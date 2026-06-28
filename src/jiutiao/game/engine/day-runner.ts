// 一天编排器（day-runner）：连接 action-grid 状态机 与 engine.settleSlot。
// 职责：执行"当前 cursor 格" = markRunning → settleSlot(引擎结算) → completeCurrent(写正文+推进)。
// 把行动格的 DayState 与引擎的 EngineState 两份状态一起推进。纯逻辑(AI经AiPort)，可测。

import {
  markRunning, completeCurrent, currentSlot, startDay, buildForcedLeaveDay, insertEventSlot, lockSlot,
} from '../action-grid/machine';
import { settleSlot } from './machine';
import { settleServe, settleDaily } from './settlement';
import {
  CONST, slidingWindowRelief, settleRecruit, dailyDesireDemand, desireOverflow, availableThugs,
} from '../economy/machine';
import { scanForced } from '../events/machine';
import { appendLog, appendContinuity } from '../memory/machine';
import { deriveEventUnlocked } from './unlocked';
import type { LogEntry } from '../memory/machine';
import type { ForcedEvent } from '../events/machine';
import type { ForcedContext } from '../events/types';
import type { DailySettleResult } from './settlement';
import type { DayState, SlotPeriod, SlotChoice } from '../action-grid/types';
import type { EngineState, SettleOptions, SettleResult } from './types';

/** 从 EngineState 构造强制事件扫描上下文 */
export function forcedContextOf(engine: EngineState): ForcedContext {
  return {
    corruption: engine.corruption,
    cognition: engine.cognition,
    infamy: engine.infamy,
    thugs: engine.thugTotal,
    triggeredLedger: engine.triggeredSpecials,
    unlocked: deriveEventUnlocked(engine),
    condomStock: engine.condomStock,
    threatLevel: engine.threatLevel ?? 0,
  };
}

/**
 * 扫描并应用"临时格"强制事件（insert_slot，如避孕套归零）。
 * 在某时段执行中调用：命中则在 cursor 后插入事件专属临时格，并标记 once 账本。
 * 返回新 day/engine + 触发的事件（null=未触发）。
 */
export function applyForcedInserts(
  day: DayState, engine: EngineState, pool: ForcedEvent[] | undefined, period: SlotPeriod,
): { day: DayState; engine: EngineState; fired: ForcedEvent | null } {
  if (!pool || pool.length === 0) return { day, engine, fired: null };
  const inserts = pool.filter(e => e.intensity === 'insert_slot');
  const ev = scanForced(inserts, forcedContextOf(engine));
  if (!ev) return { day, engine, fired: null };
  const day2 = insertEventSlot(day, period, ev.label, { optionId: ev.optionId, label: ev.label });
  const ctx = forcedContextOf(engine);
  // 应用 once 标签 + onApply 副作用补丁（如 E3 真播种 → pregnant=true）
  let engine2: EngineState = engine;
  if (ev.once && ev.ledgerKey) {
    engine2 = { ...engine2, triggeredSpecials: { ...engine2.triggeredSpecials, [ev.ledgerKey]: true } };
  }
  if (ev.onApply) {
    engine2 = { ...engine2, ...ev.onApply(ctx) } as EngineState;
  }
  return { day: day2, engine: engine2, fired: ev };
}

/**
 * 扫描并应用"强占"强制事件（seize_slot，如地盘骚扰/火并防守）。
 * 分配后调用：命中则锁定一格（白天优先，无白天格则夜晚），玩家不可改派。
 * 返回新 day + 触发的事件（null=未触发）。强占类一般非一次性（骚扰高频）。
 */
export function applyForcedSeizes(
  day: DayState, engine: EngineState, pool: ForcedEvent[] | undefined,
): { day: DayState; fired: ForcedEvent | null } {
  if (!pool || pool.length === 0) return { day, fired: null };
  const seizes = pool.filter(e => e.intensity === 'seize_slot');
  const ev = scanForced(seizes, forcedContextOf(engine));
  if (!ev) return { day, fired: null };
  const period: SlotPeriod = day.dayCount > 0 ? 'day' : 'night';
  const slots = period === 'day' ? day.daySlots : day.nightSlots;
  if (slots.length === 0) return { day, fired: null }; // 该时段无格可强占
  const day2 = lockSlot(day, period, 0, ev.label, { optionId: ev.optionId, label: ev.label });
  return { day: day2, fired: ev };
}

/** 一天 + 引擎 的合并状态（前端持有的总状态切片） */
export interface RunnerState {
  day: DayState;
  engine: EngineState;
}

export interface RunSlotResult {
  state: RunnerState;
  settle: SettleResult;
  /** 供奉类格子的结算（非供奉格为 null）：避孕套 + 当场降欲 */
  serve?: { condomUsed: number; condomShort: boolean; served: number; desireRelieved: number } | null;
  /** 招募格的即时结算（非招募格为 null）：当场招到的人数/花费 */
  recruit?: { recruited: number; cost: number; reason?: 'no_quota' | 'no_money' } | null;
  /** 本格触发的临时格强制事件（如避孕套归零），null=无 */
  forcedInsert?: ForcedEvent | null;
  /** 本格的结构化日志条目（供正文留档/UI 复用） */
  logEntry: LogEntry;
}

/**
 * 执行当前 cursor 指向的行动格：
 *  1. markRunning：行动格标记进行中（UI 显示"进行中"）。
 *  2. settleSlot：引擎跑流水线（选范式/AI或快进/抓数值/防胡诌/堕落），返回正文+新EngineState。
 *  3. completeCurrent：把正文写回该格，推进 cursor（本时段完则结算）。
 * 返回合并后的新状态 + 本格结算详情（events 供 UI 提示堕落/奖励闸门）。
 */
export async function runCurrentSlot(
  state: RunnerState,
  opts: SettleOptions,
): Promise<RunSlotResult> {
  const slot = currentSlot(state.day);
  if (!slot) throw new Error('无当前执行格');
  if (!slot.choice) throw new Error(`当前格未安排选项: ${slot.period}#${slot.index}`);

  const dayRunning = markRunning(state.day);

  const settle = await settleSlot(state.engine, {
    optionId: slot.choice.optionId,
    params: slot.choice.params,
  }, opts);

  // 供奉类格子：执行后扣避孕套 + 当场降欲 + 计入被供奉人数（由 EventOption.isServe 判定）
  let engine = settle.state;
  let serve: RunSlotResult['serve'] = null;
  if (opts.eventOptions[slot.choice.optionId]?.isServe) {
    // 强制请假轮奸日：吞吐×1.5（多服务人数，帮运营失败玩家清欲望）
    const mult = state.day.forcedLeave ? CONST.请假轮奸吞吐倍率 : 1;
    const sr = settleServe(engine, mult);
    engine = sr.state;
    serve = { condomUsed: sr.condomUsed, condomShort: sr.condomShort, served: sr.served, desireRelieved: sr.desireRelieved };
  }

  // 招募格：即时结算（当场招人、扣钱、扣额度，玩家立刻看到打手数变化，而非日终）
  let recruit: RunSlotResult['recruit'] = null;
  if (slot.choice.optionId === 'recruit') {
    const rr = settleRecruit(engine.thugTotal, engine.money, engine.recruitQuota);
    engine = { ...engine, thugTotal: rr.thugTotal, money: rr.money, recruitQuota: rr.recruitQuota };
    recruit = { recruited: rr.recruited, cost: rr.cost, reason: rr.reason };
  }

  // 强制临时格扫描（如避孕套归零）：在完成当前格【前】插入，使其成为下一格立即执行。
  let dayForInsert = dayRunning;
  let forcedInsert: ForcedEvent | null = null;
  {
    const fi = applyForcedInserts(dayForInsert, engine, opts.forcedPool, slot.period);
    dayForInsert = fi.day; engine = fi.engine; forcedInsert = fi.fired;
  }

  // 记忆层:每格写结构化日志(代码·覆盖所有格) + 代码可知的延续摘要(认知跨档/首次)
  const dayNo = state.day.dayNumber;
  const logEntry = {
    day: dayNo, period: slot.period, slot: slot.index,
    eventId: slot.choice.optionId, label: slot.choice.label,
    presentCount: engine.presentCount,
    corruptionDelta: settle.events.corruptionGain || undefined,
    renderMode: settle.events.renderMode,
    tags: settle.events.isFirstSpecial ? ['首次'] : undefined,
  };
  engine = { ...engine, narrativeLog: appendLog(engine.narrativeLog, logEntry) };
  // 认知防线跨档:代码 turning 笔记(总记,影响后续基调)
  if (settle.events.cognitionAdvancedTo) {
    engine = { ...engine, continuityNotes: appendContinuity(engine.continuityNotes, {
      day: dayNo, kind: 'turning', text: `认知防线→${settle.events.cognitionAdvancedTo}`,
    }) };
  }
  // 桶4延续摘要:AI 吐了一句(needsContinuity事件)→entity 笔记(富);否则首次特殊→代码 milestone 笔记(兜底)
  if (settle.events.continuity) {
    engine = { ...engine, continuityNotes: appendContinuity(engine.continuityNotes, {
      day: dayNo, kind: 'entity', text: settle.events.continuity,
    }) };
  } else if (settle.events.isFirstSpecial) {
    engine = { ...engine, continuityNotes: appendContinuity(engine.continuityNotes, {
      day: dayNo, kind: 'milestone', text: `首次·${slot.choice.label}`,
    }) };
  }

  const dayDone = completeCurrent(dayForInsert, settle.resultText);

  return {
    state: { day: dayDone, engine },
    settle, serve, recruit, forcedInsert, logEntry,
  };
}

/** 进入次日的结果 */
export interface NextDayResult {
  engine: EngineState;
  day: DayState;
  daily: DailySettleResult;
  forcedLeave: boolean;   // 次日是否被强制请假轮奸霸全
  reliefCleared: boolean; // 本次是否触发滑动窗口保底清空欲望
}

/**
 * 推进到次日（纯函数，便于单测）。
 *  1. settleDaily：每日收尾（招募刷新/武力/硬失败）。
 *  2. 记录今日请假状态进滑动窗口，评估保底：近期请假够多且欲望未到天文数字→清空欲望（软卡死出口）。
 *  3. 若 engine.pendingForcedLeave（昨晚欲望溢出）→ 构造强制请假轮奸日（霸全），并清除标记。
 *     否则 → 正常 startDay 进玩家分配。
 * @param wasLeaveDay 刚结束的这天是否为请假日（白天0格）。计入滑动窗口。
 */
export function advanceToNextDay(
  engine: EngineState,
  currentDayNumber: number,
  totalSlots: number,
  serveChoice: SlotChoice,
  wasLeaveDay = false,
): NextDayResult {
  const daily = settleDaily(engine, currentDayNumber);
  // 滑动窗口保底：记录今日请假→评估是否清空欲望
  const history = [...(daily.state.leaveHistory ?? []), wasLeaveDay].slice(-CONST.保底窗口长);
  const relief = slidingWindowRelief(history, daily.state.desire);
  let next: EngineState = { ...daily.state, leaveHistory: history, desire: relief.desire };

  // —— 请假轮奸判定：对"结余欲望"(当天供奉后剩下的)判定，在加次日晨间累积【之前】。 ——
  //    晨间累积不参与判定，避免打手数 > 欲望槽时永远触发(用户明确约束)。
  //    pendingForcedLeave 是个别事件可能置的旁路信号，一并消费。
  const overflow = desireOverflow(next.desire, next.desireCapacity) || !!next.pendingForcedLeave;

  // —— 次日晨间欲望累积(按可用打手数) + 重置今日供奉计数 ——
  const influx = dailyDesireDemand(availableThugs(next.thugTotal, next.garrison));
  next = {
    ...next,
    desire: next.desire + influx,
    desireAddedThisMorning: influx,
    servedThisNight: 0,
    pendingForcedLeave: false, // 判定已消费
  };

  const newDayNumber = currentDayNumber + 1;
  if (overflow) {
    return {
      engine: next,
      day: buildForcedLeaveDay(newDayNumber, totalSlots, serveChoice),
      daily, forcedLeave: true, reliefCleared: relief.cleared,
    };
  }
  return {
    engine: next,
    day: startDay(newDayNumber, totalSlots),
    daily, forcedLeave: false, reliefCleared: relief.cleared,
  };
}

export { settleNight, settleDaily } from './settlement';

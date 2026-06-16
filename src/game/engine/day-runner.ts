// 一天编排器（day-runner）：连接 action-grid 状态机 与 engine.settleSlot。
// 职责：执行"当前 cursor 格" = markRunning → settleSlot(引擎结算) → completeCurrent(写正文+推进)。
// 把行动格的 DayState 与引擎的 EngineState 两份状态一起推进。纯逻辑(AI经AiPort)，可测。

import {
  markRunning, completeCurrent, currentSlot, startDay, buildForcedLeaveDay, insertEventSlot,
} from '../action-grid/machine';
import { settleSlot } from './machine';
import { settleServe, settleDaily } from './settlement';
import { scanForced } from '../events/machine';
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
    unlocked: engine.unlocked,
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
  const engine2 = (ev.once && ev.ledgerKey)
    ? { ...engine, triggeredSpecials: { ...engine.triggeredSpecials, [ev.ledgerKey]: true } }
    : engine;
  return { day: day2, engine: engine2, fired: ev };
}

/** 一天 + 引擎 的合并状态（前端持有的总状态切片） */
export interface RunnerState {
  day: DayState;
  engine: EngineState;
}

export interface RunSlotResult {
  state: RunnerState;
  settle: SettleResult;
  /** 供奉类格子的避孕套结算（非供奉格为 null） */
  serve?: { condomUsed: number; condomShort: boolean } | null;
  /** 本格触发的临时格强制事件（如避孕套归零），null=无 */
  forcedInsert?: ForcedEvent | null;
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

  // 供奉类格子：执行后扣避孕套 + 计入被供奉人数（由 EventOption.isServe 判定）
  let engine = settle.state;
  let serve: RunSlotResult['serve'] = null;
  if (opts.eventOptions[slot.choice.optionId]?.isServe) {
    const sr = settleServe(engine);
    engine = sr.state;
    serve = { condomUsed: sr.condomUsed, condomShort: sr.condomShort };
  }

  // 强制临时格扫描（如避孕套归零）：在完成当前格【前】插入，使其成为下一格立即执行。
  let dayForInsert = dayRunning;
  let forcedInsert: ForcedEvent | null = null;
  {
    const fi = applyForcedInserts(dayForInsert, engine, opts.forcedPool, slot.period);
    dayForInsert = fi.day; engine = fi.engine; forcedInsert = fi.fired;
  }

  const dayDone = completeCurrent(dayForInsert, settle.resultText);

  return {
    state: { day: dayDone, engine },
    settle, serve, forcedInsert,
  };
}

/** 进入次日的结果 */
export interface NextDayResult {
  engine: EngineState;
  day: DayState;
  daily: DailySettleResult;
  forcedLeave: boolean;   // 次日是否被强制请假轮奸霸全
}

/**
 * 推进到次日（纯函数，便于单测）。
 *  1. settleDaily：每日收尾（招募刷新/武力/硬失败）。
 *  2. 若 engine.pendingForcedLeave（昨晚欲望溢出）→ 构造强制请假轮奸日（霸全），并清除标记。
 *     否则 → 正常 startDay 进玩家分配。
 */
export function advanceToNextDay(
  engine: EngineState,
  currentDayNumber: number,
  totalSlots: number,
  martialPrestige: number,
  infamy: number,
  serveChoice: SlotChoice,
): NextDayResult {
  const daily = settleDaily(engine, currentDayNumber, martialPrestige, infamy);
  const newDayNumber = currentDayNumber + 1;
  if (daily.state.pendingForcedLeave) {
    const engineCleared: EngineState = { ...daily.state, pendingForcedLeave: false };
    return {
      engine: engineCleared,
      day: buildForcedLeaveDay(newDayNumber, totalSlots, serveChoice),
      daily,
      forcedLeave: true,
    };
  }
  return {
    engine: daily.state,
    day: startDay(newDayNumber, totalSlots),
    daily,
    forcedLeave: false,
  };
}

export { settleNight, settleDaily } from './settlement';

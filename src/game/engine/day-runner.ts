// 一天编排器（day-runner）：连接 action-grid 状态机 与 engine.settleSlot。
// 职责：执行"当前 cursor 格" = markRunning → settleSlot(引擎结算) → completeCurrent(写正文+推进)。
// 把行动格的 DayState 与引擎的 EngineState 两份状态一起推进。纯逻辑(AI经AiPort)，可测。

import { markRunning, completeCurrent, currentSlot } from '../action-grid/machine';
import { settleSlot } from './machine';
import { settleServe } from './settlement';
import type { DayState } from '../action-grid/types';
import type { EngineState, SettleOptions, SettleResult } from './types';

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
    paradigmId: (slot.choice.params?.paradigmId as string) ?? undefined,
    params: slot.choice.params,
  }, opts);

  // 供奉类格子：执行后扣避孕套 + 计入被供奉人数
  let engine = settle.state;
  let serve: RunSlotResult['serve'] = null;
  if (opts.serveOptionIds?.includes(slot.choice.optionId)) {
    const sr = settleServe(engine);
    engine = sr.state;
    serve = { condomUsed: sr.condomUsed, condomShort: sr.condomShort };
  }

  const dayDone = completeCurrent(dayRunning, settle.resultText);

  return {
    state: { day: dayDone, engine },
    settle, serve,
  };
}

export { settleNight, settleDaily } from './settlement';

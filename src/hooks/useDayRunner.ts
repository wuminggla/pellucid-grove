// useDayRunner —— 管理"一天"的 React 状态 hook。
// 封装 action-grid 状态机 + day-runner 编排，给 UI 提供命令式接口。

import { useState, useCallback } from 'react';
import {
  startDay, allocate as allocateFn, setChoice as setChoiceFn, clearChoice as clearChoiceFn,
  beginDay as beginDayFn, beginNight as beginNightFn, fillEmpty as fillEmptyFn, currentSlot,
} from '../game/action-grid/machine';
import { runCurrentSlot } from '../game/engine/day-runner';
import type { RunnerState } from '../game/engine/day-runner';
import type { DayState, SlotChoice, SlotPeriod, ActionSlot } from '../game/action-grid/types';
import type { EngineState, SettleOptions, SettleResult } from '../game/engine/types';

export interface UseDayRunnerOpts {
  initialEngine: EngineState;
  totalSlots: number;
  settleOptions: Omit<SettleOptions, 'fastForward'>;
}

export function useDayRunner(opts: UseDayRunnerOpts) {
  const [day, setDay] = useState<DayState>(() => startDay(1, opts.totalSlots));
  const [engine, setEngine] = useState<EngineState>(opts.initialEngine);
  const [fastForward, setFastForward] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSettle, setLastSettle] = useState<SettleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allocate = useCallback((dayCount: number, nightCount: number) => {
    const r = allocateFn(day, { dayCount, nightCount });
    if (!r.ok) { setError(r.error!); return false; }
    setError(null); setDay(r.state!); return true;
  }, [day]);

  const setChoice = useCallback((period: SlotPeriod, index: number, choice: SlotChoice) => {
    try { setDay(setChoiceFn(day, period, index, choice)); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, [day]);

  const clearChoice = useCallback((period: SlotPeriod, index: number) => {
    try { setDay(clearChoiceFn(day, period, index)); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, [day]);

  const beginDay = useCallback(() => {
    try { setDay(beginDayFn(day)); setError(null); return true; }
    catch (e) { setError((e as Error).message); return false; }
  }, [day]);

  const beginNight = useCallback(() => {
    try { setDay(beginNightFn(day)); setError(null); return true; }
    catch (e) { setError((e as Error).message); return false; }
  }, [day]);

  /** 一键填充某时段空格（如夜晚全供奉） */
  const fillEmpty = useCallback((period: SlotPeriod, choice: SlotChoice) => {
    setDay(fillEmptyFn(day, period, choice)); setError(null);
  }, [day]);

  /** 当前待执行格（cursor 指向）；用于 UI 判断执行按钮可用性 */
  const cur: ActionSlot | null = currentSlot(day);
  const canRunCurrent = !!cur && !!cur.choice;

  /** 执行当前 cursor 格（异步：调 mock/真AI） */
  const runCurrent = useCallback(async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const state: RunnerState = { day, engine };
      const r = await runCurrentSlot(state, { ...opts.settleOptions, fastForward });
      setDay(r.state.day); setEngine(r.state.engine); setLastSettle(r.settle);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [busy, day, engine, fastForward, opts.settleOptions]);

  /** 进入下一天（夜晚结算后） */
  const nextDay = useCallback(() => {
    setDay(startDay(day.dayNumber + 1, opts.totalSlots));
    setLastSettle(null); setError(null);
  }, [day.dayNumber, opts.totalSlots]);

  return {
    day, engine, fastForward, busy, lastSettle, error,
    canRunCurrent,
    setFastForward,
    allocate, setChoice, clearChoice, fillEmpty, beginDay, beginNight, runCurrent, nextDay,
  };
}

// useDayRunner —— 管理"一天"的 React 状态 hook。
// 封装 action-grid 状态机 + day-runner 编排，给 UI 提供命令式接口。

import { useState, useCallback } from 'react';
import {
  startDay, allocate as allocateFn, setChoice as setChoiceFn, clearChoice as clearChoiceFn,
  beginDay as beginDayFn, beginNight as beginNightFn, fillEmpty as fillEmptyFn, currentSlot,
} from '../game/action-grid/machine';
import { runCurrentSlot, settleNight, advanceToNextDay, applyForcedSeizes } from '../game/engine/day-runner';
import type { RunnerState } from '../game/engine/day-runner';
import type { ForcedEvent } from '../game/events/machine';
import type { NightSettleResult } from '../game/engine/settlement';
import type { DayState, SlotChoice, SlotPeriod, ActionSlot } from '../game/action-grid/types';
import type { EngineState, SettleOptions, SettleResult } from '../game/engine/types';

export interface UseDayRunnerOpts {
  initialEngine: EngineState;
  totalSlots: number;
  settleOptions: Omit<SettleOptions, 'fastForward'>;
  /** 强制请假轮奸日每格用的供奉选项（默认 serve） */
  forcedLeaveChoice?: SlotChoice;
}

const DEFAULT_FORCED_LEAVE_CHOICE: SlotChoice = { optionId: 'serve', label: '供奉（强制请假轮奸）' };

export function useDayRunner(opts: UseDayRunnerOpts) {
  const [day, setDay] = useState<DayState>(() => startDay(1, opts.totalSlots));
  const [engine, setEngine] = useState<EngineState>(opts.initialEngine);
  const [fastForward, setFastForward] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSettle, setLastSettle] = useState<SettleResult | null>(null);
  const [lastServe, setLastServe] = useState<{ condomUsed: number; condomShort: boolean } | null>(null);
  const [lastNight, setLastNight] = useState<NightSettleResult | null>(null);
  const [forcedLeaveToday, setForcedLeaveToday] = useState(false);
  const [forcedSeize, setForcedSeize] = useState<ForcedEvent | null>(null);
  const [reliefCleared, setReliefCleared] = useState(false);
  const [hardFail, setHardFail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allocate = useCallback((dayCount: number, nightCount: number) => {
    const r = allocateFn(day, { dayCount, nightCount });
    if (!r.ok) { setError(r.error!); return false; }
    // 分配后扫描强占类强制事件（地盘骚扰/火并防守）：命中则锁定一格
    const seized = applyForcedSeizes(r.state!, engine, opts.settleOptions.forcedPool);
    setError(null); setDay(seized.day); setForcedSeize(seized.fired); return true;
  }, [day, engine, opts.settleOptions.forcedPool]);

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
      let nextEngine = r.state.engine;
      let nightInfo: NightSettleResult | null = null;
      // 夜晚最后一格执行完 → 夜晚收尾结算（欲望滚雪球/溢出）
      if (r.state.day.phase === 'night_settled') {
        const ns = settleNight(nextEngine);
        nextEngine = ns.state;
        nightInfo = ns;
      }
      setDay(r.state.day); setEngine(nextEngine); setLastSettle(r.settle);
      setLastServe(r.serve ?? null);
      setLastNight(nightInfo);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [busy, day, engine, fastForward, opts.settleOptions]);

  /** 进入下一天：每日收尾结算 + 若昨晚欲望溢出则次日强制请假轮奸（霸全） */
  const nextDay = useCallback(() => {
    const r = advanceToNextDay(
      engine, day.dayNumber, opts.totalSlots,
      opts.forcedLeaveChoice ?? DEFAULT_FORCED_LEAVE_CHOICE,
      day.dayCount === 0, // 刚结束的这天是否请假(白天0格)。威望从engine内部读
    );
    setEngine(r.engine);
    setDay(r.day);
    setForcedLeaveToday(r.forcedLeave);
    setReliefCleared(r.reliefCleared);
    setHardFail(r.daily.hardFail);
    setForcedSeize(null);
    setLastSettle(null); setLastServe(null); setLastNight(null); setError(null);
  }, [engine, day.dayNumber, day.dayCount, opts.totalSlots, opts.forcedLeaveChoice]);

  /** 读档：用存档快照恢复完整状态 */
  const loadState = useCallback((state: RunnerState, ff: boolean) => {
    setDay(state.day); setEngine(state.engine); setFastForward(ff);
    setLastSettle(null); setLastServe(null); setLastNight(null);
    setForcedLeaveToday(false); setForcedSeize(null); setReliefCleared(false); setHardFail(false); setError(null);
  }, []);

  /** 当前完整状态（供存档） */
  const runnerState: RunnerState = { day, engine };

  return {
    day, engine, fastForward, busy, lastSettle, lastServe, lastNight, forcedLeaveToday, forcedSeize, reliefCleared, hardFail, error,
    canRunCurrent, runnerState,
    setFastForward,
    allocate, setChoice, clearChoice, fillEmpty, beginDay, beginNight, runCurrent, nextDay, loadState,
  };
}

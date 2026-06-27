// runner-store · useDayRunner(v1 React hook) 翻译为 Pinia store。
// 封装 action-grid 状态机 + day-runner 编排,给 Vue 组件提供命令式接口。
// 业务逻辑全部复用 src/jiutiao/game/* 纯 TS 模块(零改动)。
//
// 注: 当前用本地 INITIAL_ENGINE(从 mock 起步)。阶段2末尾会改成从 MVU stat_data
//   初始化 + 用 defineMvuDataStore 双向回写,让 EngineState ↔ 酒馆变量同步。

import { defineStore } from 'pinia';
import {
  startDay, allocate as allocateFn, setChoice as setChoiceFn, clearChoice as clearChoiceFn,
  beginDay as beginDayFn, beginNight as beginNightFn, fillEmpty as fillEmptyFn, currentSlot,
} from '../../game/action-grid/machine';
import { runCurrentSlot, settleNight, advanceToNextDay, applyForcedSeizes } from '../../game/engine/day-runner';
import type { RunnerState } from '../../game/engine/day-runner';
import type { NightSettleResult } from '../../game/engine/settlement';
import {
  demoEventOptions, demoSummaryTemplates, demoExtractBounds, demoForcedPool, createMockAi,
} from '../../game/engine/mock-ai';
import type { ForcedEvent } from '../../game/events/machine';
import type { DayState, SlotChoice, SlotPeriod, ActionSlot } from '../../game/action-grid/types';
import type { EngineState, SettleOptions, SettleResult, AiPort } from '../../game/engine/types';

const DEFAULT_FORCED_LEAVE_CHOICE: SlotChoice = { optionId: 'serve_vaginal', label: '供奉（强制请假轮奸）' };

const TOTAL_SLOTS = 8;

/** 初始引擎状态(mock 起步·甜区起调值)。阶段2末尾改为从 MVU stat_data 读。 */
function initialEngine(): EngineState {
  return {
    triggeredSpecials: {}, unlocked: {},
    corruption: 0, cognition: '死撑', claimedGates: {},
    money: 8000, thugTotal: 30, garrison: 0, loyalty: 60,
    condomStock: 480, desire: 0, desireCapacity: 60, perSlotThroughput: 6,
    infamy: 0, martialPrestige: 0,
    recruitQuota: 0, presentCount: 18, isDangerousPeriod: false,
    servedThisNight: 0,
  };
}

export const useRunnerStore = defineStore('runner', {
  state: () => ({
    day: startDay(1, TOTAL_SLOTS) as DayState,
    engine: initialEngine() as EngineState,
    fastForward: false,
    busy: false,
    lastSettle: null as SettleResult | null,
    lastServe: null as { condomUsed: number; condomShort: boolean } | null,
    lastNight: null as NightSettleResult | null,
    forcedLeaveToday: false,
    forcedSeize: null as ForcedEvent | null,
    reliefCleared: false,
    hardFail: false,
    error: null as string | null,
    // AI 端口: 当前 mock,阶段2接酒馆 generate 后换 createBridgeAi
    _ai: createMockAi() as AiPort,
  }),

  getters: {
    /** 当前待执行格(cursor 指向) */
    currentSlot(state): ActionSlot | null {
      return currentSlot(state.day);
    },
    canRunCurrent(): boolean {
      const cur = this.currentSlot;
      return !!cur && !!cur.choice;
    },
    runnerState(state): RunnerState {
      return { day: state.day, engine: state.engine };
    },
    settleOptions(state): SettleOptions {
      return {
        eventOptions: demoEventOptions,
        ai: state._ai,
        summaryTemplates: demoSummaryTemplates,
        extractBounds: demoExtractBounds,
        forcedPool: demoForcedPool,
        fastForward: state.fastForward,
        rng: Math.random,
      };
    },
  },

  actions: {
    setFastForward(v: boolean) { this.fastForward = v; },

    allocate(dayCount: number, nightCount: number): boolean {
      const r = allocateFn(this.day, { dayCount, nightCount });
      if (!r.ok) { this.error = r.error!; return false; }
      const seized = applyForcedSeizes(r.state!, this.engine, demoForcedPool);
      this.error = null; this.day = seized.day; this.forcedSeize = seized.fired;
      return true;
    },

    setChoice(period: SlotPeriod, index: number, choice: SlotChoice) {
      try { this.day = setChoiceFn(this.day, period, index, choice); this.error = null; }
      catch (e) { this.error = (e as Error).message; }
    },

    clearChoice(period: SlotPeriod, index: number) {
      try { this.day = clearChoiceFn(this.day, period, index); this.error = null; }
      catch (e) { this.error = (e as Error).message; }
    },

    beginDay(): boolean {
      try { this.day = beginDayFn(this.day); this.error = null; return true; }
      catch (e) { this.error = (e as Error).message; return false; }
    },

    beginNight(): boolean {
      try { this.day = beginNightFn(this.day); this.error = null; return true; }
      catch (e) { this.error = (e as Error).message; return false; }
    },

    fillEmpty(period: SlotPeriod, choice: SlotChoice) {
      this.day = fillEmptyFn(this.day, period, choice); this.error = null;
    },

    async runCurrent() {
      if (this.busy) return;
      this.busy = true; this.error = null;
      try {
        const state: RunnerState = { day: this.day, engine: this.engine };
        const r = await runCurrentSlot(state, this.settleOptions);
        let nextEngine = r.state.engine;
        let nightInfo: NightSettleResult | null = null;
        if (r.state.day.phase === 'night_settled') {
          const ns = settleNight(nextEngine);
          nextEngine = ns.state;
          nightInfo = ns;
        }
        this.day = r.state.day;
        this.engine = nextEngine;
        this.lastSettle = r.settle;
        this.lastServe = r.serve ?? null;
        this.lastNight = nightInfo;
      } catch (e) {
        this.error = (e as Error).message;
      } finally {
        this.busy = false;
      }
    },

    nextDay() {
      const r = advanceToNextDay(
        this.engine, this.day.dayNumber, this.engine.totalSlots ?? TOTAL_SLOTS,
        DEFAULT_FORCED_LEAVE_CHOICE,
        this.day.dayCount === 0,
      );
      this.engine = r.engine;
      this.day = r.day;
      this.forcedLeaveToday = r.forcedLeave;
      this.reliefCleared = r.reliefCleared;
      this.hardFail = r.daily.hardFail;
      this.forcedSeize = null;
      this.lastSettle = null; this.lastServe = null; this.lastNight = null; this.error = null;
    },

    loadState(state: RunnerState, ff: boolean) {
      this.day = state.day; this.engine = state.engine; this.fastForward = ff;
      this.lastSettle = null; this.lastServe = null; this.lastNight = null;
      this.forcedLeaveToday = false; this.forcedSeize = null;
      this.reliefCleared = false; this.hardFail = false; this.error = null;
    },
  },
});

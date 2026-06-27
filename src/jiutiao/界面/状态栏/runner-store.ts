// runner-store · useDayRunner(v1 React hook) 翻译为 Pinia setup store。
// 用 setup 语法(对齐模板 settings.ts): ref ≈ useState, 函数 ≈ useCallback。
// 业务逻辑全部复用 src/jiutiao/game/* 纯 TS 模块(零改动)。
//
// 注: defineStore / ref / computed 都是 webpack auto-import 注入的全局,不手动 import。
//   当前用本地 initialEngine(mock 起步)。阶段2末尾改为从 MVU stat_data 初始化 + 双向回写。

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
import { demoLorebook } from '../../game/worldbook/demo';
import { createTavernAi } from './tavern-ai';
import type { ForcedEvent } from '../../game/events/machine';
import type { DayState, SlotChoice, SlotPeriod } from '../../game/action-grid/types';
import type { EngineState, SettleOptions, SettleResult, AiPort } from '../../game/engine/types';

const DEFAULT_FORCED_LEAVE_CHOICE: SlotChoice = { optionId: 'serve_vaginal', label: '供奉（强制请假轮奸）' };
const TOTAL_SLOTS = 8;

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

export const useRunnerStore = defineStore('runner', () => {
  // ─── state(ref ≈ useState) ───
  const day = ref<DayState>(startDay(1, TOTAL_SLOTS));
  const engine = ref<EngineState>(initialEngine());
  const fastForward = ref(false);
  const busy = ref(false);
  const lastSettle = ref<SettleResult | null>(null);
  const lastServe = ref<{ condomUsed: number; condomShort: boolean } | null>(null);
  const lastNight = ref<NightSettleResult | null>(null);
  const forcedLeaveToday = ref(false);
  const forcedSeize = ref<ForcedEvent | null>(null);
  const reliefCleared = ref(false);
  const hardFail = ref(false);
  const error = ref<string | null>(null);
  // #4 生成稳定性
  const lastEmpty = ref(false);        // 上次生成空回/截断(正文过短)
  const lastWarn = ref<string | null>(null); // 空回/截断的提示文案
  // 执行前快照(供重 roll: 恢复后重跑同一格)
  let preRunSnapshot: { day: DayState; engine: EngineState } | null = null;

  // AI 端口: 默认接酒馆 generate(套预设/JB,出真实正文);
  // 检测不到酒馆 generate 全局(本地开发/异常)时回落 mock。
  // useMock() 可手动切回 mock 调试。
  const hasTavernGenerate = typeof (globalThis as any).generate === 'function';
  let ai: AiPort = hasTavernGenerate
    ? createTavernAi({ lorebook: demoLorebook })
    : createMockAi();
  const aiMode = ref<'tavern' | 'mock'>(hasTavernGenerate ? 'tavern' : 'mock');

  function useMock() { ai = createMockAi(); aiMode.value = 'mock'; }
  function useTavern() { ai = createTavernAi({ lorebook: demoLorebook }); aiMode.value = 'tavern'; }

  // ─── getters(computed) ───
  const currentSlotRef = computed(() => currentSlot(day.value));
  const canRunCurrent = computed(() => {
    const cur = currentSlotRef.value;
    return !!cur && !!cur.choice;
  });
  const runnerState = computed<RunnerState>(() => ({ day: day.value, engine: engine.value }));

  function settleOptions(): SettleOptions {
    return {
      eventOptions: demoEventOptions,
      ai,
      summaryTemplates: demoSummaryTemplates,
      extractBounds: demoExtractBounds,
      forcedPool: demoForcedPool,
      fastForward: fastForward.value,
      rng: Math.random,
    };
  }

  // ─── actions(函数 ≈ useCallback) ───
  function setFastForward(v: boolean) { fastForward.value = v; }

  function allocate(dayCount: number, nightCount: number): boolean {
    const r = allocateFn(day.value, { dayCount, nightCount });
    if (!r.ok) { error.value = r.error!; return false; }
    const seized = applyForcedSeizes(r.state!, engine.value, demoForcedPool);
    error.value = null;
    day.value = seized.day;
    forcedSeize.value = seized.fired;
    return true;
  }

  function setChoice(period: SlotPeriod, index: number, choice: SlotChoice) {
    try { day.value = setChoiceFn(day.value, period, index, choice); error.value = null; }
    catch (e) { error.value = (e as Error).message; }
  }

  function clearChoice(period: SlotPeriod, index: number) {
    try { day.value = clearChoiceFn(day.value, period, index); error.value = null; }
    catch (e) { error.value = (e as Error).message; }
  }

  function beginDay(): boolean {
    try { day.value = beginDayFn(day.value); error.value = null; return true; }
    catch (e) { error.value = (e as Error).message; return false; }
  }

  function beginNight(): boolean {
    try { day.value = beginNightFn(day.value); error.value = null; return true; }
    catch (e) { error.value = (e as Error).message; return false; }
  }

  function fillEmpty(period: SlotPeriod, choice: SlotChoice) {
    day.value = fillEmptyFn(day.value, period, choice); error.value = null;
  }

  // 空回/截断判定: 正文过短(< 20 字)视为空回;以 <jiutiao_text> 未闭合等截断特征兜底由 extract 处理
  const MIN_TEXT_LEN = 20;
  // AI 生成超时(ms): 防 generateRaw 卡死导致前端/酒馆一起卡
  const GEN_TIMEOUT_MS = 120_000;

  function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI 生成超时(可能被审核拦截或网络问题),请重试')), ms)),
    ]);
  }

  // 真正执行一格(供 runCurrent 首次 + rerunLast 复用)。snapshot 是执行前状态。
  async function execCurrentFrom(snapshot: { day: DayState; engine: EngineState }) {
    busy.value = true; error.value = null; lastEmpty.value = false; lastWarn.value = null;
    try {
      const r = await withTimeout(runCurrentSlot({ day: snapshot.day, engine: snapshot.engine }, settleOptions()), GEN_TIMEOUT_MS);
      let nextEngine = r.state.engine;
      let nightInfo: NightSettleResult | null = null;
      if (r.state.day.phase === 'night_settled') {
        const ns = settleNight(nextEngine);
        nextEngine = ns.state;
        nightInfo = ns;
      }
      // 空回/截断检测(只对调 AI 的格;快进/纯模板不算)
      const text = (r.settle.resultText ?? '').trim();
      const wasAi = r.settle.events.renderMode !== 'fast_summary';
      if (wasAi && text.length < MIN_TEXT_LEN) {
        lastEmpty.value = true;
        lastWarn.value = '本次生成内容为空或过短(可能被外部审核拦截/截断)。可点「重新生成」重试。';
      }
      day.value = r.state.day;
      engine.value = nextEngine;
      lastSettle.value = r.settle;
      lastServe.value = r.serve ?? null;
      lastNight.value = nightInfo;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      busy.value = false;
    }
  }

  async function runCurrent() {
    if (busy.value) return;
    // 执行前快照(供重 roll)
    preRunSnapshot = { day: day.value, engine: engine.value };
    await execCurrentFrom(preRunSnapshot);
  }

  /** 重新生成当前(刚执行完的)格: 恢复执行前快照,重跑一次。 */
  async function rerunLast() {
    if (busy.value || !preRunSnapshot) return;
    await execCurrentFrom(preRunSnapshot);
  }

  function nextDay() {
    const r = advanceToNextDay(
      engine.value, day.value.dayNumber, engine.value.totalSlots ?? TOTAL_SLOTS,
      DEFAULT_FORCED_LEAVE_CHOICE,
      day.value.dayCount === 0,
    );
    engine.value = r.engine;
    day.value = r.day;
    forcedLeaveToday.value = r.forcedLeave;
    reliefCleared.value = r.reliefCleared;
    hardFail.value = r.daily.hardFail;
    forcedSeize.value = null;
    lastSettle.value = null; lastServe.value = null; lastNight.value = null; error.value = null;
  }

  function loadState(state: RunnerState, ff: boolean) {
    day.value = state.day; engine.value = state.engine; fastForward.value = ff;
    lastSettle.value = null; lastServe.value = null; lastNight.value = null;
    forcedLeaveToday.value = false; forcedSeize.value = null;
    reliefCleared.value = false; hardFail.value = false; error.value = null;
  }

  return {
    day, engine, fastForward, busy, lastSettle, lastServe, lastNight,
    forcedLeaveToday, forcedSeize, reliefCleared, hardFail, error,
    lastEmpty, lastWarn,
    currentSlot: currentSlotRef, canRunCurrent, runnerState,
    aiMode,
    setFastForward, allocate, setChoice, clearChoice, fillEmpty,
    beginDay, beginNight, runCurrent, rerunLast, nextDay, loadState,
    useMock, useTavern,
  };
});

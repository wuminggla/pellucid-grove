// runner-store · useDayRunner(v1 React hook) 翻译为 Pinia setup store。
// 用 setup 语法(对齐模板 settings.ts): ref ≈ useState, 函数 ≈ useCallback。
// 业务逻辑全部复用 src/jiutiao/game/* 纯 TS 模块(零改动)。
//
// 注: defineStore / ref / computed 都是 webpack auto-import 注入的全局,不手动 import。
//   当前用本地 initialEngine(mock 起步)。阶段2末尾改为从 MVU stat_data 初始化 + 双向回写。

import {
  startDay, allocate as allocateFn, setChoice as setChoiceFn, clearChoice as clearChoiceFn,
  beginDay as beginDayFn, beginNight as beginNightFn, fillEmpty as fillEmptyFn, currentSlot,
  markRunning, completeCurrent,
} from '../../game/action-grid/machine';
import { runCurrentSlot, settleNight, advanceToNextDay, applyForcedSeizes } from '../../game/engine/day-runner';
import type { RunnerState } from '../../game/engine/day-runner';
import { dailyDesireDemand, availableThugs, weeklyRecruitQuota, combatPower, presentCountFrom, appendMoneyLog } from '../../game/economy/machine';
import { weaponMult, baseMartialPerThug, prestigeMultiplier, UPGRADES_BY_ID, canUpgrade, applyUpgrade } from '../../game/upgrade/machine';
import {
  REGIONS_BY_ID, canDefeat, defeatRegion, regionState, effectiveThreshold,
  settleScout, settleBribe, settleOffensiveHarass, SCOUT_COST, BRIBE_COST,
} from '../../game/turf/machine';
import {
  canShootAv, buildAvPrompt, consumeShoot, defaultAvState, initAvOnUnlock,
  avSalesIncome, upgradeAvQuota, upgradeAvDuration,
} from '../../game/av/machine';
import type { AvDefinition } from '../../game/av/machine';
import type { UpgradeDef } from '../../game/upgrade/types';
import type { NightSettleResult } from '../../game/engine/settlement';
import {
  demoEventOptions, demoSummaryTemplates, demoExtractBounds, demoForcedPool, createMockAi,
} from '../../game/engine/mock-ai';
import { demoLorebook } from '../../game/worldbook/demo';
import { createTavernAi } from './tavern-ai';
import type { ForcedEvent } from '../../game/events/machine';
import type { DayState, SlotChoice, SlotPeriod } from '../../game/action-grid/types';
import type { EngineState, SettleOptions, SettleResult, AiPort } from '../../game/engine/types';

const DEFAULT_FORCED_LEAVE_CHOICE: SlotChoice = { optionId: 'serve_vaginal', label: '供奉（白日供奉）' };
const TOTAL_SLOTS = 8;

function initialEngine(): EngineState {
  const thugTotal = 30, garrison = 0;
  const morning = dailyDesireDemand(availableThugs(thugTotal, garrison)); // 日1晨间累积(30打手→30)
  return {
    triggeredSpecials: {}, unlocked: {},
    corruption: 0, cognition: '死撑', claimedGates: {},
    money: 8000, thugTotal, garrison, loyalty: 60, loyaltyMartial: 30, loyaltyInfamy: 30,
    condomStock: 480, desire: morning, desireCapacity: 60, desireAddedThisMorning: morning,
    perSlotThroughput: 6,
    infamy: 0, martialPrestige: 0,
    recruitQuota: weeklyRecruitQuota(0), presentCount: presentCountFrom(thugTotal, 60, 0.5), isDangerousPeriod: false,
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
  const lastServe = ref<{ condomUsed: number; condomShort: boolean; served: number; desireRelieved: number } | null>(null);
  const lastRecruit = ref<{ recruited: number; cost: number; reason?: 'no_quota' | 'no_money' } | null>(null);
  const lastBuyCondom = ref<{ bought: number; cost: number; reason?: 'no_money' } | null>(null);
  const lastReward = ref<{ gained: number; reason?: 'no_money' } | null>(null);
  const lastProtection = ref<{ income: number } | null>(null);
  const lastAttrition = ref<number>(0); // 昨日打手自然流失数(进次日时设)
  // 通知历史(最近两天·可展开查看)。不进存档,纯会话UI。
  type Notice = { t: string; tone: string };
  const notifyLog = ref<{ day: number; label: string; notices: Notice[] }[]>([]);
  const lastAvIncome = ref<{ income: number; theme: string } | null>(null);
  const lastNight = ref<NightSettleResult | null>(null);
  const forcedLeaveToday = ref(false);
  const forcedSeize = ref<ForcedEvent | null>(null);
  const reliefCleared = ref(false);
  const hardFail = ref(false);
  const hardFailReason = ref<'martial' | 'money' | null>(null);
  const failWarnings = ref<string[]>([]); // 第1次坏审核预警(留1回合缓冲)
  const error = ref<string | null>(null);
  // #4 生成稳定性
  const lastEmpty = ref(false);        // 上次生成空回/截断(正文过短)
  const lastWarn = ref<string | null>(null); // 空回/截断的提示文案
  // 生成中文案(有代入感/幽默,每次随机一条)
  const genHint = ref('事件演化中…');
  const GEN_HINTS = [
    '事件演化中…', '大小姐正在努力…', '时间推移中…', '九条会账房结算中…',
    '罗刹之血在躁动…', '正在拨动命运的算盘…', '凛的体面正在接受考验…', '夜色与欲望发酵中…',
  ];
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

  // ─── 地盘(turf)·Phase1：当前武力 + 攻打/贿赂(纯数值判定·点一下出结果) ───
  const combatPowerNow = computed(() =>
    combatPower(
      availableThugs(engine.value.thugTotal, engine.value.garrison), engine.value.presentCount, engine.value.thugTotal,
      baseMartialPerThug(engine.value.upgrades), weaponMult(engine.value.upgrades),
    ));
  const lastTurf = ref<{ ok: boolean; msg: string } | null>(null);
  type MapKind = 'scout' | 'bribe' | 'attack' | 'harass';
  // 地图选择模式(攻打/刺探/贿赂/骚扰事件格执行中):非空时主区展开地图选目标
  const pendingMap = ref<{ kind: MapKind } | null>(null);

  function attackRegion(id: string) {
    const def = REGIONS_BY_ID[id]; if (!def) return;
    const chk = canDefeat(def, combatPowerNow.value, engine.value.regions);
    if (!chk.ok) { lastTurf.value = { ok: false, msg: `攻打「${def.name}」失败：${chk.reason}` }; return; }
    // 一次性复仇·极道威望(随门槛递增·威望增长系数加成);解锁后区域每日产出由 settleDaily 接入
    const reward = Math.round(Math.max(5, Math.round(effectiveThreshold(def, regionState(engine.value.regions, id)) / 10)) * prestigeMultiplier(engine.value.upgrades));
    engine.value = {
      ...engine.value,
      regions: defeatRegion(engine.value.regions, id),
      martialPrestige: engine.value.martialPrestige + reward,
      martialGainToday: (engine.value.martialGainToday ?? 0) + reward,
    };
    const bossLine = def.isCenter ? `击败中枢Boss「${def.bossName}」` : `攻占「${def.name}」`;
    lastTurf.value = { ok: true, msg: `${bossLine}！极道威望 +${reward}，每日产出已接入。` };
  }

  // ─── 攻打/刺探/贿赂/骚扰(事件格→地图选择流程) ───
  /** 当前格是地图选择型？App 据此走 beginMapSelect 而非 runCurrent。 */
  function currentMapKind(): MapKind | null {
    const cur = currentSlot(day.value);
    const opt = cur?.choice ? demoEventOptions[cur.choice.optionId] : undefined;
    return (opt?.mapSelect as MapKind) ?? null;
  }
  /** 进入地图选择模式(地图选择格被执行) */
  function beginMapSelect(kind: MapKind) { pendingMap.value = { kind }; lastTurf.value = null; }
  function cancelMapSelect() { pendingMap.value = null; }

  /** 完成当前格(无AI·写总结文 + 推进 cursor + 必要时夜结) */
  function completeMapSlot(text: string) {
    const dayRunning = markRunning(day.value);
    const done = completeCurrent(dayRunning, text);
    day.value = done;
    if (done.phase === 'night_settled') { const ns = settleNight(engine.value); engine.value = ns.state; lastNight.value = ns; }
    pendingMap.value = null;
    logNotices(`第${day.value.dayNumber}天 地盘`);
  }

  /** 地图选择落子(攻打/刺探/贿赂/骚扰目标关) */
  function resolveMapSlot(id: string) {
    const kind = pendingMap.value?.kind; if (!kind) return;
    const def = REGIONS_BY_ID[id]; if (!def) return;
    // 清掉上一格残留的逐格提示,避免地盘格重复记录
    lastServe.value = null; lastRecruit.value = null; lastBuyCondom.value = null; lastReward.value = null; lastProtection.value = null; lastAvIncome.value = null; lastSettle.value = null;
    if (kind === 'attack') {
      const chk = canDefeat(def, combatPowerNow.value, engine.value.regions);
      if (!chk.ok) { lastTurf.value = { ok: false, msg: `攻打「${def.name}」失败：${chk.reason}` }; return; }
      const reward = Math.round(Math.max(5, Math.round(effectiveThreshold(def, regionState(engine.value.regions, id)) / 10)) * prestigeMultiplier(engine.value.upgrades));
      engine.value = {
        ...engine.value,
        regions: defeatRegion(engine.value.regions, id),
        martialPrestige: engine.value.martialPrestige + reward,
        martialGainToday: (engine.value.martialGainToday ?? 0) + reward,
      };
      const bossLine = def.isCenter ? `击败中枢Boss「${def.bossName}」` : `攻占「${def.name}」`;
      lastTurf.value = { ok: true, msg: `${bossLine}！极道威望 +${reward}。` };
      completeMapSlot(`一场据点战，${bossLine}。九条会的旗插了上去，极道威望 +${reward}。`);
      return;
    }
    if (kind === 'harass') {
      const r = settleOffensiveHarass(engine.value.regions, id, Math.random(), Math.random());
      if (!r.ok) { lastTurf.value = { ok: false, msg: r.reason === 'already' ? '该关已占据。' : '该关不可骚扰。' }; return; }
      const lost = Math.min(r.thugLost, engine.value.thugTotal);
      engine.value = { ...engine.value, thugTotal: engine.value.thugTotal - lost, regions: r.regions };
      lastTurf.value = { ok: true, msg: `骚扰「${def.name}」：门槛 -${r.cut}` + (lost > 0 ? `，折损 ${lost} 名打手。` : '，全身而退。') };
      completeMapSlot(`打手们去搅了「${def.name}」一场，砸场子放狠话，守备松了门槛降 ${r.cut}` + (lost > 0 ? `；混战中折了 ${lost} 人。` : '；这回没伤着人。'));
      return;
    }
    if (kind === 'scout') {
      const r = settleScout({ money: engine.value.money, regions: engine.value.regions }, id, Math.random());
      if (r.reason === 'no_money') {
        lastTurf.value = { ok: false, msg: `资金不足(需¥${SCOUT_COST})，刺探无果。` };
        completeMapSlot('打手前去刺探，却因银根吃紧无功而返。'); return;
      }
      engine.value = { ...engine.value, money: r.money, regions: r.regions, moneyLog: appendMoneyLog(engine.value.moneyLog, day.value.dayNumber, `刺探「${def.name}」`, -r.paid) };
      if (r.hit) {
        lastTurf.value = { ok: true, msg: `刺探「${def.name}」成功！已获情报，可对其贿赂降门槛（花费¥${r.paid}）。` };
        completeMapSlot(`刺探「${def.name}」得手，摸清了守备虚实——贿赂调查的门路打开了。`);
      } else {
        lastTurf.value = { ok: false, msg: `刺探「${def.name}」一无所获（花费¥${r.paid}）。` };
        completeMapSlot(`刺探「${def.name}」扑了空，只折了些打点钱。`);
      }
    } else {
      // 贿赂:固定花门路钱(资金不足则拒)
      if (engine.value.money < BRIBE_COST) { lastTurf.value = { ok: false, msg: `资金不足(需¥${BRIBE_COST})，无法贿赂。` }; return; }
      const r = settleBribe(engine.value.regions, id);
      if (!r.ok) {
        lastTurf.value = { ok: false, msg: r.reason === 'no_intel' ? '该关尚无情报，无法贿赂。' : '该关已占据。' };
        return; // 不消耗格,让玩家重选
      }
      engine.value = { ...engine.value, regions: r.regions, money: engine.value.money - BRIBE_COST, moneyLog: appendMoneyLog(engine.value.moneyLog, day.value.dayNumber, `贿赂「${def.name}」`, -BRIBE_COST) };
      lastTurf.value = { ok: true, msg: `贿赂调查「${def.name}」，击败门槛 -${r.cut}（花费¥${BRIBE_COST}）。` };
      completeMapSlot(`银钱开路，「${def.name}」的守备被买通松动，击败门槛降了 ${r.cut}。`);
    }
  }

  // ─── 升级系统 ───
  const lastUpgrade = ref<{ ok: boolean; msg: string } | null>(null);
  function buyUpgrade(id: string) {
    const def: UpgradeDef | undefined = UPGRADES_BY_ID[id]; if (!def) return;
    const chk = canUpgrade(def, engine.value as any);
    if (!chk.ok) { lastUpgrade.value = { ok: false, msg: `「${def.name}」无法升级：${chk.reason}` }; return; }
    engine.value = applyUpgrade(engine.value as any, def);
    engine.value = { ...engine.value, moneyLog: appendMoneyLog(engine.value.moneyLog, day.value.dayNumber, `升级·${def.name}`, -def.cost) };
    // 建成摄影室解锁 AV → 初始化周拍摄次数(否则面板显示"次数用完"),并引入淫名机制
    if (def.effect.kind === 'unlock' && def.effect.unlockKey === 'av') {
      engine.value = { ...engine.value, ...(initAvOnUnlock(engine.value) as any) };
    }
    // AV 专项升级:周产能 / 时长上限(在 av 子状态上生效)
    if (id === 'av_quota') {
      engine.value = { ...engine.value, av: upgradeAvQuota(engine.value.av ?? defaultAvState(), 1) };
    } else if (id === 'av_duration') {
      engine.value = { ...engine.value, av: upgradeAvDuration(engine.value.av ?? defaultAvState(), 1) };
    } else if (id === 'sex_stamina') {
      // 性爱持续时间增强:供奉吞吐略降(×0.7)、AV单部时长上限+24h
      engine.value = {
        ...engine.value,
        perSlotThroughput: Math.max(1, Math.round((engine.value.perSlotThroughput ?? 6) * 0.7)),
        av: upgradeAvDuration(engine.value.av ?? defaultAvState(), 1),
      };
    }
    const lvl = engine.value.upgrades?.[id] ?? 1;
    lastUpgrade.value = { ok: true, msg: `「${def.name}」已升至 Lv.${lvl}（花费¥${def.cost}）。` };
  }

  // ─── AV 系统(拍摄→排入行动格,执行时注入定制范式) ───
  const lastAv = ref<{ ok: boolean; msg: string } | null>(null);
  /** 把一次AV定制排入今日某空白白天格(执行该格时注入 inlinePrompt + consumeShoot) */
  function queueAvShoot(def: AvDefinition): boolean {
    const chk = canShootAv(engine.value, def);
    if (!chk.ok) { lastAv.value = { ok: false, msg: chk.reason ?? '无法拍摄' }; return false; }
    // 找今日第一个未安排的白天格
    const idx = day.value.daySlots.findIndex(s => !s.choice && !s.locked);
    if (idx < 0) { lastAv.value = { ok: false, msg: '今日白天没有空闲行动格，先分配/清出一格再排片。' }; return false; }
    const prompt = buildAvPrompt(def);
    day.value = setChoiceFn(day.value, 'day', idx, {
      optionId: 'av_custom', label: `拍AV·${def.theme}`,
      params: { avInlinePrompt: prompt, avDef: JSON.parse(JSON.stringify(def)) },
    });
    lastAv.value = { ok: true, msg: `已排入第 ${idx + 1} 个白天格：${def.theme}/${def.setting}（${def.durationHours}h）。执行该格即开拍。` };
    return true;
  }

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
    try {
      day.value = beginNightFn(day.value); error.value = null;
      // 推进到夜晚后,白天最后一格的快照已失效 → 清掉,避免"重生成上一格"误回退白天格
      lastSettle.value = null; lastServe.value = null; lastRecruit.value = null; lastBuyCondom.value = null; preRunSnapshot = null;
      return true;
    } catch (e) { error.value = (e as Error).message; return false; }
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
    lastTurf.value = null; // 清掉地盘格残留提示,避免普通格重复记录
    genHint.value = GEN_HINTS[Math.floor(Math.random() * GEN_HINTS.length)];
    // 执行前记录当前格(AV拍摄消费判定用)
    const ranSlot = currentSlot(snapshot.day);
    try {
      const r = await withTimeout(runCurrentSlot({ day: snapshot.day, engine: snapshot.engine }, settleOptions()), GEN_TIMEOUT_MS);
      let nextEngine = r.state.engine;
      // AV 定制格执行后:消费一次拍摄(扣周次数/累加 shotCount/存档案) + 高额销售进账
      let avIncome: { income: number; theme: string } | null = null;
      if (ranSlot?.choice?.optionId === 'av_custom' && ranSlot.choice.params?.avDef) {
        const avDef = ranSlot.choice.params.avDef as AvDefinition;
        const av = nextEngine.av ?? defaultAvState();
        const income = avSalesIncome(avDef, nextEngine.infamy);
        nextEngine = { ...nextEngine, av: consumeShoot(av, avDef), money: nextEngine.money + income, moneyLog: appendMoneyLog(nextEngine.moneyLog, day.value.dayNumber, `AV销售·${avDef.theme}`, income) };
        avIncome = { income, theme: avDef.theme };
      }
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
      lastRecruit.value = r.recruit ?? null;
      lastBuyCondom.value = r.buyCondom ?? null;
      lastReward.value = r.reward ?? null;
      lastProtection.value = r.protection ?? null;
      lastAvIncome.value = avIncome;
      lastNight.value = nightInfo;
      const sl = ranSlot ? `${ranSlot.period === 'day' ? '昼' : '夜'}#${ranSlot.index + 1}` : '';
      const extra: Notice[] = nightInfo ? [{ t: `夜结：供奉${nightInfo.servedToday}人·结余${nightInfo.desireLeftover}` + (nightInfo.overflowImminent ? ' ⚠次日白日供奉' : ''), tone: nightInfo.overflowImminent ? 'warn' : 'dim' }] : [];
      logNotices(`第${day.value.dayNumber}天 ${sl}`, extra);
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
    hardFailReason.value = r.daily.hardFailReason ?? null;
    failWarnings.value = r.daily.failWarnings ?? [];
    lastAttrition.value = r.daily.thugsLost ?? 0;
    forcedSeize.value = null;
    // 日终通知入历史(流失/硬失败/预警)
    {
      const ex: Notice[] = [];
      if (r.daily.thugsLost > 0) ex.push({ t: `打手流失 -${r.daily.thugsLost}（忠诚低·被挖角/出走）`, tone: 'warn' });
      if ((r.daily.prestigeDecay ?? 0) > 0) ex.push({ t: `威望自然衰减 -${r.daily.prestigeDecay}（江湖善忘）`, tone: 'dim' });
      (r.daily.failWarnings ?? []).forEach(w => ex.push({ t: w, tone: 'warn' }));
      if (r.daily.hardFail) ex.push({ t: '☠ 硬失败：' + (r.daily.hardFailReason === 'money' ? '资金断流' : '威望枯竭'), tone: 'err' });
      if (r.forcedLeave) ex.push({ t: '⚠ 欲望溢出 → 次日白日供奉（霸全）', tone: 'warn' });
      const d = day.value.dayNumber;
      if (ex.length) notifyLog.value = [...notifyLog.value, { day: d, label: `第${d}天 日终`, notices: ex }].filter(x => x.day >= d - 1).slice(-60);
    }
    lastSettle.value = null; lastServe.value = null; lastRecruit.value = null; lastBuyCondom.value = null; lastReward.value = null; lastProtection.value = null; lastAvIncome.value = null; lastNight.value = null; error.value = null;
  }

  function loadState(state: RunnerState, ff: boolean) {
    day.value = state.day; engine.value = state.engine; fastForward.value = ff;
    lastSettle.value = null; lastServe.value = null; lastRecruit.value = null; lastBuyCondom.value = null; lastReward.value = null; lastProtection.value = null; lastAvIncome.value = null; lastNight.value = null;
    forcedLeaveToday.value = false; forcedSeize.value = null;
    reliefCleared.value = false; hardFail.value = false; hardFailReason.value = null; failWarnings.value = []; error.value = null;
  }

  // ─── 持久化(chat 作用域·一聊天一份存档·刷新酒馆/重开聊天不丢进度) ───
  // 用酒馆"聊天变量"存一份存档 blob(engine+day+已生成正文随 day.slots.resultText 一起)。
  // 任意状态变化→防抖写回; 启动时若有存档→读回, 否则落初始并写一次。
  const SAVE_KEY = '九条会存档';
  const hasTavernVars = typeof getVariables === 'function' && typeof insertOrAssignVariables === 'function';
  let _loadingSave = false;
  let _saveTimer: ReturnType<typeof setTimeout> | null = null;
  function snapshot() {
    return JSON.parse(JSON.stringify({ v: 1, engine: engine.value, day: day.value, fastForward: fastForward.value }));
  }
  function persistNow() {
    if (_loadingSave || !hasTavernVars) return;
    try { insertOrAssignVariables({ [SAVE_KEY]: snapshot() }, { type: 'chat' }); }
    catch (e) { console.warn('[pellucid] 存档失败', e); }
  }
  function schedulePersist() { if (_saveTimer) clearTimeout(_saveTimer); _saveTimer = setTimeout(persistNow, 400); }
  function loadSave(): boolean {
    if (!hasTavernVars) return false;
    try {
      const vars = getVariables({ type: 'chat' }) || {};
      const s = (vars as any)[SAVE_KEY];
      if (s && s.engine && s.day) {
        _loadingSave = true;
        engine.value = s.engine; day.value = s.day;
        if (typeof s.fastForward === 'boolean') fastForward.value = s.fastForward;
        _loadingSave = false;
        return true;
      }
    } catch (e) { console.warn('[pellucid] 读档失败', e); }
    return false;
  }
  /** 重开新游戏(清存档→初始状态并立即写档) */
  function resetGame() {
    _loadingSave = true;
    day.value = startDay(1, TOTAL_SLOTS); engine.value = initialEngine(); fastForward.value = false;
    lastSettle.value = null; lastServe.value = null; lastRecruit.value = null; lastBuyCondom.value = null; lastReward.value = null; lastProtection.value = null; lastAvIncome.value = null; lastNight.value = null;
    forcedLeaveToday.value = false; forcedSeize.value = null; reliefCleared.value = false;
    hardFail.value = false; hardFailReason.value = null; failWarnings.value = []; error.value = null;
    _loadingSave = false; persistNow();
  }

  // ─── 通知:当前格提示(只此一格) + 历史日志(最近两天) ───
  function buildSlotNotices(): Notice[] {
    const out: Notice[] = [];
    if (lastEmpty.value && lastWarn.value) out.push({ t: '⚠ ' + lastWarn.value, tone: 'warn' });
    if (lastServe.value) out.push({ t: `供奉 ${lastServe.value.served}人 · 欲望-${lastServe.value.desireRelieved} · 套-${lastServe.value.condomUsed}` + (lastServe.value.condomShort ? '（库存不足!）' : ''), tone: lastServe.value.condomShort ? 'err' : 'rose' });
    if (lastSettle.value?.events.isFirstSpecial) out.push({ t: `◆ 首次特殊 堕落+${lastSettle.value.events.corruptionGain}` + (lastSettle.value.events.cognitionAdvancedTo ? ` → ${lastSettle.value.events.cognitionAdvancedTo}` : ''), tone: 'rose' });
    if (lastSettle.value?.events.firedGateIds.length) out.push({ t: '◆ ' + lastSettle.value.events.firedGateIds.map(g => '堕落度（' + g.replace(/\D/g, '') + '）').join('、') + ' 奖励', tone: 'gold' });
    if (lastRecruit.value && lastRecruit.value.recruited > 0) out.push({ t: `+${lastRecruit.value.recruited}打手 (¥${lastRecruit.value.cost})`, tone: 'ok' });
    if (lastBuyCondom.value && lastBuyCondom.value.bought > 0) out.push({ t: `+${lastBuyCondom.value.bought}避孕套`, tone: 'ok' });
    if (lastReward.value && lastReward.value.gained > 0) out.push({ t: `犒赏打手 · 极道忠诚 +${lastReward.value.gained}`, tone: 'gold' });
    if (lastProtection.value && lastProtection.value.income > 0) out.push({ t: `收保护费 +¥${lastProtection.value.income.toLocaleString()}`, tone: 'ok' });
    if (lastAvIncome.value && lastAvIncome.value.income > 0) out.push({ t: `AV销售 +¥${lastAvIncome.value.income.toLocaleString()}（${lastAvIncome.value.theme}）`, tone: 'gold' });
    if (lastTurf.value) out.push({ t: lastTurf.value.msg, tone: lastTurf.value.ok ? 'ok' : 'warn' });
    return out;
  }
  function logNotices(label: string, extra: Notice[] = []) {
    const notices = [...extra, ...buildSlotNotices()];
    if (!notices.length) return;
    const d = day.value.dayNumber;
    notifyLog.value = [...notifyLog.value, { day: d, label, notices }].filter(x => x.day >= d - 1).slice(-60);
  }

  // 启动: 有存档→读回; 无→落初始并写一次。之后任意状态变化自动防抖存。
  const _hadSave = loadSave();
  if (!_hadSave) persistNow();
  watch([day, engine, fastForward], schedulePersist, { deep: true });

  return {
    day, engine, fastForward, busy, lastSettle, lastServe, lastRecruit, lastNight,
    lastReward, lastProtection, lastAvIncome, lastAttrition, notifyLog,
    forcedLeaveToday, forcedSeize, reliefCleared, hardFail, hardFailReason, failWarnings, error,
    lastEmpty, lastWarn, genHint, lastBuyCondom,
    currentSlot: currentSlotRef, canRunCurrent, runnerState,
    aiMode, hasSave: _hadSave, hasTavernVars,
    combatPowerNow, lastTurf, attackRegion,
    pendingMap, currentMapKind, beginMapSelect, cancelMapSelect, resolveMapSlot,
    lastUpgrade, buyUpgrade, lastAv, queueAvShoot,
    setFastForward, allocate, setChoice, clearChoice, fillEmpty,
    beginDay, beginNight, runCurrent, rerunLast, nextDay, loadState,
    useMock, useTavern, saveNow: persistNow, resetGame,
  };
});

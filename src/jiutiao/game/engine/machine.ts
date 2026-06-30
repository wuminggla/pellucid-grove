// 回合引擎 · 核心编排（settleSlot）
// 把 paradigm → AI/快进 → extract防胡诌 → economy/corruption 串成一条结算流水线。
// 纯逻辑（AI 经 AiPort 注入），可用 mock 单测。

import { resolveEvent, markMilestone } from '../events/machine';
import { gainCorruption, attitudeForStage } from '../corruption/machine';
import { gainMartialPrestige, gainInfamy, isAvUnlocked } from '../prestige/machine';
import { prestigeMultiplier } from '../upgrade/machine';
import { deriveEventUnlocked } from './unlocked';
import { applyA4, advanceBodyDevelopment } from '../intrusion/machine';
import type { BodyPart } from '../intrusion/machine';
import type {
  EngineState, SlotInput, SettleOptions, SettleResult, SettleEvents, AiPort, ExtractRequest,
} from './types';
import type { EventContext } from '../events/types';

/**
 * 快进总结词模板填充（不调AI）。例："大小姐被{n}人插入了" + {n:36} → "大小姐被36人插入了"。
 * 占位 {key} 用 vars[key] 替换；缺失则保留 {key} 便于发现。
 */
export function fastSummaryText(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? `{${k}}`));
}

/**
 * 防胡诌：清洗 AI2 抓的数值。
 * 原则（findings②，宽松防胡诌）：只 ban 过于离谱的值（超出 bounds），不死抠。
 * 越界字段被丢弃（保留旧值），记入 rejected 供调试。
 */
export function sanitizeExtract(
  raw: Record<string, unknown>,
  bounds: Record<string, [number, number]> = {},
): { clean: Record<string, number>; rejected: string[] } {
  const clean: Record<string, number> = {};
  const rejected: string[] = [];
  for (const [k, v] of Object.entries(raw)) {
    const num = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(num)) { rejected.push(k); continue; }
    const b = bounds[k];
    if (b && (num < b[0] || num > b[1])) { rejected.push(k); continue; }
    clean[k] = num;
  }
  return { clean, rejected };
}

/** 从 EngineState 构造 events 上下文 */
function eventCtxOf(state: EngineState): EventContext {
  return {
    corruption: state.corruption,
    cognition: state.cognition,
    infamy: state.infamy,
    thugs: state.thugTotal,
    triggeredLedger: state.triggeredSpecials,
    unlocked: deriveEventUnlocked(state),
  };
}

/**
 * 结算一个行动格。完整流水线（统一事件模型 + 双判定）：
 *  1. resolveEvent：判定一 —— 该选项当前用 SFW/NSFW/首次特殊范式 + renderMode。
 *  2. attitudeForStage：判定二 —— 当前认知防线态度层。
 *  3. 出正文：
 *     - fast_summary：不调AI，用 summaryTemplates[optionId] 填在场人数。
 *     - 否则：调 AI1 expand（带 resolution + attitude 双判定）。
 *  4. extract：调 AI2 抓叙事数值（快进跳过）→ sanitizeExtract 防胡诌。
 *  5. corruption：若首次里程碑，gainCorruption + 奖励闸门 + 写账本。
 *  6. 返回新 state + 正文 + 事件。
 *
 * 注：硬经营数值（资金/避孕套/威望）不在此函数结算——由 economy 公式在时段/每日结算（防胡诌）。
 */
export async function settleSlot(
  state: EngineState,
  choice: SlotInput,
  opts: SettleOptions,
): Promise<SettleResult> {
  const option = opts.eventOptions[choice.optionId];
  if (!option) throw new Error(`未注册的事件选项: ${choice.optionId}`);

  const resolution = resolveEvent(option, eventCtxOf(state), opts.fastForward);
  // SlotChoice.params.avInlinePrompt 携带玩家定制 AV 范式时,覆盖 paradigm.inlinePrompt
  // (av_custom 事件由 UI 调 buildAvParadigm 生成 prompt 后通过 params 注入,避免污染 EventOption)
  if (choice.params && typeof choice.params.avInlinePrompt === 'string') {
    resolution.paradigm = {
      ...resolution.paradigm,
      inlinePrompt: choice.params.avInlinePrompt as string,
    };
  }
  const mode = resolution.renderMode;
  const attitude = attitudeForStage(state.cognition);

  // —— 出正文 ——
  let resultText: string;
  let continuity: string | undefined;
  let extracted: Record<string, number> = {};
  let rejected: string[] = [];

  if (mode === 'fast_summary') {
    const tpl = opts.summaryTemplates?.[choice.optionId] ?? '（已结算）';
    resultText = fastSummaryText(tpl, { n: state.presentCount });
    // 快进不调AI：叙事数值用场景上下文兜底（在场人数已知）；快进无延续摘要
  } else {
    const ai: AiPort = opts.ai;
    const ex = await ai.expand({ resolution, attitude, choice, state });
    resultText = ex.text;
    continuity = ex.continuity;
    const req: ExtractRequest = { narrative: resultText, choice, state };
    const raw = await ai.extract(req);
    const s = sanitizeExtract(raw, opts.extractBounds);
    extracted = s.clean;
    rejected = s.rejected;
  }

  // —— 应用叙事数值 ——
  // 注:在场人数(presentCount)已改为"忠诚驱动·每格刷新"的游戏数值(见 day-runner),不再由 AI extract 覆盖。
  let next: EngineState = { ...state };
  void extracted;

  // —— 堕落结算（仅首次里程碑）——
  let cognitionAdvancedTo = null as SettleResult['events']['cognitionAdvancedTo'];
  let firedGateIds: string[] = [];
  if (resolution.isFirstMilestone) {
    const cr = gainCorruption(
      { corruption: next.corruption, cognition: next.cognition, claimedGates: next.claimedGates },
      resolution.corruptionGain,
    );
    next.corruption = cr.corruption;
    next.cognition = cr.cognition;
    next.claimedGates = cr.claimedGates;
    cognitionAdvancedTo = cr.cognitionAdvancedTo;
    firedGateIds = cr.firedGates.map(g => g.gateId);
    // 奖励闸门发的钱/打手直接落资源（堕落易）
    for (const g of cr.firedGates) {
      next.money += g.reward.money ?? 0;
      next.thugTotal += g.reward.thugs ?? 0;
    }
    // 写首发账本（单一first=first.ledgerKey;多阶段=该阶段ledgerKey）→ 下次该选项/阶段落常规态
    const ledgerKey = resolution.milestoneLedgerKey ?? option.first?.ledgerKey;
    if (ledgerKey) next.triggeredSpecials = markMilestone(next.triggeredSpecials, ledgerKey);
    // 首次里程碑副作用钩子(如首次AV → initAvOnUnlock 设 unlocked.av)
    if (option.first?.onApply) {
      next = { ...next, ...option.first.onApply(next) } as EngineState;
    }
  }

  // —— 威望进账（每次结算都给）：战斗→极道威望 / AV·轮奸规模→淫名(仅AV解锁后) ——
  let martialGain = 0;
  let infamyGain = 0;
  const pm = prestigeMultiplier(next.upgrades); // 威望增长系数(升级)
  if (option.martialReward) {
    const amt = Math.round(option.martialReward * pm);
    const g = gainMartialPrestige(
      { martialPrestige: next.martialPrestige, martialGainToday: next.martialGainToday ?? 0 },
      amt,
    );
    next.martialPrestige = g.martialPrestige;
    next.martialGainToday = g.martialGainToday;
    martialGain = amt;
  }
  if (option.infamyReward && isAvUnlocked(next.unlocked)) {
    const amt = Math.round(option.infamyReward * pm);
    next.infamy = gainInfamy(next.infamy, amt);
    infamyGain = amt;
  }

  // —— A4 日常侵蚀(可选·NSFW 态且事件标 a4 时触发) ——
  // 设计正典§4: A 面 NSFW 事件结算后掷隐瞒判定,路由威望(成功→极道/失败→部分转淫名+忠诚)。
  // 同时推进对应身体部位开发度(到阈值后强化 A4 触发概率,目前未在此处用,留给未来扫描器消费)。
  let a4Report: SettleEvents['a4'] = undefined;
  if (option.a4 && resolution.isNsfw) {
    const roll = opts.rng ? opts.rng() : 0.5;
    const r = applyA4(next, {
      martialBase: option.a4.martialBase,
      transferRatio: option.a4.transferRatio,
      loyaltyOnFail: option.a4.loyaltyOnFail,
      conceal: { martialPrestige: next.martialPrestige, roll },
    });
    next = r.state;
    a4Report = {
      concealed: r.concealed,
      martialGained: r.martialGained,
      martialTransferred: r.martialTransferred,
      loyaltyDelta: r.loyaltyDelta,
    };
    // 顺手推进身体部位(若事件标了 developsPart)
    if (option.a4.developsPart) {
      const part: BodyPart = option.a4.developsPart;
      const adv = advanceBodyDevelopment(next, part, 1);
      next = adv.state;
      if (adv.advanced) {
        a4Report.developedPart = part;
        a4Report.developedTo = adv.newLevel;
      }
    }
    // 成功的极道威望计入今日流量(martialGainToday 由 applyA4 内部 gainMartialPrestige 同步)
    if (r.martialGained > 0) {
      martialGain += r.martialGained;
    }
  }

  return {
    state: next,
    resultText,
    events: {
      renderMode: mode,
      isFirstSpecial: resolution.isFirstMilestone,
      corruptionGain: resolution.corruptionGain,
      cognitionAdvancedTo,
      firedGateIds,
      isNsfw: resolution.isNsfw,
      martialGain,
      infamyGain,
      continuity,
      rejectedFields: rejected,
      a4: a4Report,
    },
  };
}

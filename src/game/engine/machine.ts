// 回合引擎 · 核心编排（settleSlot）
// 把 paradigm → AI/快进 → extract防胡诌 → economy/corruption 串成一条结算流水线。
// 纯逻辑（AI 经 AiPort 注入），可用 mock 单测。

import { resolveEvent, markMilestone } from '../events/machine';
import { gainCorruption, attitudeForStage } from '../corruption/machine';
import { gainMartialPrestige, gainInfamy, isAvUnlocked } from '../prestige/machine';
import type {
  EngineState, SlotInput, SettleOptions, SettleResult, AiPort, ExtractRequest,
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
    unlocked: state.unlocked,
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

  // —— 应用叙事数值（在场人数等，来自 extract；快进时无）——
  let next: EngineState = { ...state };
  if (typeof extracted.presentCount === 'number') {
    next.presentCount = extracted.presentCount;
  }

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
  }

  // —— 威望进账（每次结算都给）：战斗→极道威望 / AV·轮奸规模→淫名(仅AV解锁后) ——
  let martialGain = 0;
  let infamyGain = 0;
  if (option.martialReward) {
    const g = gainMartialPrestige(
      { martialPrestige: next.martialPrestige, martialGainToday: next.martialGainToday ?? 0 },
      option.martialReward,
    );
    next.martialPrestige = g.martialPrestige;
    next.martialGainToday = g.martialGainToday;
    martialGain = option.martialReward;
  }
  if (option.infamyReward && isAvUnlocked(next.unlocked)) {
    next.infamy = gainInfamy(next.infamy, option.infamyReward);
    infamyGain = option.infamyReward;
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
    },
  };
}

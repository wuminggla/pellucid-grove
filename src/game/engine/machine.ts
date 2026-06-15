// 回合引擎 · 核心编排（settleSlot）
// 把 paradigm → AI/快进 → extract防胡诌 → economy/corruption 串成一条结算流水线。
// 纯逻辑（AI 经 AiPort 注入），可用 mock 单测。

import { pickParadigm, recordTriggered, renderModeFor, fastSummaryText } from '../paradigm/machine';
import { gainCorruption } from '../corruption/machine';
import type {
  EngineState, SlotInput, SettleOptions, SettleResult, AiPort, ExtractRequest,
} from './types';
import type { ParadigmContext } from '../paradigm/types';

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

/** 构造 paradigm 上下文 */
function ctxOf(state: EngineState): ParadigmContext {
  return { triggeredSpecials: state.triggeredSpecials, unlocked: state.unlocked };
}

/**
 * 结算一个行动格。完整流水线：
 *  1. pickParadigm：选范式 + 判首次特殊。
 *  2. renderModeFor：决定 ai_full / ai_brief / fast_summary（快进）。
 *  3. 出正文：
 *     - fast_summary：不调AI，用 summaryTemplates[optionId] 填在场人数等。
 *     - ai_full/ai_brief：调 AI1 expand。
 *  4. extract：调 AI2 抓叙事数值（快进模式跳过，用场景上下文兜底）→ sanitizeExtract 防胡诌。
 *  5. corruption：若首次特殊，gainCorruption（堕落度+认知防线+奖励闸门），并写账本。
 *  6. 返回新 state + 正文 + 事件。
 *
 * 注：硬经营数值（资金/避孕套/威望）不在此函数直接结算——它们由 economy 公式在
 *     时段/每日结算时算（防胡诌）。本函数只处理"单格叙事数值 + 堕落 + 奖励闸门资源"。
 */
export async function settleSlot(
  state: EngineState,
  choice: SlotInput,
  opts: SettleOptions,
): Promise<SettleResult> {
  const pick = pickParadigm(opts.registry, choice.optionId, ctxOf(state), choice.paradigmId);
  const mode = renderModeFor(pick, opts.fastForward);

  // —— 出正文 ——
  let resultText: string;
  let extracted: Record<string, number> = {};
  let rejected: string[] = [];

  if (mode === 'fast_summary') {
    const tpl = opts.summaryTemplates?.[choice.optionId] ?? '（{n}人已结算）';
    resultText = fastSummaryText(tpl, { n: state.presentCount });
    // 快进不调AI：叙事数值用场景上下文兜底（在场人数已知）
  } else {
    const ai: AiPort = opts.ai;
    resultText = await ai.expand({ pick, mode, choice, state });
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

  // —— 堕落结算（仅首次特殊事件）——
  let cognitionAdvancedTo = null as SettleResult['events']['cognitionAdvancedTo'];
  let firedGateIds: string[] = [];
  if (pick.isFirstSpecial) {
    const cr = gainCorruption(
      { corruption: next.corruption, cognition: next.cognition, claimedGates: next.claimedGates },
      pick.corruptionGain,
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
    // 写首发账本 → 下次该范式退化略写
    next.triggeredSpecials = recordTriggered(next.triggeredSpecials, pick.paradigm.paradigmId);
  }

  return {
    state: next,
    resultText,
    events: {
      renderMode: mode,
      isFirstSpecial: pick.isFirstSpecial,
      corruptionGain: pick.isFirstSpecial ? pick.corruptionGain : 0,
      cognitionAdvancedTo,
      firedGateIds,
      rejectedFields: rejected,
    },
  };
}

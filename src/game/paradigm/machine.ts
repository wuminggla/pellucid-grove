// 范式筛选系统 · 核心逻辑（纯函数）
// pickParadigm: 玩家选了某 optionId → 决定用哪个范式 + 是否首次特殊事件。

import type { ParadigmDef, ParadigmContext, ParadigmPick } from './types';

/** 范式注册表（按 optionId 索引）。MVP 阶段内容后填，结构先定。 */
export type ParadigmRegistry = Record<string, ParadigmDef[]>;

/** 某选项是否满足解锁前置（入池条件） */
export function isUnlocked(def: ParadigmDef, ctx: ParadigmContext): boolean {
  if (!def.unlockRequires || def.unlockRequires.length === 0) return true;
  return def.unlockRequires.every(req => ctx.unlocked[req] === true);
}

/**
 * 列出某 optionId 当前"可选/可入池"的范式（已满足解锁前置）。
 * 用于行动格下拉：只展示已解锁的选项。
 */
export function availableParadigms(
  registry: ParadigmRegistry, optionId: string, ctx: ParadigmContext,
): ParadigmDef[] {
  return (registry[optionId] ?? []).filter(def => isUnlocked(def, ctx));
}

/**
 * 核心：为玩家选中的 optionId 筛选范式。
 * 规则（findings 核心定位锚）：
 *  - 非特殊选项(isSpecial=false) → daily 范式，略写，不加堕落度。
 *  - 特殊选项：
 *     - 账本中未触发过(首次) → special_first，重点扩写，记账本+加堕落度(corruptionWeight)。
 *     - 账本中已触发过(非首次) → special_repeat，退化略写，不再加堕落度。
 *  - "是否首次"完全由代码查账本判定，不靠 AI。
 *  - 首次范式被消费后，上层负责写账本(triggeredSpecials[paradigmId]=true)，
 *    使其下次自动落入 special_repeat —— 即"首次范式从池中排除"的代码实现。
 *
 * @param preferParadigmId 同一 optionId 下有多个范式时，指定选哪个（如玩家在下拉里选了具体项）；
 *                         不指定则取第一个已解锁的。
 */
export function pickParadigm(
  registry: ParadigmRegistry,
  optionId: string,
  ctx: ParadigmContext,
  preferParadigmId?: string,
): ParadigmPick {
  const candidates = availableParadigms(registry, optionId, ctx);
  if (candidates.length === 0) {
    throw new Error(`选项 ${optionId} 无可用范式（未注册或未解锁）`);
  }
  const def = preferParadigmId
    ? candidates.find(d => d.paradigmId === preferParadigmId) ?? candidates[0]
    : candidates[0];

  if (!def.isSpecial) {
    return {
      paradigm: def, kind: 'daily', isFirstSpecial: false,
      corruptionGain: 0, worldbookKey: def.worldbookKey,
    };
  }

  const triggered = ctx.triggeredSpecials[def.paradigmId] === true;
  if (!triggered) {
    return {
      paradigm: def, kind: 'special_first', isFirstSpecial: true,
      corruptionGain: def.corruptionWeight ?? 1, worldbookKey: def.worldbookKey,
    };
  }
  // 已触发过 → 退化略写
  return {
    paradigm: def, kind: 'special_repeat', isFirstSpecial: false,
    corruptionGain: 0, worldbookKey: def.worldbookKey,
  };
}

/** 消费首次特殊事件后，返回更新后的账本（纯函数，不改入参）。 */
export function recordTriggered(
  triggeredSpecials: Record<string, boolean>, paradigmId: string,
): Record<string, boolean> {
  return { ...triggeredSpecials, [paradigmId]: true };
}

// ───────────────────────────────────────
// 快进模式（用户修改2）
// ───────────────────────────────────────

/** 单格的执行方式 */
export type RenderMode =
  | 'ai_full'    // 调 AI1 重点扩写（特殊事件首次，或非快进时）
  | 'ai_brief'   // 调 AI1 略写（非快进时的日常/重复特殊）
  | 'fast_summary';// 快进：不调AI，系统输出 CG+总结词，直接更新变量

/**
 * 决定某次行动格执行用哪种渲染方式。
 * 规则（用户修改2）：
 *  - 快进开启 且 非首次特殊事件 → fast_summary（不调AI，CG+总结词+直接更新变量）。
 *  - 首次特殊事件 → 永远 ai_full（堕落里程碑不跳过，即使快进开着）。
 *  - 非快进：首次特殊=ai_full，其余=ai_brief（略写）。
 */
export function renderModeFor(pick: ParadigmPick, fastForward: boolean): RenderMode {
  if (pick.isFirstSpecial) return 'ai_full';        // 首次特殊永远完整扩写
  if (fastForward) return 'fast_summary';           // 快进跳过其余
  return 'ai_brief';                                 // 非快进的日常/重复=略写
}

/**
 * 快进的系统总结词模板填充（不调AI）。
 * 模板放这里只是结构占位；具体措辞库后续可扩充/挪到配置。
 * 例："大小姐被{n}人插入了" / "大小姐给{n}人侍奉了"。
 */
export function fastSummaryText(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? `{${k}}`));
}

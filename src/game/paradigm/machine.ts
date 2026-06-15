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

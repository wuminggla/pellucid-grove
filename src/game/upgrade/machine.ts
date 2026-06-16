// 升级系统 · 核心逻辑（纯函数·数据驱动）
// catalog 是单一真相源；引擎(canUpgrade/applyUpgrade/combatBonus)只认 UpgradeDef 结构。
// C1：升级引擎 + 打手升级(战力)。设施/扩张项在 C2 append。

import type { UpgradeDef, UpgradeRequire } from './types';

// ───────────────────────────────────────
// catalog · 打手升级（群体·作用全体打手）
// 卡琳典狱长式数值叙事：花钱给操自己的人升级，升级项本身=色情联想。
// 兵器/格斗=纯战力(大)；精力/体型/器具=纯NSFW联想+统一小战力(用户定)。
// ───────────────────────────────────────
export const THUG_UPGRADES: UpgradeDef[] = [
  { id: 'weapon',    category: 'thug', name: '兵器装备', desc: '武装到牙齿，据点战更凶',     cost: 2500, maxLevel: 5, effect: { kind: 'combat', perLevel: 0.10 } },
  { id: 'martial',   category: 'thug', name: '格斗训练', desc: '肉搏战阵磨砺，以一当十',     cost: 2500, maxLevel: 5, effect: { kind: 'combat', perLevel: 0.10 } },
  { id: 'stamina',   category: 'thug', name: '精力强化', desc: '伟哥与持久，夜夜不歇',       cost: 2500, maxLevel: 5, effect: { kind: 'combat', perLevel: 0.03 } },
  { id: 'physique',  category: 'thug', name: '体型改造', desc: '增肌壮根，体格碾压',         cost: 2500, maxLevel: 5, effect: { kind: 'combat', perLevel: 0.03 } },
  { id: 'gear',      category: 'thug', name: '调教器具', desc: '地下室刑具与玩物，调教升级', cost: 2500, maxLevel: 5, effect: { kind: 'combat', perLevel: 0.03 } },
];

/** 全部升级项（C1=thug；C2 会 concat facility/expansion） */
export const UPGRADES: UpgradeDef[] = [...THUG_UPGRADES];

/** 按 id 索引 */
export const UPGRADES_BY_ID: Record<string, UpgradeDef> =
  Object.fromEntries(UPGRADES.map(u => [u.id, u]));

// ───────────────────────────────────────
// 状态切片与查询
// ───────────────────────────────────────

/** 升级引擎读写的状态切片（EngineState 结构兼容） */
export interface UpgradeState {
  money: number;
  corruption: number;
  upgrades?: Record<string, number>;
  occupyScale?: number; // 占据规模档序号（扩张项 requires 用；地盘系统未做先占位）
}

/** 某升级项当前等级 */
export function getLevel(upgrades: Record<string, number> | undefined, id: string): number {
  return upgrades?.[id] ?? 0;
}

/** 前置依赖是否全满足 */
export function requiresMet(reqs: UpgradeRequire[] | undefined, state: UpgradeState): boolean {
  if (!reqs || reqs.length === 0) return true;
  return reqs.every(r => {
    if (r.upgradeId != null && getLevel(state.upgrades, r.upgradeId) < (r.minLevel ?? 1)) return false;
    if (r.occupyAtLeast != null && (state.occupyScale ?? 0) < r.occupyAtLeast) return false;
    return true;
  });
}

export interface UpgradeCheck {
  ok: boolean;
  reason?: string;
}

/** 能否升级该项：前置→满级→堕落门槛→资金，依次判定 */
export function canUpgrade(def: UpgradeDef, state: UpgradeState): UpgradeCheck {
  if (!requiresMet(def.requires, state)) return { ok: false, reason: '前置未满足' };
  const lvl = getLevel(state.upgrades, def.id);
  if (lvl >= def.maxLevel) return { ok: false, reason: '已满级' };
  const gate = def.corruptionGate?.[lvl]; // 升到 lvl+1（index=lvl）所需堕落度
  if (gate != null && state.corruption < gate) return { ok: false, reason: `需堕落度≥${gate}` };
  if (state.money < def.cost) return { ok: false, reason: '资金不足' };
  return { ok: true };
}

/**
 * 应用升级（扣钱+升级；效果应用）。调用方应先 canUpgrade。
 * C1：combat 为派生(不写字段,由 combatBonus 汇总)。facility/expansion 效果在 C2 扩展。
 */
export function applyUpgrade<S extends UpgradeState>(state: S, def: UpgradeDef): S {
  const lvl = getLevel(state.upgrades, def.id);
  return {
    ...state,
    money: state.money - def.cost,
    upgrades: { ...(state.upgrades ?? {}), [def.id]: lvl + 1 },
  };
}

/** 打手升级总战力加成（派生：Σ 各 combat 项等级×每级比例）。combatPower 乘 (1+此值)。 */
export function combatBonus(upgrades: Record<string, number> | undefined): number {
  let bonus = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'combat') bonus += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return bonus;
}

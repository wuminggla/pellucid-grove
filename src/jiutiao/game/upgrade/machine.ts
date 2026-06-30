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

// ───────────────────────────────────────
// catalog · 设施升级（经营数值·作用大宅与凛）
// ───────────────────────────────────────
export const FACILITY_UPGRADES: UpgradeDef[] = [
  { id: 'action_slots', category: 'facility', name: '行动格扩容', desc: '扩充每日可支配行动格(给挑战玩家留活路)', cost: 4000, maxLevel: 12, effect: { kind: 'actionSlots', perLevel: 1 } },
  // 吞吐扩容：堕落解档+花钱(用户定)。每级+6人(6→12→18→24→30)，门槛取非四分之一节点
  { id: 'throughput', category: 'facility', name: '吞吐扩容', desc: '每格供奉处理更多人(堕落越深越高效)', cost: 3000, maxLevel: 4, corruptionGate: [0, 15, 35, 60], effect: { kind: 'throughput', perLevel: 6 } },
  { id: 'desire_cap', category: 'facility', name: '欲望承载上限', desc: '打手更耐欲望积压，拖延强制请假轮奸', cost: 3000, maxLevel: 10, effect: { kind: 'desireCap', perLevel: 20 } },
  { id: 'purchase', category: 'facility', name: '采购扩容', desc: '提升避孕套单次采购上限', cost: 3000, maxLevel: 6, effect: { kind: 'purchaseMult', perLevel: 0.5 } },
  { id: 'fortify', category: 'facility', name: '据点加固', desc: '提升地盘稳定与防守，降骚扰/进攻', cost: 3000, maxLevel: 5, effect: { kind: 'turfFortify', perLevel: 1 } },
];

// ───────────────────────────────────────
// catalog · 扩张解锁（解锁NSFW区域与系统·数据驱动可无限扩展）
// 用 unlock/occupyScale 通用效果 + requires 前置，体现"扩张/解锁带来新升级任务"。
// ───────────────────────────────────────
export const EXPANSION_UPGRADES: UpgradeDef[] = [
  { id: 'expand_turf', category: 'expansion', name: '地盘扩张', desc: '吞并周边空间，占据规模逐档抬升(解锁扩张日常选项)', cost: 6000, maxLevel: 5, effect: { kind: 'occupyScale', perLevel: 1 } },
  { id: 'basement', category: 'expansion', name: '改建地下室', desc: '刑具与拘禁设施，解锁暴力供奉(受虐癖线)', cost: 5000, maxLevel: 1, effect: { kind: 'unlock', unlockKey: 'basement' } },
  { id: 'studio', category: 'expansion', name: '暗网摄影室', desc: '解锁AV拍摄系统', cost: 8000, maxLevel: 1, effect: { kind: 'unlock', unlockKey: 'av' } },
  // 庭院：前置=占据规模达"附近片区"(档2)，体现地盘扩张带来新升级任务
  { id: 'courtyard', category: 'expansion', name: '假山庭院放风区', desc: '露天放风/遛母狗等NSFW区域', cost: 5000, maxLevel: 1, requires: [{ occupyAtLeast: 2 }], effect: { kind: 'unlock', unlockKey: 'courtyard' } },
  // AV设备升级：前置=先建摄影室，体现解锁带来新升级任务
  { id: 'av_gear', category: 'expansion', name: 'AV设备升级', desc: '专业器材与场地，提升AV规模(前置:摄影室)', cost: 4000, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'av_advanced' } },
  // AV 周产能：每级 +1 本周可拍摄部数(前置:摄影室)。AV 单部收益高,靠周次数限制平衡。
  { id: 'av_quota', category: 'expansion', name: 'AV周产能扩充', desc: '雇佣班底，每周可多拍一部AV(单部收益高·靠周次数平衡)', cost: 7000, maxLevel: 4, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  // AV 时长扩容：每级 +24h 上限(前置:摄影室)
  { id: 'av_duration', category: 'expansion', name: 'AV时长扩容', desc: '更大场地与排班，提升单部AV时长上限(+24h/级)', cost: 4000, maxLevel: 5, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
];

/** 全部升级项（三类合并） */
export const UPGRADES: UpgradeDef[] = [...THUG_UPGRADES, ...FACILITY_UPGRADES, ...EXPANSION_UPGRADES];

/** 按 id 索引 */
export const UPGRADES_BY_ID: Record<string, UpgradeDef> =
  Object.fromEntries(UPGRADES.map(u => [u.id, u]));

// ───────────────────────────────────────
// 状态切片与查询
// ───────────────────────────────────────

/** 升级引擎读写的状态切片（EngineState 结构兼容）。含 applyUpgrade 效果作用的目标字段。 */
export interface UpgradeState {
  money: number;
  corruption: number;
  upgrades?: Record<string, number>;
  // —— 效果目标字段（applyUpgrade 按 effect.kind 写入）——
  occupyScale?: number;          // 占据规模档序号（地盘扩张；扩张项 requires 用）
  perSlotThroughput?: number;    // 每格供奉吞吐（吞吐扩容）
  desireCapacity?: number;       // 欲望承载上限
  totalSlots?: number;           // 每日总行动格（行动格扩容）
  purchaseUpgradeMult?: number;  // 采购扩容倍率
  turfFortifyBonus?: number;     // 据点加固加成
  unlocked?: Record<string, boolean>; // 解锁集（地下室/摄影室/庭院…）
}

/** 行动格基数（行动格扩容在此之上加） */
export const BASE_ACTION_SLOTS = 8;

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
 * 应用升级（扣钱+升级+效果作用）。调用方应先 canUpgrade。
 * combat 为派生(不写字段,由 combatBonus 汇总)；其余效果作用到对应状态字段(增量)。
 */
export function applyUpgrade<S extends UpgradeState>(state: S, def: UpgradeDef): S {
  const lvl = getLevel(state.upgrades, def.id);
  const e = def.effect;
  const d = e.perLevel ?? 0;
  const patch: Partial<UpgradeState> = {
    money: state.money - def.cost,
    upgrades: { ...(state.upgrades ?? {}), [def.id]: lvl + 1 },
  };
  switch (e.kind) {
    case 'combat': break; // 派生，不写字段
    case 'throughput':   patch.perSlotThroughput = (state.perSlotThroughput ?? 6) + d; break;
    case 'desireCap':    patch.desireCapacity = (state.desireCapacity ?? 60) + d; break;
    case 'actionSlots':  patch.totalSlots = (state.totalSlots ?? BASE_ACTION_SLOTS) + d; break;
    case 'purchaseMult': patch.purchaseUpgradeMult = (state.purchaseUpgradeMult ?? 1) + d; break;
    case 'turfFortify':  patch.turfFortifyBonus = (state.turfFortifyBonus ?? 0) + d; break;
    case 'occupyScale':  patch.occupyScale = (state.occupyScale ?? 0) + d; break;
    case 'unlock':
      if (e.unlockKey) patch.unlocked = { ...(state.unlocked ?? {}), [e.unlockKey]: true };
      break;
  }
  return { ...state, ...patch } as S;
}

/** 打手升级总战力加成（派生：Σ 各 combat 项等级×每级比例）。combatPower 乘 (1+此值)。 */
export function combatBonus(upgrades: Record<string, number> | undefined): number {
  let bonus = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'combat') bonus += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return bonus;
}

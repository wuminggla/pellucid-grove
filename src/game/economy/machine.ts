// 经济系统 · 核心公式（纯函数）
// 职责：经济模型_v1.md 的所有数值公式落地。避孕套/供奉吞吐/欲望滚雪球/武力/招募/采购。
// 全部纯函数，便于单测与回退。起调常数集中在 CONST，便于调平。

// ───────────────────────────────────────
// 起调常数（集中管理，便于数值调平）
// ───────────────────────────────────────
export const CONST = {
  避孕套每人消耗: 3,          // 每打手每场消耗
  危险期套消耗倍率: 1.5,       // 经期=危险期时
  忠诚武力系数基准: 100,       // 武力 = 可用打手 × (忠诚/基准)
  欲望基础增量: 2,            // 每个未供奉打手每晚 +2
  欲望连续翻倍倍率: 2,        // 单打手连续3晚未供奉，其贡献翻倍
  欲望连续阈值天数: 3,
  采购单格基础上限: 360,      // 单次采购(占1白天格)基础上限,个
} as const;

// ───────────────────────────────────────
// 供奉吞吐与覆盖
// ───────────────────────────────────────

/** 一晚供奉总覆盖人数 = 夜晚格数 × 每格吞吐 */
export function nightCoverage(nightSlots: number, perSlotThroughput: number): number {
  return Math.max(0, Math.floor(nightSlots * perSlotThroughput));
}

/** 覆盖某打手数所需的夜晚格数 = ceil(打手数 / 每格吞吐) */
export function slotsNeededFor(thugCount: number, perSlotThroughput: number): number {
  if (perSlotThroughput <= 0) return Infinity;
  return Math.ceil(thugCount / perSlotThroughput);
}

/** 本晚未被供奉的打手数（覆盖不足的缺口） */
export function unservedCount(thugCount: number, coverage: number): number {
  return Math.max(0, thugCount - coverage);
}

// ───────────────────────────────────────
// 避孕套
// ───────────────────────────────────────

/** 一场性事件的避孕套消耗 = 在场人数 × 每人消耗 ×(危险期倍率) */
export function condomCost(presentCount: number, isDangerousPeriod: boolean): number {
  const base = presentCount * CONST.避孕套每人消耗;
  return Math.ceil(base * (isDangerousPeriod ? CONST.危险期套消耗倍率 : 1));
}

/** 采购单次上限 = 基础 × 控制店铺数 × 地盘稳定系数(0~1) ×(采购扩容升级倍率) */
export function purchaseCap(
  shops: number, stabilityPercent: number, purchaseUpgradeMult = 1,
): number {
  const stability = Math.max(0, Math.min(100, stabilityPercent)) / 100;
  return Math.floor(CONST.采购单格基础上限 * Math.max(1, shops) * stability * purchaseUpgradeMult);
}

/** 库存扣减后是否进入告急(<10个简化阈值,可调) / 归零 */
export function condomStatus(stock: number): '充足' | '告急' | '废除' {
  if (stock <= 0) return '废除'; // 归零 = 触发内射/怀孕判定链(由 endings 处理)
  if (stock < 10) return '告急';
  return '充足';
}

// ───────────────────────────────────────
// 欲望滚雪球
// ───────────────────────────────────────

/**
 * 计算本晚欲望增量。
 * @param unserved 本晚未供奉打手数
 * @param longUnservedCount 其中"已连续≥3晚未供奉"的打手数(他们贡献翻倍)
 */
export function desireGain(unserved: number, longUnservedCount: number): number {
  const normal = (unserved - longUnservedCount) * CONST.欲望基础增量;
  const doubled = longUnservedCount * CONST.欲望基础增量 * CONST.欲望连续翻倍倍率;
  return Math.max(0, Math.round(normal + doubled));
}

/** 欲望是否溢出(≥承载上限) → 触发强制请假轮奸 */
export function desireOverflow(desire: number, capacity: number): boolean {
  return desire >= capacity;
}

// ───────────────────────────────────────
// 武力
// ───────────────────────────────────────

/** 武力 = 可用打手 × (忠诚度 / 基准)。忠诚低则武力打折。 */
export function combatPower(availableThugs: number, loyalty: number): number {
  return Math.round(availableThugs * (Math.max(0, loyalty) / CONST.忠诚武力系数基准));
}

/** 可用打手 = 总数 - 驻守占用 */
export function availableThugs(total: number, garrison: number): number {
  return Math.max(0, total - garrison);
}

// ───────────────────────────────────────
// 招募（每周额度，威望决定）
// ───────────────────────────────────────

/** 每周招募额度 = f(总威望)。起调:线性+保底。 */
export function weeklyRecruitQuota(totalPrestige: number): number {
  const base = 5;            // 保底
  const perPrestige = 0.5;   // 每点威望+0.5额度
  return Math.floor(base + Math.max(0, totalPrestige) * perPrestige);
}

/** 总威望 = 极道威望 + 淫名 */
export function totalPrestige(martial: number, infamy: number): number {
  return Math.max(0, martial) + Math.max(0, infamy);
}

/** 据点战胜率(0~1) = f(己方武力,敌方武力,威望差,情报完备度0~1)。起调逻辑式。 */
export function siegeWinChance(
  ownPower: number, enemyPower: number, prestigeDiff: number, intel: number,
): number {
  const powerRatio = ownPower / Math.max(1, ownPower + enemyPower); // 0~1
  const prestigeBonus = Math.max(-0.15, Math.min(0.15, prestigeDiff / 1000));
  const intelBonus = Math.max(0, Math.min(0.15, intel * 0.15));
  return Math.max(0.02, Math.min(0.98, powerRatio + prestigeBonus + intelBonus));
}

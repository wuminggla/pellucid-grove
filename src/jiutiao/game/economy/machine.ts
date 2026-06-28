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
  欲望基础增量: 2,            // [旧夜结模型]每个未供奉打手每晚 +2(已被晨间累积模型取代,保留兼容)
  欲望连续翻倍倍率: 2,        // 单打手连续3晚未供奉，其贡献翻倍
  欲望连续阈值天数: 3,
  欲望日增系数: 1,           // [晨间累积]每天早晨 欲望 += 可用打手数 × 此系数(30打手→+30,日1起可见)
  供奉降欲量: 1,             // [实时降欲]每供奉1人当场清偿欲望 -1(供奉格执行时即扣,玩家盯着状态栏掉)
  // 招募(每周额度·威望刷新·即时结算)
  招1打手价: 60,             // 每招1个打手花费(§12.4)
  招募周额度基础: 10,       // 每周招募额度保底(额度仍随威望增长)
  招募单格下限: 3, 招募单格上限: 4,  // 单个招募格当场招到的人数浮动区间(3-4人)
  采购单格基础上限: 360,      // 单次采购(占1白天格)基础上限,个
  避孕套单价: 2,             // 每个避孕套采购单价(资金)
  请假轮奸吞吐倍率: 1.5,      // 强制请假轮奸日：每供奉格多服务1.5×人(帮运营失败玩家清欲望)
  // 滑动窗口保底（软卡死非真卡死，给运营失败玩家出口）
  保底窗口短: 10, 保底请假数短: 7, 保底欲望阈值短: 1000,    // 10天内请假≥7且欲望<1000→清空
  保底窗口长: 20, 保底请假数长: 15, 保底欲望阈值长: 10000,  // 20天内请假≥15且欲望<10000→清空
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

/**
 * 晨间欲望累积(每天早晨一次)。= 可用打手数 × 欲望日增系数。
 * 让欲望从日1起就可见、随人数线性增长；玩家白天/夜晚靠供奉把它压下去。
 * 注：晨间累积本身不参与"请假轮奸是否触发"的判定(判定在加此增量之前,见 advanceToNextDay),
 *     否则打手数>欲望槽时会永远触发。
 */
export function dailyDesireDemand(availableThugs: number): number {
  return Math.max(0, Math.round(availableThugs * CONST.欲望日增系数));
}

/**
 * 单个供奉格当场清偿的欲望量(实时)。= 本场供奉人数 × 供奉降欲量。
 * 在供奉格执行时即扣减(settleServe),玩家盯着状态栏看欲望下降,精确规划。
 */
export function desireRelief(served: number): number {
  return Math.max(0, Math.round(served * CONST.供奉降欲量));
}

/** 欲望是否溢出(≥承载上限) → 触发强制请假轮奸。注：欲望不 clamp，可超上限继续计数(数值奇观永动)。 */
export function desireOverflow(desire: number, capacity: number): boolean {
  return desire >= capacity;
}

/** 滑动窗口内的请假天数 */
export function leaveCount(history: boolean[], window: number): number {
  return history.slice(-window).filter(Boolean).length;
}

/**
 * 请假轮奸滑动窗口保底（v3 §6.4，软卡死非真卡死）。
 * 近期请假够频繁且欲望未到天文数字 → 清空欲望，给运营失败玩家出口。
 *  - 短窗：10天内请假≥7 且 欲望<1000 → 清0
 *  - 长窗：20天内请假≥15 且 欲望<10000 → 清0（高欲望需更多请假才解）
 */
export function slidingWindowRelief(
  history: boolean[], desire: number,
): { cleared: boolean; desire: number } {
  if (leaveCount(history, CONST.保底窗口短) >= CONST.保底请假数短 && desire < CONST.保底欲望阈值短) {
    return { cleared: true, desire: 0 };
  }
  if (leaveCount(history, CONST.保底窗口长) >= CONST.保底请假数长 && desire < CONST.保底欲望阈值长) {
    return { cleared: true, desire: 0 };
  }
  return { cleared: false, desire };
}

// ───────────────────────────────────────
// 武力
// ───────────────────────────────────────

/** 武力 = 可用打手 × (忠诚度 / 基准) × (1 + 打手升级战力加成)。忠诚低则武力打折。 */
export function combatPower(availableThugs: number, loyalty: number, upgradeBonus = 0): number {
  const base = availableThugs * (Math.max(0, loyalty) / CONST.忠诚武力系数基准);
  return Math.round(base * (1 + Math.max(0, upgradeBonus)));
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
  const base = CONST.招募周额度基础; // 保底
  const perPrestige = 0.5;            // 每点威望+0.5额度
  return Math.floor(base + Math.max(0, totalPrestige) * perPrestige);
}

/**
 * 招募即时结算。一个招募格当场招人:招募数 = min(本周剩余额度, 买得起的人数)。
 * 立即 thugTotal +=、money -=、recruitQuota -=(玩家当场看到打手数变化,而非日终)。
 * 额度由每周 settleDaily 按威望刷新(§13.4),是节奏闸门;钱按 招1打手价 扣。
 */
export interface RecruitResult {
  thugTotal: number;
  money: number;
  recruitQuota: number;
  recruited: number;       // 实际招到人数
  cost: number;            // 花费
  reason?: 'no_quota' | 'no_money'; // 招到0时的原因(供UI提示)
}
export function settleRecruit(
  thugTotal: number, money: number, recruitQuota: number, rng: () => number = Math.random,
): RecruitResult {
  const quota = Math.max(0, recruitQuota);
  if (quota <= 0) {
    return { thugTotal, money, recruitQuota: quota, recruited: 0, cost: 0, reason: 'no_quota' };
  }
  // 单格招募人数在 [下限,上限] 浮动(3-4),受本周剩余额度与资金封顶。要招满周额度需多个招募格。
  const span = CONST.招募单格上限 - CONST.招募单格下限 + 1;
  const perGrid = CONST.招募单格下限 + Math.floor(Math.max(0, Math.min(0.999, rng())) * span);
  const affordable = Math.floor(money / CONST.招1打手价);
  const n = Math.min(perGrid, quota, Math.max(0, affordable));
  if (n <= 0) {
    return { thugTotal, money, recruitQuota: quota, recruited: 0, cost: 0, reason: 'no_money' };
  }
  const cost = n * CONST.招1打手价;
  return {
    thugTotal: thugTotal + n,
    money: money - cost,
    recruitQuota: quota - n,
    recruited: n,
    cost,
  };
}

/**
 * 总威望 = 极道威望 +（淫名，仅 AV 解锁后计入）。
 * 用户定：淫名是 AV 解锁后才引入的机制；解锁前威望只等于极道威望。
 */
export function totalPrestige(martial: number, infamy: number, avUnlocked = false): number {
  return Math.max(0, martial) + (avUnlocked ? Math.max(0, infamy) : 0);
}

/**
 * 资金轨硬失败审核(设计补遗_A·双轨再生力之一·资金轨)。
 * 用户定: 资金沿用【存量】≤0 判定(不是进账流)——玩家怎么把余额抬到0以上是玩家的事,
 *   "亏一天赚一天"的运营玩家不该被进账流误杀。连续2次结算余额≤0 → 硬失败。
 * @param moneyBalance 当前资金余额(存量)
 * @param zeroStreak 既往连续"余额≤0"次数
 */
export function auditMoney(
  moneyBalance: number, zeroStreak: number,
): { zeroStreak: number; hardFail: boolean } {
  const streak = moneyBalance <= 0 ? zeroStreak + 1 : 0;
  return { zeroStreak: streak, hardFail: streak >= 2 };
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

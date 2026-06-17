// 地盘系统 · 核心逻辑（纯函数·数据驱动）
// REGIONS 是单一真相源；引擎只认 RegionDef 结构。新区域=append 一条数据。
// C1：区域模型 + 复仇boss击败判定 + 降门槛 + 解锁 + threatLevel派生 + 据点产出。

import type { RegionDef, RegionState, RegionYields } from './types';

// ───────────────────────────────────────
// catalog · 地盘区域（=复仇目标网络。从松到紧·三流小势力起步）
// 数值为占位待调平。requiresRegion 串成解锁链。
// ───────────────────────────────────────
export const REGIONS: RegionDef[] = [
  { id: 'home',   name: '九条老宅一隅', bossName: '—', defeatThreshold: 0, yields: { condom: 120, money: 500 }, garrisonNeed: 0, shops: 3 }, // 初始据点(无boss,默认已解锁)
  { id: 'street', name: '街区',         bossName: '街区的三流小势力', defeatThreshold: 100, yields: { condom: 120, money: 800, martial: 3 }, garrisonNeed: 5, shops: 2, requiresRegion: 'home' },
  { id: 'ward',   name: '附近片区',     bossName: '弥生道外围头目',   defeatThreshold: 300, yields: { condom: 240, money: 1500, martial: 5 }, garrisonNeed: 10, shops: 3, requiresRegion: 'street' },
  { id: 'hill',   name: '山头',         bossName: '弥生道核心干部',   defeatThreshold: 600, yields: { condom: 360, money: 2500, martial: 8 }, garrisonNeed: 20, shops: 2, requiresRegion: 'ward' },
  { id: 'city',   name: '小半城区',     bossName: '弥生道会长(杀父仇人)', defeatThreshold: 1200, yields: { condom: 480, money: 4000, martial: 15 }, garrisonNeed: 40, shops: 5, requiresRegion: 'hill' },
];

export const REGIONS_BY_ID: Record<string, RegionDef> =
  Object.fromEntries(REGIONS.map(r => [r.id, r]));

/** 初始据点(无boss,开局即解锁) */
export const HOME_REGION_ID = 'home';

// ───────────────────────────────────────
// 状态切片与查询
// ───────────────────────────────────────

/** 地盘引擎读写的状态切片（EngineState 结构兼容） */
export interface TurfState {
  money: number;
  regions?: Record<string, RegionState>;
  turfFortifyBonus?: number; // 据点加固(升级)：抬升稳定/防守
}

const DEFAULT_REGION: RegionState = { defeated: false, thresholdReduced: 0, garrison: 0 };

/** 读区域运行时状态(缺省) */
export function regionState(regions: Record<string, RegionState> | undefined, id: string): RegionState {
  if (id === HOME_REGION_ID) return regions?.[id] ?? { ...DEFAULT_REGION, defeated: true }; // 老宅默认已解锁
  return regions?.[id] ?? DEFAULT_REGION;
}

/** 区域是否已解锁(boss已击败 / 老宅) */
export function isRegionUnlocked(regions: Record<string, RegionState> | undefined, id: string): boolean {
  return regionState(regions, id).defeated;
}

/** 有效击败门槛 = 基础门槛 - 已削减(贿赂/调查),下限0 */
export function effectiveThreshold(def: RegionDef, st: RegionState): number {
  return Math.max(0, def.defeatThreshold - st.thresholdReduced);
}

export interface DefeatCheck {
  ok: boolean;
  reason?: string;
}

/** 能否击败区域boss：前置区域已解锁 + 未击败 + 武力≥有效门槛 */
export function canDefeat(def: RegionDef, power: number, regions: Record<string, RegionState> | undefined): DefeatCheck {
  const st = regionState(regions, def.id);
  if (st.defeated) return { ok: false, reason: '已击败' };
  if (def.requiresRegion && !isRegionUnlocked(regions, def.requiresRegion)) return { ok: false, reason: '前置区域未解锁' };
  if (power < effectiveThreshold(def, st)) return { ok: false, reason: `武力不足(需${effectiveThreshold(def, st)})` };
  return { ok: true };
}

/** 击败区域boss → 解锁该区域(纯函数,返回新 regions)。调用方应先 canDefeat。 */
export function defeatRegion(
  regions: Record<string, RegionState> | undefined, id: string,
): Record<string, RegionState> {
  const st = regionState(regions, id);
  return { ...(regions ?? {}), [id]: { ...st, defeated: true } };
}

/** 贿赂/调查削减击败门槛(纯函数)。amount 累加到 thresholdReduced。 */
export function reduceThreshold(
  regions: Record<string, RegionState> | undefined, id: string, amount: number,
): Record<string, RegionState> {
  const st = regionState(regions, id);
  return { ...(regions ?? {}), [id]: { ...st, thresholdReduced: st.thresholdReduced + Math.max(0, amount) } };
}

// ───────────────────────────────────────
// 据点产出 & 稳定度派生
// ───────────────────────────────────────

/** 已解锁区域的每日总产出(faucet)。 */
export function dailyYields(regions: Record<string, RegionState> | undefined): Required<RegionYields> {
  const total = { condom: 0, money: 0, martial: 0 };
  for (const def of REGIONS) {
    if (!isRegionUnlocked(regions, def.id)) continue;
    total.condom += def.yields.condom ?? 0;
    total.money += def.yields.money ?? 0;
    total.martial += def.yields.martial ?? 0;
  }
  return total;
}

/** 已解锁区域的店铺总数(决定采购上限) */
export function totalShops(regions: Record<string, RegionState> | undefined): number {
  let shops = 0;
  for (const def of REGIONS) {
    if (isRegionUnlocked(regions, def.id)) shops += def.shops ?? 0;
  }
  return shops;
}

/**
 * 由稳定度派生威胁等级(驱动 forced events 的骚扰强占)。
 * 稳定度越低威胁越高；据点加固(turfFortifyBonus)抬升等效稳定。
 * 返回 0(无威胁)/1(骚扰)/2(进攻风险)。
 */
export function threatLevelFrom(stability: number, fortifyBonus = 0): number {
  const eff = stability + fortifyBonus * 5; // 每级加固≈+5稳定
  if (eff >= 70) return 0;
  if (eff >= 40) return 1;
  return 2;
}

// ───────────────────────────────────────
// 骚扰 / 进攻 结算（变量蓝图：骚扰高频不减员/进攻低概率减员丢地盘）
// ───────────────────────────────────────

/** 骚扰结算结果 */
export interface HarassResult {
  stability: number;   // 新稳定度
  money: number;       // 新资金
  repelled: boolean;   // 是否击退
  loot: number;        // 击退抢得资金
}

/**
 * 骚扰事件结算（高频·一般不减员）。判定驻守战力 vs 骚扰强度：
 *  - 击退(驻守战力≥强度)→ 抢得资金,稳定度不降。
 *  - 未击退→ 稳定度下降,无收益。
 * @param garrisonPower 驻守战力(可用打手×忠诚等,调用方算好传入)
 * @param harassPower 骚扰强度
 */
export function settleHarass(
  state: TurfState, stability: number, garrisonPower: number, harassPower: number,
): HarassResult {
  const repelled = garrisonPower >= harassPower;
  const fortify = state.turfFortifyBonus ?? 0;
  if (repelled) {
    const loot = Math.round(harassPower * 5); // 抢得资金∝骚扰规模
    return { stability, money: state.money + loot, repelled: true, loot };
  }
  const drop = Math.max(0, 8 - fortify); // 加固减缓稳定下降
  return { stability: Math.max(0, stability - drop), money: state.money, repelled: false, loot: 0 };
}

/** 进攻结算结果 */
export interface RaidResult {
  thugLost: number;       // 减员
  stability: number;      // 新稳定度
  regionLost: string | null; // 丢失的区域(null=守住)
  regions: Record<string, RegionState>;
  defended: boolean;
}

/**
 * 进攻事件结算（低概率·减员·失败丢地盘）。判定驻守战力 vs 进攻强度：
 *  - 守住(战力≥强度)→ 减员较少,保住区域。
 *  - 失败→ 减员较多 + 丢失目标区域(变回未解锁)。
 * @param targetRegionId 被进攻的区域(失败则丢失)
 */
export function settleRaid(
  state: TurfState, stability: number, garrisonPower: number, raidPower: number, targetRegionId: string,
): RaidResult {
  const defended = garrisonPower >= raidPower;
  const fortify = state.turfFortifyBonus ?? 0;
  if (defended) {
    const thugLost = Math.max(0, Math.round(raidPower * 0.05) - fortify);
    return { thugLost, stability, regionLost: null, regions: state.regions ?? {}, defended: true };
  }
  const thugLost = Math.round(raidPower * 0.15);
  // 丢失区域：defeated 回 false（需重新打）
  const st = regionState(state.regions, targetRegionId);
  const regions = { ...(state.regions ?? {}), [targetRegionId]: { ...st, defeated: false } };
  return { thugLost, stability: Math.max(0, stability - 15), regionLost: targetRegionId, regions, defended: false };
}


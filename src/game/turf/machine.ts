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

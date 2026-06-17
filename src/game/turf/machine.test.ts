import { describe, it, expect } from 'vitest';
import {
  REGIONS, REGIONS_BY_ID, HOME_REGION_ID,
  regionState, isRegionUnlocked, effectiveThreshold, canDefeat, defeatRegion,
  reduceThreshold, dailyYields, totalShops, threatLevelFrom,
} from './machine';
import type { RegionState } from './types';

describe('catalog', () => {
  it('区域id唯一,requiresRegion串成链', () => {
    expect(new Set(REGIONS.map(r => r.id)).size).toBe(REGIONS.length);
    expect(REGIONS_BY_ID['street'].requiresRegion).toBe('home');
    expect(REGIONS_BY_ID['city'].requiresRegion).toBe('hill');
  });
});

describe('区域解锁状态', () => {
  it('老宅默认已解锁,其它默认未解锁', () => {
    expect(isRegionUnlocked(undefined, HOME_REGION_ID)).toBe(true);
    expect(isRegionUnlocked(undefined, 'street')).toBe(false);
  });
  it('regionState缺省', () => {
    expect(regionState(undefined, 'street')).toEqual({ defeated: false, thresholdReduced: 0, garrison: 0 });
  });
});

describe('有效门槛(贿赂/调查削减)', () => {
  it('=基础-已削减,下限0', () => {
    const def = REGIONS_BY_ID['street']; // 门槛100
    expect(effectiveThreshold(def, { defeated: false, thresholdReduced: 0, garrison: 0 })).toBe(100);
    expect(effectiveThreshold(def, { defeated: false, thresholdReduced: 30, garrison: 0 })).toBe(70);
    expect(effectiveThreshold(def, { defeated: false, thresholdReduced: 999, garrison: 0 })).toBe(0);
  });
  it('reduceThreshold累加', () => {
    let r = reduceThreshold(undefined, 'street', 20);
    r = reduceThreshold(r, 'street', 15);
    expect(r['street'].thresholdReduced).toBe(35);
  });
});

describe('canDefeat 击败判定', () => {
  it('武力≥有效门槛+前置已解锁→可击败', () => {
    expect(canDefeat(REGIONS_BY_ID['street'], 100, undefined).ok).toBe(true);
    expect(canDefeat(REGIONS_BY_ID['street'], 99, undefined).ok).toBe(false); // 武力不足
  });
  it('前置区域未解锁→拒', () => {
    expect(canDefeat(REGIONS_BY_ID['ward'], 9999, undefined).ok).toBe(false); // street未解锁
    const afterStreet = defeatRegion(undefined, 'street');
    expect(canDefeat(REGIONS_BY_ID['ward'], 300, afterStreet).ok).toBe(true);
  });
  it('已击败→拒', () => {
    const r = defeatRegion(undefined, 'street');
    expect(canDefeat(REGIONS_BY_ID['street'], 9999, r).ok).toBe(false);
  });
  it('削减门槛后武力不足也能打', () => {
    const reduced = reduceThreshold(undefined, 'street', 50); // 门槛100→50
    expect(canDefeat(REGIONS_BY_ID['street'], 50, reduced).ok).toBe(true);
  });
});

describe('defeatRegion 解锁', () => {
  it('击败→defeated=true,不污染原state', () => {
    const r0: Record<string, RegionState> = {};
    const r1 = defeatRegion(r0, 'street');
    expect(r1['street'].defeated).toBe(true);
    expect(r0['street']).toBeUndefined();
  });
});

describe('据点产出与店铺', () => {
  it('只算已解锁区域,老宅默认计入', () => {
    const y0 = dailyYields(undefined); // 只有老宅
    expect(y0.condom).toBe(120);
    expect(y0.money).toBe(500);
    const afterStreet = defeatRegion(undefined, 'street');
    const y1 = dailyYields(afterStreet);
    expect(y1.condom).toBe(120 + 120);
    expect(y1.martial).toBe(3); // street产出极道威望
  });
  it('店铺数=已解锁区域累加', () => {
    expect(totalShops(undefined)).toBe(3); // 老宅3
    expect(totalShops(defeatRegion(undefined, 'street'))).toBe(3 + 2);
  });
});

describe('threatLevelFrom 威胁派生', () => {
  it('稳定高→无威胁,中→骚扰,低→进攻风险', () => {
    expect(threatLevelFrom(80)).toBe(0);
    expect(threatLevelFrom(50)).toBe(1);
    expect(threatLevelFrom(20)).toBe(2);
  });
  it('据点加固抬升等效稳定', () => {
    expect(threatLevelFrom(35, 2)).toBe(1); // 35+10=45→骚扰而非进攻
  });
});

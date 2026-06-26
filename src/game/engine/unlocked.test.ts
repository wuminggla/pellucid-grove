// 派生 unlocked 字典 · 单测
// 验证 turf 击败 boss → 自动对应 occupy_* 解锁键,扩张日常 EventOption.unlockRequires 能查到。

import { describe, expect, it } from 'vitest';
import { deriveEventUnlocked } from './unlocked';
import type { EngineState } from './types';

function eng(p: Partial<EngineState> = {}): EngineState {
  return {
    day: 1, period: 'day',
    money: 8000, thugTotal: 30, garrison: 0, loyalty: 60,
    condomStock: 480, desire: 0, desireCapacity: 60, perSlotThroughput: 6,
    martialPrestige: 0, infamy: 0, martialGainToday: 0, martialZeroStreak: 0,
    corruption: 0, cognition: '死撑',
    triggeredSpecials: {}, unlocked: {}, presentCount: 0,
    narrativeLog: [], continuityNotes: [],
    upgrades: {}, regions: {}, stability: 50, threatLevel: 0,
    cycleDay: 0, isDangerousPeriod: false,
    servedThisNight: 0, recruitQuota: 0, recruitedThisWeek: 0,
    leaveHistory: [], ...p,
  } as EngineState;
}

describe('deriveEventUnlocked · turf↔unlocked 桥接', () => {
  it('击败 street boss → occupy_street=true(扩张日常 unlockRequires 可匹配)', () => {
    const e = eng({
      regions: { street: { defeated: true, thresholdReduced: 0, garrison: 0 } },
    });
    const u = deriveEventUnlocked(e);
    expect(u.occupy_street).toBe(true);
    expect(u.occupy_home).toBe(true); // 老宅默认已解锁
    expect(u.occupy_district).toBeFalsy(); // ward 未击败
  });

  it('击败 ward boss → occupy_district=true(语义化别名)', () => {
    const e = eng({
      regions: {
        street: { defeated: true, thresholdReduced: 0, garrison: 0 },
        ward:   { defeated: true, thresholdReduced: 0, garrison: 0 },
      },
    });
    const u = deriveEventUnlocked(e);
    expect(u.occupy_district).toBe(true); // ward → occupy_district
  });

  it('击败 city boss → occupy_halfcity=true(最终boss)', () => {
    const e = eng({
      regions: {
        street: { defeated: true, thresholdReduced: 0, garrison: 0 },
        ward:   { defeated: true, thresholdReduced: 0, garrison: 0 },
        hill:   { defeated: true, thresholdReduced: 0, garrison: 0 },
        city:   { defeated: true, thresholdReduced: 0, garrison: 0 },
      },
    });
    const u = deriveEventUnlocked(e);
    expect(u.occupy_halfcity).toBe(true);
    expect(u.occupy_hill).toBe(true);
  });

  it('engine.unlocked 与 turf 派生合并(升级解锁 + 地盘解锁同时存在)', () => {
    const e = eng({
      unlocked: { courtyard_unlocked: true, dungeon_unlocked: true },
      regions: { street: { defeated: true, thresholdReduced: 0, garrison: 0 } },
    });
    const u = deriveEventUnlocked(e);
    expect(u.courtyard_unlocked).toBe(true); // 升级解锁(从 engine.unlocked)
    expect(u.dungeon_unlocked).toBe(true);
    expect(u.occupy_street).toBe(true);      // 地盘解锁(派生)
  });

  it('未击败任何 boss → 仅老宅 + 升级解锁项', () => {
    const e = eng({ unlocked: { courtyard_unlocked: true } });
    const u = deriveEventUnlocked(e);
    expect(u.occupy_home).toBe(true);   // 老宅默认
    expect(u.occupy_street).toBeFalsy();
    expect(u.courtyard_unlocked).toBe(true);
  });
});

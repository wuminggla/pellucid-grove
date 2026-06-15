import { describe, it, expect } from 'vitest';
import { settleServe, settleNight, settleDaily, condomLabel } from './settlement';
import type { EngineState } from './types';

function base(over: Partial<EngineState> = {}): EngineState {
  return {
    triggeredSpecials: {}, unlocked: {},
    corruption: 0, cognition: '死撑', claimedGates: {},
    money: 8000, thugTotal: 100, garrison: 0, loyalty: 60,
    condomStock: 480, desire: 0, desireCapacity: 60, perSlotThroughput: 18,
    recruitQuota: 0, presentCount: 18, isDangerousPeriod: false,
    servedThisNight: 0,
    ...over,
  };
}

describe('单格供奉结算', () => {
  it('扣避孕套(18人×3=54),记被供奉人数', () => {
    const r = settleServe(base({ presentCount: 18 }));
    expect(r.condomUsed).toBe(54);
    expect(r.state.condomStock).toBe(480 - 54);
    expect(r.state.servedThisNight).toBe(18);
    expect(r.condomShort).toBe(false);
  });
  it('危险期消耗×1.5', () => {
    const r = settleServe(base({ presentCount: 100, isDangerousPeriod: true }));
    expect(r.condomUsed).toBe(450); // 100×3×1.5
  });
  it('库存不足→condomShort,扣到0', () => {
    const r = settleServe(base({ presentCount: 100, condomStock: 50 }));
    expect(r.condomShort).toBe(true);
    expect(r.state.condomStock).toBe(0);
    expect(r.condomUsed).toBe(50);
  });
});

describe('夜晚收尾结算', () => {
  it('未供奉打手欲望滚雪球', () => {
    // 100可用,本晚供奉了36 → 未供奉64 → 欲望+128
    const r = settleNight(base({ thugTotal: 100, servedThisNight: 36, desire: 0 }));
    expect(r.unserved).toBe(64);
    expect(r.desireGained).toBe(128);
    expect(r.state.desire).toBe(128);
    expect(r.state.servedThisNight).toBe(0); // 重置
  });
  it('欲望溢出判定', () => {
    const r = settleNight(base({ thugTotal: 50, servedThisNight: 0, desire: 0, desireCapacity: 60 }));
    // 50未供奉×2=100 ≥60 → overflow
    expect(r.overflow).toBe(true);
  });
  it('全供奉则无未供奉,欲望不涨', () => {
    const r = settleNight(base({ thugTotal: 30, servedThisNight: 30 }));
    expect(r.unserved).toBe(0);
    expect(r.desireGained).toBe(0);
  });
});

describe('每日收尾结算', () => {
  it('第1天刷新招募额度(威望决定)', () => {
    const r = settleDaily(base(), 1, 20, 10); // 总威望30
    expect(r.recruitRefreshed).toBe(true);
    expect(r.state.recruitQuota).toBe(5 + 30 * 0.5); // 20
  });
  it('第2天不刷新', () => {
    const r = settleDaily(base({ recruitQuota: 7 }), 2, 20, 10);
    expect(r.recruitRefreshed).toBe(false);
    expect(r.state.recruitQuota).toBe(7);
  });
  it('第8天(每周)再刷新', () => {
    const r = settleDaily(base(), 8, 0, 0);
    expect(r.recruitRefreshed).toBe(true);
  });
  it('计算武力(可用×忠诚)', () => {
    const r = settleDaily(base({ thugTotal: 100, garrison: 20, loyalty: 60 }), 2, 0, 0);
    expect(r.combatPower).toBe(Math.round(80 * 0.6)); // 48
  });
  it('资金为负→硬失败信号', () => {
    const r = settleDaily(base({ money: -100 }), 2, 0, 0);
    expect(r.hardFail).toBe(true);
  });
});

describe('避孕套状态标签', () => {
  it('阈值', () => {
    expect(condomLabel(base({ condomStock: 480 }))).toBe('充足');
    expect(condomLabel(base({ condomStock: 5 }))).toBe('告急');
    expect(condomLabel(base({ condomStock: 0 }))).toBe('废除');
  });
});

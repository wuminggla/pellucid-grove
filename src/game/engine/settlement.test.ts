import { describe, it, expect } from 'vitest';
import { settleServe, settleNight, settleDaily, condomLabel } from './settlement';
import type { EngineState } from './types';

function base(over: Partial<EngineState> = {}): EngineState {
  return {
    triggeredSpecials: {}, unlocked: {},
    corruption: 0, cognition: '死撑', claimedGates: {},
    money: 8000, thugTotal: 100, garrison: 0, loyalty: 60,
    condomStock: 480, desire: 0, desireCapacity: 60, perSlotThroughput: 18,
    infamy: 0, martialPrestige: 0,
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
  it('吞吐×1.5(请假轮奸日):服务人数与扣套同步放大', () => {
    const r = settleServe(base({ presentCount: 18 }), 1.5);
    expect(r.state.servedThisNight).toBe(27); // round(18×1.5)
    expect(r.condomUsed).toBe(81);            // 27×3
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
  it('欲望溢出判定→置 pendingForcedLeave', () => {
    const r = settleNight(base({ thugTotal: 50, servedThisNight: 0, desire: 0, desireCapacity: 60 }));
    // 50未供奉×2=100 ≥60 → overflow
    expect(r.overflow).toBe(true);
    expect(r.state.pendingForcedLeave).toBe(true);
  });
  it('未溢出不置 pendingForcedLeave', () => {
    const r = settleNight(base({ thugTotal: 30, servedThisNight: 30, desire: 0, desireCapacity: 60 }));
    expect(r.overflow).toBe(false);
    expect(r.state.pendingForcedLeave).toBeFalsy();
  });
  it('全供奉则无未供奉,欲望不涨', () => {
    const r = settleNight(base({ thugTotal: 30, servedThisNight: 30 }));
    expect(r.unserved).toBe(0);
    expect(r.desireGained).toBe(0);
  });
  it('欲望可超承载上限继续计数(无clamp,数值奇观永动)', () => {
    const r = settleNight(base({ thugTotal: 200, servedThisNight: 0, desire: 500, desireCapacity: 60 }));
    expect(r.state.desire).toBe(900); // 500 + 200未供奉×2,远超上限60
    expect(r.overflow).toBe(true);
  });
});

describe('每日收尾结算', () => {
  it('第1天刷新招募额度·AV未解锁只算极道威望', () => {
    const r = settleDaily(base({ martialPrestige: 20, infamy: 10 }), 1); // 淫名不计→威望20
    expect(r.recruitRefreshed).toBe(true);
    expect(r.state.recruitQuota).toBe(5 + 20 * 0.5); // 15
  });
  it('AV解锁后招募额度计入淫名', () => {
    const r = settleDaily(base({ martialPrestige: 20, infamy: 10, unlocked: { av: true } }), 1); // 威望30
    expect(r.state.recruitQuota).toBe(5 + 30 * 0.5); // 20
  });
  it('第2天不刷新', () => {
    const r = settleDaily(base({ recruitQuota: 7 }), 2);
    expect(r.recruitRefreshed).toBe(false);
    expect(r.state.recruitQuota).toBe(7);
  });
  it('第8天(每周)再刷新', () => {
    const r = settleDaily(base(), 8);
    expect(r.recruitRefreshed).toBe(true);
  });
  it('计算武力(可用×忠诚)', () => {
    const r = settleDaily(base({ thugTotal: 100, garrison: 20, loyalty: 60 }), 2);
    expect(r.combatPower).toBe(Math.round(80 * 0.6)); // 48
  });
  it('资金为负→硬失败信号(兜底)', () => {
    const r = settleDaily(base({ money: -2000, martialGainToday: 5 }), 2); // 据点产出+500后仍负
    expect(r.hardFail).toBe(true);
  });
  it('据点产出:已解锁区域每日给避孕套/资金(老宅默认)', () => {
    const r = settleDaily(base({ money: 8000, condomStock: 480 }), 2);
    expect(r.yields.condom).toBe(120); // 老宅
    expect(r.yields.money).toBe(500);
    expect(r.state.money).toBe(8000 + 500);
    expect(r.state.condomStock).toBe(480 + 120);
  });
  it('据点产出极道威望→计入今日进账(防硬失败误杀有地盘玩家)', () => {
    const r = settleDaily(base({ regions: { street: { defeated: true, thresholdReduced: 0, garrison: 0 }, home: { defeated: true, thresholdReduced: 0, garrison: 0 } } }), 2);
    expect(r.yields.martial).toBe(3); // street产出
    expect(r.state.martialZeroStreak).toBe(0); // 有进账→不累积
  });
  it('threatLevel由稳定度派生', () => {
    expect(settleDaily(base({ stability: 80 }), 2).state.threatLevel).toBe(0);
    expect(settleDaily(base({ stability: 50 }), 2).state.threatLevel).toBe(1);
    expect(settleDaily(base({ stability: 20 }), 2).state.threatLevel).toBe(2);
  });
  it('经期每日推进+翻转危险期', () => {
    const r = settleDaily(base({ cycleDay: 5 }), 2); // 5→6=危险期起点
    expect(r.state.cycleDay).toBe(6);
    expect(r.state.isDangerousPeriod).toBe(true);
  });
  it('极道威望连续2次进账0→硬失败,审核后重置今日流量', () => {
    const r1 = settleDaily(base({ martialGainToday: 0, martialZeroStreak: 0 }), 2);
    expect(r1.hardFail).toBe(false);
    expect(r1.state.martialZeroStreak).toBe(1);
    expect(r1.state.martialGainToday).toBe(0);
    const r2 = settleDaily(base({ martialGainToday: 0, martialZeroStreak: 1 }), 2);
    expect(r2.hardFail).toBe(true);
    expect(r2.state.martialZeroStreak).toBe(2);
  });
  it('今日有极道威望进账→streak归零,不失败', () => {
    const r = settleDaily(base({ martialGainToday: 5, martialZeroStreak: 1 }), 2);
    expect(r.hardFail).toBe(false);
    expect(r.state.martialZeroStreak).toBe(0);
  });
});

describe('避孕套状态标签', () => {
  it('阈值', () => {
    expect(condomLabel(base({ condomStock: 480 }))).toBe('充足');
    expect(condomLabel(base({ condomStock: 5 }))).toBe('告急');
    expect(condomLabel(base({ condomStock: 0 }))).toBe('废除');
  });
});

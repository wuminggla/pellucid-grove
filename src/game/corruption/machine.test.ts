import { describe, it, expect } from 'vitest';
import {
  stageForCorruption, advanceCognition, gainCorruption,
  COGNITION_THRESHOLDS, REWARD_GATES,
} from './machine';

describe('认知防线阈值推进', () => {
  it('堕落度映射到正确档位', () => {
    expect(stageForCorruption(0)).toBe('死撑');
    expect(stageForCorruption(7)).toBe('死撑');
    expect(stageForCorruption(8)).toBe('动摇');
    expect(stageForCorruption(20)).toBe('崩溃');
    expect(stageForCorruption(40)).toBe('母猪化');
    expect(stageForCorruption(999)).toBe('母猪化');
  });
  it('单向不回退', () => {
    // 当前已崩溃，即使堕落度算出来是动摇(不该发生,但防御性)，也不回退
    expect(advanceCognition('崩溃', 8)).toBe('崩溃');
    expect(advanceCognition('死撑', 20)).toBe('崩溃');
  });
});

describe('堕落度增加与连带结算', () => {
  it('加堕落度推进认知防线', () => {
    const r = gainCorruption({ corruption: 6, cognition: '死撑', claimedGates: {} }, 3); // 6+3=9≥8
    expect(r.corruption).toBe(9);
    expect(r.cognition).toBe('动摇');
    expect(r.cognitionAdvancedTo).toBe('动摇');
  });
  it('未跨阈值不推进', () => {
    const r = gainCorruption({ corruption: 2, cognition: '死撑', claimedGates: {} }, 3); // 5<8
    expect(r.cognition).toBe('死撑');
    expect(r.cognitionAdvancedTo).toBeNull();
  });
  it('达阈值触发奖励闸门(一次性)', () => {
    const r = gainCorruption({ corruption: 4, cognition: '死撑', claimedGates: {} }, 2); // 6≥5
    expect(r.firedGates.map(g => g.gateId)).toContain('gate_5');
    expect(r.claimedGates['gate_5']).toBe(true);
  });
  it('已领闸门不重复触发', () => {
    const r = gainCorruption({ corruption: 10, cognition: '动摇', claimedGates: { gate_5: true } }, 1);
    expect(r.firedGates.map(g => g.gateId)).not.toContain('gate_5');
  });
  it('一次大增可同时跨多个闸门', () => {
    const r = gainCorruption({ corruption: 0, cognition: '死撑', claimedGates: {} }, 16); // 16≥5且≥15
    const ids = r.firedGates.map(g => g.gateId);
    expect(ids).toContain('gate_5');
    expect(ids).toContain('gate_15');
    expect(r.cognition).toBe('动摇'); // 16≥8
  });
});

describe('表配置自洽', () => {
  it('认知阈值递增', () => {
    for (let i = 1; i < COGNITION_THRESHOLDS.length; i++) {
      expect(COGNITION_THRESHOLDS[i].atCorruption).toBeGreaterThan(COGNITION_THRESHOLDS[i-1].atCorruption);
    }
  });
  it('奖励闸门阈值递增', () => {
    for (let i = 1; i < REWARD_GATES.length; i++) {
      expect(REWARD_GATES[i].atCorruption).toBeGreaterThan(REWARD_GATES[i-1].atCorruption);
    }
  });
});

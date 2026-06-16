import { describe, it, expect } from 'vitest';
import { isAvUnlocked, AV_UNLOCK_KEY } from './machine';

describe('AV 解锁判定(淫名闸门)', () => {
  it('未解锁→false', () => {
    expect(isAvUnlocked({})).toBe(false);
    expect(isAvUnlocked({ other: true })).toBe(false);
  });
  it('解锁→true', () => {
    expect(isAvUnlocked({ [AV_UNLOCK_KEY]: true })).toBe(true);
  });
});

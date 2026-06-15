import { describe, it, expect } from 'vitest';
import { pickParadigm, recordTriggered, availableParadigms } from './machine';
import type { ParadigmRegistry, ParadigmContext } from './types';

// 测试用范式注册表
const registry: ParadigmRegistry = {
  serve: [{ paradigmId: 'serve_daily', optionId: 'serve', kind: 'daily', isSpecial: false, worldbookKey: 'wb_serve', label: '供奉(日常)' }],
  oral: [{ paradigmId: 'oral_first', optionId: 'oral', kind: 'special_first', isSpecial: true, corruptionWeight: 3, worldbookKey: 'wb_oral_first', label: '口交' }],
  anal: [{ paradigmId: 'anal_first', optionId: 'anal', kind: 'special_first', isSpecial: true, corruptionWeight: 4, worldbookKey: 'wb_anal_first', label: '肛交', unlockRequires: ['anal_unlocked'] }],
};

const emptyCtx = (): ParadigmContext => ({ triggeredSpecials: {}, unlocked: {} });

describe('范式筛选', () => {
  it('非特殊选项→daily,不加堕落度', () => {
    const p = pickParadigm(registry, 'serve', emptyCtx());
    expect(p.kind).toBe('daily');
    expect(p.corruptionGain).toBe(0);
    expect(p.isFirstSpecial).toBe(false);
  });

  it('特殊选项首次→special_first,加堕落度', () => {
    const p = pickParadigm(registry, 'oral', emptyCtx());
    expect(p.kind).toBe('special_first');
    expect(p.isFirstSpecial).toBe(true);
    expect(p.corruptionGain).toBe(3);
  });

  it('特殊选项非首次(账本已记)→special_repeat,不再加', () => {
    const ctx = emptyCtx();
    ctx.triggeredSpecials = recordTriggered(ctx.triggeredSpecials, 'oral_first');
    const p = pickParadigm(registry, 'oral', ctx);
    expect(p.kind).toBe('special_repeat');
    expect(p.isFirstSpecial).toBe(false);
    expect(p.corruptionGain).toBe(0);
  });

  it('未解锁选项不入池', () => {
    const ctx = emptyCtx(); // 没 anal_unlocked
    expect(availableParadigms(registry, 'anal', ctx)).toHaveLength(0);
    expect(() => pickParadigm(registry, 'anal', ctx)).toThrow();
  });

  it('解锁后入池,首次加堕落度', () => {
    const ctx = emptyCtx();
    ctx.unlocked = { anal_unlocked: true };
    const p = pickParadigm(registry, 'anal', ctx);
    expect(p.kind).toBe('special_first');
    expect(p.corruptionGain).toBe(4);
  });
});

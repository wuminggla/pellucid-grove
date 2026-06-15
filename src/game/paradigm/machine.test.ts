import { describe, it, expect } from 'vitest';
import { pickParadigm, recordTriggered, availableParadigms, renderModeFor, fastSummaryText } from './machine';
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

describe('快进模式 (修改2)', () => {
  it('首次特殊事件:即使快进开着也调AI完整扩写', () => {
    const pick = pickParadigm(registry, 'oral', emptyCtx()); // 首次
    expect(renderModeFor(pick, true)).toBe('ai_full');
    expect(renderModeFor(pick, false)).toBe('ai_full');
  });
  it('非首次:快进→fast_summary,非快进→ai_brief', () => {
    const ctx = emptyCtx();
    ctx.triggeredSpecials = recordTriggered(ctx.triggeredSpecials, 'oral_first');
    const pick = pickParadigm(registry, 'oral', ctx); // special_repeat
    expect(renderModeFor(pick, true)).toBe('fast_summary');
    expect(renderModeFor(pick, false)).toBe('ai_brief');
  });
  it('日常选项:快进→fast_summary', () => {
    const pick = pickParadigm(registry, 'serve', emptyCtx()); // daily
    expect(renderModeFor(pick, true)).toBe('fast_summary');
    expect(renderModeFor(pick, false)).toBe('ai_brief');
  });
  it('总结词模板填充', () => {
    expect(fastSummaryText('大小姐被{n}人插入了', { n: 36 })).toBe('大小姐被36人插入了');
    expect(fastSummaryText('大小姐给{n}人侍奉了', { n: 18 })).toBe('大小姐给18人侍奉了');
  });
});

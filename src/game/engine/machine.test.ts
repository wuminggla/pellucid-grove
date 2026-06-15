import { describe, it, expect, vi } from 'vitest';
import { settleSlot, sanitizeExtract } from './machine';
import type { EngineState, AiPort, SettleOptions } from './types';
import type { ParadigmRegistry } from '../paradigm/machine';

const registry: ParadigmRegistry = {
  serve: [{ paradigmId: 'serve_daily', optionId: 'serve', kind: 'daily', isSpecial: false, worldbookKey: 'wb_serve', label: '供奉' }],
  oral: [{ paradigmId: 'oral_first', optionId: 'oral', kind: 'special_first', isSpecial: true, corruptionWeight: 6, worldbookKey: 'wb_oral', label: '口交' }],
};

function baseState(): EngineState {
  return {
    triggeredSpecials: {}, unlocked: {},
    corruption: 0, cognition: '死撑', claimedGates: {},
    money: 8000, thugTotal: 30,
    presentCount: 18, isDangerousPeriod: false,
  };
}

function mockAi(prose = 'AI扩写的正文', extract: Record<string, unknown> = {}): AiPort {
  return {
    expand: vi.fn(async () => prose),
    extract: vi.fn(async () => extract),
  };
}

function opts(ai: AiPort, over: Partial<SettleOptions> = {}): SettleOptions {
  return {
    registry, fastForward: false, ai,
    summaryTemplates: { serve: '大小姐给{n}人侍奉了', oral: '大小姐给{n}人口交了' },
    extractBounds: { presentCount: [0, 2000] },
    ...over,
  };
}

describe('sanitizeExtract 防胡诌', () => {
  it('保留范围内数值', () => {
    const r = sanitizeExtract({ presentCount: 36 }, { presentCount: [0, 2000] });
    expect(r.clean.presentCount).toBe(36);
    expect(r.rejected).toEqual([]);
  });
  it('拒掉越界离谱值', () => {
    const r = sanitizeExtract({ presentCount: 999999 }, { presentCount: [0, 2000] });
    expect(r.clean.presentCount).toBeUndefined();
    expect(r.rejected).toContain('presentCount');
  });
  it('拒掉非数值', () => {
    const r = sanitizeExtract({ presentCount: 'abc' as unknown as number });
    expect(r.rejected).toContain('presentCount');
  });
  it('无bounds时只过滤非数值,不卡范围(宽松)', () => {
    const r = sanitizeExtract({ x: 50000 });
    expect(r.clean.x).toBe(50000);
  });
});

describe('settleSlot 首次特殊事件', () => {
  it('调AI全扩写+加堕落度+写账本+发奖励闸门', async () => {
    const ai = mockAi('凛第一次为打手口交...', { presentCount: 20 });
    const r = await settleSlot(baseState(), { optionId: 'oral' }, opts(ai));
    expect(r.events.renderMode).toBe('ai_full');
    expect(r.events.isFirstSpecial).toBe(true);
    expect(r.events.corruptionGain).toBe(6);
    expect(r.state.corruption).toBe(6);
    // 堕落度6→触发 gate_5(给钱5000+打手20)
    expect(r.events.firedGateIds).toContain('gate_5');
    expect(r.state.money).toBe(8000 + 5000);
    expect(r.state.thugTotal).toBe(30 + 20);
    // 账本已记
    expect(r.state.triggeredSpecials['oral_first']).toBe(true);
    // extract 数值已应用
    expect(r.state.presentCount).toBe(20);
    expect(ai.expand).toHaveBeenCalledOnce();
    expect(ai.extract).toHaveBeenCalledOnce();
  });

  it('第二次同事件→退化略写,不再加堕落', async () => {
    const ai = mockAi('又一次口交', { presentCount: 18 });
    const s1 = await settleSlot(baseState(), { optionId: 'oral' }, opts(ai));
    const s2 = await settleSlot(s1.state, { optionId: 'oral' }, opts(ai));
    expect(s2.events.isFirstSpecial).toBe(false);
    expect(s2.events.renderMode).toBe('ai_brief'); // 非快进的重复=略写
    expect(s2.state.corruption).toBe(6); // 没再加
    expect(s2.events.firedGateIds).toEqual([]);
  });
});

describe('settleSlot 快进模式', () => {
  it('日常+快进:不调AI,出总结词,无堕落', async () => {
    const ai = mockAi();
    const r = await settleSlot(baseState(), { optionId: 'serve' }, opts(ai, { fastForward: true }));
    expect(r.events.renderMode).toBe('fast_summary');
    expect(r.resultText).toBe('大小姐给18人侍奉了'); // presentCount=18
    expect(ai.expand).not.toHaveBeenCalled();
    expect(ai.extract).not.toHaveBeenCalled();
  });

  it('首次特殊+快进:仍调AI(里程碑不跳过)', async () => {
    const ai = mockAi('第一次口交的完整描写', { presentCount: 18 });
    const r = await settleSlot(baseState(), { optionId: 'oral' }, opts(ai, { fastForward: true }));
    expect(r.events.renderMode).toBe('ai_full'); // 首次特殊压过快进
    expect(ai.expand).toHaveBeenCalledOnce();
    expect(r.state.corruption).toBe(6);
  });
});

describe('settleSlot 防胡诌集成', () => {
  it('AI抓的离谱在场人数被拒,不污染state', async () => {
    const ai = mockAi('正文', { presentCount: 999999 });
    const r = await settleSlot(baseState(), { optionId: 'serve' }, opts(ai));
    expect(r.events.rejectedFields).toContain('presentCount');
    expect(r.state.presentCount).toBe(18); // 保留旧值,没被离谱值覆盖
  });
});

import { describe, it, expect, vi } from 'vitest';
import { runCurrentSlot } from './day-runner';
import type { RunnerState } from './day-runner';
import { startDay, allocate, setChoice, beginDay } from '../action-grid/machine';
import type { EngineState, AiPort, SettleOptions } from './types';
import type { ParadigmRegistry } from '../paradigm/machine';

const registry: ParadigmRegistry = {
  serve: [{ paradigmId: 'serve_daily', optionId: 'serve', kind: 'daily', isSpecial: false, worldbookKey: 'wb_serve', label: '供奉' }],
  oral: [{ paradigmId: 'oral_first', optionId: 'oral', kind: 'special_first', isSpecial: true, corruptionWeight: 6, worldbookKey: 'wb_oral', label: '口交' }],
};

function engineState(): EngineState {
  return {
    triggeredSpecials: {}, unlocked: {},
    corruption: 0, cognition: '死撑', claimedGates: {},
    money: 8000, thugTotal: 30, presentCount: 18, isDangerousPeriod: false,
  };
}

function mockAi(): AiPort {
  return { expand: vi.fn(async () => 'AI正文'), extract: vi.fn(async () => ({ presentCount: 20 })) };
}

function opts(ai: AiPort, fastForward = false): SettleOptions {
  return { registry, fastForward, ai, summaryTemplates: { serve: '大小姐给{n}人侍奉了' }, extractBounds: { presentCount: [0, 2000] } };
}

function freshRunner(): RunnerState {
  let day = startDay(1, 4);
  day = allocate(day, { dayCount: 2, nightCount: 2 }).state!;
  day = setChoice(day, 'day', 0, { optionId: 'oral', label: '口交' });
  day = setChoice(day, 'day', 1, { optionId: 'serve', label: '供奉' });
  day = beginDay(day);
  return { day, engine: engineState() };
}

describe('runCurrentSlot 连接两个状态机', () => {
  it('执行首格(首次特殊):行动格写正文+引擎加堕落,cursor推进', async () => {
    const ai = mockAi();
    const r = await runCurrentSlot(freshRunner(), opts(ai));
    // 行动格侧
    expect(r.state.day.daySlots[0].status).toBe('done');
    expect(r.state.day.daySlots[0].resultText).toBe('AI正文');
    expect(r.state.day.cursor!.index).toBe(1); // 推进到第二格
    // 引擎侧
    expect(r.state.engine.corruption).toBe(6); // 首次口交加堕落度
    expect(r.state.engine.triggeredSpecials['oral_first']).toBe(true);
    expect(r.settle.events.firedGateIds).toContain('gate_5'); // 堕落6触发奖励
    expect(r.state.engine.presentCount).toBe(20); // extract应用
  });

  it('连续执行两格到白天结算', async () => {
    const ai = mockAi();
    let r = await runCurrentSlot(freshRunner(), opts(ai));
    r = await runCurrentSlot(r.state, opts(ai)); // 第二格(serve日常)
    expect(r.state.day.phase).toBe('day_settled');
    expect(r.state.day.cursor).toBeNull();
    expect(r.state.day.daySlots[1].status).toBe('done');
  });

  it('快进模式:日常格不调AI出总结词', async () => {
    const ai = mockAi();
    // 把首格也设成日常以便测快进
    let day = startDay(1, 2);
    day = allocate(day, { dayCount: 0, nightCount: 2 }).state!;
    day = setChoice(day, 'night', 0, { optionId: 'serve', label: '供奉' });
    day = setChoice(day, 'night', 1, { optionId: 'serve', label: '供奉' });
    day = beginDay(day); // 白天0格直接 day_settled
    // 手动进夜晚
    const { beginNight } = await import('../action-grid/machine');
    day = beginNight(day);
    const r = await runCurrentSlot({ day, engine: engineState() }, opts(ai, true));
    expect(r.settle.events.renderMode).toBe('fast_summary');
    expect(r.state.day.nightSlots[0].resultText).toBe('大小姐给18人侍奉了');
    expect(ai.expand).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { runCurrentSlot, advanceToNextDay } from './day-runner';
import type { RunnerState } from './day-runner';
import { startDay, allocate, setChoice, beginDay, beginNight } from '../action-grid/machine';
import type { SlotChoice } from '../action-grid/types';
import {
  demoEventOptions, demoSummaryTemplates, demoExtractBounds, demoForcedPool, createMockAi,
} from './mock-ai';
import type { EngineState, AiPort, SettleOptions } from './types';
import type { EventOption } from '../events/types';

// 统一事件模型 fixture：oral=天生NSFW+首次里程碑(权重10)；serve=天生NSFW无里程碑(日常态)
const eventOptions: Record<string, EventOption> = {
  serve: { id: 'serve', label: '供奉', period: 'night', shape: 'born_nsfw', nsfw: { worldbookKey: 'wb_serve' } },
  oral: {
    id: 'oral', label: '口交', period: 'night', shape: 'born_nsfw',
    nsfw: { worldbookKey: 'wb_oral' },
    first: { ledgerKey: 'oral_first', paradigm: { worldbookKey: 'wb_oral_first' }, corruptionWeight: 10 },
  },
};

function engineState(): EngineState {
  return {
    triggeredSpecials: {}, unlocked: {},
    corruption: 0, cognition: '死撑', claimedGates: {},
    money: 8000, thugTotal: 30, garrison: 0, loyalty: 60,
    condomStock: 480, desire: 0, desireCapacity: 60, perSlotThroughput: 6,
    infamy: 0, martialPrestige: 0,
    recruitQuota: 0, presentCount: 18, isDangerousPeriod: false, servedThisNight: 0,
  };
}

function mockAi(): AiPort {
  return { expand: vi.fn(async () => 'AI正文'), extract: vi.fn(async () => ({ presentCount: 20 })) };
}

function opts(ai: AiPort, fastForward = false): SettleOptions {
  return { eventOptions, fastForward, ai, summaryTemplates: { serve: '大小姐给{n}人侍奉了' }, extractBounds: { presentCount: [0, 2000] } };
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
    expect(r.state.engine.corruption).toBe(10); // 首次口交加堕落度
    expect(r.state.engine.triggeredSpecials['oral_first']).toBe(true);
    expect(r.settle.events.firedGateIds).toContain('gate_10'); // 堕落10触发奖励
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

describe('强制临时格(避孕套归零)', () => {
  it('供奉后库存归零→插入condom_zero临时格,不占预算,标记once账本', async () => {
    // 库存54,一场18人供奉(18×3=54)正好扣到0
    const eng: EngineState = { ...engineState(), condomStock: 54, presentCount: 18 };
    let day = startDay(1, 1);
    day = allocate(day, { dayCount: 0, nightCount: 1 }).state!;
    day = setChoice(day, 'night', 0, { optionId: 'serve', label: '供奉' });
    day = beginDay(day);     // 白天0格→day_settled
    day = beginNight(day);   // cursor=night#0
    const o: SettleOptions = {
      eventOptions: demoEventOptions, fastForward: false, ai: createMockAi(),
      summaryTemplates: demoSummaryTemplates, extractBounds: demoExtractBounds,
      forcedPool: demoForcedPool,
    };
    const r = await runCurrentSlot({ day, engine: eng }, o);
    expect(r.state.engine.condomStock).toBe(0);
    expect(r.forcedInsert!.id).toBe('condom_zero');
    // 临时格已插入夜晚(预算外)
    const inserted = r.state.day.nightSlots.find(s => s.inserted);
    expect(inserted!.choice!.optionId).toBe('condom_zero');
    expect(r.state.day.nightCount).toBe(1);            // 预算不变
    expect(r.state.engine.triggeredSpecials['condom_zero_1']).toBe(true); // once账本
  });

  it('库存未归零→不触发临时格', async () => {
    const eng: EngineState = { ...engineState(), condomStock: 480, presentCount: 18 };
    let day = startDay(1, 1);
    day = allocate(day, { dayCount: 0, nightCount: 1 }).state!;
    day = setChoice(day, 'night', 0, { optionId: 'serve', label: '供奉' });
    day = beginDay(day);
    day = beginNight(day);
    const o: SettleOptions = {
      eventOptions: demoEventOptions, fastForward: false, ai: createMockAi(),
      summaryTemplates: demoSummaryTemplates, extractBounds: demoExtractBounds,
      forcedPool: demoForcedPool,
    };
    const r = await runCurrentSlot({ day, engine: eng }, o);
    expect(r.forcedInsert).toBeNull();
    expect(r.state.day.nightSlots.some(s => s.inserted)).toBe(false);
  });
});

describe('advanceToNextDay 进入次日', () => {
  const serveChoice: SlotChoice = { optionId: 'serve', label: '供奉' };

  it('正常→startDay进玩家分配', () => {
    const r = advanceToNextDay(engineState(), 1, 8, 0, 0, serveChoice);
    expect(r.forcedLeave).toBe(false);
    expect(r.day.dayNumber).toBe(2);
    expect(r.day.phase).toBe('allocating');
  });

  it('pendingForcedLeave→构造强制请假轮奸日+清除标记', () => {
    const r = advanceToNextDay(
      engineState(), 3, 8, 0, 0, serveChoice,
    );
    expect(r.forcedLeave).toBe(false); // 默认无溢出

    const r2 = advanceToNextDay(
      { ...engineState(), pendingForcedLeave: true }, 3, 8, 0, 0, serveChoice,
    );
    expect(r2.forcedLeave).toBe(true);
    expect(r2.day.dayNumber).toBe(4);
    expect(r2.day.phase).toBe('day_settled');     // 白天0格
    expect(r2.day.nightCount).toBe(8);
    expect(r2.day.nightSlots.every(s => s.locked)).toBe(true);
    expect(r2.engine.pendingForcedLeave).toBe(false); // 标记已清除
  });
});

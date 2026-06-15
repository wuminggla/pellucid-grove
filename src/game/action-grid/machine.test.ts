import { describe, it, expect } from 'vitest';
import {
  startDay, allocate, setChoice, clearChoice, lockSlot,
  checkSubmit, beginDay, markRunning, completeCurrent, beginNight, currentSlot, fillEmpty,
} from './machine';
import type { SlotChoice } from './types';

const serve: SlotChoice = { optionId: 'serve', label: '供奉打手' };
const recruit: SlotChoice = { optionId: 'recruit', label: '招募打手' };

function freshAllocated(day = 4, night = 4) {
  const s0 = startDay(1, day + night);
  const r = allocate(s0, { dayCount: day, nightCount: night });
  if (!r.ok || !r.state) throw new Error(r.error);
  return r.state;
}

describe('分配 allocate', () => {
  it('X+Y必须等于总格数', () => {
    const s = startDay(1, 8);
    expect(allocate(s, { dayCount: 4, nightCount: 4 }).ok).toBe(true);
    expect(allocate(s, { dayCount: 4, nightCount: 3 }).ok).toBe(false);
    expect(allocate(s, { dayCount: -1, nightCount: 9 }).ok).toBe(false);
  });
  it('请假=白天0格全给夜晚，合法', () => {
    const s = startDay(1, 8);
    const r = allocate(s, { dayCount: 0, nightCount: 8 });
    expect(r.ok).toBe(true);
    expect(r.state!.nightSlots.length).toBe(8);
    expect(r.state!.daySlots.length).toBe(0);
  });
});

describe('安排选项与校验', () => {
  it('空格不能提交', () => {
    const s = freshAllocated(2, 2);
    expect(checkSubmit(s, 'day').ok).toBe(false);
    expect(checkSubmit(s, 'day').emptyIndexes).toEqual([0, 1]);
  });
  it('排满后可提交', () => {
    let s = freshAllocated(2, 2);
    s = setChoice(s, 'day', 0, recruit);
    s = setChoice(s, 'day', 1, recruit);
    expect(checkSubmit(s, 'day').ok).toBe(true);
  });
  it('清空选项回到empty', () => {
    let s = freshAllocated(2, 2);
    s = setChoice(s, 'day', 0, recruit);
    s = clearChoice(s, 'day', 0);
    expect(s.daySlots[0].status).toBe('empty');
  });
});

describe('强占锁定', () => {
  it('locked格不可改派/清空', () => {
    let s = freshAllocated(2, 2);
    s = lockSlot(s, 'day', 0, '日常侵蚀', { optionId: 'forced_molest', label: '日常侵蚀NSFW' });
    expect(s.daySlots[0].locked).toBe(true);
    expect(s.daySlots[0].lockedBy).toBe('日常侵蚀');
    expect(() => setChoice(s, 'day', 0, recruit)).toThrow();
    expect(() => clearChoice(s, 'day', 0)).toThrow();
  });
});

describe('完整一天流转', () => {
  it('分配→白天逐格→白天结算→夜晚逐格→夜晚结算', () => {
    let s = freshAllocated(2, 2);
    // 白天排满
    s = setChoice(s, 'day', 0, recruit);
    s = setChoice(s, 'day', 1, recruit);
    s = beginDay(s);
    expect(s.phase).toBe('day_running');
    expect(currentSlot(s)!.index).toBe(0);
    // 第一格
    s = markRunning(s);
    expect(currentSlot(s)!.status).toBe('running');
    s = completeCurrent(s, '招募了几个打手');
    expect(s.daySlots[0].status).toBe('done');
    expect(s.cursor!.index).toBe(1);
    // 第二格→白天结算
    s = markRunning(s);
    s = completeCurrent(s, '又招了几个');
    expect(s.phase).toBe('day_settled');
    expect(s.cursor).toBeNull();
    // 夜晚
    s = setChoice(s, 'night', 0, serve);
    s = setChoice(s, 'night', 1, serve);
    s = beginNight(s);
    expect(s.phase).toBe('night_running');
    s = markRunning(s); s = completeCurrent(s, '供奉一批');
    s = markRunning(s); s = completeCurrent(s, '供奉二批');
    expect(s.phase).toBe('night_settled');
  });

  it('请假场景：白天0格直接跳到白天结算', () => {
    const r = allocate(startDay(1, 8), { dayCount: 0, nightCount: 8 });
    let s = beginDay(r.state!);
    expect(s.phase).toBe('day_settled'); // 白天0格直接结算
    for (let i = 0; i < 8; i++) s = setChoice(s, 'night', i, serve);
    s = beginNight(s);
    expect(s.phase).toBe('night_running');
  });

  it('边走边排：只排一格也能 beginDay(不再强制全填)', () => {
    let s = freshAllocated(2, 2);
    s = setChoice(s, 'day', 0, recruit); // 只排一格
    s = beginDay(s); // 不抛错
    expect(s.phase).toBe('day_running');
    expect(s.cursor!.index).toBe(0);
  });
});

describe('fillEmpty 一键填充', () => {
  it('填充所有空格,已排/锁定格不动', () => {
    let s = freshAllocated(0, 4);
    s = setChoice(s, 'night', 0, recruit); // 第0格已排招募
    s = lockSlot(s, 'night', 1, '强占', serve); // 第1格锁定
    s = fillEmpty(s, 'night', serve); // 填充剩余
    expect(s.nightSlots[0].choice!.optionId).toBe('recruit'); // 已排不变
    expect(s.nightSlots[1].locked).toBe(true); // 锁定不变
    expect(s.nightSlots[2].choice!.optionId).toBe('serve'); // 空格被填
    expect(s.nightSlots[3].choice!.optionId).toBe('serve');
  });
});

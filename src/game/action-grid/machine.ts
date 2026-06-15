// 行动格系统 · 状态机核心（纯函数，无副作用，便于单测）
// 设计：每个操作返回新的 DayState，不修改入参。错误用抛异常/返回校验结果区分。

import type {
  DayState, DayPhase, SlotPeriod, ActionSlot, SlotChoice, Allocation,
} from './types';

// ───────────────────────────────────────
// 构造
// ───────────────────────────────────────

function makeSlots(period: SlotPeriod, count: number): ActionSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    period,
    status: 'empty' as const,
    choice: null,
  }));
}

/** 开始新的一天（早7点）：进入分配阶段 */
export function startDay(dayNumber: number, totalSlots: number): DayState {
  return {
    dayNumber,
    phase: 'allocating',
    totalSlots,
    dayCount: 0,
    nightCount: 0,
    daySlots: [],
    nightSlots: [],
    cursor: null,
  };
}

// ───────────────────────────────────────
// 分配（allocating 阶段）
// ───────────────────────────────────────

export interface AllocResult {
  ok: boolean;
  error?: string;
  state?: DayState;
}

/**
 * 分配白天/夜晚格数。X+Y 必须 == totalSlots。
 * 请假 = dayCount:0（全给夜晚），是合法的极端分配。
 */
export function allocate(state: DayState, alloc: Allocation): AllocResult {
  if (state.phase !== 'allocating') {
    return { ok: false, error: `当前阶段 ${state.phase} 不可分配` };
  }
  const { dayCount, nightCount } = alloc;
  if (!Number.isInteger(dayCount) || !Number.isInteger(nightCount) || dayCount < 0 || nightCount < 0) {
    return { ok: false, error: '格数必须是非负整数' };
  }
  if (dayCount + nightCount !== state.totalSlots) {
    return { ok: false, error: `白天(${dayCount})+夜晚(${nightCount}) 必须等于总格数 ${state.totalSlots}` };
  }
  return {
    ok: true,
    state: {
      ...state,
      dayCount,
      nightCount,
      daySlots: makeSlots('day', dayCount),
      nightSlots: makeSlots('night', nightCount),
    },
  };
}

// ───────────────────────────────────────
// 安排选项（仍在 allocating，或对应时段尚未执行该格）
// ───────────────────────────────────────

function slotsOf(state: DayState, period: SlotPeriod): ActionSlot[] {
  return period === 'day' ? state.daySlots : state.nightSlots;
}

function withSlots(state: DayState, period: SlotPeriod, slots: ActionSlot[]): DayState {
  return period === 'day' ? { ...state, daySlots: slots } : { ...state, nightSlots: slots };
}

/** 给某格安排选项（empty→planned）。locked 格不可改派。 */
export function setChoice(
  state: DayState, period: SlotPeriod, index: number, choice: SlotChoice,
): DayState {
  const slots = slotsOf(state, period);
  const slot = slots[index];
  if (!slot) throw new Error(`格不存在: ${period}#${index}`);
  if (slot.locked) throw new Error(`该格被事件「${slot.lockedBy}」强占，不可改派`);
  if (slot.status === 'running' || slot.status === 'done') {
    throw new Error(`该格已执行(${slot.status})，不可改派`);
  }
  const next = slots.map((s, i) =>
    i === index ? { ...s, choice, status: 'planned' as const } : s);
  return withSlots(state, period, next);
}

/** 清空某格选项（planned→empty）。 */
export function clearChoice(state: DayState, period: SlotPeriod, index: number): DayState {
  const slots = slotsOf(state, period);
  const slot = slots[index];
  if (!slot) throw new Error(`格不存在: ${period}#${index}`);
  if (slot.locked) throw new Error(`该格被事件强占，不可清空`);
  if (slot.status === 'running' || slot.status === 'done') {
    throw new Error(`该格已执行，不可清空`);
  }
  const next = slots.map((s, i) =>
    i === index ? { ...s, choice: null, status: 'empty' as const } : s);
  return withSlots(state, period, next);
}

/** 事件系统强占某格（强占/霸全）：锁定且写入来源事件名。 */
export function lockSlot(
  state: DayState, period: SlotPeriod, index: number, eventName: string, choice: SlotChoice,
): DayState {
  const slots = slotsOf(state, period);
  if (!slots[index]) throw new Error(`格不存在: ${period}#${index}`);
  const next = slots.map((s, i) =>
    i === index ? { ...s, choice, status: 'planned' as const, locked: true, lockedBy: eventName } : s);
  return withSlots(state, period, next);
}

// ───────────────────────────────────────
// 提交校验（空格不能提交）
// ───────────────────────────────────────

export interface SubmitCheck {
  ok: boolean;
  error?: string;
  emptyIndexes?: number[];
}

/**
 * 校验某时段能否提交执行。规则（设计稿）：
 * - 该时段所有格必须非 empty（"空选项不能提交"）。
 * - 用户可"只排第一格"就提交——但当前实现要求每个已分配的格都要有内容。
 *   注：设计稿"可只排第一格"指逐格推进时可边走边排；MVP 先要求全排满，
 *   后续若要支持"边排边走"，再放宽为"至少第一格非空"。
 */
export function checkSubmit(state: DayState, period: SlotPeriod): SubmitCheck {
  const slots = slotsOf(state, period);
  if (slots.length === 0) {
    return { ok: true }; // 该时段0格（如请假时白天0格），直接通过
  }
  const emptyIndexes = slots.filter(s => s.status === 'empty').map(s => s.index);
  if (emptyIndexes.length > 0) {
    return { ok: false, error: `有空格未安排：${emptyIndexes.join(',')}`, emptyIndexes };
  }
  return { ok: true };
}

// ───────────────────────────────────────
// 阶段流转与逐格推进
// ───────────────────────────────────────

/** 从分配阶段进入白天执行（校验白天可提交） */
export function beginDay(state: DayState): DayState {
  if (state.phase !== 'allocating') throw new Error(`阶段错误: ${state.phase}`);
  const check = checkSubmit(state, 'day');
  if (!check.ok) throw new Error(check.error);
  // 白天0格则直接跳到白天结算（请假场景）
  if (state.dayCount === 0) {
    return { ...state, phase: 'day_settled', cursor: null };
  }
  return { ...state, phase: 'day_running', cursor: { period: 'day', index: 0 } };
}

/** 标记当前 cursor 格为进行中（调AI/mock前） */
export function markRunning(state: DayState): DayState {
  if (!state.cursor) throw new Error('无当前执行格');
  const { period, index } = state.cursor;
  const slots = slotsOf(state, period);
  const next = slots.map((s, i) => i === index ? { ...s, status: 'running' as const } : s);
  return withSlots(state, period, next);
}

/** 完成当前 cursor 格（写入结果文本），推进 cursor 到下一格；本时段完则进入结算 */
export function completeCurrent(state: DayState, resultText: string): DayState {
  if (!state.cursor) throw new Error('无当前执行格');
  const { period, index } = state.cursor;
  const slots = slotsOf(state, period);
  const nextSlots = slots.map((s, i) =>
    i === index ? { ...s, status: 'done' as const, resultText } : s);
  let s2 = withSlots(state, period, nextSlots);

  const isLast = index >= slots.length - 1;
  if (!isLast) {
    return { ...s2, cursor: { period, index: index + 1 } };
  }
  // 本时段最后一格完成 → 结算
  if (period === 'day') {
    return { ...s2, phase: 'day_settled', cursor: null };
  }
  return { ...s2, phase: 'night_settled', cursor: null };
}

/** 白天结算后进入夜晚执行 */
export function beginNight(state: DayState): DayState {
  if (state.phase !== 'day_settled') throw new Error(`阶段错误: ${state.phase}`);
  const check = checkSubmit(state, 'night');
  if (!check.ok) throw new Error(check.error);
  if (state.nightCount === 0) {
    return { ...state, phase: 'night_settled', cursor: null };
  }
  return { ...state, phase: 'night_running', cursor: { period: 'night', index: 0 } };
}

/** 当前执行格（便捷读取） */
export function currentSlot(state: DayState): ActionSlot | null {
  if (!state.cursor) return null;
  return slotsOf(state, state.cursor.period)[state.cursor.index] ?? null;
}

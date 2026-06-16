// 统一事件模型 · 核心逻辑（纯函数）
// resolveEvent: 给定事件选项+上下文 → 决定用SFW还是NSFW态、是否首次里程碑、renderMode。
// 候选池: 优先级+已触发标签机制（覆盖避孕套三连等同条件依次触发）。

import { COGNITION_ORDER } from '../corruption/machine';
import type { CognitionStage } from '../corruption/machine';
import type {
  EventOption, ErosionGate, EventContext, EventResolution, RenderMode, ParadigmRef,
} from './types';

// ───────────────────────────────────────
// 解锁 & 侵蚀闸门判定
// ───────────────────────────────────────

/** 认知防线档位序号比较 */
function cognitionGte(cur: CognitionStage, need: CognitionStage): boolean {
  return COGNITION_ORDER.indexOf(cur) >= COGNITION_ORDER.indexOf(need);
}

/** 选项是否已解锁（扩张：出现在菜单的条件） */
export function isUnlocked(opt: EventOption, ctx: EventContext): boolean {
  if (!opt.unlockRequires || opt.unlockRequires.length === 0) return true;
  return opt.unlockRequires.every(r => ctx.unlocked[r] === true);
}

/** 侵蚀闸门是否满足（全部条件满足才翻面成NSFW）。可组合多数值。 */
export function gateOpen(gate: ErosionGate | undefined, ctx: EventContext): boolean {
  if (!gate) return false;
  if (gate.corruptionAtLeast != null && ctx.corruption < gate.corruptionAtLeast) return false;
  if (gate.cognitionAtLeast != null && !cognitionGte(ctx.cognition, gate.cognitionAtLeast)) return false;
  if (gate.infamyAtLeast != null && ctx.infamy < gate.infamyAtLeast) return false;
  if (gate.thugsAtLeast != null && ctx.thugs < gate.thugsAtLeast) return false;
  if (gate.custom && !gate.custom(ctx)) return false;
  return true;
}

// ───────────────────────────────────────
// 事件解析：决定 face / 首次 / renderMode
// ───────────────────────────────────────

function pickRenderMode(isFirst: boolean, isNsfw: boolean, fastForward: boolean): RenderMode {
  if (isFirst) return 'ai_full';        // 首次里程碑永远完整扩写(压过快进)
  if (fastForward) return 'fast_summary';
  return isNsfw ? 'ai_normal' : 'ai_brief'; // NSFW非首次正常生成；SFW日常略写
}

/**
 * 解析一个事件选项当前该怎么演。
 * 规则（v3 §0/§2/§3）：
 *  - born_sfw：永远 SFW。
 *  - born_nsfw：永远 NSFW；其 first 里程碑（第一次做）未触发则首次特殊。
 *  - dual：看侵蚀闸门——
 *     未开 → SFW态（ai_brief）。
 *     开 + first 未触发 → 首次侵蚀特殊事件（ai_full，加堕落，记账本）。
 *     开 + first 已触发 → NSFW态（ai_normal）。
 */
export function resolveEvent(
  opt: EventOption, ctx: EventContext, fastForward: boolean,
): EventResolution {
  const firstTriggered = opt.first ? ctx.triggeredLedger[opt.first.ledgerKey] === true : true;

  // 决定 face
  let face: 'sfw' | 'nsfw';
  if (opt.shape === 'born_sfw') face = 'sfw';
  else if (opt.shape === 'born_nsfw') face = 'nsfw';
  else face = gateOpen(opt.erosionGate, ctx) ? 'nsfw' : 'sfw';

  // 首次里程碑判定：NSFW态 + 有first + 未触发
  const isFirstMilestone = face === 'nsfw' && !!opt.first && !firstTriggered;

  // 选范式
  let paradigm: ParadigmRef;
  if (isFirstMilestone) paradigm = opt.first!.paradigm;
  else if (face === 'nsfw') paradigm = opt.nsfw ?? opt.first!.paradigm;
  else paradigm = opt.sfw ?? { worldbookKey: `${opt.id}_sfw` };

  const isNsfw = face === 'nsfw';
  const corruptionGain = isFirstMilestone ? opt.first!.corruptionWeight : 0;
  const renderMode = pickRenderMode(isFirstMilestone, isNsfw, fastForward);

  return { option: opt, face, isFirstMilestone, corruptionGain, paradigm, renderMode, isNsfw };
}

/** 消费首次里程碑后，返回更新后的账本（纯函数） */
export function markMilestone(ledger: Record<string, boolean>, ledgerKey: string): Record<string, boolean> {
  return { ...ledger, [ledgerKey]: true };
}

// ───────────────────────────────────────
// 菜单：列出某时段当前可选的事件选项（+♥标记+置顶排序）
// ───────────────────────────────────────

export interface MenuEntry {
  option: EventOption;
  isNsfw: boolean;      // 当前态是否NSFW（UI加♥）
  label: string;        // 含♥的显示名
}

/**
 * 列出某时段菜单。规则：
 *  - 仅已解锁。
 *  - 双面型若已不可逆侵蚀(闸门开+首次已触发+irreversibleAfterErosion)，SFW版语义已消失，只显示NSFW(♥)。
 *  - 置顶项排最前。
 */
export function buildMenu(
  options: EventOption[], ctx: EventContext, period: 'day' | 'night',
): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const opt of options) {
    if (opt.period !== 'any' && opt.period !== period) continue;
    if (!isUnlocked(opt, ctx)) continue;
    const res = resolveEvent(opt, ctx, false);
    entries.push({
      option: opt,
      isNsfw: res.isNsfw,
      label: res.isNsfw ? `${opt.label}（♥）` : opt.label,
    });
  }
  // 置顶优先，其余保持注册顺序
  return entries.sort((a, b) => Number(b.option.pinned ?? false) - Number(a.option.pinned ?? false));
}

// ───────────────────────────────────────
// 强制/特殊事件候选池（优先级 + 已触发标签）
// ───────────────────────────────────────

/** 强制事件条目（强占/霸全，由系统扫描触发，非玩家主动选） */
export interface ForcedEvent {
  id: string;
  ledgerKey?: string;          // 一次性事件的账本键（触发后打标签，不再触发）
  priority: number;            // 数字小先触发
  /** 触发条件 */
  condition: (ctx: EventContext) => boolean;
  /** 是否一次性（触发后标记，永不再触发） */
  once?: boolean;
}

/**
 * 扫描强制事件候选池，返回本回合应触发的最高优先级事件（或 null）。
 * 机制（v3 §4）：过滤(已触发标签 + 条件不满足) → 按优先级取最高。
 * 覆盖避孕套三连：三条目同条件(库存=0)，靠优先级+once标签依次触发。
 */
export function scanForced(pool: ForcedEvent[], ctx: EventContext): ForcedEvent | null {
  const candidates = pool.filter(e => {
    if (e.once && e.ledgerKey && ctx.triggeredLedger[e.ledgerKey]) return false; // 已触发跳过
    return e.condition(ctx);
  });
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => a.priority - b.priority)[0];
}

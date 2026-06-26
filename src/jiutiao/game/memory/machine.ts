// 记忆层（纯函数）· 记忆层设计 阶段1 落地
// 三线:结构化日志(桶2·代码写·滑动窗口) + 延续摘要(桶4·里程碑+AI一句) + 里程碑账本(已有triggeredSpecials)。
// 本模块管前两线的数据与渲染。AI <continuity> piggyback 解析见 3-3b;此处先支持代码可知的里程碑/认知跨档笔记。

import type { RenderMode } from '../events/types';

/** 结构化日志条目(每格结算代码写,不依赖AI) */
export interface LogEntry {
  day: number;
  period: 'day' | 'night';
  slot: number;
  eventId: string;
  label: string;
  presentCount?: number;
  corruptionDelta?: number;
  renderMode: RenderMode;
  tags?: string[];
}

/** 延续摘要(桶4·永久里程碑线) */
export interface ContinuityNote {
  day: number;
  kind: 'milestone' | 'entity' | 'turning';
  text: string;
}

/** 注入 prompt 的记忆上下文 */
export interface MemoryContext {
  storyThread: string; // 故事脉络(延续摘要·永久)
  recentLog: string;   // 近期发生(日志滑动窗口)
}

/** 近期日志注入窗口大小(条) */
export const RECENT_LOG_WINDOW = 12;

const PERIOD_CN: Record<'day' | 'night', string> = { day: '昼', night: '夜' };

export function appendLog(log: LogEntry[] | undefined, entry: LogEntry): LogEntry[] {
  return [...(log ?? []), entry];
}

export function appendContinuity(notes: ContinuityNote[] | undefined, note: ContinuityNote): ContinuityNote[] {
  return [...(notes ?? []), note];
}

/** 渲染单条日志:`第N天夜#2 · 供奉 · 在场80人` */
export function renderLogEntry(e: LogEntry): string {
  const head = `第${e.day}天${PERIOD_CN[e.period]}#${e.slot} · ${e.label}`;
  const ppl = e.presentCount != null ? ` · 在场${e.presentCount}人` : '';
  const tags = e.tags && e.tags.length ? ` [${e.tags.join('/')}]` : '';
  return head + ppl + tags;
}

/** 近期发生:日志滑动窗口最近N条 */
export function renderRecentLog(log: LogEntry[] | undefined, n = RECENT_LOG_WINDOW): string {
  if (!log || log.length === 0) return '';
  return log.slice(-n).map(renderLogEntry).join('\n');
}

/** 故事脉络:全部延续摘要(永久·天然紧凑) */
export function renderStoryThread(notes: ContinuityNote[] | undefined): string {
  if (!notes || notes.length === 0) return '';
  return notes.map(n => `第${n.day}天:${n.text}`).join('\n');
}

/** 从状态切片构造记忆上下文(供 buildGamePrompt 注入) */
export function buildMemoryContext(state: { narrativeLog?: LogEntry[]; continuityNotes?: ContinuityNote[] }): MemoryContext {
  return {
    storyThread: renderStoryThread(state.continuityNotes),
    recentLog: renderRecentLog(state.narrativeLog),
  };
}

/** 本格是否需要 AI 延续摘要(桶4判定):事件标记 || 认知防线跨档 */
export function needsContinuitySummary(needsFlag: boolean | undefined, cognitionAdvanced: boolean): boolean {
  return !!needsFlag || cognitionAdvanced;
}

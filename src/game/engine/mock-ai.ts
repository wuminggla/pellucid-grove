// Mock AI + 示例数据 —— 供 UI 在无真实API时跑通游戏循环（开发/演示用）。
// 用统一事件模型(EventOption)。真实游戏内容(范式/世界书)后续填；这里是结构占位 + 可玩假数据。

import type { AiPort } from './types';
import type { EventOption } from '../events/types';
import type { ForcedEvent } from '../events/machine';

/** 示例事件选项注册表（统一模型：双面型/天生NSFW/解锁/侵蚀闸门）。占位堕落度阈值50。 */
export const demoEventOptions: Record<string, EventOption> = {
  // —— 白天·天生SFW经营 ——
  recruit: { id: 'recruit', label: '招募打手', period: 'day', shape: 'born_sfw', sfw: { worldbookKey: 'wb_recruit' } },
  attack:  { id: 'attack', label: '攻打据点', period: 'day', shape: 'born_sfw', sfw: { worldbookKey: 'wb_attack' }, martialReward: 5 },
  // —— 白天·双面型（堕落侵蚀）——
  bribe: {
    id: 'bribe', label: '贿赂敌人', period: 'day', shape: 'dual',
    sfw: { worldbookKey: 'wb_bribe_money' }, nsfw: { worldbookKey: 'wb_bribe_body' },
    erosionGate: { corruptionAtLeast: 50 }, irreversibleAfterErosion: true,
    first: { ledgerKey: 'bribe_first_body', paradigm: { worldbookKey: 'wb_bribe_first' }, corruptionWeight: 10 },
  },
  protection: {
    id: 'protection', label: '收保护费', period: 'day', shape: 'dual',
    sfw: { worldbookKey: 'wb_protect_sfw' }, nsfw: { worldbookKey: 'wb_protect_nsfw' },
    erosionGate: { corruptionAtLeast: 50 },
    first: { ledgerKey: 'protect_first', paradigm: { worldbookKey: 'wb_protect_first' }, corruptionWeight: 8 },
  },
  buy_condoms: { id: 'buy_condoms', label: '采购避孕套', period: 'day', shape: 'born_nsfw', nsfw: { worldbookKey: 'wb_buy' },
    first: { ledgerKey: 'buy_first', paradigm: { worldbookKey: 'wb_buy_first' }, corruptionWeight: 5 } },
  // —— 夜晚·天生NSFW供奉 ——
  serve: { id: 'serve', label: '供奉打手', period: 'night', shape: 'born_nsfw', isServe: true, nsfw: { worldbookKey: 'wb_serve' },
    first: { ledgerKey: 'serve_first', paradigm: { worldbookKey: 'wb_serve_first' }, corruptionWeight: 5 } },
  oral: { id: 'oral', label: '口交侍奉', period: 'night', shape: 'born_nsfw', isServe: true, nsfw: { worldbookKey: 'wb_oral' },
    first: { ledgerKey: 'oral_first', paradigm: { worldbookKey: 'wb_oral_first' }, corruptionWeight: 5 } },
  anal: { id: 'anal', label: '肛交开发', period: 'night', shape: 'born_nsfw', isServe: true, unlockRequires: ['anal_unlocked'],
    nsfw: { worldbookKey: 'wb_anal' }, first: { ledgerKey: 'anal_first', paradigm: { worldbookKey: 'wb_anal_first' }, corruptionWeight: 8 } },
  // —— 通用·休息 ——
  rest: { id: 'rest', label: '休息', period: 'night', shape: 'born_sfw', sfw: { worldbookKey: 'wb_rest' } },
  // —— 强制·避孕套归零（临时格插入，非玩家主动选）——
  condom_zero: {
    id: 'condom_zero', label: '避孕套归零·裸体买套', period: 'any', shape: 'born_nsfw',
    nsfw: { worldbookKey: 'wb_condom_zero' },
    first: { ledgerKey: 'condom_zero_first', paradigm: { worldbookKey: 'wb_condom_zero_first' }, corruptionWeight: 5 },
  },
  // —— 强制·地盘骚扰防守（强占白天一格，非玩家主动选）——
  defend_turf: {
    id: 'defend_turf', label: '地盘骚扰·驱逐', period: 'day', shape: 'born_sfw',
    sfw: { worldbookKey: 'wb_defend_turf' },
  },
};

/** 示例强制事件池（统一机制：优先级+已触发标签）。条件占位，真实信号待地盘/经济系统驱动。 */
export const demoForcedPool: ForcedEvent[] = [
  // 避孕套归零 → 临时格（不占预算），无空格也能强行插入
  {
    id: 'condom_zero', ledgerKey: 'condom_zero_1', priority: 1, once: true,
    intensity: 'insert_slot', optionId: 'condom_zero', label: '避孕套归零·裸体买套',
    condition: c => (c.condomStock ?? 1) <= 0,
  },
  // 地盘骚扰 → 强占白天一格（高频，非一次性）
  {
    id: 'harass', priority: 5,
    intensity: 'seize_slot', optionId: 'defend_turf', label: '地盘骚扰',
    condition: c => (c.threatLevel ?? 0) >= 1,
  },
];

/** 快进总结词模板 */
export const demoSummaryTemplates: Record<string, string> = {
  serve: '大小姐给{n}人侍奉了',
  oral: '大小姐为{n}人口交了',
  anal: '大小姐被{n}人开发了后穴',
  rest: '凛回房歇下，养精蓄锐。',
  recruit: '招募事宜处理完毕。',
  buy_condoms: '采购了一批避孕套。',
  attack: '据点战事已了结。',
  bribe: '贿赂之事已办妥。',
  protection: '保护费已收讫。',
};

/** extract 防胡诌范围 */
export const demoExtractBounds: Record<string, [number, number]> = {
  presentCount: [0, 2000],
};

/** 供奉类 optionId（从 demoEventOptions.isServe 推导，供 day-runner 用） */
export const demoServeOptionIds = Object.values(demoEventOptions).filter(o => o.isServe).map(o => o.id);

/** 假 AI：本地生成占位正文 + 固定数值，不联网。供 UI 跑通循环。 */
export function createMockAi(): AiPort {
  return {
    async expand(req) {
      const { resolution, attitude, state } = req;
      const tag = resolution.renderMode === 'ai_full' ? '【首次·重点扩写】'
        : resolution.renderMode === 'ai_normal' ? '【NSFW常规】'
        : '【略写】';
      const wb = resolution.paradigm.inlinePrompt ? '定制范式' : resolution.paradigm.worldbookKey;
      return `${tag}（mock 正文·态度:${attitude}）凛执行了「${resolution.option.label}」。`
        + `在场约 ${state.presentCount} 人。这里将来是 AI1 按范式 ${wb} 扩写的正文。`;
    },
    async extract(req) {
      const base = req.state.presentCount || 18;
      return { presentCount: base };
    },
  };
}

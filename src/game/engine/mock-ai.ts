// Mock AI + 事件注册表 —— 无真实API时跑通游戏循环（开发/演示用）。
// 3-5c: EventOption 注册表扩展为真实事件定义(worldbookKey对齐设计稿)。

import type { AiPort } from './types';
import type { EventOption } from '../events/types';
import type { ForcedEvent } from '../events/machine';

/** 真实事件注册表(统一模型) · 3-5c */
export const demoEventOptions: Record<string, EventOption> = {

  // ═══════════════════════════════════════════════════
  // 白天经营事件
  // ═══════════════════════════════════════════════════

  recruit: {
    id: 'recruit', label: '招募打手', period: 'day', shape: 'born_sfw',
    sfw: { worldbookKey: 'wb_recruit_sfw' },
  },

  attack: {
    id: 'attack', label: '攻打据点', period: 'day', shape: 'born_sfw',
    sfw: { worldbookKey: 'wb_attack' }, martialReward: 5,
  },

  defend_turf: {
    id: 'defend_turf', label: '地盘骚扰·驱逐', period: 'day', shape: 'born_sfw',
    sfw: { worldbookKey: 'wb_defend_turf' },
  },

  scout: {
    id: 'scout', label: '刺探/派驻', period: 'day', shape: 'born_sfw',
    sfw: { worldbookKey: 'wb_scout_sfw' },
  },

  // 双面型:贿赂敌人(SFW金钱↔NSFW身体贿赂)
  bribe: {
    id: 'bribe', label: '贿赂敌人', period: 'day', shape: 'dual',
    sfw: { worldbookKey: 'wb_bribe_sfw' },
    nsfw: { worldbookKey: 'wb_bribe_body' },
    erosionGate: { corruptionAtLeast: 30 },
    irreversibleAfterErosion: true,
    first: { ledgerKey: 'bribe_first_body', paradigm: { worldbookKey: 'wb_bribe_first' }, corruptionWeight: 10 },
    needsContinuity: true,
  },

  // 双面型:收保护费(SFW威风↔NSFW人前淫乱)
  protection: {
    id: 'protection', label: '收保护费', period: 'day', shape: 'dual',
    sfw: { worldbookKey: 'wb_protect_sfw' },
    nsfw: { worldbookKey: 'wb_protect_nsfw' },
    erosionGate: { corruptionAtLeast: 25 },
    first: { ledgerKey: 'protect_first', paradigm: { worldbookKey: 'wb_protect_first' }, corruptionWeight: 6 },
  },

  // 天生NSFW:买避孕套(四档分级·按人数/堕落度选档·stages)
  buy_condoms: {
    id: 'buy_condoms', label: '采购避孕套', period: 'day', shape: 'born_nsfw',
    nsfw: { worldbookKey: 'wb_buy_condom' },
    first: { ledgerKey: 'buy_first', paradigm: { worldbookKey: 'wb_buy_condom_first' }, corruptionWeight: 5 },
  },

  // 双面型:去大学上课(SFW日常↔NSFW三阶段·防跳阶段)
  school: {
    id: 'school', label: '去大学上课', period: 'day', shape: 'dual',
    sfw: { worldbookKey: 'wb_school_sfw' },
    needsContinuity: true,
    stages: [
      { corruptionAtLeast: 25, ledgerKey: 'school_25', corruptionWeight: 5,
        firstParadigm: { worldbookKey: 'wb_school25_first' }, paradigm: { worldbookKey: 'wb_school25' } },
      { corruptionAtLeast: 50, ledgerKey: 'school_50', corruptionWeight: 5,
        firstParadigm: { worldbookKey: 'wb_school50_first' }, paradigm: { worldbookKey: 'wb_school50' } },
      { corruptionAtLeast: 75, ledgerKey: 'school_75', corruptionWeight: 5,
        firstParadigm: { worldbookKey: 'wb_school75_first' }, paradigm: { worldbookKey: 'wb_school75' } },
    ],
  },

  // 双面型:出门吃饭→餐厅
  dine: {
    id: 'dine', label: '出门吃饭', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_street'],
    sfw: { worldbookKey: 'wb_dine_sfw' },
    nsfw: { worldbookKey: 'wb_dine' },
    erosionGate: { corruptionAtLeast: 30 },
    first: { ledgerKey: 'dine_first', paradigm: { worldbookKey: 'wb_dine_first' }, corruptionWeight: 5 },
    infamyReward: 1,
  },

  // ═══════════════════════════════════════════════════
  // 夜晚供奉事件(isServe=true·抵供奉吞吐)
  // ═══════════════════════════════════════════════════

  serve_oral: {
    id: 'serve_oral', label: '口交侍奉', period: 'night', shape: 'born_nsfw', isServe: true,
    nsfw: { worldbookKey: 'wb_serve_oral' },
    first: { ledgerKey: 'serve_oral_first', paradigm: { worldbookKey: 'wb_serve_oral_first' }, corruptionWeight: 8 },
  },

  serve_vaginal: {
    id: 'serve_vaginal', label: '供奉', period: 'night', shape: 'born_nsfw', isServe: true,
    nsfw: { worldbookKey: 'wb_serve_vaginal' },
    first: { ledgerKey: 'serve_vaginal_first', paradigm: { worldbookKey: 'wb_serve_vaginal_first' }, corruptionWeight: 10 },
  },

  serve_anal: {
    id: 'serve_anal', label: '肛交开发', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['anal_unlocked'],
    nsfw: { worldbookKey: 'wb_serve_anal' },
    first: { ledgerKey: 'serve_anal_first', paradigm: { worldbookKey: 'wb_serve_anal_first' }, corruptionWeight: 12 },
  },

  serve_violent: {
    id: 'serve_violent', label: '暴力供奉', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['dungeon_unlocked'],
    nsfw: { worldbookKey: 'wb_violent_serve_common' },
    first: { ledgerKey: 'serve_violent_first', paradigm: { worldbookKey: 'wb_violent_serve_common' }, corruptionWeight: 15 },
    needsContinuity: true,
  },

  // 双面型:休息(SFW睡觉↔NSFW轮奸起居)
  rest: {
    id: 'rest', label: '休息', period: 'night', shape: 'dual',
    sfw: { worldbookKey: 'wb_rest_sfw' },
    nsfw: { worldbookKey: 'wb_rape_living' },
    erosionGate: { corruptionAtLeast: 20 },
    first: { ledgerKey: 'rape_living_first', paradigm: { worldbookKey: 'wb_rape_living_first' }, corruptionWeight: 8 },
  },

  // ═══════════════════════════════════════════════════
  // 强制/临时格事件(非玩家主动选)
  // ═══════════════════════════════════════════════════

  condom_zero: {
    id: 'condom_zero', label: '避孕套归零·补救', period: 'any', shape: 'born_nsfw',
    nsfw: { worldbookKey: 'wb_condom_zero_1' },
    first: { ledgerKey: 'condom_zero_1', paradigm: { worldbookKey: 'wb_condom_zero_1' }, corruptionWeight: 5 },
  },

  forced_leave: {
    id: 'forced_leave', label: '强制请假轮奸', period: 'day', shape: 'born_nsfw', isServe: true,
    nsfw: { worldbookKey: 'wb_forced_leave' },
    first: { ledgerKey: 'forced_leave_first', paradigm: { worldbookKey: 'wb_forced_leave_first' }, corruptionWeight: 15 },
    needsContinuity: true,
  },
};

/** 强制事件池 */
export const demoForcedPool: ForcedEvent[] = [
  {
    id: 'condom_zero', ledgerKey: 'condom_zero_1', priority: 1, once: true,
    intensity: 'insert_slot', optionId: 'condom_zero', label: '避孕套归零·裸体买套',
    condition: c => (c.condomStock ?? 1) <= 0,
  },
  {
    id: 'harass', priority: 5,
    intensity: 'seize_slot', optionId: 'defend_turf', label: '地盘骚扰',
    condition: c => (c.threatLevel ?? 0) >= 1,
  },
];

/** 快进总结词 */
export const demoSummaryTemplates: Record<string, string> = {
  serve_oral: '大小姐为{n}人进行了口交侍奉',
  serve_vaginal: '大小姐供奉了{n}人',
  serve_anal: '大小姐被{n}人开发了后穴',
  serve_violent: '暴力供奉已完成',
  rest: '凛回房歇下，养精蓄锐。',
  recruit: '招募事宜处理完毕。',
  scout: '刺探/派驻已完成。',
  buy_condoms: '采购了一批避孕套。',
  attack: '据点战事已了结。',
  bribe: '贿赂之事已办妥。',
  protection: '保护费已收讫。',
  school: '大小姐处理了学校事务。',
  dine: '外出用餐完毕。',
  forced_leave: '（已结算请假轮奸）',
};

/** extract 防胡诌范围 */
export const demoExtractBounds: Record<string, [number, number]> = {
  presentCount: [0, 2000],
};

/** 供奉类 optionId */
export const demoServeOptionIds = Object.values(demoEventOptions).filter(o => o.isServe).map(o => o.id);

/** 假 AI */
export function createMockAi(): AiPort {
  return {
    async expand(req) {
      const { resolution, attitude, state } = req;
      const tag = resolution.renderMode === 'ai_full' ? '【首次·重点扩写】'
        : resolution.renderMode === 'ai_normal' ? '【NSFW常规】'
        : '【略写】';
      const wb = resolution.paradigm.inlinePrompt ? '定制范式' : resolution.paradigm.worldbookKey;
      const text = `${tag}（mock 正文·态度:${attitude}）凛执行了「${resolution.option.label}」。`
        + `在场约 ${state.presentCount} 人。这里将来是 AI1 按范式 ${wb} 扩写的正文。`;
      const continuity = resolution.option.needsContinuity
        ? `（mock延续摘要）「${resolution.option.label}」发生了需后续回调的独特事实。`
        : undefined;
      return { text, continuity };
    },
    async extract(req) {
      return { presentCount: req.state.presentCount || 18 };
    },
  };
}

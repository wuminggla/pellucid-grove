// Mock AI + 示例数据 —— 供 UI 在无真实API时跑通游戏循环（开发/演示用）。
// 真实游戏内容(范式注册表/世界书)后续填；这里是结构占位 + 可玩的假数据。

import type { AiPort } from './types';
import type { ParadigmRegistry } from '../paradigm/machine';

/** 示例范式注册表（少量选项，验证日常/特殊/解锁三类） */
export const demoRegistry: ParadigmRegistry = {
  // —— 日常（无门槛常驻）——
  serve:   [{ paradigmId: 'serve_daily', optionId: 'serve', kind: 'daily', isSpecial: false, worldbookKey: 'wb_serve', label: '供奉打手' }],
  recruit: [{ paradigmId: 'recruit_daily', optionId: 'recruit', kind: 'daily', isSpecial: false, worldbookKey: 'wb_recruit', label: '招募打手' }],
  buy_condoms: [{ paradigmId: 'buy_daily', optionId: 'buy_condoms', kind: 'daily', isSpecial: false, worldbookKey: 'wb_buy', label: '采购避孕套' }],
  attack:  [{ paradigmId: 'attack_daily', optionId: 'attack', kind: 'daily', isSpecial: false, worldbookKey: 'wb_attack', label: '攻打据点' }],
  rest:    [{ paradigmId: 'rest_daily', optionId: 'rest', kind: 'daily', isSpecial: false, worldbookKey: 'wb_rest', label: '休息' }],
  // —— 特殊（首次加堕落度）——
  oral:    [{ paradigmId: 'oral_first', optionId: 'oral', kind: 'special_first', isSpecial: true, corruptionWeight: 6, worldbookKey: 'wb_oral', label: '口交侍奉' }],
  // —— 需解锁 ——
  anal:    [{ paradigmId: 'anal_first', optionId: 'anal', kind: 'special_first', isSpecial: true, corruptionWeight: 8, worldbookKey: 'wb_anal', label: '肛交开发', unlockRequires: ['anal_unlocked'] }],
};

/** 快进总结词模板 */
export const demoSummaryTemplates: Record<string, string> = {
  // 供奉类：带在场人数
  serve: '大小姐给{n}人侍奉了',
  oral: '大小姐为{n}人口交了',
  anal: '大小姐被{n}人开发了后穴',
  // 非供奉类：不套用"{n}人"供奉文案（修UI待办#4）
  rest: '凛回房歇下，养精蓄锐。',
  recruit: '招募事宜处理完毕。',
  buy_condoms: '采购了一批避孕套。',
  attack: '据点战事已了结。',
};

/** extract 防胡诌范围 */
export const demoExtractBounds: Record<string, [number, number]> = {
  presentCount: [0, 2000],
};

/** 假 AI：本地生成占位正文 + 固定数值，不联网。供 UI 跑通循环。 */
export function createMockAi(): AiPort {
  return {
    async expand(req) {
      const label = req.pick.paradigm.label;
      const kind = req.pick.kind === 'special_first' ? '【首次·重点扩写】' : (req.mode === 'ai_brief' ? '【略写】' : '');
      return `${kind}（mock 正文）凛执行了「${label}」。在场约 ${req.state.presentCount} 人。`
        + `这里将来是 AI1 按范式 ${req.pick.worldbookKey} 扩写的正文。`;
    },
    async extract(req) {
      // 假装从正文抓到在场人数（轻微波动）
      const base = req.state.presentCount || 18;
      return { presentCount: base };
    },
  };
}

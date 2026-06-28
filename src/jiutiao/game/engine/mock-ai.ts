// Mock AI + 事件注册表 —— 无真实API时跑通游戏循环（开发/演示用）。
// 3-5c: EventOption 注册表扩展为真实事件定义(worldbookKey对齐设计稿)。

import type { AiPort } from './types';
import type { EventOption } from '../events/types';
import type { ForcedEvent } from '../events/machine';
import { initAvOnUnlock } from '../av/machine';

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
    first: { ledgerKey: 'bribe_first_body', paradigm: { worldbookKey: 'wb_bribe_first' }, corruptionWeight: 2 },
    needsContinuity: true,
  },

  // 双面型:收保护费(SFW威风↔NSFW人前淫乱)
  protection: {
    id: 'protection', label: '收保护费', period: 'day', shape: 'dual',
    sfw: { worldbookKey: 'wb_protect_sfw' },
    nsfw: { worldbookKey: 'wb_protect_nsfw' },
    erosionGate: { corruptionAtLeast: 25 },
    first: { ledgerKey: 'protect_first', paradigm: { worldbookKey: 'wb_protect_first' }, corruptionWeight: 1 },
    // A4 日常侵蚀: 在外人(店主)面前 NSFW=有曝光风险
    a4: { martialBase: 3, transferRatio: 0.4, loyaltyOnFail: 2, developsPart: '小穴' },
  },

  // 天生NSFW:买避孕套(四档分级·按人数/堕落度选档·stages)
  buy_condoms: {
    id: 'buy_condoms', label: '采购避孕套', period: 'day', shape: 'born_nsfw',
    nsfw: { worldbookKey: 'wb_buy_condom' },
    first: { ledgerKey: 'buy_first', paradigm: { worldbookKey: 'wb_buy_condom_first' }, corruptionWeight: 1 },
    // A4: 公共便利店采购,有曝光风险
    a4: { martialBase: 2, transferRatio: 0.5, developsPart: '小穴' },
  },

  // 双面型:去大学上课(SFW日常↔NSFW三阶段·防跳阶段)
  school: {
    id: 'school', label: '去大学上课', period: 'day', shape: 'dual',
    sfw: { worldbookKey: 'wb_school_sfw' },
    needsContinuity: true,
    stages: [
      { corruptionAtLeast: 25, ledgerKey: 'school_25', corruptionWeight: 1,
        firstParadigm: { worldbookKey: 'wb_school25_first' }, paradigm: { worldbookKey: 'wb_school25' } },
      { corruptionAtLeast: 50, ledgerKey: 'school_50', corruptionWeight: 1,
        firstParadigm: { worldbookKey: 'wb_school50_first' }, paradigm: { worldbookKey: 'wb_school50' } },
      { corruptionAtLeast: 75, ledgerKey: 'school_75', corruptionWeight: 1,
        firstParadigm: { worldbookKey: 'wb_school75_first' }, paradigm: { worldbookKey: 'wb_school75' } },
    ],
    // A4: 校园=公共场所,有同学/讲师曝光风险
    a4: { martialBase: 4, transferRatio: 0.5, developsPart: '小穴' },
  },

  // 双面型:出门吃饭→餐厅
  dine: {
    id: 'dine', label: '出门吃饭', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_street'],
    sfw: { worldbookKey: 'wb_dine_sfw' },
    nsfw: { worldbookKey: 'wb_dine' },
    erosionGate: { corruptionAtLeast: 30 },
    first: { ledgerKey: 'dine_first', paradigm: { worldbookKey: 'wb_dine_first' }, corruptionWeight: 1 },
    infamyReward: 1,
    // A4: 餐厅=公共场所(虽然包场,仍可能曝光)
    a4: { martialBase: 3, transferRatio: 0.4, developsPart: '小穴' },
  },

  // ═══════════════════════════════════════════════════
  // 扩张日常·SFW↔NSFW侵蚀反转(白日宣淫·占据规模解锁)
  // 统一结构: 双面型 dual / +忠诚高比率 / needsContinuity 记已玩场所 /
  //         首次=堕落度+ / SFW根=该活动正常版 / NSFW=该场所白日宣淫
  // ═══════════════════════════════════════════════════

  amusement: {
    id: 'amusement', label: '去游乐园', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_district'],
    sfw: { worldbookKey: 'wb_amusement_sfw' },
    nsfw: { worldbookKey: 'wb_amusement' },
    erosionGate: { corruptionAtLeast: 40 },
    first: { ledgerKey: 'amusement_first', paradigm: { worldbookKey: 'wb_amusement_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  beach: {
    id: 'beach', label: '去海滩', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_district'],
    sfw: { worldbookKey: 'wb_beach_sfw' },
    nsfw: { worldbookKey: 'wb_beach' },
    erosionGate: { corruptionAtLeast: 40 },
    first: { ledgerKey: 'beach_first', paradigm: { worldbookKey: 'wb_beach_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  mall: {
    id: 'mall', label: '去商场', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_street'],
    sfw: { worldbookKey: 'wb_mall_sfw' },
    nsfw: { worldbookKey: 'wb_mall' },
    erosionGate: { corruptionAtLeast: 35 },
    first: { ledgerKey: 'mall_first', paradigm: { worldbookKey: 'wb_mall_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  camping: {
    id: 'camping', label: '森林野营', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_hill'],
    sfw: { worldbookKey: 'wb_camping_sfw' },
    nsfw: { worldbookKey: 'wb_camping' },
    erosionGate: { corruptionAtLeast: 35 },
    first: { ledgerKey: 'camping_first', paradigm: { worldbookKey: 'wb_camping_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  hiking: {
    id: 'hiking', label: '爬山', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_hill'],
    sfw: { worldbookKey: 'wb_hiking_sfw' },
    nsfw: { worldbookKey: 'wb_hiking' },
    erosionGate: { corruptionAtLeast: 30 },
    first: { ledgerKey: 'hiking_first', paradigm: { worldbookKey: 'wb_hiking_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  street: {
    id: 'street', label: '街道散步', period: 'day', shape: 'dual',
    sfw: { worldbookKey: 'wb_street_sfw' },
    nsfw: { worldbookKey: 'wb_street' },
    erosionGate: { corruptionAtLeast: 30 },
    first: { ledgerKey: 'street_first', paradigm: { worldbookKey: 'wb_street_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  festival: {
    id: 'festival', label: '逛祭典', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_district'],
    sfw: { worldbookKey: 'wb_festival_sfw' },
    nsfw: { worldbookKey: 'wb_festival' },
    erosionGate: { corruptionAtLeast: 40 },
    first: { ledgerKey: 'festival_first', paradigm: { worldbookKey: 'wb_festival_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  concert: {
    id: 'concert', label: '看演唱会', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_halfcity'],
    sfw: { worldbookKey: 'wb_concert_sfw' },
    nsfw: { worldbookKey: 'wb_concert' },
    erosionGate: { corruptionAtLeast: 45 },
    first: { ledgerKey: 'concert_first', paradigm: { worldbookKey: 'wb_concert_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  garden_dog: {
    id: 'garden_dog', label: '庭院遛母狗', period: 'day', shape: 'dual',
    unlockRequires: ['courtyard_unlocked'],
    sfw: { worldbookKey: 'wb_garden_sfw' },
    nsfw: { worldbookKey: 'wb_garden_dog' },
    erosionGate: { corruptionAtLeast: 45 },
    first: { ledgerKey: 'garden_dog_first', paradigm: { worldbookKey: 'wb_garden_dog_first' }, corruptionWeight: 2 },
    needsContinuity: true,
  },

  garden_rock: {
    id: 'garden_rock', label: '假山野战', period: 'day', shape: 'dual',
    unlockRequires: ['courtyard_unlocked'],
    sfw: { worldbookKey: 'wb_garden_sfw' },
    nsfw: { worldbookKey: 'wb_garden_rock' },
    erosionGate: { corruptionAtLeast: 50 },
    first: { ledgerKey: 'garden_rock_first', paradigm: { worldbookKey: 'wb_garden_rock_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  ancestor: {
    id: 'ancestor', label: '参拜先祖', period: 'day', shape: 'dual',
    sfw: { worldbookKey: 'wb_ancestor_sfw' },
    nsfw: { worldbookKey: 'wb_ancestor' },
    erosionGate: { corruptionAtLeast: 60 },
    first: { ledgerKey: 'ancestor_first', paradigm: { worldbookKey: 'wb_ancestor_first' }, corruptionWeight: 3 },
    needsContinuity: true,
  },

  // ─── AV 系统 ────────────────────────────────────
  // 首次AV: 摄影室升级解锁后强制触发(里程碑·一次性·标 first 走 ai_full 重点扩写)
  av_first: {
    id: 'av_first', label: '拍摄第一部AV(里程碑)', period: 'day', shape: 'born_nsfw',
    unlockRequires: ['studio_unlocked'],
    nsfw: { worldbookKey: 'wb_av_first' },
    first: {
      ledgerKey: 'av_first', paradigm: { worldbookKey: 'wb_av_first' }, corruptionWeight: 3,
      // 副作用: 解锁淫名机制 + 初始化 AV state
      onApply: (engine) => initAvOnUnlock(engine),
    },
    infamyReward: 5,  // 首次AV直接给5淫名(钩到淫名引入)
    needsContinuity: true,
    pinned: true,
  },

  // 玩家定制AV: 解锁 av 后开,paradigm 由 UI 调 buildAvParadigm 动态生成
  // 此处仅占位 worldbookKey,实际 dispatch 时 UI 用 buildAvParadigm 注入 inlinePrompt
  av_custom: {
    id: 'av_custom', label: '拍 AV', period: 'day', shape: 'born_nsfw',
    unlockRequires: ['av'],
    nsfw: { worldbookKey: 'wb_av_custom' },
    infamyReward: 3,
    pinned: true,
  },

  // ═══════════════════════════════════════════════════
  // 夜晚供奉事件(isServe=true·抵供奉吞吐)
  // ═══════════════════════════════════════════════════

  serve_oral: {
    id: 'serve_oral', label: '口交侍奉', period: 'night', shape: 'born_nsfw', isServe: true,
    nsfw: { worldbookKey: 'wb_serve_oral' },
    first: { ledgerKey: 'serve_oral_first', paradigm: { worldbookKey: 'wb_serve_oral_first' }, corruptionWeight: 2 },
  },

  serve_vaginal: {
    id: 'serve_vaginal', label: '供奉', period: 'night', shape: 'born_nsfw', isServe: true,
    nsfw: { worldbookKey: 'wb_serve_vaginal' },
    first: { ledgerKey: 'serve_vaginal_first', paradigm: { worldbookKey: 'wb_serve_vaginal_first' }, corruptionWeight: 2 },
  },

  serve_anal: {
    id: 'serve_anal', label: '肛交开发', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['anal_unlocked'],
    nsfw: { worldbookKey: 'wb_serve_anal' },
    first: { ledgerKey: 'serve_anal_first', paradigm: { worldbookKey: 'wb_serve_anal_first' }, corruptionWeight: 3 },
  },

  serve_violent: {
    id: 'serve_violent', label: '暴力供奉', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['dungeon_unlocked'],
    nsfw: { worldbookKey: 'wb_violent_serve_common' },
    first: { ledgerKey: 'serve_violent_first', paradigm: { worldbookKey: 'wb_violent_serve_common' }, corruptionWeight: 3 },
    needsContinuity: true,
  },

  // 双面型:休息(SFW睡觉↔NSFW轮奸起居)
  rest: {
    id: 'rest', label: '休息', period: 'night', shape: 'dual',
    sfw: { worldbookKey: 'wb_rest_sfw' },
    nsfw: { worldbookKey: 'wb_rape_living' },
    erosionGate: { corruptionAtLeast: 20 },
    first: { ledgerKey: 'rape_living_first', paradigm: { worldbookKey: 'wb_rape_living_first' }, corruptionWeight: 2 },
  },

  // ═══════════════════════════════════════════════════
  // 强制/临时格事件(非玩家主动选)
  // ═══════════════════════════════════════════════════

  condom_zero: {
    id: 'condom_zero', label: '避孕套归零·补救', period: 'any', shape: 'born_nsfw',
    nsfw: { worldbookKey: 'wb_condom_zero_1' },
    first: { ledgerKey: 'condom_zero_1', paradigm: { worldbookKey: 'wb_condom_zero_1' }, corruptionWeight: 1 },
  },

  /** 生育线 E2: 循环利用废套(口戴套) */
  condom_zero_2: {
    id: 'condom_zero_2', label: '避孕套归零·循环利用', period: 'any', shape: 'born_nsfw',
    nsfw: { worldbookKey: 'wb_condom_zero_2' },
    first: { ledgerKey: 'condom_zero_2', paradigm: { worldbookKey: 'wb_condom_zero_2' }, corruptionWeight: 2 },
    needsContinuity: true,
  },

  /** 生育线 E3: 真播种 = 终极里程碑(触发受孕状态机) */
  condom_zero_3: {
    id: 'condom_zero_3', label: '避孕套归零·真播种', period: 'any', shape: 'born_nsfw',
    nsfw: { worldbookKey: 'wb_condom_zero_3' },
    first: { ledgerKey: 'condom_zero_3', paradigm: { worldbookKey: 'wb_condom_zero_3' }, corruptionWeight: 4 },
    needsContinuity: true,
  },

  forced_leave: {
    id: 'forced_leave', label: '强制请假轮奸', period: 'day', shape: 'born_nsfw', isServe: true,
    nsfw: { worldbookKey: 'wb_forced_leave' },
    first: { ledgerKey: 'forced_leave_first', paradigm: { worldbookKey: 'wb_forced_leave_first' }, corruptionWeight: 3 },
    needsContinuity: true,
  },
};

/** 强制事件池 */
export const demoForcedPool: ForcedEvent[] = [
  // ─── 生育线三连(避孕套归零·once+ledgerKey 依次触发) ──────────
  {
    id: 'condom_zero', ledgerKey: 'condom_zero_1', priority: 1, once: true,
    intensity: 'insert_slot', optionId: 'condom_zero', label: '避孕套归零·裸体买套',
    condition: c => (c.condomStock ?? 1) <= 0,
  },
  {
    id: 'condom_zero_2', ledgerKey: 'condom_zero_2', priority: 2, once: true,
    intensity: 'insert_slot', optionId: 'condom_zero_2', label: '避孕套归零·口戴废套',
    condition: c => (c.condomStock ?? 1) <= 0,
  },
  {
    id: 'condom_zero_3', ledgerKey: 'condom_zero_3', priority: 3, once: true,
    intensity: 'insert_slot', optionId: 'condom_zero_3', label: '避孕套归零·真播种',
    condition: c => (c.condomStock ?? 1) <= 0,
    // E3 触发副作用: 设置怀孕状态(钩到 endings.pregnant)
    onApply: () => ({ pregnant: true }),
  },
  // ─── 地盘骚扰(高频强占) ────────────────────────────────
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
  condom_zero_2: '大小姐在打手的指使下，循环利用了几个用过的避孕套。',
  condom_zero_3: '——避孕套用完了。打手们对视而笑。',
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

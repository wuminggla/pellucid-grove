// AV 系统 · 核心逻辑（纯函数）
// 设计正典§9 + 内容_v2 第七部分:
//   - 第一次AV = 强制演出事件(wb_av_first 范式·一次性·解锁淫名机制)
//   - 后续AV玩家定制: 选题材/情景/玩法/时长 → 拼 inlinePrompt 注入 buildGamePrompt
//   - 每周编辑次数限制(初始2,可升级)
//   - 选项置顶(EventOption.pinned=true)
//   - 触发条件: 摄影室升级解锁(studio_unlocked)
//
// 核心数据结构: AvDefinition(题材/场景/玩法/时长)→ buildAvPrompt 组装成 inlinePrompt

import { AV_UNLOCK_KEY } from '../prestige/machine';
import type { EngineState } from '../engine/types';
import type { ParadigmRef } from '../events/types';

// ───────────────────────────────────────────────
// AV 定制要素(对齐设计·v2.md L716-723)
// 每类用枚举字符串,UI 选项菜单按这些枚举构建。
// ───────────────────────────────────────────────

export type AvTheme =
  | '玩具调教' | '高潮挑战' | '男M' | '女M' | '本格性爱'
  | '目隐NTR' | '目前NTR' | '人数挑战' | '时长挑战';

export type AvSetting =
  | '学校' | '职场' | '医院' | '伦理乱伦'
  | '奇幻角色扮演' | '二次元角色扮演' | '偶像';

export type AvPlay = '口' | '手' | '足' | '小穴' | '臀';

/** AV 玩家定制定义(由 UI 收集) */
export interface AvDefinition {
  theme: AvTheme;
  setting: AvSetting;
  plays: AvPlay[];      // 至少一项
  durationHours: number; // 1..上限(可升级)
  /** 角色扮演填空(场景=角色扮演时·NPC关系) */
  setupNote?: string;
}

/** AV 系统的 EngineState 字段(嵌入 EngineState 的 av 子对象) */
export interface AvState {
  weeklyQuota: number;         // 本周剩余编辑次数
  weeklyQuotaMax: number;      // 上限(初始2·可升级)
  durationCap: number;         // 时长上限(小时·初始48·可升级)
  shotCount: number;           // 总拍摄次数(数值奇观)
  customs: AvDefinition[];     // 历史定制档案(去重展示·UI画廊用)
}

/** AV 初始状态(开始游戏时·解锁前不可用) */
export function defaultAvState(): AvState {
  return { weeklyQuota: 0, weeklyQuotaMax: 2, durationCap: 48, shotCount: 0, customs: [] };
}

// ───────────────────────────────────────────────
// 解锁判定 · 钩到现有 prestige/intrusion
// ───────────────────────────────────────────────

/** AV 是否解锁(摄影室建好·钩到 prestige.AV_UNLOCK_KEY 同一标签) */
export function isAvSystemUnlocked(engine: EngineState): boolean {
  return engine.unlocked[AV_UNLOCK_KEY] === true || engine.unlocked.studio_unlocked === true;
}

/** 是否可以新拍 AV(解锁 + 本周还有次数 + 时长在上限内) */
export function canShootAv(engine: EngineState, def: AvDefinition): { ok: boolean; reason?: string } {
  if (!isAvSystemUnlocked(engine)) return { ok: false, reason: 'AV 系统未解锁(需先建摄影室或拍首部AV)' };
  const av = engine.av ?? defaultAvState();
  if (av.weeklyQuota <= 0) return { ok: false, reason: '本周编辑次数已用完' };
  if (def.durationHours <= 0) return { ok: false, reason: '时长必须 > 0' };
  if (def.durationHours > av.durationCap) return { ok: false, reason: `时长超出上限 ${av.durationCap}h` };
  if (def.plays.length === 0) return { ok: false, reason: '至少选一项玩法' };
  return { ok: true };
}

// ───────────────────────────────────────────────
// inlinePrompt 组装 · 把定制要素拼成 AI 可读的范式正文
// 设计: 题材定基调、场景定情景外壳与服装、玩法定身体部位侧重、时长定侧面烘托强度
// ───────────────────────────────────────────────

/** 题材→基调 词条(给 AI 的方向锚) */
const THEME_TONE: Record<AvTheme, string> = {
  '玩具调教': '密集器具刺激·凛被强制接受多种玩具(跳蛋/按摩棒/电极)·身体反应被无情放大',
  '高潮挑战': '强制连续高潮·凛被推到失神边缘后又被推下一波·身体不允许平复',
  '男M': '反向(凛短暂掌控)·然后被反扑·短控制后的报复',
  '女M': '受虐受辱核心·痛→快感转译重笔墨·身体明明该痛却分泌',
  '本格性爱': '不靠玩具/暴力/角色扮演,纯粹大量长时间多人轮奸·拓扑配置完整',
  '目隐NTR': '凛被蒙眼·不知道谁在用·全凭触觉气味辨别·恐惧叠加敏感',
  '目前NTR': '凛清醒看着每一个上来的男人·屈辱具象化',
  '人数挑战': '极限多人·规模奇观·拓扑写满·换组节奏不停',
  '时长挑战': '超长时长·环境光流转·背景音日常作息·肉体碰撞从未停一秒',
};

/** 场景→情景外壳词条 */
const SETTING_SHELL: Record<AvSetting, string> = {
  '学校': '校园情景剧·制服/教室/讲台·学校的"清纯"外壳与里面发生的事强反差',
  '职场': 'OL 制服·办公室桌椅会议室·"职场精英"形象与肉便器现实的倒错',
  '医院': '诊疗室/检查台·"病人"角色·医疗器械被滥用',
  '伦理乱伦': '家庭角色(继兄/继父/叔伯)·禁忌叙事·"家人"称呼下的轮奸',
  '奇幻角色扮演': '精灵/魔物/异世界·种族锚定(可借口"娇小"·罗刹瞳是天然奇幻角色)',
  '二次元角色扮演': 'cosplay 二次元角色·服装高度还原·凛被迫扮演她不喜欢的角色',
  '偶像': '偶像演唱会舞台/后台·"粉丝见面会"变质·偶像光环下的轮奸',
};

/** 玩法部位→词条 */
const PLAY_LABEL: Record<AvPlay, string> = {
  '口': '口腔(深喉/喉射/坐脸/舔蛋)',
  '手': '手活(双手并用/夹击)',
  '足': '足交(脚趾/足弓)',
  '小穴': '阴道(各体位/双插/打桩)',
  '臀': '肛门(扩张/双插/灌满)',
};

/**
 * 组装 AV 定制的 inlinePrompt(注入 buildGamePrompt 的范式槽).
 * 输出= "继承 wb_av_first 三阶段结构 + 限知视角 + 本次定制要素"
 */
export function buildAvPrompt(def: AvDefinition): string {
  const tone = THEME_TONE[def.theme];
  const shell = SETTING_SHELL[def.setting];
  const playList = def.plays.map(p => PLAY_LABEL[p]).join(' / ');
  const note = def.setupNote ? `角色扮演填空: ${def.setupNote}` : '';

  // 时长侧面烘托等级
  const durTier = def.durationHours < 8 ? '中等(8小时内)' :
                  def.durationHours < 24 ? '长(8-24小时·分Part)' :
                  '超长(24h+·环境光流转/背景音日常作息全开/地板垃圾堆积)';

  return `[AV 玩家定制·动态范式]
本次AV定制要素(三阶段结构继承 wb_av_first·限知视角继承):
- 题材基调: ${def.theme} → ${tone}
- 场景外壳: ${def.setting} → ${shell}
- 玩法部位: ${playList}(笔墨侧重以上部位的开发/反应/感官)
- 时长烘托: ${def.durationHours}小时 → ${durTier}
${note ? note + '\n' : ''}
按 wb_av_first 三阶段写: ①屈辱情景剧前戏(服装+念台词) ②无尽轮奸+限知视角(局部画面+画外音脑补) ③超长时长侧面烘托(快感痕迹+环境光+背景音+地板垃圾).
铁律: 罗刹瞳禁损伤词;成年/不沉痛;笔墨重心永远是凛的身体反应,不是男性数量/动作展示.`;
}

/** 完整组装成 ParadigmRef(用于注入 EventResolution.paradigm 替代世界书查找) */
export function buildAvParadigm(def: AvDefinition): ParadigmRef {
  return {
    worldbookKey: 'wb_av_custom',           // 元数据用·实际不查
    inlinePrompt: buildAvPrompt(def),       // 真正注入的范式正文
  };
}

// ───────────────────────────────────────────────
// 状态更新 · 拍摄消费 / 周刷新 / 升级
// ───────────────────────────────────────────────

/** 消费一次拍摄: 写入 customs / 扣 weeklyQuota / 累加 shotCount */
export function consumeShoot(av: AvState, def: AvDefinition): AvState {
  return {
    ...av,
    weeklyQuota: Math.max(0, av.weeklyQuota - 1),
    shotCount: av.shotCount + 1,
    customs: [...av.customs, def],
  };
}

/** 每周刷新: weeklyQuota 重置为 weeklyQuotaMax(由 settleDaily 在第 N 天调用) */
export function refreshWeeklyQuota(av: AvState): AvState {
  return { ...av, weeklyQuota: av.weeklyQuotaMax };
}

/** 升级: 提升 weeklyQuotaMax(每级 +1) */
export function upgradeAvQuota(av: AvState, levels = 1): AvState {
  return { ...av, weeklyQuotaMax: av.weeklyQuotaMax + Math.max(0, levels) };
}

/** 升级: 提升 durationCap(每级 +24h·封顶 168h=7天) */
export function upgradeAvDuration(av: AvState, levels = 1): AvState {
  return { ...av, durationCap: Math.min(168, av.durationCap + Math.max(0, levels) * 24) };
}

/**
 * AV 首次解锁: 返回 EngineState 补丁(用于 FirstMilestone.onApply / ForcedEvent.onApply)。
 * 写入: unlocked.av + unlocked.studio_unlocked + av.weeklyQuota=max(开局就能拍下一部)
 */
export function initAvOnUnlock(engine: EngineState): Record<string, unknown> {
  const av = engine.av ?? defaultAvState();
  return {
    unlocked: { ...engine.unlocked, [AV_UNLOCK_KEY]: true, studio_unlocked: true },
    av: { ...av, weeklyQuota: av.weeklyQuotaMax },
  };
}

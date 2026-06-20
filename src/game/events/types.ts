// 统一事件模型 · 类型定义（v3 蓝图 §0 最高统一模型）
// 核心：每个"事件选项"= SFW范式 + NSFW范式 + 侵蚀闸门 + 首次侵蚀特殊事件。
// 扩张(解锁)长出选项，堕落(侵蚀闸门)让选项从SFW翻面成NSFW，翻面的"第一次"=特殊事件。

import type { CognitionStage } from '../corruption/machine';

/** 范式引用（指向世界书范式条目；前端只存key+元数据，正文在世界书） */
export interface ParadigmRef {
  worldbookKey: string;
  /** 动态范式（AV玩家定制等运行时拼装）：直接带正文/要素，不查世界书 */
  inlinePrompt?: string;
}

/**
 * 侵蚀闸门：决定"SFW何时翻面成NSFW"。可组合多个数值条件（全满足才翻面）。
 * 用户定：占位统一堕落度≥50；但部分事件多数值共同决定，故留可组合接口。
 */
export interface ErosionGate {
  corruptionAtLeast?: number;        // 堕落度≥（占位50）
  cognitionAtLeast?: CognitionStage; // 认知防线达到某档
  infamyAtLeast?: number;            // 淫名≥（如身体贿赂走淫名路径）
  thugsAtLeast?: number;             // 打手数≥（如强占进阶供奉）
  /** 扩展接口：任意自定义条件（多数值组合），返回 true 表示该条件满足 */
  custom?: (ctx: EventContext) => boolean;
}

/** 事件选项形态 */
export type EventShape =
  | 'dual'        // 双面型：有SFW也有NSFW（多数。如出门吃饭↔餐厅轮奸）
  | 'born_nsfw'   // 天生NSFW型：只有NSFW（供奉/请假轮奸/AV）
  | 'born_sfw';   // 天生SFW型：只有SFW（纯经营动作）

/** 首次里程碑特殊事件（SFW→NSFW首次 或 天生NSFW的第一次） */
export interface FirstMilestone {
  /** 账本键（已触发标签）。全局唯一 */
  ledgerKey: string;
  paradigm: ParadigmRef;     // 首次用的特殊事件范式
  corruptionWeight: number;  // 首次加的堕落度
  /** 优先级（多个同条件特殊事件依次触发时，数字小先触发）。默认0 */
  priority?: number;
}

/** 一个事件选项（统一模型核心条目） */
export interface EventOption {
  id: string;
  label: string;                 // 显示名（不含♥，♥由UI按是否NSFW态加）
  period: 'day' | 'night' | 'any';
  shape: EventShape;
  /** 扩张解锁：满足才出现在菜单（占据规模/宅邸升级/设施）。空=初始可用 */
  unlockRequires?: string[];
  /** SFW范式（dual/born_sfw 有） */
  sfw?: ParadigmRef;
  /** NSFW范式（dual/born_nsfw 有），即"侵蚀态" */
  nsfw?: ParadigmRef;
  /** 侵蚀闸门（dual 有）：SFW→NSFW的翻面条件 */
  erosionGate?: ErosionGate;
  /** 首次里程碑特殊事件（翻面首次 / 天生NSFW首次） */
  first?: FirstMilestone;
  /** 翻面后不可逆：达闸门并触发首次后，SFW版从菜单消失（如贿赂→只剩贿赂♥） */
  irreversibleAfterErosion?: boolean;
  /** 置顶（AV玩家定制选项排菜单最前） */
  pinned?: boolean;
  /** 供奉类（执行后扣避孕套等，对接 settlement.serveOptionIds） */
  isServe?: boolean;
  /** 极道威望奖励（每次结算给；来源=火并/据点战/复仇胜利） */
  martialReward?: number;
  /** 淫名奖励（每次结算给，仅 AV 解锁后生效；来源=AV/轮奸规模/肉体名气） */
  infamyReward?: number;
  /** 桶4:本事件是否引入"需后续回调的具体实体/独特事实"→需AI一句延续摘要(记忆层)。认知防线跨档另由代码自动触发。 */
  needsContinuity?: boolean;
}

/** 事件解析输入上下文（从游戏状态提取） */
export interface EventContext {
  corruption: number;
  cognition: CognitionStage;
  infamy: number;
  thugs: number;
  triggeredLedger: Record<string, boolean>;  // 已触发特殊事件账本
  unlocked: Record<string, boolean>;          // 已解锁集（扩张）
}

/**
 * 强制事件扫描上下文 = EventContext + 强制事件关心的额外信号。
 * 额外字段可选：地盘系统等未做时缺省，条件函数自行兜底。
 */
export interface ForcedContext extends EventContext {
  condomStock?: number;   // 避孕套库存（归零链触发）
  threatLevel?: number;   // 地盘威胁等级（骚扰/火并防守触发；0=无。地盘系统未做先占位）
}

/** 渲染方式（v3 §3 四档） */
export type RenderMode =
  | 'ai_full'      // 首次里程碑特殊事件：重点扩写
  | 'ai_normal'    // 常规NSFW（非首次/天生NSFW日常态）：正常生成色情内容
  | 'ai_brief'     // 纯SFW日常流水：略写/模板
  | 'fast_summary';// 快进：不调AI，CG+总结

/** 当前态（SFW还是NSFW） */
export type EventFace = 'sfw' | 'nsfw';

/** 事件解析结果 */
export interface EventResolution {
  option: EventOption;
  face: EventFace;             // 当前用SFW还是NSFW态
  isFirstMilestone: boolean;   // 是否首次里程碑（true→加堕落+记账本）
  corruptionGain: number;
  paradigm: ParadigmRef;       // 实际要注入AI的范式
  renderMode: RenderMode;
  isNsfw: boolean;             // 是否NSFW（UI加♥）
}

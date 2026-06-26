// 回合引擎 · 类型定义
// 职责：把 action-grid / events(统一事件模型) / corruption / economy 串成"结算一个行动格"的流水线。
// AI 调用抽象成可注入的 AiPort，使编排逻辑可用 mock 单测（不依赖真实API）。

import type { CognitionStage, CognitionAttitude } from '../corruption/machine';
import type { EventOption, EventResolution, RenderMode } from '../events/types';
import type { ForcedEvent } from '../events/machine';

export type { RenderMode };

/** 引擎工作的状态切片（结算一个格会读写的字段；完整 schema 映射在 hook 层做） */
export interface EngineState {
  // —— 账本 / 解锁 ——
  triggeredSpecials: Record<string, boolean>;  // 首发账本（events 的 triggeredLedger）
  unlocked: Record<string, boolean>;           // 解锁集（扩张）
  // —— corruption ——
  corruption: number;
  cognition: CognitionStage;
  claimedGates: Record<string, boolean>;       // 奖励闸门账本
  // —— economy 资源 ——
  money: number;
  thugTotal: number;          // 打手总数
  garrison: number;           // 驻守占用打手
  loyalty: number;            // 打手忠诚度 0~100
  condomStock: number;        // 避孕套库存
  desire: number;             // 打手欲望值
  desireCapacity: number;     // 欲望承载上限（设施可提）
  perSlotThroughput: number;  // 每格供奉吞吐（可升级 6→30）
  // —— 威望（招募/硬失败/侵蚀闸门用）——
  infamy: number;             // 淫名（累计；仅 AV 解锁后计入总威望）
  martialPrestige: number;    // 极道威望（累计）
  martialGainToday?: number;  // 今日极道威望进账（流量，每日审核后重置）
  martialZeroStreak?: number; // 连续零进账次数（连续2次=硬失败）
  // —— 升级（群体升级账本：升级项id→等级 + 设施/扩张效果落地的字段） ——
  upgrades?: Record<string, number>;
  totalSlots?: number;          // 每日总行动格(行动格扩容；默认见 BASE_ACTION_SLOTS)
  purchaseUpgradeMult?: number; // 避孕套采购扩容倍率(默认1)
  turfFortifyBonus?: number;    // 据点加固加成(默认0；地盘系统消费)
  occupyScale?: number;         // 占据规模档序号(地盘扩张；门控扩张日常选项)
  // —— 招募 ——
  recruitQuota: number;       // 本周剩余招募额度
  // —— 场景上下文 ——
  presentCount: number;        // 单场在场打手人数
  isDangerousPeriod: boolean;  // 危险期(由经期周期派生·去医学化只分安全/危险)
  cycleDay?: number;           // 经期周期日(0..length-1·每日推进)
  pregnant?: boolean;          // 是否已怀孕(生育线判定后置;结局判定用)
  // —— 身体开发度(A4 日常侵蚀·五级 0-4 抗拒/被迫接受/无意识迎合/轻度上瘾/重度依赖) ——
  // 注: schema.ts 用中文枚举,引擎层用 number 0-4 便于数值比较(阈值/推进)
  // 完整字段由 hook 层(将来 MVU 收尾)映射,引擎只读写白天 A4 关心的四主穴
  bodyDevelopment?: {
    口腔?: number;   // 0-4
    小穴?: number;
    肛门?: number;
    子宫生育?: number;
  };
  // —— 派生/统计（结算更新，供UI/失败判定）——
  servedThisNight: number;     // 本晚已被供奉人数（夜晚结算用）
  // —— 记忆层（叙事连贯性·随存档持久化）——
  narrativeLog?: import('../memory/machine').LogEntry[];        // 结构化日志(每格代码写)
  continuityNotes?: import('../memory/machine').ContinuityNote[]; // 延续摘要(里程碑+AI一句)
  // —— 强制事件信号（跨天，随存档持久化）——
  pendingForcedLeave?: boolean; // 夜晚欲望溢出 → 次日强制请假轮奸（霸全）。nextDay 消费后清除
  leaveHistory?: boolean[];     // 近期每日是否请假（滑动窗口保底用，保留最近20天）
  // —— 地盘信号（地盘系统未做，先占位供强制事件扫描）——
  threatLevel?: number;         // 地盘威胁等级（骚扰/火并防守强占触发；0=无。由 stability 派生）
  // —— 地盘（区域/据点·turf 模块）——
  regions?: Record<string, import('../turf/types').RegionState>; // 各区域运行时状态(boss击败/降门槛/驻守)
  stability?: number;           // 地盘稳定系数 0~100(骚扰↓/派驻↑)
}

/** 玩家在某格选的内容（来自 action-grid 的 SlotChoice，精简引用） */
export interface SlotInput {
  optionId: string;
  params?: Record<string, unknown>;
}

/** AI1 扩写请求（双判定：范式 resolution + 认知防线态度层 attitude） */
export interface ExpandRequest {
  resolution: EventResolution;     // 判定一：用哪个范式（含 face/renderMode）
  attitude: CognitionAttitude;     // 判定二：当前堕落态度（堕落前/堕落后/母猪化）
  choice: SlotInput;
  state: EngineState;
}

/** AI2 抓数值请求 */
export interface ExtractRequest {
  narrative: string;
  choice: SlotInput;
  state: EngineState;
}

/**
 * AI 端口（双AI抽象）。真实实现走 api-router；测试注入 mock。
 * - expand：AI1，按范式扩写正文，返回 prose。
 * - extract：AI2，从正文抓"叙事性数值"（在场人数/次数等），返回原始数值表（未校验）。
 *   注意：硬经营数值(资金/避孕套/威望/打手)不由 AI 抓，由 economy 公式算（防胡诌）。
 */
/** AI1 扩写返回:正文 + 可选延续摘要(桶4·needsContinuity 时 AI 额外吐的一句) */
export interface ExpandResult {
  text: string;          // <maintext> 给玩家看的正文
  continuity?: string;   // <continuity> 一句话延续摘要(记忆层桶4),无则 undefined
}

export interface AiPort {
  expand(req: ExpandRequest): Promise<ExpandResult>;
  extract(req: ExtractRequest): Promise<Record<string, unknown>>;
}

/** 结算一个格的选项 */
export interface SettleOptions {
  /** 事件选项注册表（按 optionId 索引），统一事件模型 */
  eventOptions: Record<string, EventOption>;
  fastForward: boolean;
  ai: AiPort;
  /** 快进总结词模板（按 optionId 索引），如 { serve: '大小姐给{n}人侍奉了' } */
  summaryTemplates?: Record<string, string>;
  /** extract 数值的合法范围（防胡诌），如 { presentCount: [0, 2000] } */
  extractBounds?: Record<string, [number, number]>;
  /** 强制事件池（强占/临时格，结算时按条件扫描触发） */
  forcedPool?: ForcedEvent[];
}

/** 本次结算产生的事件（供 UI 提示/叙事钩子） */
export interface SettleEvents {
  renderMode: RenderMode;
  isFirstSpecial: boolean;     // 是否首次里程碑（=events isFirstMilestone）
  corruptionGain: number;
  cognitionAdvancedTo: CognitionStage | null;
  firedGateIds: string[];
  isNsfw: boolean;             // 当前态是否NSFW（UI加♥）
  /** 本格极道威望进账（战斗胜利等） */
  martialGain: number;
  /** 本格淫名进账（仅 AV 解锁后非0） */
  infamyGain: number;
  /** AI 吐的桶4延续摘要（needsContinuity 时有；day-runner 据此写 continuityNote） */
  continuity?: string;
  /** 被防胡诌拒掉的离谱字段（调试用） */
  rejectedFields: string[];
}

/** 结算结果 */
export interface SettleResult {
  state: EngineState;
  resultText: string;     // 给玩家看的正文（AI正文 或 快进总结词）
  events: SettleEvents;
}

// 回合引擎 · 类型定义
// 职责：把 action-grid / paradigm / corruption / economy 串成"结算一个行动格"的流水线。
// AI 调用抽象成可注入的 AiPort，使编排逻辑可用 mock 单测（不依赖真实API）。

import type { ParadigmRegistry, RenderMode } from '../paradigm/machine';
import type { ParadigmPick } from '../paradigm/types';
import type { CognitionStage } from '../corruption/machine';

/** 引擎工作的状态切片（结算一个格会读写的字段；完整 schema 映射在 hook 层做） */
export interface EngineState {
  // —— paradigm ——
  triggeredSpecials: Record<string, boolean>;  // 首发账本
  unlocked: Record<string, boolean>;           // 解锁集
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
  // —— 招募 ——
  recruitQuota: number;       // 本周剩余招募额度
  // —— 场景上下文 ——
  presentCount: number;        // 单场在场打手人数
  isDangerousPeriod: boolean;  // 危险期
  // —— 派生/统计（结算更新，供UI/失败判定）——
  servedThisNight: number;     // 本晚已被供奉人数（夜晚结算用）
}

/** 玩家在某格选的内容（来自 action-grid 的 SlotChoice，精简引用） */
export interface SlotInput {
  optionId: string;
  paradigmId?: string;         // 同 optionId 多范式时指定
  params?: Record<string, unknown>;
}

/** AI1 扩写请求 */
export interface ExpandRequest {
  pick: ParadigmPick;
  mode: Exclude<RenderMode, 'fast_summary'>;  // ai_full | ai_brief
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
export interface AiPort {
  expand(req: ExpandRequest): Promise<string>;
  extract(req: ExtractRequest): Promise<Record<string, unknown>>;
}

/** 结算一个格的选项 */
export interface SettleOptions {
  registry: ParadigmRegistry;
  fastForward: boolean;
  ai: AiPort;
  /** 快进总结词模板（按 optionId 索引），如 { serve: '大小姐给{n}人侍奉了' } */
  summaryTemplates?: Record<string, string>;
  /** extract 数值的合法范围（防胡诌），如 { presentCount: [0, 2000] } */
  extractBounds?: Record<string, [number, number]>;
  /** 供奉类 optionId 集合（执行后触发避孕套结算+计入被供奉人数）。如 ['serve','oral','anal'] */
  serveOptionIds?: string[];
}

/** 本次结算产生的事件（供 UI 提示/叙事钩子） */
export interface SettleEvents {
  renderMode: RenderMode;
  isFirstSpecial: boolean;
  corruptionGain: number;
  cognitionAdvancedTo: CognitionStage | null;
  firedGateIds: string[];
  /** 被防胡诌拒掉的离谱字段（调试用） */
  rejectedFields: string[];
}

/** 结算结果 */
export interface SettleResult {
  state: EngineState;
  resultText: string;     // 给玩家看的正文（AI正文 或 快进总结词）
  events: SettleEvents;
}

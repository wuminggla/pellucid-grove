// 范式筛选系统 · 类型定义
// 职责：玩家在行动格选了某 optionId → 代码层决定"用哪个范式引导AI扩写"。
// 核心：判定是否"首次特殊事件"(查账本) → 首次=特殊范式(重点扩写+加堕落度)，否则=普通范式(略写)。
// 设计依据：游玩体验方向.txt + findings 核心定位锚（堕落=首次特殊事件累计）。

/** 范式类型 */
export type ParadigmKind =
  | 'daily'        // 日常范式：略写，不加堕落度（无门槛常驻选项的常态，或特殊事件的非首次重复）
  | 'special_first'// 首次特殊事件范式：重点扩写，记账本+加堕落度
  | 'special_repeat';// 特殊事件的非首次：退化为略写，不再加堕落度（= daily 待遇，但保留语义区分）

/**
 * 范式定义（注册表条目）。
 * 注意：范式的"剧情骨架内容"（场景/必含节拍/打手态度…）放在酒馆世界书，
 *       本前端只存"元数据 + 指向世界书条目的 key"，不硬编码露骨正文。
 *       （这是工程便利，非内容回避——前端可含NSFW文本，但范式正文库放世界书便于复用/换皮。）
 */
export interface ParadigmDef {
  paradigmId: string;          // 范式唯一ID
  optionId: string;            // 对应的行动格选项
  kind: ParadigmKind;
  /** 是否是"特殊事件"（首次会加堕落度）。daily 常态选项为 false。 */
  isSpecial: boolean;
  /** 首次发生时加的堕落度权重（仅 isSpecial 且首次时生效） */
  corruptionWeight?: number;
  /** 指向世界书范式模板条目的 key（AI1 扩写时注入该条目） */
  worldbookKey: string;
  /** 解锁前置：需要哪些条件才入池（如已解锁肛交）。空=无门槛常驻 */
  unlockRequires?: string[];
  label: string;               // 显示名（可含 NSFW）
}

/** 范式筛选的输入上下文（从游戏状态提取的必要信息） */
export interface ParadigmContext {
  /** 已触发特殊事件账本（schema 解锁与结局.已触发特殊事件） */
  triggeredSpecials: Record<string, boolean>;
  /** 已解锁的能力/场景集合（用于 unlockRequires 判定） */
  unlocked: Record<string, boolean>;
}

/** 范式筛选结果 */
export interface ParadigmPick {
  paradigm: ParadigmDef;
  kind: ParadigmKind;
  /** 是否首次特殊事件（true 时上层应：记账本 + 调 corruption 加堕落度） */
  isFirstSpecial: boolean;
  /** 首次时应加的堕落度（isFirstSpecial 时 >0） */
  corruptionGain: number;
  /** 要注入 AI1 的世界书范式条目 key */
  worldbookKey: string;
}

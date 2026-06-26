// 升级系统 · 类型定义（数据驱动·可扩展）
// 三类升级：打手升级(群体战力/NSFW) / 设施升级(经营数值) / 扩张解锁(NSFW区域与系统)。
// 升级=独立子菜单(不占行动格,v3 §0.1)，群体整体，每级固定价。
// 扩展原则：新升级项=往 catalog append 一条数据,引擎只认本结构,无需改代码(设计正典 §5)。

export type UpgradeCategory =
  | 'thug'       // 打手升级：作用全体打手(战力/NSFW)
  | 'facility'   // 设施升级：经营数值(吞吐/欲望上限/行动格/采购/据点加固)
  | 'expansion'; // 扩张解锁：解锁NSFW区域与系统(地盘扩张/地下室/摄影室/AV/庭院…)

/** 升级效果种类（决定 applyUpgrade 如何作用） */
export type UpgradeEffectKind =
  | 'combat'        // 战力加成（派生，不写字段；由 combatBonus 汇总）
  | 'throughput'    // 每格供奉吞吐（吞吐扩容，受堕落度门槛）
  | 'desireCap'     // 欲望承载上限（拖延强制请假）
  | 'actionSlots'   // 每日总行动格
  | 'purchaseMult'  // 避孕套采购扩容倍率
  | 'turfFortify'   // 据点加固（地盘稳定/防守）
  | 'unlock'        // 通用解锁：买后置 unlocked[unlockKey]=true（地下室/摄影室/庭院/任何区域系统）
  | 'occupyScale';  // 地盘扩张：抬升占据规模档（门控扩张日常选项）

export interface UpgradeEffect {
  kind: UpgradeEffectKind;
  /** 每级效果量：combat=战力比例 / throughput=每级+人 / desireCap=每级+上限 / occupyScale=每级+档 等 */
  perLevel?: number;
  /** kind==='unlock' 时设置的解锁键（写入 EngineState.unlocked），如 'basement'/'av'/'courtyard' */
  unlockKey?: string;
}

/** 前置依赖（数据驱动·可组合）：全满足才出现在菜单/可买。体现"扩张/解锁带来新升级任务"。 */
export interface UpgradeRequire {
  upgradeId?: string;   // 需某升级项
  minLevel?: number;    // …达到的最低等级（默认1）
  occupyAtLeast?: number; // 需占据规模档≥（档位序号）
}

/** 一个升级项定义（数据驱动，数值便于调平） */
export interface UpgradeDef {
  id: string;
  category: UpgradeCategory;
  name: string;
  desc: string;              // 效果/NSFW联想说明（卡琳式：升级项本身=色情联想）
  cost: number;              // 每级固定价（资金）
  maxLevel: number;
  /** 升到第 i+1 级（从 i 级买下一级）所需最低堕落度；index=当前等级。用于吞吐扩容堕落解档。 */
  corruptionGate?: number[];
  /** 前置依赖：满足才出现在菜单（地盘扩张→解锁更多项 / AV设备需先建摄影室）。空=初始可用。 */
  requires?: UpgradeRequire[];
  effect: UpgradeEffect;
}

// 经济/时段结算（纯函数）。把 economy 公式接进游戏循环，让数值真正闭环。
// 三层结算：单格供奉 → 夜晚收尾 → 每日收尾。settleSlot 之外的"硬经营数值"在此结算。

import {
  condomCost, condomStatus, desireGain, desireOverflow,
  availableThugs, combatPower, weeklyRecruitQuota, totalPrestige,
} from '../economy/machine';
import type { EngineState } from './types';

/** 单个供奉格结算：扣避孕套 + 记录被供奉人数。仅"供奉类"行动触发(serve/oral/anal等)。 */
export interface ServeSettleResult {
  state: EngineState;
  condomUsed: number;
  condomShort: boolean;   // 库存不足以覆盖本场(触发内射风险链)
}

/**
 * 供奉格结算。presentCount = 本场在场人数（已由 settleSlot 的 extract/上下文确定）。
 * 扣避孕套；不足则标记 condomShort（内射/怀孕判定链由 endings 处理）。
 * 被供奉的人计入 servedThisNight（夜晚结算时这些人欲望被清）。
 * @param throughputMultiplier 吞吐倍率（强制请假轮奸日=1.5，多服务人数同步放大扣套与被供奉计数）
 */
export function settleServe(state: EngineState, throughputMultiplier = 1): ServeSettleResult {
  const served = Math.round(state.presentCount * throughputMultiplier);
  const need = condomCost(served, state.isDangerousPeriod);
  const used = Math.min(need, state.condomStock);
  const condomShort = need > state.condomStock;
  return {
    state: {
      ...state,
      condomStock: Math.max(0, state.condomStock - used),
      servedThisNight: state.servedThisNight + served,
    },
    condomUsed: used,
    condomShort,
  };
}

/** 夜晚收尾结算：未被供奉的打手欲望滚雪球 + 溢出判定。 */
export interface NightSettleResult {
  state: EngineState;
  unserved: number;
  desireGained: number;
  overflow: boolean;      // 欲望≥承载上限 → 次日强制请假轮奸（事件系统消费）
}

/**
 * 夜晚收尾。可用打手中未被供奉的部分欲望增长（滚雪球）。
 * MVP：连续3晚未供奉的"翻倍"暂记为0（需跨天追踪每个打手，后续接），先用基础增长。
 */
export function settleNight(state: EngineState): NightSettleResult {
  const avail = availableThugs(state.thugTotal, state.garrison);
  const unserved = Math.max(0, avail - state.servedThisNight);
  const gained = desireGain(unserved, 0); // longUnservedCount=0（跨天追踪后续接）
  const desire = state.desire + gained;
  const overflow = desireOverflow(desire, state.desireCapacity);
  return {
    // 溢出 → 置 pendingForcedLeave，由 nextDay 构造次日强制请假轮奸日（霸全）
    state: { ...state, desire, servedThisNight: 0, pendingForcedLeave: overflow || state.pendingForcedLeave },
    unserved, desireGained: gained, overflow,
  };
}

/** 每日收尾结算（一天结束→次日）。 */
export interface DailySettleResult {
  state: EngineState;
  recruitRefreshed: boolean;
  combatPower: number;
  hardFail: boolean;        // 硬失败信号（占位：资金<0等；极道威望连2次0由威望系统判，后续接）
}

/**
 * 每日收尾。
 * @param dayNumber 当前天数（用于每周招募额度刷新：每7天）
 * @param martialPrestige 极道威望
 * @param infamy 淫名
 */
export function settleDaily(
  state: EngineState, dayNumber: number, martialPrestige: number, infamy: number,
): DailySettleResult {
  let next = { ...state };
  // 每周刷新招募额度（第1天及每隔7天）
  const recruitRefreshed = dayNumber % 7 === 1;
  if (recruitRefreshed) {
    next.recruitQuota = weeklyRecruitQuota(totalPrestige(martialPrestige, infamy));
  }
  const power = combatPower(availableThugs(next.thugTotal, next.garrison), next.loyalty);
  const hardFail = next.money < 0; // 占位硬失败条件
  return { state: next, recruitRefreshed, combatPower: power, hardFail };
}

/** 便捷：避孕套库存状态标签（UI 用） */
export function condomLabel(state: EngineState): '充足' | '告急' | '废除' {
  return condomStatus(state.condomStock);
}

// 经济/时段结算（纯函数）。把 economy 公式接进游戏循环，让数值真正闭环。
// 三层结算：单格供奉 → 夜晚收尾 → 每日收尾。settleSlot 之外的"硬经营数值"在此结算。

import {
  condomCost, condomStatus, desireRelief, desireOverflow,
  availableThugs, combatPower, weeklyRecruitQuota, totalPrestige,
} from '../economy/machine';
import { isAvUnlocked, auditMartial } from '../prestige/machine';
import { combatBonus } from '../upgrade/machine';
import { dailyYields, threatLevelFrom } from '../turf/machine';
import { advanceCycle } from '../cycle/machine';
import type { EngineState } from './types';

/** 单个供奉格结算：扣避孕套 + 记录被供奉人数。仅"供奉类"行动触发(serve/oral/anal等)。 */
export interface ServeSettleResult {
  state: EngineState;
  condomUsed: number;
  condomShort: boolean;   // 库存不足以覆盖本场(触发内射风险链)
  served: number;         // 本场供奉人数
  desireRelieved: number; // 本场当场清偿的欲望量(实时降欲)
}

/**
 * 供奉格结算(实时·每格执行时调用)。presentCount = 本场在场人数。
 *  - 扣避孕套；不足则标记 condomShort（内射/怀孕判定链由 endings 处理）。
 *  - **当场清偿欲望**：欲望 -= 本场供奉人数 × 供奉降欲量，clamp≥0（玩家盯着状态栏看它掉）。
 *  - 被供奉的人计入 servedThisNight（统计/显示用）。
 * @param throughputMultiplier 吞吐倍率（强制请假轮奸日=1.5，多服务人数同步放大扣套与降欲）
 */
export function settleServe(state: EngineState, throughputMultiplier = 1): ServeSettleResult {
  const served = Math.round(state.presentCount * throughputMultiplier);
  const need = condomCost(served, state.isDangerousPeriod);
  const used = Math.min(need, state.condomStock);
  const condomShort = need > state.condomStock;
  const relieved = desireRelief(served);
  return {
    state: {
      ...state,
      condomStock: Math.max(0, state.condomStock - used),
      servedThisNight: state.servedThisNight + served,
      desire: Math.max(0, state.desire - relieved),
    },
    condomUsed: used,
    condomShort,
    served,
    desireRelieved: relieved,
  };
}

/**
 * 夜晚收尾(报告·只读不改欲望)。
 * 晨间累积模型下,欲望增减都已实时发生(晨间 advanceToNextDay 累积 / 供奉格 settleServe 降欲),
 * 夜结不再改欲望。本函数只汇报当天结余,供 UI 显示与"是否将触发请假轮奸"的预警。
 * 真正的请假轮奸判定在 advanceToNextDay(对结余欲望、在加次日晨间累积前判定)。
 */
export interface NightSettleResult {
  state: EngineState;
  servedToday: number;        // 今日累计供奉人数
  desireLeftover: number;     // 当前结余欲望(供奉后)
  overflowImminent: boolean;  // 结余≥承载上限 → 次日将触发请假轮奸(预警)
}

export function settleNight(state: EngineState): NightSettleResult {
  return {
    state, // 不改动(欲望已实时结算)
    servedToday: state.servedThisNight,
    desireLeftover: state.desire,
    overflowImminent: desireOverflow(state.desire, state.desireCapacity),
  };
}

/** 每日收尾结算（一天结束→次日）。 */
export interface DailySettleResult {
  state: EngineState;
  recruitRefreshed: boolean;
  combatPower: number;
  hardFail: boolean;        // 硬失败信号（极道威望连续2次每日审核进账为0，或资金<0兜底）
  yields: { condom: number; money: number; martial: number }; // 据点每日产出
}

/**
 * 每日收尾。威望从 state 读（极道威望+淫名，淫名仅 AV 解锁后计入）。
 * @param dayNumber 当前天数（用于每周招募额度刷新：每7天）
 */
export function settleDaily(state: EngineState, dayNumber: number): DailySettleResult {
  let next = { ...state };
  // 据点产出（faucet：已解锁区域每日给避孕套/资金/极道威望）
  const y = dailyYields(next.regions);
  next.condomStock = next.condomStock + y.condom;
  next.money = next.money + y.money;
  if (y.martial > 0) {
    next.martialPrestige = next.martialPrestige + y.martial;
    next.martialGainToday = (next.martialGainToday ?? 0) + y.martial; // 据点产出也算极道威望进账(防硬失败误杀有地盘玩家)
  }
  // 每周刷新招募额度（第1天及每隔7天）。招募难易由总威望决定。
  const recruitRefreshed = dayNumber % 7 === 1;
  if (recruitRefreshed) {
    const prestige = totalPrestige(next.martialPrestige, next.infamy, isAvUnlocked(next.unlocked));
    next.recruitQuota = weeklyRecruitQuota(prestige);
    // 同步刷新 AV 周编辑次数(若已解锁)
    if (isAvUnlocked(next.unlocked) && next.av) {
      next.av = { ...next.av, weeklyQuota: next.av.weeklyQuotaMax };
    }
  }
  const power = combatPower(availableThugs(next.thugTotal, next.garrison), next.loyalty, combatBonus(next.upgrades));
  // 硬失败审核：极道威望连续2次进账为0（纯摆烂者/A面崩盘者）。审核后重置今日流量。
  const audit = auditMartial(next.martialGainToday ?? 0, next.martialZeroStreak ?? 0);
  next.martialZeroStreak = audit.martialZeroStreak;
  next.martialGainToday = 0;
  const hardFail = audit.hardFail || next.money < 0; // 资金为负兜底
  // 由稳定度派生威胁等级（驱动 forced events 骚扰强占）
  next.threatLevel = threatLevelFrom(next.stability ?? 100, next.turfFortifyBonus ?? 0);
  // 经期推进(每日一步,翻转危险期→次日套消耗×1.5/受孕率↑)
  const cyc = advanceCycle(next.cycleDay ?? 0);
  next.cycleDay = cyc.cycleDay;
  next.isDangerousPeriod = cyc.isDangerousPeriod;
  return { state: next, recruitRefreshed, combatPower: power, hardFail, yields: y };
}

/** 便捷：避孕套库存状态标签（UI 用） */
export function condomLabel(state: EngineState): '充足' | '告急' | '废除' {
  return condomStatus(state.condomStock);
}

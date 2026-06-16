// 威望系统 · 核心逻辑（纯函数）
// 威望 = 极道威望 + 淫名（淫名仅 AV 解锁后引入）。
// 极道威望靠打架/火并/复仇；淫名靠拍AV/轮奸规模/肉体名气。占比决定游戏风味。
// 本模块管：AV 解锁判定（淫名闸门）。威望增益与硬失败审核见 C2。

/** AV 解锁标记键（存于 EngineState.unlocked）。解锁后淫名机制才引入。 */
export const AV_UNLOCK_KEY = 'av';

/** AV（暗网摄影室）是否已解锁。决定淫名是否计入总威望。 */
export function isAvUnlocked(unlocked: Record<string, boolean>): boolean {
  return unlocked[AV_UNLOCK_KEY] === true;
}

/**
 * 极道威望进账（来源：打架/火并/复仇胜利）。
 * 同时累加 martialGainToday（当日流量，供每日硬失败审核），martialPrestige 为累计值。
 */
export function gainMartialPrestige(
  s: { martialPrestige: number; martialGainToday: number }, amount: number,
): { martialPrestige: number; martialGainToday: number } {
  const amt = Math.max(0, amount);
  return {
    martialPrestige: s.martialPrestige + amt,
    martialGainToday: s.martialGainToday + amt,
  };
}

/** 淫名进账（来源：拍AV/轮奸规模/肉体名气）。调用方须确保 AV 已解锁（淫名机制 AV 后才引入）。 */
export function gainInfamy(infamy: number, amount: number): number {
  return infamy + Math.max(0, amount);
}

/**
 * 每日硬失败审核（v3/findings 定稿）：极道威望分量连续2次每日审核进账为0 → 硬失败。
 * 只惩罚不靠实力也不靠人海打据点的纯摆烂者；靠人海推据点打赢即涨极道威望→不触发。
 * @param martialGainToday 今日极道威望进账（流量）
 * @param martialZeroStreak 既往连续零进账次数
 */
export function auditMartial(
  martialGainToday: number, martialZeroStreak: number,
): { martialZeroStreak: number; hardFail: boolean } {
  const streak = martialGainToday > 0 ? 0 : martialZeroStreak + 1;
  return { martialZeroStreak: streak, hardFail: streak >= 2 };
}

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

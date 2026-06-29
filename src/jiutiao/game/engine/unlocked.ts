// 派生 EventContext.unlocked 字典 · 单一真相聚合点
// 设计目的: EventOption.unlockRequires 查的是扁平 unlocked 字典,但实际解锁信号分散——
//   - upgrade 系统写 engine.unlocked['dungeon_unlocked'/'studio_unlocked'/...] (升级解锁)
//   - turf 系统写 engine.regions[].defeated=true (击败 boss 解锁地盘)
// 这里把两路派生信号合并成单一字典,3处构造 EventContext 都调本函数。
// 改这里 = 一次性同步所有解析路径,不会出现"菜单显示了但 settleSlot 又判定未解锁"等漂移。

import { deriveTurfUnlocked, occupyScaleAliases } from '../turf/machine';
import type { EngineState } from './types';

/**
 * 合并 engine.unlocked + turf 派生 = 完整 EventOption 可见的 unlocked 字典。
 * 新增派生源(如经济/经期某状态解锁某事件)时,在这里加一行合并即可。
 */
export function deriveEventUnlocked(engine: EngineState): Record<string, boolean> {
  return {
    ...(engine.unlocked ?? {}),
    ...deriveTurfUnlocked(engine.regions),
    ...occupyScaleAliases(engine.occupyScale),
  };
}

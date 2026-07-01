// 升级系统 · 核心逻辑（纯函数·数据驱动）
// catalog 是单一真相源；引擎(canUpgrade/applyUpgrade/combatBonus)只认 UpgradeDef 结构。
// C1：升级引擎 + 打手升级(战力)。设施/扩张项在 C2 append。

import type { UpgradeDef, UpgradeRequire } from './types';

// ───────────────────────────────────────
// catalog · 打手升级（群体·作用全体打手）
// 卡琳典狱长式数值叙事：花钱给操自己的人升级，升级项本身=色情联想。
// 兵器/格斗=纯战力(大)；精力/体型/器具=纯NSFW联想+统一小战力(用户定)。
// ───────────────────────────────────────
export const THUG_UPGRADES: UpgradeDef[] = [
  { id: 'weapon',    category: 'thug', name: '兵器装备', desc: '武装到牙齿，据点战更凶',     cost: 2500, maxLevel: 5, effect: { kind: 'combat', perLevel: 0.10 } },
  { id: 'martial',   category: 'thug', name: '格斗训练', desc: '肉搏战阵磨砺，以一当十',     cost: 2500, maxLevel: 5, effect: { kind: 'combat', perLevel: 0.10 } },
  { id: 'stamina',   category: 'thug', name: '精力强化', desc: '伟哥与持久，夜夜不歇(NSFW·凛承受更久)',       cost: 2500, maxLevel: 5, effect: { kind: 'combat', perLevel: 0.03 }, corruptionOnBuy: 1 },
  { id: 'physique',  category: 'thug', name: '体型改造', desc: '增肌壮根，巨根碾压(NSFW·体格差)',         cost: 2500, maxLevel: 5, effect: { kind: 'combat', perLevel: 0.03 }, corruptionOnBuy: 1 },
  { id: 'gear',      category: 'thug', name: '调教器具', desc: '扩阴器/震动棒等玩物，调教升级(NSFW)', cost: 2500, maxLevel: 5, effect: { kind: 'combat', perLevel: 0.03 }, corruptionOnBuy: 2 },
];

// ───────────────────────────────────────
// catalog · 设施升级（经营数值·作用大宅与凛）
// ───────────────────────────────────────
export const FACILITY_UPGRADES: UpgradeDef[] = [
  { id: 'action_slots', category: 'facility', name: '行动格扩容', desc: '扩充每日可支配行动格(给挑战玩家留活路)', cost: 4000, maxLevel: 12, effect: { kind: 'actionSlots', perLevel: 1 } },
  // 吞吐扩容：堕落解档+花钱(用户定)。每级+6人(6→12→18→24→30)，门槛取非四分之一节点
  { id: 'throughput', category: 'facility', name: '吞吐扩容', desc: '每格供奉处理更多人(堕落越深越高效)', cost: 3000, maxLevel: 4, corruptionGate: [0, 15, 35, 60], effect: { kind: 'throughput', perLevel: 6 } },
  { id: 'desire_cap', category: 'facility', name: '欲望承载上限', desc: '打手更耐欲望积压，拖延强制请假轮奸', cost: 3000, maxLevel: 10, effect: { kind: 'desireCap', perLevel: 20 } },
  { id: 'purchase', category: 'facility', name: '采购扩容', desc: '提升避孕套单次采购上限', cost: 3000, maxLevel: 6, effect: { kind: 'purchaseMult', perLevel: 0.5 } },
  { id: 'fortify', category: 'facility', name: '据点加固', desc: '提升地盘稳定与防守，降骚扰/进攻', cost: 3000, maxLevel: 5, effect: { kind: 'turfFortify', perLevel: 1 } },
];

// ───────────────────────────────────────
// catalog · 扩张解锁（解锁NSFW区域与系统·数据驱动可无限扩展）
// 用 unlock/occupyScale 通用效果 + requires 前置，体现"扩张/解锁带来新升级任务"。
// ───────────────────────────────────────
export const EXPANSION_UPGRADES: UpgradeDef[] = [
  { id: 'basement', category: 'expansion', name: '改建地下室', desc: '刑具与拘禁设施，解锁暴力供奉(受虐癖线)', cost: 5000, maxLevel: 1, effect: { kind: 'unlock', unlockKey: 'basement' }, corruptionOnBuy: 5 },
  { id: 'studio', category: 'expansion', name: '暗网摄影室', desc: '解锁AV拍摄系统(达摩克里斯之剑·首拍强制演出)', cost: 8000, maxLevel: 1, effect: { kind: 'unlock', unlockKey: 'av' }, corruptionOnBuy: 3 },
  // AV设备升级：前置=先建摄影室，体现解锁带来新升级任务
  { id: 'av_gear', category: 'expansion', name: 'AV设备升级', desc: '专业器材与场地，提升AV规模(前置:摄影室)', cost: 4000, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'av_advanced' } },
  // AV 周产能：每级 +1 本周可拍摄部数(前置:摄影室)。AV 单部收益高,靠周次数限制平衡。
  { id: 'av_quota', category: 'expansion', name: 'AV周产能扩充', desc: '雇佣班底，每周可多拍一部AV(单部收益高·靠周次数平衡)', cost: 7000, maxLevel: 4, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  // AV 时长扩容：每级 +24h 上限(前置:摄影室)
  { id: 'av_duration', category: 'expansion', name: 'AV时长扩容', desc: '更大场地与排班，提升单部AV时长上限(+24h/级)', cost: 4000, maxLevel: 5, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
];

// ───────────────────────────────────────
// catalog · 九条宅技能树（叙事:九条会沉寂多年,宅邸功能不全,凛赚钱后逐间修缮重启)
// 主页「九条宅」的房间修缮节点 → 解锁对应子页(道场/摄影房/地下室/纪念室/庭院/日常淫具化…)
// 巨量内容待世界书完善后填充,这里先搭框架 + 示例分支,留接口。
// ───────────────────────────────────────
export const HOUSE_UPGRADES: UpgradeDef[] = [
  // —— 九条宅(主页·房间修缮=解锁子页) ——
  { id: 'room_dojo', category: 'expansion', name: '重启道场', desc: '清理荒废的练武堂，打手得以操练——解锁「道场」升级页', cost: 3000, maxLevel: 1, effect: { kind: 'unlock', unlockKey: 'dojo_page' } },
  { id: 'room_dailytoy', category: 'expansion', name: '日常淫具化改造', desc: '把宅邸日常起居处处改成淫具温床(马桶/餐具/椅子淫具化)——解锁日常淫具化事件', cost: 5000, maxLevel: 1, requires: [{ upgradeId: 'basement', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'dailytoy' }, corruptionOnBuy: 3 },

  // —— 凛自己(主页旁·永远可用·经营核心) ——
  { id: 'prestige_mult', category: 'facility', name: '威望增长系数', desc: '凛亲自打理名声经营，一切威望进账 +25%/级', cost: 4000, maxLevel: 3, effect: { kind: 'prestigeMult', perLevel: 0.25 } },

  // —— 道场示例分支(前置:重启道场) ——
  { id: 'phys_train', category: 'thug', name: '打手体能训练', desc: '提高打手每人基础武力值(+0.2/级·与在场/武器乘区相乘)', cost: 2500, maxLevel: 1, requires: [{ upgradeId: 'room_dojo', minLevel: 1 }], effect: { kind: 'baseMartial', perLevel: 0.2 } },
  { id: 'phys_train2', category: 'thug', name: '打手体能训练·二段', desc: '更高强度的操练，基础武力 +0.2', cost: 3500, maxLevel: 1, requires: [{ upgradeId: 'phys_train', minLevel: 1 }], effect: { kind: 'baseMartial', perLevel: 0.2 } },
  { id: 'phys_train3', category: 'thug', name: '打手体能训练·三段', desc: '榨干潜能，基础武力 +0.2', cost: 4500, maxLevel: 1, requires: [{ upgradeId: 'phys_train2', minLevel: 1 }], effect: { kind: 'baseMartial', perLevel: 0.2 } },
  { id: 'sex_stamina', category: 'thug', name: '性爱持续时间增强', desc: '打手更持久：供奉吞吐略降，但AV单部时长上限+24h', cost: 3500, maxLevel: 1, requires: [{ upgradeId: 'phys_train', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'sex_stamina' } },
  { id: 'lust_beast', category: 'thug', name: '性欲野兽', desc: '打手欲求暴涨：欲望增长×1.5，解锁日常事件的NSFW版本(前置)', cost: 5000, maxLevel: 1, requires: [{ upgradeId: 'sex_stamina', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'lust_beast' } },

  // —— 摄影房示例(前置:摄影室) ——
  { id: 'av_play', category: 'expansion', name: 'AV玩法编排扩容', desc: '更专业的策划，单部AV同时可选玩法tag上限 +1/级', cost: 5000, maxLevel: 3, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'avPlayCap', perLevel: 1 } },

  // —— 地下室示例(前置:地下室) ——
  { id: 'dungeon_gear', category: 'expansion', name: '地下室刑具扩充', desc: '更多拘禁与调教器具(暴力供奉相关·待填)', cost: 4000, maxLevel: 1, requires: [{ upgradeId: 'basement', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'dungeon_gear' } },
];

// ───────────────────────────────────────
// catalog · 地盘扩张收购树（花钱收购地皮→解锁对应片区的白天SFW↔NSFW双面事件·前后置·数据驱动）
// 便宜的作前置(鼓励早买铺开NSFW面);每档收购增少量堕落;一个升级可对应多个场景(如"私山")。
// 占据规模6档: 老宅一隅(起点)→整座九条邸→邻近街区→盘踞一山(私山)/整片城区→小半座城。
// ───────────────────────────────────────
export const ANNEX_UPGRADES: UpgradeDef[] = [
  { id: 'annex_estate', category: 'expansion', name: '买下整座九条邸', desc: '吞下整座老宅含庭院假山→解锁庭院遛母狗/假山野战', cost: 1500, maxLevel: 1, effect: { kind: 'unlock', unlockKey: 'courtyard' }, corruptionOnBuy: 3 },
  { id: 'annex_shrine', category: 'expansion', name: '修缮祖堂纪念室', desc: '先代牌位重见天日→解锁参拜先祖(牌位前淫乱)', cost: 2500, maxLevel: 1, requires: [{ upgradeId: 'annex_estate', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'shrine' }, corruptionOnBuy: 3 },
  { id: 'annex_street', category: 'expansion', name: '收购邻近街区', desc: '吞并周边商铺→解锁出门吃饭(餐厅)/购物(商场)/街道散步', cost: 3000, maxLevel: 1, requires: [{ upgradeId: 'annex_estate', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'occupy_street' }, corruptionOnBuy: 3 },
  { id: 'annex_hill', category: 'expansion', name: '盘踞一山（私山）', desc: '买下整座山(一升级多场景)→解锁爬山/森林野营/私山露天轮奸', cost: 5000, maxLevel: 1, requires: [{ upgradeId: 'annex_street', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'occupy_hill' }, corruptionOnBuy: 4 },
  { id: 'annex_district', category: 'expansion', name: '吞并整片城区', desc: '游乐园/海滩/祭典场→解锁去游乐园/海滩/逛祭典', cost: 6000, maxLevel: 1, requires: [{ upgradeId: 'annex_street', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'occupy_district' }, corruptionOnBuy: 4 },
  { id: 'annex_halfcity', category: 'expansion', name: '坐拥小半座城', desc: '地下霸主级·包下公开场馆→解锁看演唱会(舞台轮奸)', cost: 12000, maxLevel: 1, requires: [{ upgradeId: 'annex_district', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'occupy_halfcity' }, corruptionOnBuy: 5 },
  // 经营便利·后期贵:避孕套送货上门(便利=堕落加速·省采购格)
  { id: 'condom_delivery', category: 'expansion', name: '避孕套·黑市送货渠道', desc: '打手代买送货上门，每日自动进货一批(省去主动采购)', cost: 20000, maxLevel: 3, requires: [{ upgradeId: 'annex_halfcity', minLevel: 1 }], effect: { kind: 'condomDaily', perLevel: 250 }, corruptionOnBuy: 4 },
];

// ───────────────────────────────────────
// catalog · 荒唐升级（卡琳典狱长式·花钱换收益但增堕落·升级本身=色情联想·前期堕落度主来源）
// ───────────────────────────────────────
export const DEBAUCH_UPGRADES: UpgradeDef[] = [
  // 信息张贴链(用户范例):每级减忠诚自然衰减,但每级增堕落
  { id: 'poster1', category: 'facility', name: '宅内张贴大小姐个人信息', desc: '打手随时能看到主人信息→忠诚更稳(自然衰减-1)', cost: 1500, maxLevel: 1, effect: { kind: 'loyaltyDecayReduce', perLevel: 1 }, corruptionOnBuy: 2 },
  { id: 'poster2', category: 'facility', name: '张贴大小姐艳照', desc: '曝光升级→忠诚更稳(衰减再-1)', cost: 2500, maxLevel: 1, requires: [{ upgradeId: 'poster1', minLevel: 1 }], effect: { kind: 'loyaltyDecayReduce', perLevel: 1 }, corruptionOnBuy: 2 },
  { id: 'poster3', category: 'facility', name: '张贴大小姐小穴特写', desc: '玷污→忠诚更稳(衰减再-1)', cost: 4000, maxLevel: 1, requires: [{ upgradeId: 'poster2', minLevel: 1 }], effect: { kind: 'loyaltyDecayReduce', perLevel: 1 }, corruptionOnBuy: 3 },
  { id: 'poster4', category: 'facility', name: '张贴流着精液的小穴照', desc: '终极物化→忠诚更稳(衰减再-1)', cost: 6000, maxLevel: 1, requires: [{ upgradeId: 'poster3', minLevel: 1 }], effect: { kind: 'loyaltyDecayReduce', perLevel: 1 }, corruptionOnBuy: 3 },
];

/** 全部升级项（合并） */
export const UPGRADES: UpgradeDef[] = [...THUG_UPGRADES, ...FACILITY_UPGRADES, ...EXPANSION_UPGRADES, ...HOUSE_UPGRADES, ...ANNEX_UPGRADES, ...DEBAUCH_UPGRADES];

/** 按 id 索引 */
export const UPGRADES_BY_ID: Record<string, UpgradeDef> =
  Object.fromEntries(UPGRADES.map(u => [u.id, u]));

// ───────────────────────────────────────
// 状态切片与查询
// ───────────────────────────────────────

/** 升级引擎读写的状态切片（EngineState 结构兼容）。含 applyUpgrade 效果作用的目标字段。 */
export interface UpgradeState {
  money: number;
  corruption: number;
  upgrades?: Record<string, number>;
  // —— 效果目标字段（applyUpgrade 按 effect.kind 写入）——
  occupyScale?: number;          // 占据规模档序号（地盘扩张；扩张项 requires 用）
  perSlotThroughput?: number;    // 每格供奉吞吐（吞吐扩容）
  desireCapacity?: number;       // 欲望承载上限
  totalSlots?: number;           // 每日总行动格（行动格扩容）
  purchaseUpgradeMult?: number;  // 采购扩容倍率
  turfFortifyBonus?: number;     // 据点加固加成
  unlocked?: Record<string, boolean>; // 解锁集（地下室/摄影室/庭院…）
}

/** 行动格基数（行动格扩容在此之上加） */
export const BASE_ACTION_SLOTS = 8;

/** 某升级项当前等级 */
export function getLevel(upgrades: Record<string, number> | undefined, id: string): number {
  return upgrades?.[id] ?? 0;
}

/** 前置依赖是否全满足 */
export function requiresMet(reqs: UpgradeRequire[] | undefined, state: UpgradeState): boolean {
  if (!reqs || reqs.length === 0) return true;
  return reqs.every(r => {
    if (r.upgradeId != null && getLevel(state.upgrades, r.upgradeId) < (r.minLevel ?? 1)) return false;
    if (r.occupyAtLeast != null && (state.occupyScale ?? 0) < r.occupyAtLeast) return false;
    return true;
  });
}

export interface UpgradeCheck {
  ok: boolean;
  reason?: string;
}

/** 能否升级该项：前置→满级→堕落门槛→资金，依次判定 */
export function canUpgrade(def: UpgradeDef, state: UpgradeState): UpgradeCheck {
  if (!requiresMet(def.requires, state)) return { ok: false, reason: '前置未满足' };
  const lvl = getLevel(state.upgrades, def.id);
  if (lvl >= def.maxLevel) return { ok: false, reason: '已满级' };
  const gate = def.corruptionGate?.[lvl]; // 升到 lvl+1（index=lvl）所需堕落度
  if (gate != null && state.corruption < gate) return { ok: false, reason: `需堕落度≥${gate}` };
  if (state.money < def.cost) return { ok: false, reason: '资金不足' };
  return { ok: true };
}

/**
 * 应用升级（扣钱+升级+效果作用）。调用方应先 canUpgrade。
 * combat 为派生(不写字段,由 combatBonus 汇总)；其余效果作用到对应状态字段(增量)。
 */
export function applyUpgrade<S extends UpgradeState>(state: S, def: UpgradeDef): S {
  const lvl = getLevel(state.upgrades, def.id);
  const e = def.effect;
  const d = e.perLevel ?? 0;
  const patch: Partial<UpgradeState> = {
    money: state.money - def.cost,
    upgrades: { ...(state.upgrades ?? {}), [def.id]: lvl + 1 },
  };
  switch (e.kind) {
    case 'combat': break;      // 派生(武器乘区)，不写字段
    case 'baseMartial': break; // 派生(每人基础武力)，不写字段
    case 'avPlayCap': break;   // 派生(AV玩法tag上限)，不写字段
    case 'prestigeMult': break;// 派生(威望增长系数)，不写字段
    case 'loyaltyDecayReduce': break; // 派生(减忠诚衰减)
    case 'condomDaily': break;        // 派生(避孕套送货上门)
    case 'throughput':   patch.perSlotThroughput = (state.perSlotThroughput ?? 6) + d; break;
    case 'desireCap':    patch.desireCapacity = (state.desireCapacity ?? 60) + d; break;
    case 'actionSlots':  patch.totalSlots = (state.totalSlots ?? BASE_ACTION_SLOTS) + d; break;
    case 'purchaseMult': patch.purchaseUpgradeMult = (state.purchaseUpgradeMult ?? 1) + d; break;
    case 'turfFortify':  patch.turfFortifyBonus = (state.turfFortifyBonus ?? 0) + d; break;
    case 'occupyScale':  patch.occupyScale = (state.occupyScale ?? 0) + d; break;
    case 'unlock':
      if (e.unlockKey) patch.unlocked = { ...(state.unlocked ?? {}), [e.unlockKey]: true };
      break;
  }
  return { ...state, ...patch } as S;
}

/** 武器乘区加成（派生：Σ 各 combat 项等级×每级比例）。武力乘 (1+此值)。 */
export function combatBonus(upgrades: Record<string, number> | undefined): number {
  let bonus = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'combat') bonus += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return bonus;
}
/** 武器乘区 = 1 + combatBonus（武力的一个独立乘区） */
export function weaponMult(upgrades: Record<string, number> | undefined): number {
  return 1 + combatBonus(upgrades);
}
/** 每人基础武力值 = 1 + Σ baseMartial 项（派生·与在场乘区相乘） */
export function baseMartialPerThug(upgrades: Record<string, number> | undefined): number {
  let bonus = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'baseMartial') bonus += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return 1 + bonus;
}
/** AV 同时可选玩法tag上限 = 基础 + Σ avPlayCap 项 */
export const BASE_AV_PLAY_CAP = 2;
export function avPlayCap(upgrades: Record<string, number> | undefined): number {
  let bonus = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'avPlayCap') bonus += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return BASE_AV_PLAY_CAP + bonus;
}
/** 威望增长系数 = 1 + Σ prestigeMult 项（威望进账乘此值） */
export function prestigeMultiplier(upgrades: Record<string, number> | undefined): number {
  let bonus = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'prestigeMult') bonus += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return 1 + bonus;
}
/** 欲望增长乘区（性欲野兽解锁后 ×1.5） */
export function desireGrowthMult(unlocked: Record<string, boolean> | undefined): number {
  return unlocked?.lust_beast ? 1.5 : 1;
}
/** 忠诚每日衰减的减免总量（Σ loyaltyDecayReduce 项·"荒唐升级"如张贴照片链） */
export function loyaltyDecayReduction(upgrades: Record<string, number> | undefined): number {
  let r = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'loyaltyDecayReduce') r += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return r;
}
/** 避孕套每日送货上门量（Σ condomDaily 项·后期便利·省主动采购） */
export function condomDailyFrom(upgrades: Record<string, number> | undefined): number {
  let c = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'condomDaily') c += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return c;
}

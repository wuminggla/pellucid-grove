// 升级技能树 · 分页 + 节点布局元数据（数据驱动·留巨量内容接口）
// 叙事: 九条会沉寂多年,宅邸功能不全,凛赚钱后逐间修缮重启。
//   「九条宅」为主页,房间修缮节点解锁其它子页(道场/摄影房/地下室/纪念室/庭院/日常淫具化…)。
//   新游戏只解锁两页: 九条宅 + 凛自己。其它升级体系各自成独立小技能树分页。
// 本文件只管"页与节点的呈现/前后置布局";具体效果仍由 upgrade/machine 的 UpgradeDef 决定。

import { UPGRADES, UPGRADES_BY_ID } from './machine';
import type { UpgradeDef } from './types';

/** 技能树子页 */
export interface SkillPage {
  id: string;
  name: string;
  /** 叙事说明(页头) */
  narrative: string;
  /** 解锁键(engine.unlocked[unlockKey]===true 才解锁本页)。空=永远解锁(主页/凛)。 */
  unlockKey?: string;
  /** 由主页哪个修缮节点解锁(给锁定页提示用) */
  unlockedByNode?: string;
}

export const SKILL_PAGES: SkillPage[] = [
  { id: 'house', name: '九条宅', narrative: '荒废多年的九条本邸。凛赚来的每一分钱，先用来修缮这里——每修好一处，就重启一片可能。' },
  { id: 'rin', name: '凛 · 自己', narrative: '大小姐亲自打理的经营核心：行动格、供奉吞吐、欲望承载、名声系数。' },
  { id: 'dojo', name: '道场', narrative: '练武堂。打手的武力与肉体在此被反复操练、改造。', unlockKey: 'dojo_page', unlockedByNode: 'room_dojo' },
  { id: 'studio', name: '摄影房', narrative: '暗网AV摄影棚。设备、产能、玩法编排都在这里升级。', unlockKey: 'av', unlockedByNode: 'studio' },
  { id: 'dungeon', name: '地下室', narrative: '拘禁与刑具之所。暴力供奉、受虐癖线在此推进。', unlockKey: 'basement', unlockedByNode: 'basement' },
  { id: 'expansion', name: '地盘扩张', narrative: '收购周边地皮。占了哪片地，那片的场所才会翻面成白日宣淫的猎场——每一次扩张都为白天解锁新的双面事件。便宜的先买，铺开NSFW面。' },
];

/** 节点布局(列col/行row)。每页一套局部坐标。 */
export interface NodeMeta { page: string; col: number; row: number; }
export const NODE_META: Record<string, NodeMeta> = {
  // 九条宅(主页·房间修缮=解锁子页 + 荒唐升级链)
  room_dojo:     { page: 'house', col: 0, row: 0 },
  studio:        { page: 'house', col: 0, row: 1 },
  basement:      { page: 'house', col: 0, row: 2 },
  room_dailytoy: { page: 'house', col: 1, row: 2 },
  // 信息张贴链(减忠诚衰减·增堕落)
  poster1:       { page: 'house', col: 1, row: 0 },
  poster2:       { page: 'house', col: 2, row: 0 },
  poster3:       { page: 'house', col: 3, row: 0 },
  poster4:       { page: 'house', col: 4, row: 0 },
  // 凛自己
  action_slots: { page: 'rin', col: 0, row: 0 },
  throughput:   { page: 'rin', col: 0, row: 1 },
  desire_cap:   { page: 'rin', col: 1, row: 0 },
  purchase:     { page: 'rin', col: 1, row: 1 },
  fortify:      { page: 'rin', col: 2, row: 0 },
  prestige_mult:{ page: 'rin', col: 2, row: 1 },
  // 道场
  weapon:      { page: 'dojo', col: 0, row: 0 },
  martial:     { page: 'dojo', col: 0, row: 1 },
  stamina:     { page: 'dojo', col: 1, row: 0 },
  physique:    { page: 'dojo', col: 1, row: 1 },
  gear:        { page: 'dojo', col: 1, row: 2 },
  phys_train:  { page: 'dojo', col: 2, row: 0 },
  phys_train2: { page: 'dojo', col: 3, row: 0 },
  phys_train3: { page: 'dojo', col: 4, row: 0 },
  sex_stamina: { page: 'dojo', col: 3, row: 1 },
  lust_beast:  { page: 'dojo', col: 4, row: 1 },
  // 摄影房
  av_gear:     { page: 'studio', col: 0, row: 0 },
  av_quota:    { page: 'studio', col: 0, row: 1 },
  av_duration: { page: 'studio', col: 1, row: 0 },
  av_play:     { page: 'studio', col: 1, row: 1 },
  // 地下室
  dungeon_gear:{ page: 'dungeon', col: 0, row: 0 },
  // 地盘扩张收购树(挂扩张日常双面事件·前后置)
  annex_estate:    { page: 'expansion', col: 0, row: 1 },
  annex_shrine:    { page: 'expansion', col: 1, row: 0 },
  annex_street:    { page: 'expansion', col: 1, row: 2 },
  annex_hill:      { page: 'expansion', col: 2, row: 1 },
  annex_district:  { page: 'expansion', col: 2, row: 3 },
  annex_halfcity:  { page: 'expansion', col: 3, row: 3 },
  condom_delivery: { page: 'expansion', col: 4, row: 3 },
};

/** 页是否解锁 */
export function pageUnlocked(page: SkillPage, unlocked: Record<string, boolean> | undefined): boolean {
  if (!page.unlockKey) return true;
  return unlocked?.[page.unlockKey] === true;
}

/** 某页的全部节点(按 NODE_META) */
export function nodesOfPage(pageId: string): UpgradeDef[] {
  return UPGRADES.filter(u => NODE_META[u.id]?.page === pageId);
}

/** 节点的页内前置(同页·来自 requires[].upgradeId)。用于连线。 */
export function nodePrereqIds(def: UpgradeDef): string[] {
  const page = NODE_META[def.id]?.page;
  return (def.requires ?? [])
    .map(r => r.upgradeId)
    .filter((id): id is string => !!id && NODE_META[id]?.page === page);
}

export { UPGRADES_BY_ID };

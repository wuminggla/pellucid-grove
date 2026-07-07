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
  { id: 'rin', name: '凛 · 自己', narrative: '大小姐的起居与身体。定制饮食、深度睡眠、扩建浴场……每一件生活的改善，都在不知不觉间给"另一种改造"腾出位置——绯红的???会自己亮起来。性技修炼是"堕落解锁的技艺"(粉金)，既要花钱又要堕落到位。' },
  { id: 'biz', name: '势力经营', narrative: '九条会的门面与耳目：采购、威望、会规、暗探。正经的帮派治理——但每条会规的背面，都藏着一条只约束大小姐的荒唐规矩。' },
  { id: 'dojo', name: '道场', narrative: '练武堂。打手的武力与肉体在此被反复操练、改造。', unlockKey: 'dojo_page', unlockedByNode: 'room_dojo' },
  { id: 'studio', name: '摄影房', narrative: '暗网AV摄影棚。设备、产能、玩法编排都在这里升级。', unlockKey: 'av', unlockedByNode: 'studio' },
  { id: 'dungeon', name: '地下室', narrative: '拘禁与刑具之所。暴力供奉、受虐癖线在此推进。', unlockKey: 'basement', unlockedByNode: 'basement' },
  { id: 'dailytoy', name: '日常淫乱化', narrative: '把宅邸的日常起居处处改成淫乱温床——张贴、饮食、如厕、座椅。多数不进事件格，叙事就在这一页里讲。', unlockKey: 'dailytoy', unlockedByNode: 'room_dailytoy' },
  { id: 'expansion', name: '地盘扩张', narrative: '修缮宅邸、收购地皮——解锁的是正正经经的日常去处。但每个去处下面都吊着一个绯红的???，堕落到了，它会自己翻面。' },
];

/** 节点布局(列col/行row)。每页一套局部坐标。 */
export interface NodeMeta { page: string; col: number; row: number; }
export const NODE_META: Record<string, NodeMeta> = {
  // 九条宅(主页·纯子页入口·不设粉色内容)
  room_dojo:     { page: 'house', col: 0, row: 0 },
  studio:        { page: 'house', col: 0, row: 1 },
  basement:      { page: 'house', col: 0, row: 2 },
  room_dailytoy: { page: 'house', col: 0, row: 3 },
  // 凛·自己(每列一条纵链:生活化/性技/欲望/嵌合)
  life_diet:   { page: 'rin', col: 0, row: 0 },
  life_sleep:  { page: 'rin', col: 1, row: 0 },
  life_bed:    { page: 'rin', col: 2, row: 0 },
  life_bath:   { page: 'rin', col: 3, row: 0 },
  life_walk:   { page: 'rin', col: 4, row: 0 },
  skill_hand:   { page: 'rin', col: 0, row: 1 },
  skill_breast: { page: 'rin', col: 1, row: 1 },
  skill_foot:   { page: 'rin', col: 2, row: 1 },
  skill_double: { page: 'rin', col: 3, row: 1 },
  skill_orgy:   { page: 'rin', col: 4, row: 1 },
  desire_train:  { page: 'rin', col: 0, row: 2 },
  desire_liquor: { page: 'rin', col: 1, row: 2 },
  m_cloth_outer: { page: 'rin', col: 2, row: 2 },
  m_cloth_shoes: { page: 'rin', col: 3, row: 2 },
  m_cloth_inner: { page: 'rin', col: 4, row: 2 },
  m_scent:       { page: 'rin', col: 5, row: 2 },
  m_sleep:      { page: 'rin', col: 0, row: 3 },
  m_bath:       { page: 'rin', col: 1, row: 3 },
  m_bath_serve: { page: 'rin', col: 2, row: 3 },
  m_walk_toy:   { page: 'rin', col: 0, row: 4 },
  m_walk_dog:   { page: 'rin', col: 1, row: 4 },
  m_walk_orgy:  { page: 'rin', col: 2, row: 4 },
  // 势力经营(采购/威望/据点制度·每行一链)
  buy_drugstore:  { page: 'biz', col: 0, row: 0 },
  buy_wholesale:  { page: 'biz', col: 1, row: 0 },
  buy_convoy:     { page: 'biz', col: 2, row: 0 },
  prestige_crest:  { page: 'biz', col: 0, row: 1 },
  prestige_feast:  { page: 'biz', col: 1, row: 1 },
  m_feast_hostess: { page: 'biz', col: 2, row: 1 },
  rule_code:    { page: 'biz', col: 0, row: 2 },
  rule_spy:     { page: 'biz', col: 1, row: 2 },
  rule_patrol:  { page: 'biz', col: 2, row: 2 },
  m_rule_greet: { page: 'biz', col: 1, row: 3 },
  m_rule_meal:  { page: 'biz', col: 2, row: 3 },
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
  dojo_spar:   { page: 'dojo', col: 5, row: 0 },
  m_spar1:     { page: 'dojo', col: 6, row: 0 },
  m_spar2:     { page: 'dojo', col: 7, row: 0 },
  m_cheer1:    { page: 'dojo', col: 5, row: 1 },
  m_cheer2:    { page: 'dojo', col: 6, row: 1 },
  m_cheer3:    { page: 'dojo', col: 7, row: 1 },
  // 摄影房
  av_gear:     { page: 'studio', col: 0, row: 0 },
  av_quota:    { page: 'studio', col: 0, row: 1 },
  av_duration: { page: 'studio', col: 1, row: 0 },
  av_play:     { page: 'studio', col: 1, row: 1 },
  m_av_letters:{ page: 'studio', col: 2, row: 0 },
  // 地下室
  dungeon_gear:      { page: 'dungeon', col: 0, row: 0 },
  dungeon_soundproof:{ page: 'dungeon', col: 0, row: 1 },
  m_dungeon_night:   { page: 'dungeon', col: 1, row: 1 },
  // 日常淫乱化(张贴链 + 家内淫乱化)
  poster1:   { page: 'dailytoy', col: 0, row: 0 },
  poster2:   { page: 'dailytoy', col: 1, row: 0 },
  poster3:   { page: 'dailytoy', col: 2, row: 0 },
  poster4:   { page: 'dailytoy', col: 3, row: 0 },
  m_diet:    { page: 'dailytoy', col: 0, row: 1 },
  m_toilet:  { page: 'dailytoy', col: 0, row: 2 },
  m_chair:   { page: 'dailytoy', col: 1, row: 2 },
  // 地盘扩张树(SFW解锁在上·???翻面开关垂在各自事件下方)
  annex_estate:    { page: 'expansion', col: 0, row: 0 },
  annex_shrine:    { page: 'expansion', col: 1, row: 0 },
  m_ancestor:      { page: 'expansion', col: 2, row: 0 },
  annex_street:    { page: 'expansion', col: 0, row: 1 },
  m_dine:          { page: 'expansion', col: 1, row: 1 },
  m_mall:          { page: 'expansion', col: 2, row: 1 },
  annex_hill:      { page: 'expansion', col: 0, row: 2 },
  annex_hill_trail:{ page: 'expansion', col: 1, row: 2 },
  m_hiking:        { page: 'expansion', col: 2, row: 2 },
  annex_hill_camp: { page: 'expansion', col: 1, row: 3 },
  m_camping:       { page: 'expansion', col: 2, row: 3 },
  annex_district:  { page: 'expansion', col: 0, row: 4 },
  m_amusement:     { page: 'expansion', col: 1, row: 4 },
  m_beach:         { page: 'expansion', col: 2, row: 4 },
  m_festival:      { page: 'expansion', col: 3, row: 4 },
  annex_halfcity:  { page: 'expansion', col: 0, row: 5 },
  m_concert:       { page: 'expansion', col: 1, row: 5 },
  condom_delivery: { page: 'expansion', col: 2, row: 5 },
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

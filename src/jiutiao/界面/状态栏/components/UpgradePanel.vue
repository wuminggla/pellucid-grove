<!--
  UpgradePanel · 升级视图（#16）
  职责: 列三类升级(打手/设施/扩张)，每项显示等级/上限/价/前置·堕落门槛，可升级则升。
  升级=独立子菜单不占行动格(设计 §0.1)。数据驱动: catalog 改了这里自动跟。
  数据: engine(money/corruption/upgrades/occupyScale...) + upgrade 模块 canUpgrade/applyUpgrade。
-->
<template>
  <div class="up">
    <div class="up-head">
      <div class="u-title">升级 · 极道经营</div>
      <div class="u-stats">
        <span>资金 <b>¥{{ r.engine.money }}</b></span>
        <span>堕落度 <b>{{ r.engine.corruption }}</b></span>
        <span>战力加成 <b>+{{ Math.round(combatPct) }}%</b></span>
      </div>
    </div>
    <div v-if="r.lastUpgrade" class="u-feedback" :class="{ ok: r.lastUpgrade.ok, bad: !r.lastUpgrade.ok }">{{ r.lastUpgrade.msg }}</div>

    <div v-for="grp in groups" :key="grp.cat" class="grp">
      <div class="grp-title">{{ grp.title }} <span class="grp-sub">{{ grp.sub }}</span></div>
      <div class="cards">
        <div v-for="u in grp.items" :key="u.id" class="card" :class="{ maxed: u.lvl >= u.def.maxLevel, locked: !u.visible }">
          <div class="c-top">
            <span class="c-name">{{ u.def.name }}</span>
            <span class="c-lvl">{{ u.def.maxLevel > 1 ? `Lv.${u.lvl}/${u.def.maxLevel}` : (u.lvl > 0 ? '已建' : '未建') }}</span>
          </div>
          <div class="c-desc">{{ u.def.desc }}</div>
          <div class="c-foot">
            <span class="c-cost">¥{{ u.def.cost }}</span>
            <button class="buy" :disabled="!u.can.ok" @click="r.buyUpgrade(u.def.id)">
              {{ u.lvl >= u.def.maxLevel ? '满级' : (u.can.ok ? (u.lvl > 0 && u.def.maxLevel > 1 ? '升级 ▲' : '建造 ▲') : u.can.reason) }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRunnerStore } from '../runner-store';
import {
  THUG_UPGRADES, FACILITY_UPGRADES, EXPANSION_UPGRADES,
  getLevel, canUpgrade, requiresMet, combatBonus,
} from '../../../game/upgrade/machine';

const r = useRunnerStore();
const combatPct = computed(() => combatBonus(r.engine.upgrades) * 100);

function rows(list: typeof THUG_UPGRADES) {
  return list.map(def => ({
    def,
    lvl: getLevel(r.engine.upgrades, def.id),
    can: canUpgrade(def, r.engine as any),
    visible: requiresMet(def.requires, r.engine as any),
  }));
}

const groups = computed(() => [
  { cat: 'thug', title: '打手升级', sub: '作用全体打手 · 兵器/格斗=战力，其余兼NSFW', items: rows(THUG_UPGRADES) },
  { cat: 'facility', title: '设施升级', sub: '大宅经营数值 · 吞吐受堕落解档', items: rows(FACILITY_UPGRADES) },
  { cat: 'expansion', title: '扩张解锁', sub: '解锁淫窟区域与系统 · 部分需前置', items: rows(EXPANSION_UPGRADES) },
]);
</script>

<style scoped>
.up { padding: 18px 26px; overflow-y: auto; height: 100%; }
.up-head { display: flex; align-items: baseline; gap: 16px; margin-bottom: 6px; }
.u-title { font-family: var(--brush); font-size: 28px; color: var(--gold-hi); }
.u-stats { margin-left: auto; display: flex; gap: 16px; font-size: 13px; color: var(--text-dim); }
.u-stats b { color: var(--gold-hi); font-size: 15px; }
.u-feedback { margin: 8px 0 12px; padding: 9px 14px; border-radius: 7px; font-size: 13px; }
.u-feedback.ok { background: rgba(94,122,72,.12); border: 1px solid #3a4a2a; color: var(--green); }
.u-feedback.bad { background: rgba(179,33,46,.1); border: 1px solid var(--red); color: var(--red-hi); }

.grp { margin-top: 16px; }
.grp-title { font-family: var(--serif); font-size: 17px; color: var(--gold); letter-spacing: 2px; margin-bottom: 9px; border-bottom: 1px solid var(--line); padding-bottom: 5px; }
.grp-sub { font-size: 11px; color: var(--text-dim); letter-spacing: 0; margin-left: 8px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 11px; }
.card { border: 1px solid var(--line); border-radius: 9px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.card.maxed { border-color: var(--gold-dim); }
.card.locked { opacity: .5; }
.c-top { display: flex; align-items: baseline; gap: 8px; }
.c-name { font-size: 15px; color: var(--text); }
.c-lvl { margin-left: auto; font-size: 11px; color: var(--gold-dim); }
.c-desc { font-size: 12px; color: var(--text-dim); line-height: 1.5; flex: 1; }
.c-foot { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.c-cost { font-size: 13px; color: var(--gold); }
.buy { margin-left: auto; font-family: var(--serif); background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; border-radius: 6px; padding: 7px 14px; font-size: 13px; font-weight: 700; cursor: pointer; max-width: 60%; }
.buy:disabled { background: rgba(0,0,0,.3); color: var(--text-dim); border: 1px solid var(--line); cursor: not-allowed; font-weight: 400; }
</style>

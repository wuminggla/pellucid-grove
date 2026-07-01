<!--
  UpgradePanel · 升级技能树（#33）
  叙事: 九条会沉寂多年,宅邸功能不全,凛赚钱后逐间修缮重启。
  「九条宅」为主页,房间修缮节点解锁其它子页;新游戏只解锁 九条宅 + 凛自己 两页。
  数据驱动: 页/节点来自 upgrade/skilltree(NODE_META/SKILL_PAGES),效果来自 UpgradeDef。
  树形: 节点按 col/row 绝对定位,SVG 连线表示前后置。点节点=升级/建造。
-->
<template>
  <div class="tree">
    <div class="tree-head">
      <div class="th-title">升级 · 九条会百废待兴</div>
      <div class="th-stats"><span>资金 <b>¥{{ r.engine.money.toLocaleString() }}</b></span><span>堕落度 <b>{{ r.engine.corruption }}</b></span></div>
    </div>

    <!-- 子页选项卡 -->
    <div class="pg-tabs">
      <button v-for="p in pages" :key="p.id" class="pg-tab" :class="{ active: p.id === curPage, locked: !p.open }"
        :disabled="!p.open" @click="curPage = p.id">
        {{ p.name }}<span v-if="!p.open" class="pg-lock">🔒</span>
      </button>
    </div>

    <div class="pg-narr">{{ curPageObj?.narrative }}</div>
    <div v-if="r.lastUpgrade" class="u-feedback" :class="{ ok: r.lastUpgrade.ok, bad: !r.lastUpgrade.ok }">{{ r.lastUpgrade.msg }}</div>

    <!-- 锁定页提示 -->
    <div v-if="curPageObj && !curPageObj.open" class="locked-page">
      此区域尚未修缮。前往「九条宅」建造 <b>{{ unlockNodeName(curPageObj) }}</b> 后解锁。
    </div>

    <!-- 技能树画布 -->
    <div v-else class="canvas" :style="{ width: canvasW + 'px', height: canvasH + 'px' }">
      <svg class="links" :width="canvasW" :height="canvasH">
        <line v-for="(l, i) in links" :key="i" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2"
          :class="{ done: l.done }" />
      </svg>
      <div v-for="n in nodes" :key="n.def.id" class="node" :class="n.state" :style="{ left: n.x + 'px', top: n.y + 'px' }"
        @click="onNode(n)" @mouseenter="hover = n" @mouseleave="hover = null">
        <div class="n-name">{{ n.def.name }}</div>
        <div class="n-lvl">{{ n.def.maxLevel > 1 ? `Lv.${n.lvl}/${n.def.maxLevel}` : (n.lvl > 0 ? '已建' : `¥${n.def.cost}`) }}</div>
        <div v-if="n.lvl >= n.def.maxLevel" class="n-check">✓</div>
        <div v-else-if="n.state === 'locked'" class="n-check">🔒</div>
      </div>
    </div>

    <!-- 选中/悬停节点详情 -->
    <div class="detail" v-if="detail">
      <div class="d-top"><span class="d-name">{{ detail.def.name }}</span><span class="d-cost">¥{{ detail.def.cost }}{{ detail.def.maxLevel > 1 ? ` · Lv.${detail.lvl}/${detail.def.maxLevel}` : '' }}</span></div>
      <div class="d-desc">{{ detail.def.desc }}</div>
      <div class="d-foot">
        <span v-if="detail.def.corruptionGate" class="d-gate">需堕落度 ≥ {{ detail.def.corruptionGate[detail.lvl] ?? '—' }}</span>
        <span v-if="detail.def.corruptionOnBuy" class="d-corr">购买 · 堕落度 +{{ detail.def.corruptionOnBuy }}</span>
        <button class="buy" :disabled="!detail.can.ok" @click="r.buyUpgrade(detail.def.id)">
          {{ detail.lvl >= detail.def.maxLevel ? '已满级' : (detail.can.ok ? (detail.lvl > 0 || detail.def.maxLevel > 1 ? '升级 ▲' : '建造 ▲') : detail.can.reason) }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRunnerStore } from '../runner-store';
import { canUpgrade, getLevel, UPGRADES_BY_ID } from '../../../game/upgrade/machine';
import { SKILL_PAGES, NODE_META, pageUnlocked, nodesOfPage, nodePrereqIds } from '../../../game/upgrade/skilltree';
import type { UpgradeDef } from '../../../game/upgrade/types';
import type { SkillPage } from '../../../game/upgrade/skilltree';

const r = useRunnerStore();
const COL_W = 168, ROW_H = 96, NODE_W = 132, NODE_H = 60, PAD = 16;

const pages = computed(() => SKILL_PAGES.map(p => ({ ...p, open: pageUnlocked(p, r.engine.unlocked) })));
const curPage = ref('house');
const curPageObj = computed(() => pages.value.find(p => p.id === curPage.value) ?? null);

interface Node { def: UpgradeDef; lvl: number; can: { ok: boolean; reason?: string }; state: string; x: number; y: number; }

function nodeState(def: UpgradeDef, lvl: number, can: { ok: boolean; reason?: string }): string {
  if (lvl >= def.maxLevel) return 'maxed';
  if (lvl > 0) return 'owned';
  if (can.ok) return 'buyable';
  if (can.reason === '前置未满足') return 'locked';
  return 'pending'; // 钱/堕落不足:可见但暂买不起
}

const nodes = computed<Node[]>(() => nodesOfPage(curPage.value).map(def => {
  const m = NODE_META[def.id];
  const lvl = getLevel(r.engine.upgrades, def.id);
  const can = canUpgrade(def, r.engine as any);
  // 从上到下:col=前置链深度(纵·根在上后置在下),row=同层并列(横)
  return { def, lvl, can, state: nodeState(def, lvl, can), x: PAD + m.row * COL_W, y: PAD + m.col * ROW_H };
}));

const nodeById = computed(() => Object.fromEntries(nodes.value.map(n => [n.def.id, n])));

const links = computed(() => {
  const out: { x1: number; y1: number; x2: number; y2: number; done: boolean }[] = [];
  for (const n of nodes.value) {
    for (const pid of nodePrereqIds(n.def)) {
      const p = nodeById.value[pid]; if (!p) continue;
      out.push({
        x1: p.x + NODE_W / 2, y1: p.y + NODE_H,
        x2: n.x + NODE_W / 2, y2: n.y,
        done: p.lvl >= (UPGRADES_BY_ID[pid]?.requires?.find(rq => rq.upgradeId === pid)?.minLevel ?? 1),
      });
    }
  }
  return out;
});

const canvasW = computed(() => Math.max(...nodes.value.map(n => n.x + NODE_W), 300) + PAD);
const canvasH = computed(() => Math.max(...nodes.value.map(n => n.y + NODE_H), 120) + PAD);

const selected = ref<Node | null>(null);
const hover = ref<Node | null>(null);
const detail = computed(() => hover.value ?? selected.value);

function onNode(n: Node) {
  selected.value = n;
  if (n.can.ok) r.buyUpgrade(n.def.id);
}
function unlockNodeName(p: SkillPage): string {
  return p.unlockedByNode ? (UPGRADES_BY_ID[p.unlockedByNode]?.name ?? p.unlockedByNode) : '对应设施';
}
</script>

<style scoped>
.tree { padding: 16px 22px; overflow-y: auto; height: 100%; display: flex; flex-direction: column; }
.tree-head { display: flex; align-items: baseline; gap: 14px; }
.th-title { font-family: var(--brush); font-size: 26px; color: var(--gold-hi); }
.th-stats { margin-left: auto; display: flex; gap: 16px; font-size: 13px; color: var(--text-dim); }
.th-stats b { color: var(--gold-hi); font-size: 15px; }

.pg-tabs { display: flex; flex-wrap: wrap; gap: 7px; margin: 12px 0 8px; }
.pg-tab { font-family: var(--serif); font-size: 14px; color: var(--text-dim); background: rgba(0,0,0,.3); border: 1px solid var(--line); border-radius: 7px; padding: 7px 14px; cursor: pointer; transition: .12s; }
.pg-tab:hover:not(:disabled) { color: var(--text); border-color: var(--gold-dim); }
.pg-tab.active { color: var(--gold-hi); border-color: var(--gold); background: linear-gradient(180deg, rgba(201,162,74,.16), rgba(0,0,0,.2)); }
.pg-tab.locked { opacity: .5; cursor: not-allowed; }
.pg-lock { margin-left: 5px; font-size: 11px; }
.pg-narr { font-size: 12px; color: var(--text-dim); line-height: 1.7; margin-bottom: 10px; max-width: 820px; }
.u-feedback { margin-bottom: 10px; padding: 8px 13px; border-radius: 7px; font-size: 13px; }
.u-feedback.ok { background: rgba(94,122,72,.12); border: 1px solid #3a4a2a; color: var(--green); }
.u-feedback.bad { background: rgba(179,33,46,.1); border: 1px solid var(--red); color: var(--red-hi); }
.locked-page { padding: 30px; text-align: center; color: var(--text-dim); border: 1px dashed var(--gold-dim); border-radius: 12px; max-width: 560px; margin: 20px auto; line-height: 1.8; }
.locked-page b { color: var(--gold); }

.canvas { position: relative; flex: 1; min-height: 200px; }
.links { position: absolute; left: 0; top: 0; pointer-events: none; }
.links line { stroke: var(--line); stroke-width: 2; }
.links line.done { stroke: var(--gold); }
.node { position: absolute; width: 132px; height: 60px; border-radius: 9px; border: 1px solid var(--line); background: linear-gradient(180deg, var(--panel), var(--panel-2)); padding: 8px 10px; cursor: pointer; transition: .12s; display: flex; flex-direction: column; justify-content: center; }
.node:hover { transform: translateY(-2px); }
.node .n-name { font-size: 13px; color: var(--text); line-height: 1.25; }
.node .n-lvl { font-size: 11px; color: var(--gold-dim); margin-top: 3px; }
.node .n-check { position: absolute; top: 5px; right: 8px; font-size: 12px; color: var(--gold-hi); }
.node.maxed { border-color: var(--gold); background: linear-gradient(180deg, rgba(201,162,74,.22), rgba(0,0,0,.25)); }
.node.owned { border-color: var(--gold-dim); }
.node.buyable { border-color: var(--gold-hi); box-shadow: 0 0 10px rgba(236,200,120,.35); }
.node.pending { border-color: rgba(179,33,46,.4); }
.node.locked { opacity: .45; }

.detail { flex: none; margin-top: 12px; border: 1px solid var(--gold-dim); border-radius: 9px; background: rgba(18,12,11,.8); padding: 12px 16px; }
.d-top { display: flex; align-items: baseline; gap: 12px; }
.d-name { font-size: 16px; color: var(--gold-hi); }
.d-cost { margin-left: auto; font-size: 12px; color: var(--gold); }
.d-desc { font-size: 12px; color: var(--text-dim); line-height: 1.6; margin: 7px 0; }
.d-foot { display: flex; align-items: center; gap: 12px; }
.d-gate { font-size: 11px; color: var(--red-hi); }
.d-corr { font-size: 11px; color: var(--rose-hi); }
.buy { margin-left: auto; font-family: var(--serif); background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; border-radius: 6px; padding: 8px 18px; font-size: 13px; font-weight: 700; cursor: pointer; }
.buy:disabled { background: rgba(0,0,0,.3); color: var(--text-dim); border: 1px solid var(--line); cursor: not-allowed; font-weight: 400; }
</style>

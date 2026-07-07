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

    <!-- 技能树画布(独立滚动区·可拖拽平移·不再遮盖下方详情) -->
    <div v-else class="canvas-wrap" ref="wrapEl"
      @pointerdown="panStart" @pointermove="panMove" @pointerup="panEnd" @pointercancel="panEnd">
      <div class="canvas" :style="{ width: canvasW + 'px', height: canvasH + 'px' }">
        <svg class="links" :width="canvasW" :height="canvasH">
          <line v-for="(l, i) in links" :key="i" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2"
            :class="{ done: l.done }" />
        </svg>
        <div v-for="n in nodes" :key="n.def.id" class="node" :class="[n.state, { mystery: n.def.mystery }]" :style="{ left: n.x + 'px', top: n.y + 'px' }"
          @click="onNode(n)" @mouseenter="hover = n" @mouseleave="hover = null">
          <div class="n-name">{{ n.def.mystery && n.lvl === 0 ? '？？？' : n.def.name }}<span v-if="n.def.mystery" class="n-heart">♥</span></div>
          <div class="n-lvl">{{ n.def.mystery ? (n.lvl > 0 ? '已解禁' : '待解禁') : (n.def.maxLevel > 1 ? `Lv.${n.lvl}/${n.def.maxLevel}` : (n.lvl > 0 ? '已建' : `¥${n.def.cost}`)) }}</div>
          <div v-if="n.lvl >= n.def.maxLevel" class="n-check">✓</div>
          <div v-else-if="!n.def.mystery && n.state === 'locked'" class="n-check">🔒</div>
        </div>
      </div>
    </div>

    <!-- 选中/悬停节点详情 -->
    <div class="detail" v-if="detail" :class="{ 'detail-myst': detail.def.mystery }">
      <!-- ???未解禁:只显条件不显内容 -->
      <template v-if="detail.def.mystery && detail.lvl === 0">
        <div class="d-top"><span class="d-name rose">？？？ <span class="n-heart">♥</span></span><span class="d-cost">自动解禁 · 无需花费</span></div>
        <div class="d-desc dim">尚未揭晓的变化正在酝酿……满足条件后将自动降临。</div>
        <div class="d-reqs">
          <span v-for="(q, i) in mysteryReqs(detail.def)" :key="i" class="d-req">{{ q }}</span>
        </div>
      </template>
      <template v-else>
        <div class="d-top"><span class="d-name" :class="{ rose: detail.def.mystery }">{{ detail.def.name }}<span v-if="detail.def.mystery" class="n-heart"> ♥</span></span>
          <span class="d-cost">{{ detail.def.mystery ? '已解禁' : `¥${detail.def.cost}` }}{{ detail.def.maxLevel > 1 ? ` · Lv.${detail.lvl}/${detail.def.maxLevel}` : '' }}</span></div>
        <div class="d-desc">{{ detail.def.desc }}</div>
        <div class="d-foot">
          <span v-if="detail.def.corruptionGate" class="d-gate">需堕落度 ≥ {{ detail.def.corruptionGate[detail.lvl] ?? '—' }}</span>
          <span v-if="detail.def.corruptionOnBuy" class="d-corr">{{ detail.def.mystery ? '解禁' : '购买' }} · 堕落度 +{{ detail.def.corruptionOnBuy }}</span>
          <span v-if="detail.def.infamyOnBuy" class="d-corr">淫名 +{{ detail.def.infamyOnBuy }}</span>
          <button v-if="!detail.def.mystery" class="buy" :disabled="!detail.can.ok" @click="r.buyUpgrade(detail.def.id)">
            {{ detail.lvl >= detail.def.maxLevel ? '已满级' : (detail.can.ok ? (detail.lvl > 0 || detail.def.maxLevel > 1 ? '升级 ▲' : '建造 ▲') : detail.can.reason) }}
          </button>
        </div>
      </template>
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
// 缩小节点与网格,整树尽量放得下;放不下时画布区可滚动/拖拽平移
const COL_W = 126, ROW_H = 70, NODE_W = 104, NODE_H = 48, PAD = 10;

// —— 画布拖拽平移(按住空白处拖动;点节点不触发) ——
const wrapEl = ref<HTMLElement | null>(null);
let panning = false, panSX = 0, panSY = 0, panLeft = 0, panTop = 0;
function panStart(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('.node')) return; // 节点上不平移,保留点击
  const el = wrapEl.value; if (!el) return;
  panning = true; panSX = e.clientX; panSY = e.clientY; panLeft = el.scrollLeft; panTop = el.scrollTop;
  el.setPointerCapture(e.pointerId);
}
function panMove(e: PointerEvent) {
  if (!panning) return;
  const el = wrapEl.value; if (!el) return;
  el.scrollLeft = panLeft - (e.clientX - panSX);
  el.scrollTop = panTop - (e.clientY - panSY);
}
function panEnd(e: PointerEvent) {
  if (!panning) return;
  panning = false;
  try { wrapEl.value?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
}

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
  if (!n.def.mystery && n.can.ok) r.buyUpgrade(n.def.id);
}

/** ???未解禁时悬停可见的条件列表(前置若也是未解禁???则不剧透名字) */
function mysteryReqs(def: UpgradeDef): string[] {
  const out: string[] = [];
  for (const rq of def.requires ?? []) {
    if (!rq.upgradeId) continue;
    const p = UPGRADES_BY_ID[rq.upgradeId];
    const hidden = p?.mystery && getLevel(r.engine.upgrades, p.id) === 0;
    out.push(`前置：${hidden ? '？？？' : (p?.name ?? rq.upgradeId)}`);
  }
  if (def.corruptionRequired != null) out.push(`堕落度 ≥ ${def.corruptionRequired}`);
  if (def.requiresSlotsMax) out.push('行动格已达上限(15)');
  return out;
}
function unlockNodeName(p: SkillPage): string {
  return p.unlockedByNode ? (UPGRADES_BY_ID[p.unlockedByNode]?.name ?? p.unlockedByNode) : '对应设施';
}
</script>

<style scoped>
.tree { padding: 14px 20px; overflow: hidden; height: 100%; display: flex; flex-direction: column; }
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

.canvas-wrap { flex: 1; min-height: 120px; overflow: auto; cursor: grab; border: 1px dashed rgba(201,162,74,.14); border-radius: 8px; }
.canvas-wrap:active { cursor: grabbing; }
.canvas { position: relative; flex: none; }
.links { position: absolute; left: 0; top: 0; pointer-events: none; }
.links line { stroke: var(--line); stroke-width: 2; }
.links line.done { stroke: var(--gold); }
.node { position: absolute; width: 104px; height: 48px; border-radius: 7px; border: 1px solid var(--line); background: linear-gradient(180deg, var(--panel), var(--panel-2)); padding: 5px 8px; cursor: pointer; transition: .12s; display: flex; flex-direction: column; justify-content: center; }
.node:hover { transform: translateY(-2px); }
.node .n-name { font-size: 11.5px; color: var(--text); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.node .n-lvl { font-size: 10px; color: var(--gold-dim); margin-top: 2px; }
.node .n-check { position: absolute; top: 3px; right: 6px; font-size: 11px; color: var(--gold-hi); }
.node.maxed { border-color: var(--gold); background: linear-gradient(180deg, rgba(201,162,74,.22), rgba(0,0,0,.25)); }
.node.owned { border-color: var(--gold-dim); }
.node.buyable { border-color: var(--gold-hi); box-shadow: 0 0 10px rgba(236,200,120,.35); }
.node.pending { border-color: rgba(179,33,46,.4); }
.node.locked { opacity: .45; }
/* ???节点:绯红边框+♥(与金边区分) */
.node.mystery { border-color: var(--rose) !important; box-shadow: 0 0 8px rgba(210,74,106,.25) !important; }
.node.mystery.maxed { border-color: var(--rose-hi) !important; background: linear-gradient(180deg, rgba(210,74,106,.16), rgba(0,0,0,.25)); }
.node.mystery .n-lvl { color: var(--rose-hi); }
.n-heart { color: var(--rose-hi); margin-left: 4px; font-size: 12px; }
.d-name.rose { color: var(--rose-hi); }
.d-desc.dim { color: var(--text-dim); font-style: italic; }
.d-reqs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.d-req { font-size: 12px; color: var(--rose-hi); border: 1px solid rgba(210,74,106,.45); background: rgba(210,74,106,.08); border-radius: 5px; padding: 4px 10px; }
.detail-myst { border-color: var(--rose) !important; }

.detail { flex: none; margin-top: 10px; border: 1px solid var(--gold-dim); border-radius: 9px; background: rgba(18,12,11,.92); padding: 10px 14px; max-height: 30vh; overflow-y: auto; position: relative; z-index: 5; }
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

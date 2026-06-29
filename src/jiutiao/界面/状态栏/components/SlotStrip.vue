<!--
  SlotStrip · 事件格横条（对齐日夜滑条的分格）
  职责: 把当天 白天格+夜晚格 排成一条等宽长条，每格=一个事件格预览(序号/状态/简标签)。
        点选某格 → emit select(period,index)，由 App 在下方子页展示该格的事件选择/正文。
        格数增加只是横条变长，玩家不需上下滚动。
  状态色: 白天格金顶边 / 夜晚格红顶边；空/已排/进行中/已结算/锁定 各异。
-->
<template>
  <div class="strip">
    <div v-for="c in cells" :key="c.key"
      class="cell" :class="[c.period, c.statusClass, { sel: c.key === selectedKey, cur: c.isCur }]"
      :title="c.label" @click="$emit('select', c.period, c.index)">
      <div class="no">{{ c.cn }}</div>
      <div class="lbl">{{ c.label }}</div>
      <div class="st">{{ c.st }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DayState, ActionSlot, SlotPeriod } from '../../../game/action-grid/types';

const props = defineProps<{ day: DayState; selectedKey: string | null }>();
defineEmits<{ select: [period: SlotPeriod, index: number] }>();

const CN = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾'];

function cellOf(slot: ActionSlot, period: SlotPeriod) {
  const cur = props.day.cursor;
  const isCur = cur?.period === period && cur?.index === slot.index;
  let st = '○'; let statusClass = 'empty';
  if (slot.locked) { st = '⚠'; statusClass = 'locked'; }
  else if (slot.status === 'done') { st = '✓'; statusClass = 'done'; }
  else if (slot.status === 'running') { st = '●'; statusClass = 'running'; }
  else if (slot.status === 'planned') { st = '●'; statusClass = 'planned'; }
  const label = slot.choice?.label ?? '空';
  return { key: period + '-' + slot.index, period, index: slot.index, cn: CN[slot.index] ?? String(slot.index + 1), label, st, statusClass, isCur };
}

const cells = computed(() => [
  ...props.day.daySlots.map(s => cellOf(s, 'day')),
  ...props.day.nightSlots.map(s => cellOf(s, 'night')),
]);
</script>

<style scoped>
.strip { display: flex; gap: 4px; }
.cell {
  flex: 1 1 0; min-width: 0; cursor: pointer; text-align: center;
  border: 1px solid var(--line); border-radius: 6px; padding: 7px 4px 6px;
  background: linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.4)); transition: .12s;
}
.cell.day { border-top: 3px solid var(--gold-dim); }
.cell.night { border-top: 3px solid rgba(179,33,46,.65); }
.cell:hover { background: rgba(236,200,120,.08); }
.cell.sel { border-color: var(--gold-hi); background: rgba(201,162,74,.14); box-shadow: 0 0 0 1px var(--gold-hi); }
.cell.cur { box-shadow: inset 0 0 0 1px var(--red-hi); }
.cell.done { opacity: .85; }
.no { font-family: var(--brush); font-size: 20px; color: var(--gold); line-height: 1; }
.cell.night .no { color: var(--red-hi); }
.cell.done .no { color: var(--green); }
.lbl { font-size: 11px; color: var(--text-dim); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cell.sel .lbl { color: var(--text); }
.st { font-size: 11px; margin-top: 2px; color: var(--gold-dim); }
.cell.done .st { color: var(--green); }
.cell.planned .st, .cell.running .st { color: var(--gold); }
.cell.locked .st { color: var(--red-hi); }
</style>

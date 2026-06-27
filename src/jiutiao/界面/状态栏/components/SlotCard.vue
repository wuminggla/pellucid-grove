<template>
  <div class="slot-card" :class="{ current: isCurrent, locked: slot.locked }">
    <!-- 卡头 -->
    <div class="card-head" :style="{ cursor: canExpand ? 'pointer' : 'default' }"
      @click="canExpand && $emit('toggle')">
      <span class="slot-idx">{{ period === 'day' ? '白' : '夜' }}{{ slot.index + 1 }}</span>
      <span class="slot-label">
        <template v-if="slot.choice">{{ slot.choice.label }}</template>
        <span v-else class="dim">未安排</span>
      </span>
      <span class="status-tag">
        <span v-if="slot.locked" style="color:#e06666">⚠{{ slot.lockedBy }}</span>
        <span v-else-if="slot.status === 'running'" style="color:#d96a8f">● 进行中</span>
        <span v-else-if="slot.status === 'done'" style="color:#7aa37a">✓</span>
        <span v-else-if="slot.status === 'planned'" style="color:#e8c87a">●</span>
        <span v-else style="color:#8a6b73">○</span>
      </span>
      <span v-if="canExpand" class="caret">{{ expanded ? '▲' : '▼' }}</span>
    </div>

    <!-- 编辑态: 下拉选行动 -->
    <div v-if="!slot.locked && slot.status !== 'done' && slot.status !== 'running'" class="card-edit">
      <select :value="slot.choice?.optionId ?? ''" @change="onSelect">
        <option value="">— 选择{{ period === 'day' ? '经营' : '供奉' }}行动 —</option>
        <option v-for="o in options" :key="o.optionId" :value="o.optionId">{{ o.label }}</option>
      </select>
      <button v-if="slot.choice" class="clear-btn" @click="$emit('clear')">清</button>
    </div>

    <!-- 展开态: 正文 -->
    <div v-if="expanded && canExpand" class="card-body">{{ slot.resultText }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ActionSlot, SlotPeriod } from '../../../game/action-grid/types';

interface MenuOpt { optionId: string; label: string; isNsfw: boolean }

const props = defineProps<{
  slot: ActionSlot;
  period: SlotPeriod;
  options: MenuOpt[];
  isCurrent: boolean;
  expanded: boolean;
}>();

const emit = defineEmits<{
  pick: [optionId: string, label: string];
  clear: [];
  toggle: [];
}>();

const canExpand = computed(() => props.slot.status === 'done' && !!props.slot.resultText);

function onSelect(e: Event) {
  const id = (e.target as HTMLSelectElement).value;
  const opt = props.options.find(o => o.optionId === id);
  if (opt) emit('pick', opt.optionId, opt.label);
}
</script>

<style scoped>
.slot-card {
  background: #1d1216;
  border: 1px solid #3a2128;
  border-radius: 8px;
  overflow: hidden;
}
.slot-card.current {
  background: #241318;
  border-color: #d96a8f;
  box-shadow: 0 0 0 2px rgba(217, 106, 143, 0.27);
}
.slot-card.locked { border-color: #e06666; }
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
}
.slot-idx { font-size: 11px; color: #8a6b73; min-width: 38px; }
.slot-label {
  flex: 1;
  font-size: 13px;
  color: #e8dde0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.slot-label .dim { color: #8a6b73; }
.status-tag { font-size: 12px; }
.caret { font-size: 10px; color: #8a6b73; }
.card-edit {
  display: flex;
  gap: 6px;
  padding: 0 10px 10px;
}
.card-edit select {
  flex: 1;
  background: #0e0809;
  color: #e8dde0;
  border: 1px solid #2c1a20;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
}
.clear-btn {
  background: #3a2128;
  color: #e8dde0;
  border: none;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
}
.card-body {
  padding: 10px 12px;
  border-top: 1px solid #2c1a20;
  font-size: 13.5px;
  color: #e8dde0;
  line-height: 1.75;
  background: #0e0809;
  max-height: 320px;
  overflow-y: auto;
  white-space: pre-wrap;
}
</style>

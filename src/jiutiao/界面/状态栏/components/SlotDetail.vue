<!--
  SlotDetail · 选中事件格的子页
  职责: 展示 SlotStrip 当前选中格的内容——
    · 可编辑(未排/已排未执行): 事件选择界面(选项列表，点选即安排)
    · 进行中: 占位提示
    · 已结算: 该格生成的正文(首字水墨 + 段落保留 white-space:pre-wrap·修复排版失效)
    · 锁定: 锁定来源 + (若已结算)正文
  正文区可滚动；横条选格切换内容，玩家不用上下翻找。
-->
<template>
  <div class="detail" v-if="slot">
    <div class="d-head">
      <span class="d-no">{{ cn }}</span>
      <span class="d-title">{{ slot.choice?.label ?? '未安排' }}</span>
      <span class="d-tag" :class="tagClass">{{ tagText }}</span>
    </div>

    <!-- 已结算正文 -->
    <div v-if="showProse" class="prose"><span class="first">{{ first }}</span>{{ rest }}</div>

    <!-- 进行中 -->
    <div v-else-if="slot.status === 'running'" class="hint-pane">⏳ 本格正在生成…</div>

    <!-- 锁定（未结算） -->
    <div v-else-if="slot.locked" class="hint-pane">⚠ 本格被「{{ slot.lockedBy }}」强占，不可改派。</div>

    <!-- 可编辑：事件选择 -->
    <div v-else class="picker">
      <div class="picker-cap">选择本格{{ period === 'day' ? '经营' : '供奉' }}行动：</div>
      <div class="opts">
        <button v-for="o in options" :key="o.optionId"
          class="opt" :class="{ on: slot.choice?.optionId === o.optionId }"
          @click="$emit('pick', o.optionId, o.label)">
          {{ o.label }}<span v-if="o.isNsfw" class="heart"> ♥</span>
        </button>
      </div>
      <button v-if="slot.choice" class="clear" @click="$emit('clear')">清空本格</button>
    </div>
  </div>
  <div class="detail empty" v-else>从上方横条点选一个事件格查看 / 安排</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ActionSlot, SlotPeriod } from '../../../game/action-grid/types';

interface MenuOpt { optionId: string; label: string; isNsfw: boolean }
const props = defineProps<{ slot: ActionSlot | null; period: SlotPeriod; options: MenuOpt[] }>();
defineEmits<{ pick: [optionId: string, label: string]; clear: [] }>();

const CN = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾'];
const cn = computed(() => props.slot ? (CN[props.slot.index] ?? String(props.slot.index + 1)) : '');
const showProse = computed(() => props.slot?.status === 'done' && !!props.slot.resultText);
const text = computed(() => (props.slot?.resultText ?? '').trim());
const first = computed(() => text.value.slice(0, 1));
const rest = computed(() => text.value.slice(1));
const tagText = computed(() => {
  const s = props.slot; if (!s) return '';
  if (s.locked) return '强占';
  if (s.status === 'done') return '已结算';
  if (s.status === 'running') return '进行中';
  if (s.status === 'planned') return '已安排';
  return '待安排';
});
const tagClass = computed(() => ({
  done: props.slot?.status === 'done',
  wait: props.slot?.status === 'planned',
  nsfw: props.slot?.locked || props.slot?.status === 'running',
}));
</script>

<style scoped>
.detail { border: 1px solid var(--line); border-radius: 8px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); padding: 16px 18px; min-height: 100%; }
.detail.empty { display: flex; align-items: center; justify-content: center; color: var(--text-dim); font-size: 14px; }
.d-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
.d-no { font-family: var(--brush); font-size: 26px; color: var(--gold); }
.d-title { flex: 1; font-size: 18px; color: var(--text); letter-spacing: 1px; }
.d-tag { font-size: 11px; padding: 3px 10px; border-radius: 3px; }
.d-tag.done { background: rgba(94,122,72,.18); color: var(--green); }
.d-tag.wait { background: rgba(201,162,74,.12); color: var(--gold); }
.d-tag.nsfw { background: rgba(179,33,46,.18); color: var(--red-hi); }

.prose { font-size: 15px; line-height: 2; color: var(--text); white-space: pre-wrap; }
.prose .first { font-family: var(--brush); font-size: 32px; color: var(--gold-hi); float: left; line-height: 1; margin: 6px 12px 0 0; }

.hint-pane { color: var(--text-dim); font-size: 14px; padding: 20px 0; text-align: center; }

.picker-cap { font-size: 13px; color: var(--text-dim); margin-bottom: 12px; letter-spacing: 1px; }
.opts { display: flex; flex-direction: column; gap: 8px; }
.opt { text-align: left; font-family: var(--serif); background: rgba(0,0,0,.3); color: var(--text); border: 1px solid var(--line); border-radius: 7px; padding: 12px 16px; font-size: 15px; cursor: pointer; transition: .12s; }
.opt:hover { border-color: var(--gold-dim); background: rgba(236,200,120,.06); }
.opt.on { border-color: var(--gold); background: rgba(201,162,74,.16); color: var(--gold-hi); font-weight: 700; }
.opt .heart { color: var(--red-hi); }
.clear { margin-top: 12px; background: rgba(0,0,0,.3); color: var(--text-dim); border: 1px solid var(--line); border-radius: 6px; padding: 7px 14px; font-size: 12px; cursor: pointer; }
</style>

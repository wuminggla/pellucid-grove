<template>
  <div class="game-screen">
    <!-- 顶部状态栏 -->
    <div class="top-bar">
      <StatusBar :engine="r.engine" :day="r.day" />
    </div>

    <!-- 阶段标签 + 快进 -->
    <div class="tool-row">
      <span class="phase-label">{{ phaseLabel }}</span>
      <span class="ai-mode" :class="r.aiMode">{{ r.aiMode === 'tavern' ? '◆ 酒馆AI' : '○ mock' }}</span>
      <label class="ff-toggle">
        <input type="checkbox" :checked="r.fastForward" @change="onFastForward" />
        快进
      </label>
    </div>

    <!-- 滚动内容 -->
    <div class="content">
      <div v-if="r.error" class="err-box">⚠ {{ r.error }}</div>

      <!-- 分配阶段 -->
      <template v-if="phase === 'allocating'">
        <div class="alloc-hint">分配 {{ r.day.totalSlots }} 行动格（白天经营 / 夜晚供奉；白天0格 = 请假）</div>
        <div class="alloc-btns">
          <button v-for="dayN in allocOptions" :key="dayN"
            class="alloc-btn" :class="{ active: allocated && r.day.dayCount === dayN }"
            @click="r.allocate(dayN, r.day.totalSlots - dayN)">
            白{{ dayN }}/夜{{ r.day.totalSlots - dayN }}
          </button>
        </div>
        <template v-if="allocated">
          <Section v-if="r.day.daySlots.length" title="白天行动安排">
            <SlotGrid period="day" :slots="r.day.daySlots" />
          </Section>
          <Section v-if="r.day.nightSlots.length" title="夜晚行动安排">
            <SlotGrid period="night" :slots="r.day.nightSlots" />
          </Section>
          <button class="primary-btn mt" @click="r.beginDay()">确定分配 · 开始这一天 ▶</button>
        </template>
      </template>

      <!-- 白天阶段 -->
      <Section v-if="phase === 'day_running' || phase === 'day_settled'" title="白天 · A面经营">
        <SlotGrid period="day" :slots="r.day.daySlots" />
      </Section>

      <!-- 夜晚阶段 -->
      <template v-if="phase === 'night_running' || phase === 'night_settled'">
        <Section v-if="r.day.daySlots.length" title="白天 · 已结算" dim>
          <SlotGrid period="day" :slots="r.day.daySlots" />
        </Section>
        <Section title="夜晚 · B面供奉">
          <template #action v-if="phase === 'night_running'">
            <button class="small-btn" @click="r.fillEmpty('night', { optionId: 'serve_vaginal', label: '供奉打手' })">一键全供奉</button>
          </template>
          <SlotGrid period="night" :slots="r.day.nightSlots" />
        </Section>
      </template>

      <!-- 结算反馈 -->
      <div v-if="showSettleFeedback" class="feedback rose-box">
        <div v-if="r.lastSettle?.events.isFirstSpecial" style="color:#d96a8f;font-size:13px">
          ◆ 首次特殊事件！堕落度 +{{ r.lastSettle.events.corruptionGain }}
          <template v-if="r.lastSettle.events.cognitionAdvancedTo">
            → 认知防线推进至「{{ r.lastSettle.events.cognitionAdvancedTo }}」
          </template>
        </div>
        <div v-if="r.lastSettle && r.lastSettle.events.firedGateIds.length" style="color:#e8c87a;font-size:13px;margin-top:4px">
          ◆ 奖励闸门触发：{{ r.lastSettle.events.firedGateIds.join(', ') }}（资源涌入）
        </div>
      </div>

      <!-- 避孕套不足警告 -->
      <div v-if="r.lastServe?.condomShort" class="err-box mt-sm">
        ⚠ 避孕套库存不足！本场出现无套内射风险（怀孕判定链）
      </div>

      <!-- 夜晚收尾 -->
      <div v-if="r.lastNight" class="night-box">
        夜晚收尾：未供奉 {{ r.lastNight.unserved }} 人 → 群体欲望 +{{ r.lastNight.desireGained }}
        <span v-if="r.lastNight.overflow" style="color:#e06666;margin-left:8px">⚠ 欲望溢出！次日将触发强制请假轮奸</span>
      </div>

      <!-- 硬失败 -->
      <div v-if="r.hardFail" class="err-box mt-sm">
        ☠ 硬失败：极道威望连续 2 次审核进账为 0。东山再起的能力已经失去。
      </div>

      <!-- #4 空回/截断警告 + 重新生成 -->
      <div v-if="r.lastWarn" class="warn-box mt-sm">
        ⚠ {{ r.lastWarn }}
        <button class="reroll-btn" :disabled="r.busy" @click="r.rerunLast()">↻ 重新生成</button>
      </div>
    </div>

    <!-- #4 生成中遮罩(明确状态,防误判卡死) -->
    <div v-if="r.busy" class="gen-overlay">
      <div class="gen-box">
        <div class="gen-spinner"></div>
        <div class="gen-text">AI 正在生成本格正文…</div>
        <div class="gen-sub">{{ r.aiMode === 'tavern' ? '调用酒馆 API(可能需数秒到数十秒)' : 'mock 模拟' }}</div>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="bottom-bar">
      <template v-if="phase === 'day_running' || phase === 'night_running'">
        <span v-if="!r.canRunCurrent" class="dim-hint">请先为当前格选择行动</span>
        <!-- 已执行完(非首格)可重 roll -->
        <button v-if="r.lastSettle && !r.busy" class="small-btn" @click="r.rerunLast()">↻ 重生成上一格</button>
        <button class="primary-btn" :disabled="r.busy || !r.canRunCurrent"
          :style="{ opacity: (r.busy || !r.canRunCurrent) ? 0.45 : 1 }"
          @click="r.runCurrent()">
          {{ r.busy ? '生成中…' : '执行当前格 ▶' }}
        </button>
      </template>
      <button v-if="phase === 'day_settled'" class="primary-btn" @click="r.beginNight()">进入夜晚 ▶</button>
      <button v-if="phase === 'night_settled'" class="primary-btn" @click="r.nextDay()">结束今天 · 次日 ▶</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, defineComponent } from 'vue';
import { useRunnerStore } from './runner-store';
import StatusBar from './components/StatusBar.vue';
import SlotCard from './components/SlotCard.vue';
import { buildMenu } from '../../game/events/machine';
import { deriveEventUnlocked } from '../../game/engine/unlocked';
import { demoEventOptions } from '../../game/engine/mock-ai';
import type { EngineState } from '../../game/engine/types';
import type { EventContext } from '../../game/events/types';
import type { SlotPeriod, ActionSlot } from '../../game/action-grid/types';

const r = useRunnerStore();

const phase = computed(() => r.day.phase);

const phaseLabel = computed(() => ({
  allocating: '早 7:00 · 分配今日行动',
  day_running: '白天进行中', day_settled: '白天结束',
  night_running: '夜晚进行中', night_settled: '今日结束',
} as Record<string, string>)[phase.value] ?? phase.value);

const allocated = computed(() => r.day.daySlots.length + r.day.nightSlots.length > 0);
const allocOptions = computed(() => Array.from({ length: r.day.totalSlots + 1 }, (_, i) => i));

const showSettleFeedback = computed(() =>
  !!r.lastSettle && (r.lastSettle.events.isFirstSpecial || r.lastSettle.events.firedGateIds.length > 0));

function eventCtx(engine: EngineState): EventContext {
  return {
    corruption: engine.corruption, cognition: engine.cognition,
    infamy: engine.infamy, thugs: engine.thugTotal,
    triggeredLedger: engine.triggeredSpecials, unlocked: deriveEventUnlocked(engine),
  };
}
function optionsForPeriod(engine: EngineState, period: SlotPeriod) {
  return buildMenu(Object.values(demoEventOptions), eventCtx(engine), period)
    .map(e => ({ optionId: e.option.id, label: e.label, isNsfw: e.isNsfw }));
}

function onFastForward(e: Event) {
  r.setFastForward((e.target as HTMLInputElement).checked);
}

// SlotGrid: 渲染某时段所有格(内联组件,管展开态)
// expandedKey 用 ref(响应式),toggle 改了能触发 SlotGrid 重渲染。
const expandedKey = ref<string | null>(null);

const SlotGrid = defineComponent({
  props: { period: { type: String as () => SlotPeriod, required: true },
           slots: { type: Array as () => ActionSlot[], required: true } },
  setup(props) {
    return () => h('div', { class: 'slot-grid' }, props.slots.map(slot => {
      const key = `${props.period}-${slot.index}`;
      const opts = optionsForPeriod(r.engine, props.period);
      return h(SlotCard, {
        key,
        slot, period: props.period, options: opts,
        isCurrent: r.day.cursor?.period === props.period && r.day.cursor?.index === slot.index,
        expanded: expandedKey.value === key,
        onToggle: () => { expandedKey.value = expandedKey.value === key ? null : key; },
        onPick: (optionId: string, label: string) => {
          // av_custom 弹编辑器留待 AvEditor 翻译;先直接 setChoice
          r.setChoice(props.period, slot.index, { optionId, label });
        },
        onClear: () => r.clearChoice(props.period, slot.index),
      });
    }));
  },
});

// Section: 带标题的区块
const Section = defineComponent({
  props: { title: String, dim: Boolean },
  setup(props, { slots }) {
    return () => h('div', { class: ['section', { dim: props.dim }] }, [
      h('div', { class: 'section-head' }, [
        h('div', { class: 'section-title' }, props.title),
        slots.action?.(),
      ]),
      slots.default?.(),
    ]);
  },
});
</script>

<style scoped>
.game-screen {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #140c0f;
  color: #e8dde0;
}
.top-bar { padding: 8px 12px; border-bottom: 1px solid #3a2128; }
.tool-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 18px;
  border-bottom: 1px solid #2c1a20;
}
.phase-label { font-size: 13px; color: #8a6b73; letter-spacing: 1px; }
.ai-mode { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.ai-mode.tavern { color: #7aa37a; background: rgba(122, 163, 122, 0.12); }
.ai-mode.mock { color: #e8a87a; background: rgba(232, 168, 122, 0.12); }
.ff-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #8a6b73;
  cursor: pointer;
  margin-left: auto;
}
.content { flex: 1; overflow-y: auto; padding: 18px; }
.err-box {
  margin-bottom: 12px;
  padding: 10px;
  background: #3a1518;
  border: 1px solid #e06666;
  border-radius: 6px;
  color: #e06666;
  font-size: 13px;
}
.mt-sm { margin-top: 10px; }
.alloc-hint { font-size: 13px; color: #b08a93; letter-spacing: 1px; margin-bottom: 10px; }
.alloc-btns { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.alloc-btn {
  background: #2c1a20;
  color: #b08a93;
  border: none;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
}
.alloc-btn.active { background: #d96a8f; color: #1a0e12; font-weight: 700; }
.primary-btn {
  background: #d96a8f;
  color: #1a0e12;
  border: none;
  border-radius: 6px;
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.primary-btn:disabled { cursor: not-allowed; }
.small-btn {
  background: #3a2128;
  color: #e8dde0;
  border: none;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
}
.mt { margin-top: 8px; }
.feedback { margin-top: 14px; padding: 12px; border-radius: 8px; }
.rose-box { background: #22141a; border: 1px solid #d96a8f; }
.night-box {
  margin-top: 10px;
  padding: 10px;
  background: #1a1420;
  border: 1px solid #2c1a20;
  border-radius: 6px;
  font-size: 13px;
  color: #8a6b73;
}
.dim-hint { font-size: 12px; color: #8a6b73; margin-right: auto; }
.warn-box {
  padding: 10px 12px;
  background: rgba(232, 168, 122, 0.1);
  border: 1px solid #e8a87a;
  border-radius: 6px;
  color: #e8a87a;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.reroll-btn {
  margin-left: auto;
  background: #e8a87a;
  color: #1a0e12;
  border: none;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.reroll-btn:disabled { opacity: 0.5; cursor: not-allowed; }
/* 生成中遮罩 */
.gen-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 6, 8, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.gen-box { text-align: center; }
.gen-spinner {
  width: 36px;
  height: 36px;
  margin: 0 auto 14px;
  border: 3px solid #3d2828;
  border-top-color: #d96a8f;
  border-radius: 50%;
  animation: pellucid-spin 0.8s linear infinite;
}
@keyframes pellucid-spin { to { transform: rotate(360deg); } }
.gen-text { font-size: 15px; color: #e8c87a; letter-spacing: 1px; }
.gen-sub { font-size: 12px; color: #8a6b73; margin-top: 6px; }
.bottom-bar {
  border-top: 1px solid #3a2128;
  padding: 12px 18px;
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  background: #0e0809;
}
:deep(.slot-grid) { display: flex; flex-direction: column; gap: 8px; }
:deep(.section) { margin-bottom: 18px; }
:deep(.section.dim) { opacity: 0.55; }
:deep(.section-head) { display: flex; align-items: center; margin-bottom: 10px; }
:deep(.section-title) {
  flex: 1;
  font-size: 13px;
  color: #b08a93;
  letter-spacing: 2px;
  border-left: 3px solid #d96a8f;
  padding-left: 8px;
}
</style>

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
        <div v-if="r.engine.desire >= r.engine.desireCapacity" class="morning-box">
          ⚠ 群体欲望 {{ r.engine.desire }}/{{ r.engine.desireCapacity }} 已超上限！务必在日终前安排足够供奉格把它压回上限以内，否则次日强制请假轮奸。
        </div>
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

      <!-- 招募即时反馈 -->
      <div v-if="r.lastRecruit && r.lastRecruit.recruited > 0" class="night-box" style="color:#7aa37a;border-color:#3a4a2a">
        ◆ 招募即时入伙：+{{ r.lastRecruit.recruited }} 打手（花费 ¥{{ r.lastRecruit.cost }}）→ 当前打手 {{ r.engine.thugTotal }}，剩余周额度 {{ r.engine.recruitQuota }}
      </div>
      <div v-else-if="r.lastRecruit && r.lastRecruit.reason" class="warn-box mt-sm">
        招募未成：{{ r.lastRecruit.reason === 'no_quota' ? '本周招募额度已用尽（每周刷新，威望越高额度越多）' : '资金不足' }}
      </div>

      <!-- 采购避孕套即时反馈 -->
      <div v-if="r.lastBuyCondom && r.lastBuyCondom.bought > 0" class="night-box" style="color:#7aa37a;border-color:#3a4a2a">
        ◆ 采购到货：+{{ r.lastBuyCondom.bought }} 避孕套（花费 ¥{{ r.lastBuyCondom.cost }}）→ 当前库存 {{ r.engine.condomStock }}
      </div>
      <div v-else-if="r.lastBuyCondom && r.lastBuyCondom.reason" class="warn-box mt-sm">
        采购未成：资金不足
      </div>

      <!-- 夜晚收尾 -->
      <div v-if="r.lastNight" class="night-box">
        夜晚收尾：今日已供奉 {{ r.lastNight.servedToday }} 人 · 结余欲望 {{ r.lastNight.desireLeftover }}/{{ r.engine.desireCapacity }}
        <span v-if="r.lastNight.overflowImminent" style="color:#e06666;margin-left:8px">⚠ 结余超上限！次日触发强制请假轮奸</span>
      </div>

      <!-- 再生力预警(第1次坏审核·留1回合缓冲·设计补遗_A) -->
      <div v-for="(w, i) in r.failWarnings" :key="i" class="warn-box mt-sm">{{ w }}</div>

      <!-- 硬失败 -->
      <div v-if="r.hardFail" class="err-box mt-sm">
        ☠ 硬失败：{{ r.hardFailReason === 'money'
          ? '资金余额连续 2 次结算为 0/负，现金流断裂。'
          : '极道威望连续 2 次审核进账为 0，招牌再也榨不出人和钱。' }}九条会东山再起的能力已经失去。
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
        <div class="gen-text">{{ r.genHint }}</div>
        <div class="gen-sub">{{ r.aiMode === 'tavern' ? '调用酒馆 API(可能需数秒到数十秒)' : 'mock 模拟' }}</div>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="bottom-bar">
      <!-- 重生成上一格: 只要刚跑完一格且尚未推进到下一面/次日就能重 roll(running 与 settled 阶段都在);进入夜晚/次日后快照失效自动隐藏 -->
      <button v-if="canRerun" class="small-btn" @click="r.rerunLast()">↻ 重生成上一格</button>
      <template v-if="phase === 'day_running' || phase === 'night_running'">
        <span v-if="!r.canRunCurrent" class="dim-hint">请先为当前格选择行动</span>
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

// 重生成上一格可用: 刚跑完一格(有 lastSettle)、未在生成中、仍停留在该格所在的执行/结算面。
// nextDay/beginNight 会清掉 lastSettle+快照,推进后此按钮自动消失(防误回退已离开的格)。
const canRerun = computed(() =>
  !!r.lastSettle && !r.busy
  && ['day_running', 'night_running', 'day_settled', 'night_settled'].includes(phase.value));

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
.morning-box {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: rgba(232, 200, 122, 0.08);
  border: 1px solid #c9a24a;
  border-radius: 6px;
  color: #e8c87a;
  font-size: 13px;
  line-height: 1.5;
}
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

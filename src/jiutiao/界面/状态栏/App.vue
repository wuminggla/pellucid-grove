<!--
  App · 新 UI 外壳（极道手账）
  布局: CSS Grid 三列两行（顶栏跨列）= Masthead / NavRail / Stage(行动视图) / RinPanel。
  职责: 组合各组件 + 按 view 切换页签 + 「行动」视图的完整编排（分配/逐格执行/反馈/遮罩）。
  业务调用复用 runner-store（allocate/runCurrent/rerunLast/nextDay 等）。详见 docs/UI改版工程说明.md。
-->
<template>
  <div class="app" @click="closePins">
    <Masthead ref="mast" :engine="r.engine" :day="r.day" />
    <NavRail v-model:view="view" @action="onNav" />

    <main class="stage">
      <!-- ===== 行动视图 ===== -->
      <template v-if="view === '行动'">
        <div class="tool-row">
          <span class="phase-label">{{ phaseLabel }}</span>
          <span class="ai-mode" :class="r.aiMode">{{ r.aiMode === 'tavern' ? '◆ 酒馆AI' : '○ mock' }}</span>
          <label class="ff"><input type="checkbox" :checked="r.fastForward" @change="onFF" /> 快进</label>
        </div>

        <div v-if="r.error" class="err-box">⚠ {{ r.error }}</div>

        <!-- 分配阶段：滑动长条 + 预排格子 -->
        <template v-if="phase === 'allocating'">
          <DaySlider :total="r.day.totalSlots" @change="onAllocate" />
          <template v-if="allocated">
            <div v-if="r.day.daySlots.length" class="section-head"><div class="section-title">白天 · 经营安排</div></div>
            <div v-if="r.day.daySlots.length" class="grid">
              <SlotCard v-for="(s, i) in r.day.daySlots" :key="'d'+i" :slot="s" period="day"
                :options="opts('day')" :isCurrent="false" :expanded="false"
                @pick="(o,l)=>r.setChoice('day', i, { optionId:o, label:l })" @clear="r.clearChoice('day', i)" />
            </div>
            <div v-if="r.day.nightSlots.length" class="section-head"><div class="section-title">夜晚 · 供奉安排</div></div>
            <div v-if="r.day.nightSlots.length" class="grid">
              <SlotCard v-for="(s, i) in r.day.nightSlots" :key="'n'+i" :slot="s" period="night"
                :options="opts('night')" :isCurrent="false" :expanded="false"
                @pick="(o,l)=>r.setChoice('night', i, { optionId:o, label:l })" @clear="r.clearChoice('night', i)" />
            </div>
          </template>
        </template>

        <!-- 白天执行 -->
        <template v-if="phase === 'day_running' || phase === 'day_settled'">
          <div class="section-head"><div class="section-title">白天 · 经营</div></div>
          <div class="grid"><SlotCard v-for="(s, i) in r.day.daySlots" :key="'D'+i" :slot="s" period="day"
            :options="opts('day')" :isCurrent="isCur('day', i)" :expanded="exp==='day-'+i"
            @pick="(o,l)=>r.setChoice('day', i, { optionId:o, label:l })" @clear="r.clearChoice('day', i)"
            @toggle="toggle('day', i)" /></div>
        </template>

        <!-- 夜晚执行 -->
        <template v-if="phase === 'night_running' || phase === 'night_settled'">
          <div v-if="r.day.daySlots.length" class="section-head dim"><div class="section-title">白天 · 已结算</div></div>
          <div v-if="r.day.daySlots.length" class="grid dim"><SlotCard v-for="(s, i) in r.day.daySlots" :key="'Dd'+i" :slot="s" period="day"
            :options="opts('day')" :isCurrent="false" :expanded="exp==='day-'+i" @toggle="toggle('day', i)" /></div>
          <div class="section-head"><div class="section-title">夜晚 · 供奉</div>
            <button v-if="phase==='night_running'" class="mini-btn" @click="r.fillEmpty('night', { optionId:'serve_vaginal', label:'供奉打手' })">一键全供奉</button>
          </div>
          <div class="grid"><SlotCard v-for="(s, i) in r.day.nightSlots" :key="'N'+i" :slot="s" period="night"
            :options="opts('night')" :isCurrent="isCur('night', i)" :expanded="exp==='night-'+i"
            @pick="(o,l)=>r.setChoice('night', i, { optionId:o, label:l })" @clear="r.clearChoice('night', i)"
            @toggle="toggle('night', i)" /></div>
        </template>

        <!-- ===== 反馈区 ===== -->
        <div v-if="r.engine.desire >= r.engine.desireCapacity" class="morning-box">
          ⚠ 群体欲望 {{ r.engine.desire }}/{{ r.engine.desireCapacity }} 已超上限！务必在日终前安排足够供奉格压回上限以内，否则次日「白日供奉」。
        </div>
        <div v-for="(w, i) in r.failWarnings" :key="'w'+i" class="warn-box">{{ w }}</div>
        <div v-if="r.lastRecruit && r.lastRecruit.recruited > 0" class="ok-box">◆ 招募即时入伙：+{{ r.lastRecruit.recruited }} 打手（¥{{ r.lastRecruit.cost }}）→ 当前 {{ r.engine.thugTotal }}，剩余额度 {{ r.engine.recruitQuota }}</div>
        <div v-else-if="r.lastRecruit && r.lastRecruit.reason" class="warn-box">招募未成：{{ r.lastRecruit.reason === 'no_quota' ? '本周额度已用尽' : '资金不足' }}</div>
        <div v-if="r.lastBuyCondom && r.lastBuyCondom.bought > 0" class="ok-box">◆ 采购到货：+{{ r.lastBuyCondom.bought }} 避孕套（¥{{ r.lastBuyCondom.cost }}）→ 库存 {{ r.engine.condomStock }}</div>
        <div v-if="showSettle" class="rose-box">
          <div v-if="r.lastSettle?.events.isFirstSpecial" style="color:var(--red-hi)">◆ 首次特殊事件！堕落度 +{{ r.lastSettle.events.corruptionGain }}<template v-if="r.lastSettle.events.cognitionAdvancedTo"> → 认知防线推进至「{{ r.lastSettle.events.cognitionAdvancedTo }}」</template></div>
          <div v-if="r.lastSettle && r.lastSettle.events.firedGateIds.length" style="color:var(--gold-hi);margin-top:4px">◆ 堕落度奖励触发：{{ gateLabel }}（资源涌入）</div>
        </div>
        <div v-if="r.lastServe?.condomShort" class="err-box">⚠ 避孕套库存不足！本场出现无套内射风险（怀孕判定链）</div>
        <div v-if="r.lastNight" class="night-box">夜晚收尾：今日已供奉 {{ r.lastNight.servedToday }} 人 · 结余欲望 {{ r.lastNight.desireLeftover }}/{{ r.engine.desireCapacity }}<span v-if="r.lastNight.overflowImminent" style="color:var(--red-hi);margin-left:8px">⚠ 结余超上限！次日「白日供奉」</span></div>
        <div v-if="r.hardFail" class="err-box">☠ 硬失败：{{ r.hardFailReason === 'money' ? '资金连续 2 次结算为 0/负，现金流断裂。' : '极道威望连续 2 次审核进账为 0，招牌再也榨不出人和钱。' }}九条会东山再起的能力已经失去。</div>
        <div v-if="r.lastWarn" class="warn-box reroll">⚠ {{ r.lastWarn }}<button class="mini-btn" :disabled="r.busy" @click="r.rerunLast()">↻ 重新生成</button></div>

        <!-- 已结算正文 -->
        <div v-if="r.lastSettle?.resultText && phase !== 'allocating'" class="prose"><span class="first">{{ proseFirst }}</span>{{ proseRest }}</div>

        <!-- 底部操作 -->
        <div class="cta">
          <button v-if="canRerun" class="ghost-btn" @click="r.rerunLast()">↻ 重生成上一格</button>
          <template v-if="phase === 'day_running' || phase === 'night_running'">
            <span v-if="!r.canRunCurrent" class="dim-hint">请先为当前格选择行动</span>
            <button class="primary-btn" :disabled="r.busy || !r.canRunCurrent" @click="r.runCurrent()">{{ r.busy ? '生成中…' : '执行当前格 ▶' }}</button>
          </template>
          <button v-if="phase === 'allocating' && allocated" class="primary-btn" @click="r.beginDay()">确定分配 · 开始这一天 ▶</button>
          <button v-if="phase === 'day_settled'" class="primary-btn" @click="r.beginNight()">进入夜晚 ▶</button>
          <button v-if="phase === 'night_settled'" class="primary-btn" @click="r.nextDay()">结束今天 · 次日 ▶</button>
        </div>
      </template>

      <!-- ===== 其它页签：占位 ===== -->
      <div v-else class="placeholder">
        <div class="ph-t">{{ view }}</div>
        <div class="ph-s">此面板待玩法接入（见 UI改版工程说明.md §2）</div>
      </div>
    </main>

    <RinPanel :engine="r.engine" />

    <!-- 生成中遮罩 -->
    <div v-if="r.busy" class="gen-overlay">
      <div class="gen-box"><div class="gen-spinner"></div><div class="gen-text">{{ r.genHint }}</div>
        <div class="gen-sub">{{ r.aiMode === 'tavern' ? '调用酒馆 API（可能需数秒到数十秒）' : 'mock 模拟' }}</div></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRunnerStore } from './runner-store';
import Masthead from './components/Masthead.vue';
import NavRail from './components/NavRail.vue';
import DaySlider from './components/DaySlider.vue';
import RinPanel from './components/RinPanel.vue';
import SlotCard from './components/SlotCard.vue';
import { buildMenu } from '../../game/events/machine';
import { deriveEventUnlocked } from '../../game/engine/unlocked';
import { demoEventOptions } from '../../game/engine/mock-ai';
import type { EngineState } from '../../game/engine/types';
import type { EventContext } from '../../game/events/types';
import type { SlotPeriod } from '../../game/action-grid/types';

const r = useRunnerStore();
const view = ref('行动');
const mast = ref<InstanceType<typeof Masthead> | null>(null);
const exp = ref<string | null>(null);

const phase = computed(() => r.day.phase);
const phaseLabel = computed(() => (({
  allocating: '早 7:00 · 分配今日行动', day_running: '白天进行中', day_settled: '白天结束',
  night_running: '夜晚进行中', night_settled: '今日结束',
} as Record<string, string>)[phase.value] ?? phase.value));
const allocated = computed(() => r.day.daySlots.length + r.day.nightSlots.length > 0);

const canRerun = computed(() => !!r.lastSettle && !r.busy
  && ['day_running', 'night_running', 'day_settled', 'night_settled'].includes(phase.value));
const showSettle = computed(() => !!r.lastSettle && (r.lastSettle.events.isFirstSpecial || r.lastSettle.events.firedGateIds.length > 0));
const gateLabel = computed(() => (r.lastSettle?.events.firedGateIds ?? []).map(g => '堕落度（' + g.replace(/\D/g, '') + '）').join('、'));

// 已结算正文：首字水墨
const proseText = computed(() => (r.lastSettle?.resultText ?? '').trim());
const proseFirst = computed(() => proseText.value.slice(0, 1));
const proseRest = computed(() => proseText.value.slice(1));

function eventCtx(engine: EngineState): EventContext {
  return { corruption: engine.corruption, cognition: engine.cognition, infamy: engine.infamy,
    thugs: engine.thugTotal, triggeredLedger: engine.triggeredSpecials, unlocked: deriveEventUnlocked(engine) };
}
function opts(period: SlotPeriod) {
  return buildMenu(Object.values(demoEventOptions), eventCtx(r.engine), period)
    .map(e => ({ optionId: e.option.id, label: e.label, isNsfw: e.isNsfw }));
}
function isCur(period: SlotPeriod, i: number) { return r.day.cursor?.period === period && r.day.cursor?.index === i; }
function toggle(period: SlotPeriod, i: number) { const k = period + '-' + i; exp.value = exp.value === k ? null : k; }

function onFF(e: Event) { r.setFastForward((e.target as HTMLInputElement).checked); }
function onAllocate(day: number, night: number) { r.allocate(day, night); }
function onNav(a: 'save' | 'exit') { /* TODO: 存读档 / 退出回酒馆（待接） */ console.log('[nav]', a); }
function closePins() { mast.value?.clearPin(); }
</script>

<style scoped>
.app { position: relative; z-index: 1; display: grid; grid-template-columns: 212px 1fr 340px; grid-template-rows: auto 1fr; height: 100vh; }
.app > :deep(header) { grid-column: 1 / 4; }
.stage { overflow-y: auto; padding: 22px 28px; display: flex; flex-direction: column; }

.tool-row { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.phase-label { font-size: 13px; color: var(--text-dim); letter-spacing: 1px; }
.ai-mode { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.ai-mode.tavern { color: var(--green); background: rgba(122,163,122,.12); }
.ai-mode.mock { color: #e8a87a; background: rgba(232,168,122,.12); }
.ff { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-dim); cursor: pointer; margin-left: auto; }

:deep(.section-head) { display: flex; align-items: center; margin: 14px 0 10px; }
:deep(.section-head.dim) { opacity: .55; }
:deep(.section-title) { flex: 1; font-family: var(--brush); font-size: 24px; color: var(--gold-hi); border-left: 3px solid var(--red); padding-left: 10px; }
.grid { display: flex; flex-direction: column; gap: 10px; }
.grid.dim { opacity: .55; }

.morning-box { margin-top: 12px; padding: 10px 12px; background: rgba(232,200,122,.08); border: 1px solid #c9a24a; border-radius: 6px; color: var(--gold-hi); font-size: 13px; line-height: 1.5; }
.warn-box { margin-top: 10px; padding: 10px 12px; background: rgba(232,168,122,.1); border: 1px solid #e8a87a; border-radius: 6px; color: #e8a87a; font-size: 13px; display: flex; align-items: center; gap: 12px; }
.warn-box.reroll { justify-content: space-between; }
.ok-box { margin-top: 10px; padding: 10px 12px; background: rgba(94,122,72,.1); border: 1px solid #3a4a2a; border-radius: 6px; color: var(--green); font-size: 13px; }
.err-box { margin-top: 10px; padding: 10px 12px; background: #3a1518; border: 1px solid var(--red-hi); border-radius: 6px; color: var(--red-hi); font-size: 13px; }
.rose-box { margin-top: 12px; padding: 12px; border-radius: 8px; background: #22141a; border: 1px solid var(--red); font-size: 13px; }
.night-box { margin-top: 10px; padding: 10px; background: #1a1420; border: 1px solid var(--line); border-radius: 6px; font-size: 13px; color: var(--text-dim); }

.prose { margin-top: 14px; padding: 18px 20px; border: 1px solid var(--line); border-radius: 8px; background: rgba(20,16,14,.7); font-size: 15px; line-height: 2; color: var(--text); }
.prose .first { font-family: var(--brush); font-size: 30px; color: var(--gold-hi); float: left; line-height: 1; margin: 6px 10px 0 0; }

.cta { margin-top: auto; padding-top: 18px; display: flex; gap: 12px; align-items: center; justify-content: flex-end; }
.dim-hint { font-size: 12px; color: var(--text-dim); margin-right: auto; }
.primary-btn { font-family: var(--serif); background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; border-radius: 6px; padding: 12px 26px; font-size: 15px; font-weight: 700; letter-spacing: 2px; cursor: pointer; box-shadow: 0 6px 18px rgba(201,162,74,.25); }
.primary-btn:disabled { opacity: .45; cursor: not-allowed; }
.ghost-btn { font-family: var(--serif); background: transparent; border: 1px solid var(--line); color: var(--text-dim); border-radius: 6px; padding: 12px 22px; font-size: 14px; letter-spacing: 1px; cursor: pointer; }
.mini-btn { background: rgba(0,0,0,.3); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
.mini-btn:disabled { opacity: .5; }

.placeholder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
.ph-t { font-family: var(--brush); font-size: 48px; color: var(--gold-dim); }
.ph-s { font-size: 13px; color: var(--text-dim); letter-spacing: 2px; }

.gen-overlay { position: fixed; inset: 0; background: rgba(10,6,8,.72); display: flex; align-items: center; justify-content: center; z-index: 200; }
.gen-box { text-align: center; }
.gen-spinner { width: 36px; height: 36px; margin: 0 auto 14px; border: 3px solid #3d2828; border-top-color: var(--gold-hi); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.gen-text { font-family: var(--brush); font-size: 22px; color: var(--gold-hi); letter-spacing: 2px; }
.gen-sub { font-size: 12px; color: var(--text-dim); margin-top: 6px; }
</style>

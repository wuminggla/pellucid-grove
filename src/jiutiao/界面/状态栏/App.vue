<!--
  App · 新 UI 外壳（极道手账）
  布局: CSS Grid 三列两行（顶栏跨列）= Masthead / NavRail / Stage / RinPanel。
  「行动」视图(本批重构·减少上下滚动):
    上: 工具行 +(分配阶段)日夜滑条 + 8格事件横条(SlotStrip)
    中: 选中格子页(SlotDetail·事件选择 / 正文)，仅此区滚动
    下: 固定底边栏 = 左状态提示栏(变量变化/警告/空回) + 右操作按钮
  生成正文后自动跳到下一格(selected 复位为 null → 跟随 cursor)。
  业务调用复用 runner-store。详见 docs/UI改版工程说明.md。
-->
<template>
  <div class="app pellucid-root" @click="closePins">
    <Masthead ref="mast" :engine="r.engine" :day="r.day" />
    <NavRail v-model:view="view" @action="onNav" />

    <main class="stage">
      <!-- ===== 行动视图 ===== -->
      <section v-if="view === '行动'" class="action-view">
        <div class="av-top">
          <div class="tool-row">
            <span class="phase-label">{{ phaseLabel }}</span>
            <span class="ai-mode" :class="r.aiMode">{{ r.aiMode === 'tavern' ? '◆ 酒馆AI' : '○ mock' }}</span>
            <div class="toggles">
              <button class="tg" :class="{ on: r.fastForward }" @click="r.setFastForward(!r.fastForward)"
                title="快进：非特殊事件不调用 AI，直接出 CG + 总结词并更新数值。想刷数值/看结果就开；想读叙事就关。首次里程碑事件仍正常扩写。">⏩ 快进</button>
              <button class="tg" :class="{ on: autoAdvance }" @click="autoAdvance = !autoAdvance"
                title="自动跳转下一事件：生成正文后自动选中并展开下一格，连续推进。关闭则停留在刚生成的格子看正文，由你手动点选下一格再执行。">⤵ 自动跳转下一事件</button>
            </div>
          </div>

          <Transition name="collapse">
            <DaySlider v-if="phase === 'allocating'" :total="r.day.totalSlots" @change="onAllocate" />
          </Transition>

          <SlotStrip v-if="hasSlots" :day="r.day" :selectedKey="selKey" @select="onSelect" />
        </div>

        <div class="av-detail">
          <SlotDetail v-if="hasSlots" :slot="selSlot" :period="selPeriod" :options="selOptions"
            @pick="onPick" @clear="onClear" />
          <div v-else class="av-empty">拖动上方滑条分配今日白天 / 夜晚行动格</div>
        </div>

        <div class="av-bottom">
          <div class="status-strip">
            <template v-if="statusItems.length">
              <span v-for="(s, i) in statusItems" :key="i" class="st-item" :class="s.tone">{{ s.t }}</span>
            </template>
            <span v-else class="st-empty">— 状态提示 · 变量变化 / 截断空回 会显示在这里 —</span>
          </div>
          <div class="actions">
            <button v-if="canRerun" class="ghost-btn" @click="rerun">↻ 重生成上一格</button>
            <button v-if="phase === 'allocating' && hasSlots" class="primary-btn" @click="startDay">确定分配 · 开始 ▶</button>
            <template v-if="phase === 'day_running' || phase === 'night_running'">
              <button class="primary-btn" :disabled="r.busy || !r.canRunCurrent" @click="exec">{{ r.busy ? '生成中…' : '执行当前格 ▶' }}</button>
            </template>
            <button v-if="phase === 'day_settled'" class="primary-btn" @click="toNight">进入夜晚 ▶</button>
            <button v-if="phase === 'night_settled'" class="primary-btn" @click="toNextDay">结束今天 · 次日 ▶</button>
          </div>
        </div>
      </section>

      <!-- ===== 设置 · 存档管理 ===== -->
      <div v-else-if="view === '设置'" class="settings">
        <div class="set-box">
          <h3>存档 · 管理</h3>
          <p class="lead">进度<b>自动保存</b>到【当前聊天】里，刷新酒馆 / 退出重进聊天都不丢。</p>
          <div class="srow"><b>多存档 · 并行</b>：每个聊天 = 一份独立存档。在酒馆「管理聊天」里给本角色多开几个聊天，就是多个并行存档，互不影响、可随时切换。</div>
          <div class="srow"><b>开新游戏</b>：给本角色【新建聊天】= 全新一局（空存档，从头开始）。或点下方「重开本局」清空当前这个聊天的进度。</div>
          <div class="srow"><b>删除存档</b>：删掉某个聊天 = 删掉它的存档；删除角色卡会连同它的聊天一起清掉。存档是「聊天作用域」，不留全局残留。</div>
          <div class="srow"><b>性能</b>：存档存在聊天的元数据里，<b>不进入发给 AI 的上下文</b>，不烧 token、不会让酒馆变卡。体积只含当前一天 + 精简记忆日志，增长很慢。</div>
          <div class="set-btns">
            <button class="primary-btn" @click="manualSave">立即存档</button>
            <button class="danger-btn" @click="confirmReset">重开本局（清空当前进度）</button>
          </div>
        </div>
        <div class="set-box dim-box">
          <h3>API / 界面风格（待接）</h3>
          <p class="lead">之后这里配置副 AI 端点、切换我们提供的其它 UI 风格。</p>
        </div>
      </div>

      <!-- ===== 其它页签：占位 ===== -->
      <div v-else class="placeholder">
        <div class="ph-t">{{ view }}</div>
        <div class="ph-s">此面板待玩法接入（见 UI改版工程说明.md §2）</div>
      </div>
    </main>

    <RinPanel :engine="r.engine" />

    <Transition name="fade">
      <div v-if="saveToast" class="save-toast">{{ saveToast }}</div>
    </Transition>

    <div v-if="r.busy" class="gen-overlay">
      <div class="gen-box"><div class="gen-spinner"></div><div class="gen-text">{{ r.genHint }}</div>
        <div class="gen-sub">{{ r.aiMode === 'tavern' ? '调用酒馆 API（可能需数秒到数十秒）' : 'mock 模拟' }}</div></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue';
import { useRunnerStore } from './runner-store';
import Masthead from './components/Masthead.vue';
import NavRail from './components/NavRail.vue';
import DaySlider from './components/DaySlider.vue';
import RinPanel from './components/RinPanel.vue';
import SlotStrip from './components/SlotStrip.vue';
import SlotDetail from './components/SlotDetail.vue';
import { buildMenu } from '../../game/events/machine';
import { deriveEventUnlocked } from '../../game/engine/unlocked';
import { demoEventOptions } from '../../game/engine/mock-ai';
import type { EngineState } from '../../game/engine/types';
import type { EventContext } from '../../game/events/types';
import type { SlotPeriod } from '../../game/action-grid/types';

const r = useRunnerStore();
const view = ref('行动');
const mast = ref<InstanceType<typeof Masthead> | null>(null);
const autoAdvance = ref(true); // 生成后是否自动跳到下一格（开关·tool-row 按钮）

const phase = computed(() => r.day.phase);
const phaseLabel = computed(() => (({
  allocating: '早 7:00 · 分配今日行动', day_running: '白天进行中', day_settled: '白天结束',
  night_running: '夜晚进行中', night_settled: '今日结束',
} as Record<string, string>)[phase.value] ?? phase.value));
const hasSlots = computed(() => r.day.daySlots.length + r.day.nightSlots.length > 0);

// —— 选中格（默认跟随 cursor；手动点选可覆盖；执行后复位为跟随）——
const selected = ref<{ period: SlotPeriod; index: number } | null>(null);
const effSel = computed<{ period: SlotPeriod; index: number } | null>(() => {
  if (selected.value) return selected.value;
  const c = r.day.cursor;
  if (c) return { period: c.period, index: c.index };
  if (r.day.daySlots.length) return { period: 'day', index: 0 };
  if (r.day.nightSlots.length) return { period: 'night', index: 0 };
  return null;
});
const selPeriod = computed<SlotPeriod>(() => effSel.value?.period ?? 'day');
const selSlot = computed(() => {
  const s = effSel.value; if (!s) return null;
  const arr = s.period === 'day' ? r.day.daySlots : r.day.nightSlots;
  return arr[s.index] ?? null;
});
const selKey = computed(() => effSel.value ? effSel.value.period + '-' + effSel.value.index : null);
const selOptions = computed(() => effSel.value ? opts(effSel.value.period) : []);

function onSelect(period: SlotPeriod, index: number) { selected.value = { period, index }; }
function onPick(o: string, l: string) { const s = effSel.value; if (s) r.setChoice(s.period, s.index, { optionId: o, label: l }); }
function onClear() { const s = effSel.value; if (s) r.clearChoice(s.period, s.index); }

// —— 操作（执行后 selected 复位 → 自动跳到下一格 cursor）——
async function exec() {
  if (r.busy || !r.canRunCurrent) return;
  const prev = r.day.cursor ? { period: r.day.cursor.period, index: r.day.cursor.index } : null;
  await r.runCurrent();
  // 自动跳转开 → selected 复位跟随新 cursor；关 → 停留在刚执行(现已结算)的格看正文
  selected.value = autoAdvance.value ? null : prev;
}
async function rerun() { await r.rerunLast(); selected.value = null; }
function startDay() { r.beginDay(); selected.value = null; }
function toNight() { r.beginNight(); selected.value = null; }
function toNextDay() { r.nextDay(); selected.value = null; }
function onAllocate(day: number, night: number) { r.allocate(day, night); selected.value = null; }

const canRerun = computed(() => !!r.lastSettle && !r.busy
  && ['day_running', 'night_running', 'day_settled', 'night_settled'].includes(phase.value));
const gateLabel = computed(() => (r.lastSettle?.events.firedGateIds ?? []).map(g => '堕落度（' + g.replace(/\D/g, '') + '）').join('、'));

// —— 底部状态提示栏：汇总变量变化 / 警告 / 空回 ——
const statusItems = computed(() => {
  const e = r.engine; const out: Array<{ t: string; tone: string }> = [];
  if (r.hardFail) out.push({ t: '☠ 硬失败：' + (r.hardFailReason === 'money' ? '资金断流' : '威望枯竭'), tone: 'err' });
  r.failWarnings.forEach(w => out.push({ t: w, tone: 'warn' }));
  if (r.lastWarn) out.push({ t: '⚠ ' + r.lastWarn, tone: 'warn' });
  if (e.desire >= e.desireCapacity) out.push({ t: `⚠ 群体欲望 ${e.desire}/${e.desireCapacity} 超上限`, tone: 'warn' });
  if (r.lastServe) out.push({ t: `供奉 ${r.lastServe.served}人 · 欲望-${r.lastServe.desireRelieved} · 套-${r.lastServe.condomUsed}` + (r.lastServe.condomShort ? '（库存不足!）' : ''), tone: r.lastServe.condomShort ? 'err' : 'ok' });
  if (r.lastSettle?.events.isFirstSpecial) out.push({ t: `◆ 首次特殊 堕落+${r.lastSettle.events.corruptionGain}` + (r.lastSettle.events.cognitionAdvancedTo ? ` → ${r.lastSettle.events.cognitionAdvancedTo}` : ''), tone: 'rose' });
  if (r.lastSettle?.events.firedGateIds.length) out.push({ t: '◆ ' + gateLabel.value + ' 奖励', tone: 'gold' });
  if (r.lastRecruit && r.lastRecruit.recruited > 0) out.push({ t: `+${r.lastRecruit.recruited}打手 (¥${r.lastRecruit.cost})`, tone: 'ok' });
  if (r.lastBuyCondom && r.lastBuyCondom.bought > 0) out.push({ t: `+${r.lastBuyCondom.bought}避孕套`, tone: 'ok' });
  if (r.lastNight) out.push({ t: `夜结：供奉${r.lastNight.servedToday}人·结余${r.lastNight.desireLeftover}` + (r.lastNight.overflowImminent ? ' ⚠次日白日供奉' : ''), tone: r.lastNight.overflowImminent ? 'warn' : 'dim' });
  return out;
});

function eventCtx(engine: EngineState): EventContext {
  return { corruption: engine.corruption, cognition: engine.cognition, infamy: engine.infamy,
    thugs: engine.thugTotal, triggeredLedger: engine.triggeredSpecials, unlocked: deriveEventUnlocked(engine) };
}
function opts(period: SlotPeriod) {
  return buildMenu(Object.values(demoEventOptions), eventCtx(r.engine), period)
    .map(e => ({ optionId: e.option.id, label: e.label, isNsfw: e.isNsfw }));
}

const collapse = inject<(() => void) | null>('pellucidCollapse', null);
// 退出=收起回酒馆；存读档=立即存档(进度本就自动存到聊天变量·刷新不丢，此处给手动确认)
function onNav(a: 'save' | 'exit') {
  if (a === 'exit') { collapse?.(); return; }
  r.saveNow();
  saveToast.value = r.hasTavernVars ? '✓ 进度已存档（聊天变量·刷新不丢）' : '⚠ 当前环境无酒馆变量，无法存档';
  setTimeout(() => { saveToast.value = ''; }, 2600);
}
const saveToast = ref('');
function closePins() { mast.value?.clearPin(); }

// 设置·存档管理
function manualSave() {
  r.saveNow();
  saveToast.value = r.hasTavernVars ? '✓ 进度已存档' : '⚠ 当前环境无酒馆变量，无法存档';
  setTimeout(() => { saveToast.value = ''; }, 2600);
}
function confirmReset() {
  if (window.confirm('确定清空【当前聊天】的进度、从头开始这一局？\n（其它聊天的存档不受影响。此操作不可撤销）')) {
    r.resetGame(); selected.value = null;
    saveToast.value = '✓ 已重开本局';
    setTimeout(() => { saveToast.value = ''; }, 2600);
  }
}
</script>

<style scoped>
.app { position: relative; z-index: 1; display: grid; grid-template-columns: 212px 1fr 340px; grid-template-rows: auto 1fr; height: 100vh; }
.app > :deep(header) { grid-column: 1 / 4; }
.stage { overflow: hidden; display: flex; flex-direction: column; min-height: 0; }

.action-view { display: flex; flex-direction: column; height: 100%; padding: 18px 26px 0; min-height: 0; }
.av-top { flex: none; }
.av-detail { flex: 1; min-height: 0; overflow-y: auto; margin-top: 14px; }
.av-empty { color: var(--text-dim); font-size: 14px; text-align: center; padding: 40px 0; }
.av-bottom { flex: none; display: flex; align-items: stretch; gap: 14px; padding: 12px 0 16px; margin-top: 10px; border-top: 1px solid var(--line); }

.tool-row { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
.phase-label { font-size: 13px; color: var(--text-dim); letter-spacing: 1px; }
.ai-mode { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.ai-mode.tavern { color: var(--green); background: rgba(122,163,122,.12); }
.ai-mode.mock { color: #e8a87a; background: rgba(232,168,122,.12); }
.toggles { margin-left: auto; display: flex; gap: 8px; }
.tg { font-family: var(--serif); font-size: 12px; letter-spacing: 1px; color: var(--text-dim); cursor: pointer;
  background: rgba(0,0,0,.3); border: 1px solid var(--line); border-radius: 16px; padding: 6px 14px; transition: .12s; }
.tg:hover { color: var(--text); border-color: var(--gold-dim); }
.tg.on { color: #1a120a; font-weight: 700; background: linear-gradient(180deg, var(--gold-hi), var(--gold)); border-color: var(--gold); }
/* 滑条折叠消失动画 */
.collapse-enter-active, .collapse-leave-active { transition: max-height .35s ease, opacity .28s ease, margin-bottom .35s ease, transform .35s ease; overflow: hidden; }
.collapse-enter-from, .collapse-leave-to { max-height: 0; opacity: 0; transform: translateY(-6px); margin-bottom: 0 !important; }
.collapse-enter-to, .collapse-leave-from { max-height: 140px; }

/* 底部状态提示栏 */
.status-strip { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 6px; max-height: 76px; overflow-y: auto; }
.st-item { font-size: 12px; padding: 4px 10px; border-radius: 5px; border: 1px solid var(--line); background: rgba(0,0,0,.25); white-space: nowrap; }
.st-item.ok { color: var(--green); border-color: rgba(94,122,72,.5); }
.st-item.warn { color: #e8a87a; border-color: #e8a87a; }
.st-item.err { color: var(--red-hi); border-color: var(--red-hi); background: rgba(179,33,46,.12); }
.st-item.gold { color: var(--gold-hi); border-color: var(--gold-dim); }
.st-item.rose { color: var(--red-hi); border-color: rgba(216,64,77,.5); }
.st-item.dim { color: var(--text-dim); }
.st-empty { font-size: 12px; color: var(--text-dim); align-self: center; }

.actions { flex: none; display: flex; gap: 12px; align-items: center; }
.primary-btn { font-family: var(--serif); background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; border-radius: 6px; padding: 12px 26px; font-size: 15px; font-weight: 700; letter-spacing: 2px; cursor: pointer; box-shadow: 0 6px 18px rgba(201,162,74,.25); }
.primary-btn:disabled { opacity: .45; cursor: not-allowed; }
.ghost-btn { font-family: var(--serif); background: transparent; border: 1px solid var(--line); color: var(--text-dim); border-radius: 6px; padding: 12px 20px; font-size: 14px; cursor: pointer; }

.settings { padding: 22px 28px; overflow-y: auto; }
.set-box { border: 1px solid var(--line); border-radius: 10px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); padding: 18px 20px; margin-bottom: 16px; max-width: 680px; }
.set-box.dim-box { opacity: .6; }
.set-box h3 { font-family: var(--brush); font-size: 24px; color: var(--gold-hi); margin-bottom: 8px; }
.set-box .lead { font-size: 14px; color: var(--text); line-height: 1.7; margin-bottom: 12px; }
.set-box .srow { font-size: 13px; color: var(--text-dim); line-height: 1.7; padding: 7px 0; border-top: 1px dashed var(--line); }
.set-box .srow b { color: var(--gold); font-weight: 400; }
.set-btns { display: flex; gap: 12px; margin-top: 16px; }
.danger-btn { font-family: var(--serif); background: rgba(179,33,46,.12); color: var(--red-hi); border: 1px solid var(--red); border-radius: 6px; padding: 12px 22px; font-size: 14px; cursor: pointer; }
.danger-btn:hover { background: rgba(179,33,46,.22); }
.placeholder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
.ph-t { font-family: var(--brush); font-size: 48px; color: var(--gold-dim); }
.ph-s { font-size: 13px; color: var(--text-dim); letter-spacing: 2px; }

.save-toast { position: fixed; bottom: 26px; left: 50%; transform: translateX(-50%); z-index: 210;
  background: rgba(20,16,14,.95); border: 1px solid var(--gold-dim); color: var(--gold-hi);
  padding: 10px 20px; border-radius: 8px; font-size: 14px; box-shadow: 0 8px 26px rgba(0,0,0,.6); }
.fade-enter-active, .fade-leave-active { transition: opacity .3s ease, transform .3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }
.gen-overlay { position: fixed; inset: 0; background: rgba(10,6,8,.72); display: flex; align-items: center; justify-content: center; z-index: 200; }
.gen-box { text-align: center; }
.gen-spinner { width: 36px; height: 36px; margin: 0 auto 14px; border: 3px solid #3d2828; border-top-color: var(--gold-hi); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.gen-text { font-family: var(--brush); font-size: 22px; color: var(--gold-hi); letter-spacing: 2px; }
.gen-sub { font-size: 12px; color: var(--text-dim); margin-top: 6px; }
</style>

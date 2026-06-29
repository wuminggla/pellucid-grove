<!--
  Masthead · 顶部刊头（横向木纹）+ 状态条
  职责: logo + 六项核心数值（资金/威望/打手/群体欲望/避孕套/堕落度），
        每项悬停出浮窗、点击钉住（再点或点别处取消）。
  数据: engine（见 UI改版工程说明.md §3 数据映射，🟡=占位）。
-->
<template>
  <header class="masthead">
    <div class="logo">九条会<span class="sub">JIUTIAO · 极道手账 · {{ BUILD_VERSION }}</span></div>

    <div class="stat-strip">
      <!-- 1 资金 -->
      <div class="stat pinnable" :class="{ pinned: pin === 'money' }" @click.stop="toggle('money')">
        <div class="k">资 金</div>
        <div class="v">¥{{ e.money.toLocaleString() }}</div>
        <div class="pop">
          <h4>近期账目（悬停查看 · 点击钉住）</h4>
          <div v-for="(r, i) in ledger" :key="i" class="row"><span>{{ r.t }}</span><b :class="r.d >= 0 ? 'plus' : 'minus'">{{ r.d >= 0 ? '+' : '' }}{{ r.d.toLocaleString() }}</b></div>
          <div class="hint">完整资金流水待接（task #12）</div>
        </div>
      </div>

      <!-- 2 威望 双色条 -->
      <div class="stat wide pinnable" :class="{ pinned: pin === 'prestige' }" @click.stop="toggle('prestige')">
        <div class="k">威 望</div>
        <div class="prestige">
          <div class="pbar"><span class="pg" :style="{ width: goldPct + '%' }"></span><span class="pr" :style="{ width: redPct + '%' }"></span></div>
          <div class="pnum"><b style="color:var(--gold-hi)">极 {{ e.martialPrestige }}</b> · <b style="color:var(--red-hi)">淫 {{ e.infamy }}</b></div>
        </div>
        <div class="pop">
          <h4>威望 = 极道 + 淫名</h4>
          <div class="row"><span>极道威望（金）</span><b>{{ e.martialPrestige }}</b></div>
          <div class="row"><span>淫名（红）</span><b>{{ e.infamy }}</b></div>
          <div class="row"><span>占比风味</span><b>{{ e.martialPrestige >= e.infamy ? '偏极道' : '偏淫名' }}</b></div>
          <div class="hint">两者之和决定招募额度；占比决定叙事/配色风味</div>
        </div>
      </div>

      <!-- 3 打手·在场 -->
      <div class="stat pinnable" :class="{ pinned: pin === 'thug' }" @click.stop="toggle('thug')">
        <div class="k">打手 · 在场</div>
        <div class="v white">{{ e.thugTotal }}<span class="sub-n"> / {{ e.presentCount }}</span></div>
        <div class="pop">
          <h4>打手 · 机制</h4>
          <div class="row"><span>总打手</span><b>{{ e.thugTotal }}</b></div>
          <div class="row"><span>在场（当前场景）</span><b>{{ e.presentCount }}</b></div>
          <div class="prow">总数 = 麾下全部人手；在场 = 当前这场供奉/事件出场的人数（决定避孕套消耗与场面规模）。</div>
          <div class="prow">增减：招募↑ / 自然增长↑（淫名越高越快）/ 攻防损耗↓ / 驻守占用（锁定不可用）。</div>
          <div class="row"><span>本周招募额度</span><b>{{ e.recruitQuota }}</b></div>
          <div class="row"><span>单次招募</span><b>3-4 人（可升级）</b></div>
          <div class="hint">额度随威望提升；上限随设施升级</div>
        </div>
      </div>

      <!-- 4 群体欲望 -->
      <div class="stat pinnable" :class="{ pinned: pin === 'desire' }" @click.stop="toggle('desire')">
        <div class="k">群体欲望</div>
        <div class="v" :style="{ color: desireOver ? 'var(--red-hi)' : 'var(--gold-hi)' }">{{ e.desire }}/{{ e.desireCapacity }}</div>
        <div class="pop">
          <h4>群体欲望 · 机制</h4>
          <div class="prow">每天清晨按可用打手数累积欲望；夜晚每场供奉按人数清偿。日终结余仍 ≥ 上限 → 次日触发「白日供奉」（全天供奉泄欲）。</div>
          <div class="row"><span>当前 / 上限</span><b>{{ e.desire }} / {{ e.desireCapacity }}</b></div>
          <div class="row"><span>今晨累积</span><b class="minus">+{{ e.desireAddedThisMorning ?? 0 }}</b></div>
          <div class="hint">上限可由设施升级提高（拖延白日供奉）</div>
        </div>
      </div>

      <!-- 5 避孕套 -->
      <div class="stat pinnable" :class="{ pinned: pin === 'condom' }" @click.stop="toggle('condom')">
        <div class="k">避孕套</div>
        <div class="v" :style="{ color: condomTone }">{{ e.condomStock }}</div>
        <div class="pop wide-pop">
          <h4>避孕套 · 库存与消耗</h4>
          <div class="row"><span>库存</span><b>{{ e.condomStock }}</b></div>
          <div class="row"><span>昨日消耗</span><b class="minus">—</b></div>
          <div class="row"><span>今日消耗（随行动变化）</span><b class="minus">—</b></div>
          <div class="chart-inline">
            <div class="ci-t">消耗趋势（待接逐日追踪）</div>
            <svg viewBox="0 0 280 72" preserveAspectRatio="none">
              <line x1="0" y1="60" x2="280" y2="60" stroke="rgba(201,162,74,.14)" stroke-width="1"/>
              <polyline points="0,55 70,50 140,40 210,30 280,18" fill="none" stroke="#d8404d" stroke-width="2" stroke-dasharray="4 3"/>
            </svg>
            <div class="chart-cap">数值叙事：随打手膨胀，每日避孕套消耗逐日攀升——这条上扬曲线就是滑向深渊的刻度。</div>
          </div>
        </div>
      </div>

      <!-- 6 堕落度（含认知防线） -->
      <div class="stat pinnable" :class="{ pinned: pin === 'corruption' }" @click.stop="toggle('corruption')">
        <div class="k">堕落度</div>
        <div class="v red">{{ e.corruption }}</div>
        <div class="pop">
          <h4>堕落度 · 认知防线</h4>
          <div class="prow">堕落度累积推进「认知防线」：死撑 → 动摇 → 崩溃 → 母猪化，单向不可逆，决定凛面对玷污时的真实态度。</div>
          <div class="row"><span>当前认知</span><b>{{ e.cognition }}</b></div>
          <template v-if="nextStage">
            <div class="row"><span>距下阶段「{{ nextStage.stage }}」({{ nextStage.at }})</span><b>还差 {{ nextStage.gap }}</b></div>
          </template>
          <template v-else>
            <div class="row"><span>认知防线</span><b>已至母猪化</b></div>
          </template>
          <div v-if="nextGate" class="row sub"><span>↳ 下阶段奖励（{{ nextGate.at }}）</span><b class="plus">{{ nextGate.text }}</b></div>
          <div class="hint">堕落越深，阶段奖励越丰</div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { BUILD_VERSION } from '../version';
import { COGNITION_THRESHOLDS, REWARD_GATES } from '../../../game/corruption/machine';
import type { EngineState } from '../../../game/engine/types';
import type { DayState } from '../../../game/action-grid/types';

const props = defineProps<{ engine: EngineState; day: DayState }>();
const e = computed(() => props.engine); // 模板里 e.xxx 自动解包，engine 整体替换即响应

// 钉住浮窗
const pin = ref<string | null>(null);
function toggle(k: string) { pin.value = pin.value === k ? null : k; }
function clearPin() { pin.value = null; }
defineExpose({ clearPin });

// 威望双色条占比
const goldPct = computed(() => {
  const t = props.engine.martialPrestige + props.engine.infamy;
  return t <= 0 ? 50 : (props.engine.martialPrestige / t) * 100;
});
const redPct = computed(() => 100 - goldPct.value);

const desireOver = computed(() => props.engine.desire >= props.engine.desireCapacity);
const condomTone = computed(() => props.engine.condomStock <= 0 ? 'var(--red-hi)'
  : props.engine.condomStock < 10 ? '#e8a87a' : 'var(--text)');

// 堕落度：下一认知档 + 下一奖励闸门
const nextStage = computed(() => {
  const c = props.engine.corruption;
  const t = COGNITION_THRESHOLDS.find(x => x.atCorruption > c);
  return t ? { stage: t.stage, at: t.atCorruption, gap: t.atCorruption - c } : null;
});
const nextGate = computed(() => {
  const c = props.engine.corruption;
  const g = REWARD_GATES.find(x => x.atCorruption > c);
  if (!g) return null;
  const r = g.reward;
  const parts: string[] = [];
  if (r.money) parts.push(`+¥${r.money.toLocaleString()}`);
  if (r.thugs) parts.push(`+${r.thugs}打手`);
  return { at: g.atCorruption, text: parts.join(' / ') };
});

// 资金流水占位（🟡 task #12 未做）
const ledger = computed(() => [] as Array<{ t: string; d: number }>);
</script>

<style scoped>
.masthead {
  display: flex; align-items: center; gap: 22px; padding: 14px 26px;
  background: var(--wood-h); background-color: var(--wood-base); border-bottom: 2px solid #000;
  box-shadow: inset 0 -3px 8px rgba(0,0,0,.4), 0 3px 12px rgba(0,0,0,.5);
}
.logo { font-family: var(--brush); font-size: 46px; line-height: 1; color: var(--gold-hi);
  text-shadow: 0 2px 0 #000, 0 0 18px rgba(201,162,74,.3); letter-spacing: 2px; margin-top: 6px; }
.logo .sub { font-family: var(--serif); font-size: 12px; color: var(--text-dim); letter-spacing: 6px; display: block; margin-top: 4px; }
.stat-strip { margin-left: auto; display: flex; }
.stat { position: relative; padding: 4px 18px; text-align: center; border-left: 1px solid rgba(201,162,74,.16); cursor: pointer; }
.stat:hover { background: rgba(236,200,120,.06); }
.stat .k { font-size: 11px; color: var(--text-dim); letter-spacing: 2px; }
.stat .v { font-size: 20px; color: var(--gold-hi); font-weight: 700; }
.stat .v.red { color: var(--red-hi); } .stat .v.white { color: var(--text); }
.stat .v .sub-n { font-size: 13px; color: var(--text-dim); }
.stat.wide { min-width: 158px; }
.prestige { margin-top: 3px; }
.pbar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(201,162,74,.3); background: #0a0706; }
.pbar .pg { background: linear-gradient(180deg, var(--gold-hi), var(--gold)); }
.pbar .pr { background: linear-gradient(180deg, var(--red-hi), var(--red)); }
.pnum { font-size: 12px; margin-top: 3px; color: var(--text-dim); }
.pnum b { font-weight: 700; font-size: 13px; }
/* 浮窗 */
.pop { display: none; position: absolute; top: 100%; right: 0; margin-top: 8px; width: 240px; text-align: left;
  background: var(--panel-2); border: 1px solid var(--gold-dim); border-radius: 8px; padding: 12px 14px;
  z-index: 20; box-shadow: 0 14px 40px rgba(0,0,0,.6); }
.stat:hover .pop, .stat.pinned .pop { display: block; }
.stat.pinned { background: rgba(236,200,120,.09); }
.stat.pinned .pop { max-height: 62vh; overflow: auto; }
.pop.wide-pop { width: 282px; }
.pop h4 { font-size: 12px; color: var(--gold); letter-spacing: 1px; margin-bottom: 8px; border-bottom: 1px dashed var(--line); padding-bottom: 6px; }
.pop .row { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-dim); padding: 3px 0; }
.pop .row b { color: var(--text); font-weight: 400; }
.pop .row .plus { color: var(--green); } .pop .row .minus { color: var(--red-hi); }
.pop .row.sub { padding-left: 16px; color: var(--gold-dim); }
.pop .prow { font-size: 11px; color: var(--text-dim); line-height: 1.65; padding: 5px 0; border-bottom: 1px dashed rgba(201,162,74,.12); }
.pop .hint { font-size: 11px; color: var(--gold-dim); margin-top: 8px; }
.chart-inline { margin-top: 9px; border-top: 1px dashed var(--line); padding-top: 9px; }
.chart-inline .ci-t { font-size: 11px; color: var(--gold); margin-bottom: 6px; }
.chart-inline svg { width: 100%; height: 64px; display: block; }
.chart-inline .chart-cap { font-size: 11px; color: var(--gold-dim); margin-top: 7px; font-style: italic; line-height: 1.6; }
</style>

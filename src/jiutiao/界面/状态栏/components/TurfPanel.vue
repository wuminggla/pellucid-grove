<!--
  TurfPanel · 地盘视图（#13 Phase1）
  职责: 把 turf 的 5 区域复仇链可视化(老宅→街区→片区→山头→小半城·会长杀父仇人)，
        显示每区域 状态/有效门槛 vs 当前武力/每日产出/驻防需求，并提供 攻打 / 贿赂降门槛。
  威望主来源: 攻打成功=一次性极道威望 + 解锁后每日产出(条/钱/威望·settleDaily 接入)。
  数据: engine.regions + REGIONS(数据源) + 当前武力(runner-store.combatPowerNow)。
  说明: Phase1 攻打/贿赂为直接数值判定(点一下出结果·设计正典「据点战纯数值判定」)，
        尚未占白天行动格(留 Phase2 格集成)。
-->
<template>
  <div class="turf">
    <div class="turf-head">
      <div class="t-title">地盘 · 复仇</div>
      <div class="t-power">当前武力 <b>{{ Math.round(power) }}</b></div>
    </div>
    <div class="t-hint">击败一片地盘的 boss（你的复仇目标）即占据该区域：需 <b>武力 ≥ 击败门槛</b>。贿赂调查可降低门槛。占据后每日产出避孕套 / 资金 / 极道威望。</div>

    <div v-if="r.lastTurf" class="t-feedback" :class="{ ok: r.lastTurf.ok, bad: !r.lastTurf.ok }">{{ r.lastTurf.msg }}</div>

    <div class="chain">
      <div v-for="(c, i) in cells" :key="c.id" class="region" :class="c.state">
        <div class="r-rail"><span class="r-dot"></span><span v-if="i < cells.length - 1" class="r-line"></span></div>
        <div class="r-body">
          <div class="r-top">
            <span class="r-name">{{ c.name }}</span>
            <span class="r-tag" :class="c.state">{{ c.tagText }}</span>
          </div>
          <div class="r-boss">守敌 · {{ c.bossName }}</div>
          <div class="r-meta">
            <span class="m">门槛 <b :class="{ red: !c.canBeat && c.state !== 'occupied' && c.state !== 'locked' }">{{ c.threshold }}</b> / 武力 {{ Math.round(power) }}</span>
            <span class="m">产出 <b>{{ c.yieldText }}</b></span>
            <span class="m" v-if="c.garrisonNeed">驻防需 {{ c.garrisonNeed }}</span>
          </div>
          <div class="r-btns" v-if="c.state !== 'occupied'">
            <button class="atk" :disabled="!c.canBeat" @click="r.attackRegion(c.id)">{{ c.state === 'locked' ? '前置未解锁' : (c.canBeat ? '攻打占据 ▶' : '武力不足') }}</button>
            <button class="brb" v-if="c.state !== 'locked'" :disabled="r.engine.money < 1000" @click="r.bribeRegion(c.id)" title="花 ¥1000 降低击败门槛 60">贿赂调查 -门槛</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRunnerStore } from '../runner-store';
import { REGIONS, regionState, effectiveThreshold, isRegionUnlocked } from '../../../game/turf/machine';

const r = useRunnerStore();
const power = computed(() => r.combatPowerNow);

const cells = computed(() => {
  const regions = r.engine.regions;
  return REGIONS.filter(d => d.id !== 'home').map(def => {
    const st = regionState(regions, def.id);
    const thr = effectiveThreshold(def, st);
    const preOk = !def.requiresRegion || isRegionUnlocked(regions, def.requiresRegion);
    const canBeat = !st.defeated && preOk && power.value >= thr;
    let state: 'occupied' | 'locked' | 'ready' | 'weak' = 'weak';
    let tagText = '';
    if (st.defeated) { state = 'occupied'; tagText = '已占据'; }
    else if (!preOk) { state = 'locked'; tagText = '锁定'; }
    else if (canBeat) { state = 'ready'; tagText = '可攻打'; }
    else { state = 'weak'; tagText = '门槛不足'; }
    const y = def.yields;
    const yieldText = [y.money ? `¥${y.money}` : '', y.condom ? `套${y.condom}` : '', y.martial ? `威望${y.martial}` : ''].filter(Boolean).join(' · ');
    return { id: def.id, name: def.name, bossName: def.bossName, threshold: thr, canBeat, state, tagText, yieldText, garrisonNeed: def.garrisonNeed };
  });
});
</script>

<style scoped>
.turf { padding: 20px 26px; overflow-y: auto; height: 100%; }
.turf-head { display: flex; align-items: baseline; gap: 16px; margin-bottom: 6px; }
.t-title { font-family: var(--brush); font-size: 30px; color: var(--gold-hi); }
.t-power { margin-left: auto; font-size: 14px; color: var(--text-dim); }
.t-power b { font-size: 22px; color: var(--gold-hi); font-weight: 700; }
.t-hint { font-size: 12px; color: var(--text-dim); line-height: 1.7; margin-bottom: 14px; max-width: 760px; }
.t-hint b { color: var(--gold); }
.t-feedback { margin-bottom: 14px; padding: 10px 14px; border-radius: 7px; font-size: 13px; }
.t-feedback.ok { background: rgba(94,122,72,.12); border: 1px solid #3a4a2a; color: var(--green); }
.t-feedback.bad { background: rgba(179,33,46,.1); border: 1px solid var(--red); color: var(--red-hi); }

.chain { display: flex; flex-direction: column; }
.region { display: flex; gap: 14px; }
.r-rail { width: 16px; display: flex; flex-direction: column; align-items: center; padding-top: 6px; }
.r-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--gold-dim); background: var(--ink); flex: none; }
.region.occupied .r-dot { background: var(--green); border-color: var(--green); }
.region.ready .r-dot { background: var(--gold); border-color: var(--gold-hi); box-shadow: 0 0 8px rgba(236,200,120,.5); }
.region.weak .r-dot { border-color: var(--red); }
.r-line { flex: 1; width: 2px; background: var(--line); margin: 4px 0; }
.r-body { flex: 1; border: 1px solid var(--line); border-radius: 9px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); padding: 13px 16px; margin-bottom: 14px; }
.region.occupied .r-body { border-color: rgba(94,122,72,.5); }
.region.ready .r-body { border-color: var(--gold-dim); }
.region.locked .r-body { opacity: .5; }
.r-top { display: flex; align-items: center; gap: 10px; }
.r-name { font-size: 18px; color: var(--text); letter-spacing: 1px; }
.r-tag { font-size: 11px; padding: 3px 9px; border-radius: 3px; }
.r-tag.occupied { background: rgba(94,122,72,.18); color: var(--green); }
.r-tag.ready { background: rgba(201,162,74,.16); color: var(--gold-hi); }
.r-tag.weak { background: rgba(179,33,46,.16); color: var(--red-hi); }
.r-tag.locked { background: rgba(0,0,0,.3); color: var(--text-dim); }
.r-boss { font-size: 12px; color: var(--text-dim); margin-top: 4px; }
.r-meta { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; font-size: 12px; color: var(--text-dim); }
.r-meta b { color: var(--text); } .r-meta b.red { color: var(--red-hi); }
.r-btns { display: flex; gap: 10px; margin-top: 12px; }
.atk { font-family: var(--serif); background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; border-radius: 6px; padding: 9px 18px; font-size: 14px; font-weight: 700; cursor: pointer; }
.atk:disabled { background: rgba(0,0,0,.3); color: var(--text-dim); border: 1px solid var(--line); cursor: not-allowed; }
.brb { font-family: var(--serif); background: rgba(0,0,0,.3); color: var(--text-dim); border: 1px solid var(--line); border-radius: 6px; padding: 9px 14px; font-size: 13px; cursor: pointer; }
.brb:disabled { opacity: .4; cursor: not-allowed; }
</style>

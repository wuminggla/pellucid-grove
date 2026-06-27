<template>
  <div class="boot-shell">
    <div class="title">九条会</div>
    <div class="subtitle">前端界面 · 数据层探测</div>

    <div class="probe">
      <div class="probe-row" :class="probe.tavernHelper ? 'ok' : 'bad'">
        <span class="k">酒馆助手全局 (TavernHelper)</span>
        <span class="v">{{ probe.tavernHelper ? '✓ 可用' : '✗ 不可用' }}</span>
      </div>
      <div class="probe-row" :class="probe.getVariables ? 'ok' : 'bad'">
        <span class="k">getVariables</span>
        <span class="v">{{ probe.getVariables ? '✓ 可调' : '✗ 不可调' }}</span>
      </div>
      <div class="probe-row" :class="probe.mvu ? 'ok' : 'bad'">
        <span class="k">Mvu 全局</span>
        <span class="v">{{ probe.mvu ? '✓ 已初始化' : '✗ 未就绪' }}</span>
      </div>
      <div class="probe-row" :class="probe.statData ? 'ok' : 'bad'">
        <span class="k">MVU stat_data</span>
        <span class="v">{{ probe.statData ? '✓ 已注入' : '✗ 空' }}</span>
      </div>
      <div class="probe-row" :class="probe.generate ? 'ok' : 'bad'">
        <span class="k">generate (调 LLM)</span>
        <span class="v">{{ probe.generate ? '✓ 可调' : '✗ 不可调' }}</span>
      </div>
    </div>

    <div v-if="probe.statKeys.length" class="stat-keys">
      <div class="stat-keys-title">stat_data 顶层键 ({{ probe.statKeys.length }})</div>
      <div class="stat-keys-list">{{ probe.statKeys.join(' · ') }}</div>
    </div>

    <div class="meta">pellucid-grove · v2 · 原生前端界面机制</div>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted } from 'vue';

/**
 * App.vue · 数据层探测器(阶段1)
 *
 * 目的: 一次性验证三件事——
 *   1. 前端界面机制能渲染 Vue(看到本界面即证明)
 *   2. 酒馆全局函数在无沙盒 iframe 里可用(getVariables/generate/TavernHelper)
 *   3. MVU 变量(Mvu 全局 + stat_data)就绪
 * 这些是阶段2(UI翻译 + defineMvuDataStore 双向绑定)的前提条件。
 *
 * 探测结果全绿 → 进入 UI 翻译: 把 v1 GameScreen.tsx → App.vue,
 *   useDayRunner hook → Pinia store,接 defineMvuDataStore。
 */

const probe = reactive({
  tavernHelper: false,
  getVariables: false,
  mvu: false,
  statData: false,
  generate: false,
  statKeys: [] as string[],
});

function runProbe() {
  const w = window as any;
  probe.tavernHelper = typeof w.TavernHelper !== 'undefined';
  probe.getVariables = typeof w.getVariables === 'function';
  probe.mvu = typeof w.Mvu !== 'undefined';
  probe.generate = typeof w.generate === 'function' || typeof w.generateRaw === 'function'
    || (probe.tavernHelper && typeof w.TavernHelper.generate === 'function');

  if (probe.getVariables) {
    try {
      const vars = w.getVariables({ type: 'message' }) ?? {};
      const stat = vars.stat_data;
      if (stat && typeof stat === 'object') {
        probe.statData = true;
        probe.statKeys = Object.keys(stat);
      }
    } catch { /* ignore */ }
  }
  console.log('[pellucid] 数据层探测:', JSON.parse(JSON.stringify(probe)));
}

onMounted(() => {
  runProbe();
  // MVU 可能稍后才注入,2 秒后再探一次
  setTimeout(runProbe, 2000);
});
</script>

<style scoped>
.boot-shell {
  padding: 24px 20px;
  background: linear-gradient(180deg, #1a0e12 0%, #0e0809 100%);
  color: #e8dde0;
  font-family: 'Noto Serif SC', serif;
}
.title {
  font-size: 26px;
  letter-spacing: 6px;
  color: #e8c87a;
  text-align: center;
  margin-bottom: 4px;
}
.subtitle {
  font-size: 12px;
  color: #d96a8f;
  text-align: center;
  margin-bottom: 18px;
}
.probe {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.probe-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 12px;
  border-radius: 6px;
  font-size: 13px;
  border: 1px solid #2c1a20;
}
.probe-row.ok { background: rgba(122, 163, 122, 0.12); }
.probe-row.bad { background: rgba(224, 102, 102, 0.1); }
.probe-row .k { color: #b89098; }
.probe-row.ok .v { color: #7aa37a; }
.probe-row.bad .v { color: #e06666; }
.stat-keys {
  padding: 10px 12px;
  background: rgba(232, 200, 122, 0.08);
  border: 1px solid #2c1a20;
  border-radius: 6px;
  margin-bottom: 14px;
}
.stat-keys-title { font-size: 11px; color: #e8c87a; margin-bottom: 6px; }
.stat-keys-list { font-size: 12px; color: #b89098; line-height: 1.6; word-break: break-all; }
.meta {
  font-size: 11px;
  color: #8a6b73;
  letter-spacing: 1px;
  text-align: center;
}
</style>

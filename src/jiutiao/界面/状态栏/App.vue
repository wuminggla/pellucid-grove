<template>
  <div class="boot-shell">
    <div class="title">九条会</div>
    <div class="subtitle">前端正在初始化…</div>
    <div class="meta">
      <span>pellucid-grove · v2 (tavern_helper_template 工程)</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * App.vue · 空壳占位
 *
 * 阶段 1 (本次): 仅证明 $('body').load() → Vue mount 链路通。看到本组件渲染的"九条会"标题
 *               即说明集成路径打通,可以继续做 UI 翻译。
 * 阶段 2 (下批): 把 v1 工程的 GameScreen.tsx + StatusBar/SavePanel/AvEditor 翻译成 Vue,
 *              业务逻辑直接复用 src/jiutiao/game/* 的纯 TS 模块,接 defineMvuDataStore
 *              替代本地 EngineState,让 React state ↔ MVU 变量双向自动绑定。
 */
</script>

<style scoped>
.boot-shell {
  padding: 32px 24px;
  background: linear-gradient(180deg, #1a0e12 0%, #0e0809 100%);
  color: #e8dde0;
  border: 1px solid #3a2128;
  border-radius: 10px;
  font-family: 'Noto Serif SC', serif;
  text-align: center;
}
.title {
  font-size: 28px;
  letter-spacing: 6px;
  color: #e8c87a;
  margin-bottom: 6px;
}
.subtitle {
  font-size: 13px;
  color: #d96a8f;
  margin-bottom: 14px;
}
.meta {
  font-size: 11px;
  color: #8a6b73;
  letter-spacing: 1px;
}
</style>

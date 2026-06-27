import App from './App.vue';
import './global.css';

// 前端界面标准初始化(对齐 tavern_helper_template 官方状态栏示例)。
// 运行环境: 酒馆助手"前端界面"= 无沙盒 iframe, getVariables/Mvu/generate 等全局开箱即用。
// (v04-v10 的 PellucidLoader/srcdoc 脚本路线已废弃 — 把前端界面当"脚本"用绕了远路)
//
// 阶段1(当前): 不强依赖 MVU,先验证前端界面渲染 + 探测酒馆全局可用性。
//   App.vue 内自己探测 getVariables/Mvu 是否就绪并展示,便于一次性确认数据层。
// 阶段2(UI翻译): 改为标准 await waitGlobalInitialized('Mvu') + defineMvuDataStore 双向绑定。
$(() => {
  createApp(App).use(createPinia()).mount('#app');
});

import App from './App.vue';
import './global.css';

// 前端界面标准初始化(对齐 tavern_helper_template 官方状态栏示例)。
// 运行环境: 酒馆助手"前端界面"= 无沙盒 iframe, getVariables/Mvu/generate 等全局开箱即用。
//
// 加全局错误捕获: 挂载失败时把错误显示在界面(而非白屏),便于定位。
function showFatal(msg: string) {
  const el = document.getElementById('app');
  if (el) {
    el.innerHTML = '<div style="padding:20px;color:#e06666;background:#1a0e12;'
      + 'font-family:monospace;font-size:12px;white-space:pre-wrap;line-height:1.6;">'
      + '[pellucid 挂载失败]\n' + msg + '</div>';
  }
}

window.addEventListener('error', (e) => {
  showFatal('window.error: ' + (e.error?.stack || e.message || String(e)));
});
window.addEventListener('unhandledrejection', (e) => {
  showFatal('unhandledrejection: ' + (e.reason?.stack || String(e.reason)));
});

$(() => {
  try {
    console.log('[pellucid] 开始挂载 App');
    createApp(App).use(createPinia()).mount('#app');
    console.log('[pellucid] App 挂载完成');
  } catch (err: any) {
    console.error('[pellucid] 挂载异常', err);
    showFatal('mount catch: ' + (err?.stack || String(err)));
  }
});

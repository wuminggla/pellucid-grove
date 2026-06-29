import App from './App.vue';
import './global.css';
import { BUILD_VERSION } from './version';

console.log('[pellucid] 构建版本', BUILD_VERSION);

// ============================================================
// 入口 · "信息流只留启动按钮 + 全屏展开"
// ------------------------------------------------------------
// 运行环境: 酒馆助手"前端界面"= 楼层内无沙盒 iframe，generate/Mvu/getVariables 等全局开箱即用。
// 问题: 若把整套 UI 直接挂进楼层，会被挤进窄窄的消息列。
// 方案(产品方向): 楼层里只渲染一个【展开按钮】；点击后把 App 挂到酒馆【顶层窗口】(window.top)
//   的全屏宿主里覆盖显示——前端 JS 仍跑在楼层 iframe(保留 generate/Mvu 全局)，只是 DOM 提到顶层全屏。
//   global.css 已把全局样式收敛到 .pellucid-root，故把本文档 <style> 克隆进顶层 <head> 不会污染酒馆本体。
// 退化: 若拿不到 window.top(跨域/异常)，回退为楼层内直接挂载(虽挤但可用)。
// ============================================================

function showFatal(msg: string) {
  const el = document.getElementById('app');
  if (el) {
    el.innerHTML = '<div style="padding:16px;color:#e06666;background:#1a0e12;font-family:monospace;'
      + 'font-size:12px;white-space:pre-wrap;line-height:1.6;">[pellucid 挂载失败]\n' + msg + '</div>';
  }
}
window.addEventListener('error', (e) => showFatal('window.error: ' + ((e as ErrorEvent).error?.stack || (e as ErrorEvent).message || String(e))));
window.addEventListener('unhandledrejection', (e) => showFatal('unhandledrejection: ' + ((e as PromiseRejectionEvent).reason?.stack || String((e as PromiseRejectionEvent).reason))));

function getTopDoc(): Document | null {
  try { const d = window.top?.document; return d ?? null; } catch { return null; }
}

$(() => {
  try {
    const local = document.getElementById('app');
    if (!local) { console.warn('[pellucid] 无 #app'); return; }

    // —— 楼层里只放一个展开按钮 ——
    local.innerHTML = '';
    const btn = document.createElement('button');
    btn.textContent = '⚔ 展 开 · 九 条 会';
    btn.style.cssText = [
      'display:block', 'width:100%', 'max-width:460px', 'margin:8px auto', 'padding:15px',
      'font-family:"YFFYT","KingHwaOldSong",serif', 'font-size:24px', 'letter-spacing:8px',
      'color:#1a120a', 'cursor:pointer', 'border:1px solid #43350f', 'border-radius:10px',
      'background:linear-gradient(180deg,#ecc878,#c9a24a)', 'box-shadow:0 6px 20px rgba(0,0,0,.5)',
    ].join(';');
    local.appendChild(btn);

    let host: HTMLElement | null = null;   // 顶层全屏宿主
    let inlineMounted = false;             // 退化路径已挂载标记

    function open() {
      const topDoc = getTopDoc();

      // 退化路径: 拿不到顶层 → 楼层内直接挂载
      if (!topDoc || !topDoc.body) {
        if (!inlineMounted) {
          local!.innerHTML = '<div id="pellucid-inline"></div>';
          const app = createApp(App);
          app.provide('pellucidCollapse', () => { try { location.reload(); } catch { /* ignore */ } });
          app.use(createPinia()).mount('#pellucid-inline');
          inlineMounted = true;
        }
        return;
      }

      if (host) { host.style.display = 'block'; return; }

      // 1) 克隆本文档(楼层)的所有 <style> 到顶层 <head>（已 scope 到 .pellucid-root，安全）
      document.querySelectorAll('style').forEach((s) => {
        const c = topDoc.importNode(s, true) as HTMLElement;
        c.setAttribute('data-pellucid', '');
        topDoc.head.appendChild(c);
      });

      // 2) 全屏宿主
      host = topDoc.createElement('div');
      host.id = 'pellucid-fs';
      host.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:#0a0706;';
      topDoc.body.appendChild(host);

      // 3) 挂载 App（JS 仍在楼层 iframe 上下文 → 酒馆全局可用）。
      //    收起功能不再单独做按钮，而是 provide 给 App，由左栏「退出」按钮调用（隐藏宿主回酒馆，状态保留）。
      const mountEl = topDoc.createElement('div');
      host.appendChild(mountEl);
      const app = createApp(App);
      app.provide('pellucidCollapse', () => { if (host) host.style.display = 'none'; });
      app.use(createPinia()).mount(mountEl);
      console.log('[pellucid] 全屏前端已挂载');
    }

    btn.addEventListener('click', open);
    console.log('[pellucid] 启动按钮已就绪');
  } catch (err: any) {
    console.error('[pellucid] 入口异常', err);
    showFatal('entry catch: ' + (err?.stack || String(err)));
  }
});

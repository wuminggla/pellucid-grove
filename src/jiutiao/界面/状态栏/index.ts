import './vue-flags'; // 必须第一个 import:补 __VUE_PROD_DEVTOOLS__ 等 flag(CDN pinia 依赖·否则黑屏)
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

    // 批H7: 清理上一个 iframe 生命周期残留的顶层宿主(变量写入等可触发楼层重渲染→
    // iframe 重载,旧宿主 DOM 会僵死在顶层文档里)。重载后回到按钮态,由玩家重新展开。
    try {
      const stale = getTopDoc()?.getElementById('pellucid-fs');
      if (stale) { stale.remove(); console.log('[pellucid] 已清理陈旧顶层宿主'); }
    } catch { /* ignore */ }

    // —— 楼层里只放 木纹底板+金色展开按钮(批G4·用户定稿:开卡只见这一块) ——
    local.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'padding:34px 22px', 'border-radius:12px', 'border:1px solid #43350f',
      'background:linear-gradient(180deg,rgba(0,0,0,.16),rgba(0,0,0,.44)),'
        + 'repeating-linear-gradient(90deg,#181109 0px,#251a0e 6px,#120c07 13px,#221708 20px,#0f0a06 27px,#27190c 34px)',
      'box-shadow:inset 0 0 24px rgba(0,0,0,.6),0 8px 24px rgba(0,0,0,.45)',
    ].join(';');
    const btn = document.createElement('button');
    btn.textContent = '⚔ 展 开 · 九 条 会';
    btn.style.cssText = [
      'display:block', 'width:100%', 'max-width:460px', 'margin:0 auto', 'padding:15px',
      'font-family:"YFFYT","KingHwaOldSong",serif', 'font-size:24px', 'letter-spacing:8px',
      'color:#1a120a', 'cursor:pointer', 'border:1px solid #43350f', 'border-radius:10px',
      'background:linear-gradient(180deg,#ecc878,#c9a24a)', 'box-shadow:0 6px 20px rgba(0,0,0,.5)',
    ].join(';');
    wrap.appendChild(btn);
    local.appendChild(wrap);

    let host: HTMLElement | null = null;   // 顶层全屏宿主
    let inlineMounted = false;             // 退化路径已挂载标记

    function open() {
      // 批H5: open() 全程保护——此前只有 mount 段有 try,克隆样式/建宿主任何一步抛错
      // 都表现为"点击无反应"(v1.2.0 手机模拟实测卡第一步)。现在任何异常都直接上屏可截图。
      try {
        openInner();
      } catch (err: any) {
        const stack = err?.stack || String(err);
        console.error('[pellucid] open 失败', err);
        // 错误显示在楼层按钮区(顶层宿主可能没建成,楼层是唯一可靠画布)
        if (local) {
          local.innerHTML = '<div style="padding:16px;color:#e06666;background:#1a0e12;font-family:monospace;'
            + 'font-size:12px;white-space:pre-wrap;line-height:1.6;border-radius:8px;">[pellucid 展开失败 · 请把本屏截图发给开发]\n\n'
            + stack + '</div>';
        }
      }
    }

    function openInner() {
      const topDoc = getTopDoc();

      // 退化路径: 拿不到顶层 → 楼层内直接挂载
      // 批H7: ①硬性像素高度保底(iframe 高度自适应内容时,纯 fixed/vh 布局会塌成 0 高="前端消失")
      //       ②顶部路径徽标(诊断用:截图一眼看出走的是内联模式)
      if (!topDoc || !topDoc.body) {
        console.warn('[pellucid] path=inline 顶层不可达,楼层内退化挂载');
        if (!inlineMounted) {
          local!.innerHTML = '<div style="font:11px monospace;color:#c9a24a;padding:2px 6px;">[pellucid·内联模式]</div>'
            + '<div id="pellucid-inline" style="min-height:560px;height:70vh;"></div>';
          const app = createApp(App);
          app.provide('pellucidCollapse', () => { try { location.reload(); } catch { /* ignore */ } });
          app.use(createPinia()).mount('#pellucid-inline');
          inlineMounted = true;
        }
        return;
      }

      if (host) { host.style.display = 'block'; return; }

      // 1) 克隆本文档(楼层)的所有 <style> 到顶层 <head>（已 scope 到 .pellucid-root，安全）
      // 单条失败不阻塞(某条样式异常≠全部失败)
      document.querySelectorAll('style').forEach((s) => {
        try {
          const c = topDoc.importNode(s, true) as HTMLElement;
          c.setAttribute('data-pellucid', '');
          (topDoc.head ?? topDoc.body).appendChild(c);
        } catch (e) { console.warn('[pellucid] 样式克隆失败(跳过一条)', e); }
      });

      // 2) 全屏宿主
      host = topDoc.createElement('div');
      host.id = 'pellucid-fs';
      host.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:#0a0706;overflow:auto;-webkit-overflow-scrolling:touch;';
      topDoc.body.appendChild(host);

      // 批H4·手机: 确保顶层文档允许用户缩放(部分酒馆页 viewport 锁 user-scalable=no →
      // 玩家开"PC页面模式"后无法双指放大)。存在则放开,不存在则补一个标准 viewport。
      try {
        let vp = topDoc.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
        if (!vp) {
          vp = topDoc.createElement('meta');
          vp.name = 'viewport';
          topDoc.head?.appendChild(vp);
        }
        vp.content = 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes';
      } catch { /* viewport 调整失败不阻塞挂载 */ }

      // 3) 挂载 App（JS 仍在楼层 iframe 上下文 → 酒馆全局可用）。
      //    收起功能不再单独做按钮，而是 provide 给 App，由左栏「退出」按钮调用（隐藏宿主回酒馆，状态保留）。
      const mountEl = topDoc.createElement('div');
      host.appendChild(mountEl);
      try {
        const app = createApp(App);
        app.provide('pellucidCollapse', () => { if (host) host.style.display = 'none'; });
        app.use(createPinia()).mount(mountEl);
        console.log('[pellucid] path=fullscreen 全屏前端已挂载');
      } catch (mountErr: any) {
        // 挂载失败绝不留黑屏:把错误直接显示在全屏宿主里(可截图报修),并给退出按钮
        const stack = mountErr?.stack || String(mountErr);
        mountEl.innerHTML = '<div style="padding:24px;color:#e06666;font-family:monospace;font-size:13px;'
          + 'white-space:pre-wrap;line-height:1.7;">[pellucid 挂载失败 · ' + '请把本屏截图发给开发]\n\n' + stack
          + '\n\n<button onclick="document.getElementById(\'pellucid-fs\').style.display=\'none\'" '
          + 'style="margin-top:12px;padding:8px 18px;cursor:pointer;">关闭返回酒馆</button></div>';
        console.error('[pellucid] mount 失败', mountErr);
      }
    }

    btn.addEventListener('click', open);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) open(); }); // 批H5:木纹底板整块可点(手机小屏容错)
    // 批H7: 本 iframe 卸载(楼层重渲染/切聊天)时移除顶层宿主——JS 上下文已死,留着只会僵屏
    window.addEventListener('pagehide', () => { try { host?.remove(); } catch { /* ignore */ } });
    console.log('[pellucid] 启动按钮已就绪');
  } catch (err: any) {
    console.error('[pellucid] 入口异常', err);
    showFatal('entry catch: ' + (err?.stack || String(err)));
  }
});

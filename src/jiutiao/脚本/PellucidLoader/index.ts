/**
 * pellucid-grove 前端加载器 v08 · webpack ESM 编译产物
 * --------------------------------------------------
 * 部署机制(v08 校正):
 *   - 酒馆助手脚本 content 字段写 `import 'jsdelivr URL'` 一行(标准模式,对齐 MVU)
 *   - 浏览器以 ES module 加载该 URL,本文件作为模块顶层代码执行
 *   - webpack 编译时 outputModule=true,输出 ESM 格式 + 任意依赖打包(本文件零外部依赖)
 *
 * v04-v07 失败原因:
 *   - v04/v05 直接把 IIFE 源码塞 content 字段,酒馆助手按 ES module 执行时找不到 `$`
 *     (jQuery 全局在普通脚本环境可用,但 ES module 严格模式需显式 `window.$`)
 *   - 酒馆助手对 content 的执行机制可能要求 `import 'URL'` 标准格式,IIFE 被忽略
 *
 * v08 改:
 *   - 本文件由 webpack 编译,作为远程 ESM 由 jsdelivr 提供
 *   - 完全用 vanilla DOM API,不依赖 jQuery/Vue/Pinia(loader 阶段不需要)
 *
 * 远程产物: https://github.com/wuminggla/pellucid-grove (master 分支 dist/)
 * 镜像: testingcf.jsdelivr.net 优先,失败回落 cdn.jsdelivr.net
 */

const BASE_URL = 'https://testingcf.jsdelivr.net/gh/wuminggla/pellucid-grove/dist/jiutiao/界面/状态栏/index.html';
const FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/wuminggla/pellucid-grove/dist/jiutiao/界面/状态栏/index.html';
const ROOT_ID = 'pellucid-app-root';
const BODY_CLASS = 'pellucid-app-body';

function ensureAppRoot(): HTMLElement {
  const existing = document.getElementById(ROOT_ID);
  if (existing) {
    const body = existing.querySelector('.' + BODY_CLASS) as HTMLElement | null;
    if (body) return body;
  }

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.style.cssText = [
    'position:fixed',
    'top:64px',
    'right:20px',
    'width:min(460px,92vw)',
    'max-height:calc(100vh - 100px)',
    'overflow:hidden',
    'display:flex',
    'flex-direction:column',
    'z-index:9999',
    'background:#0a0608',
    'border:1px solid #3d2828',
    'border-radius:10px',
    'box-shadow:0 8px 32px rgba(0,0,0,0.7)',
    "font-family:'Noto Serif SC',serif",
    'color:#e8dde0',
  ].join(';');

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:#1a0e12;border-bottom:1px solid #3d2828;flex-shrink:0;';

  const title = document.createElement('span');
  title.style.cssText = 'font-size:12px;color:#8a6b73;letter-spacing:2px;';
  title.textContent = '九条会';
  bar.appendChild(title);

  const toggleBtn = document.createElement('button');
  toggleBtn.style.cssText = 'background:none;border:none;color:#8a6b73;cursor:pointer;font-size:13px;padding:2px 10px;';
  toggleBtn.textContent = '▁';
  bar.appendChild(toggleBtn);
  root.appendChild(bar);

  const body = document.createElement('div');
  body.className = BODY_CLASS;
  body.style.cssText = 'flex:1;overflow-y:auto;min-height:0;';
  root.appendChild(body);

  toggleBtn.addEventListener('click', function () {
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? '' : 'none';
    toggleBtn.textContent = isHidden ? '▁' : '▔';
  });

  document.body.appendChild(root);
  console.log('[pellucid] 容器已创建·挂到 body');
  return body;
}

async function fetchAndInject(targetEl: HTMLElement, url: string): Promise<void> {
  const r = await fetch(url, { credentials: 'omit', mode: 'cors' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.head.querySelectorAll('style').forEach((s) => {
    targetEl.appendChild(s.cloneNode(true));
  });

  Array.from(doc.body.childNodes).forEach((node) => {
    if (node.nodeType === 1 && (node as Element).tagName === 'SCRIPT') return;
    targetEl.appendChild(node.cloneNode(true));
  });

  const allScripts: HTMLScriptElement[] = [];
  doc.head.querySelectorAll('script').forEach((s) => allScripts.push(s as HTMLScriptElement));
  doc.body.querySelectorAll('script').forEach((s) => allScripts.push(s as HTMLScriptElement));

  for (const oldScript of allScripts) {
    const newScript = document.createElement('script');
    Array.from(oldScript.attributes).forEach((attr) => {
      newScript.setAttribute(attr.name, attr.value);
    });
    newScript.textContent = oldScript.textContent || '';
    targetEl.appendChild(newScript);
  }
}

let loadPromise: Promise<void> | null = null;
function tryLoadOnce(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const body = ensureAppRoot();
    body.innerHTML = '<div style="padding:32px;color:#8a6b73;text-align:center;">前端正在加载…</div>';
    try {
      await fetchAndInject(body, BASE_URL);
      console.log('[pellucid] loaded from testingcf');
    } catch (e1: any) {
      console.warn('[pellucid] testingcf 失败,回落 cdn.jsdelivr.net:', e1?.message ?? e1);
      body.innerHTML = '<div style="padding:32px;color:#8a6b73;text-align:center;">回落镜像加载中…</div>';
      try {
        await fetchAndInject(body, FALLBACK_URL);
        console.log('[pellucid] loaded from cdn.jsdelivr.net');
      } catch (e2: any) {
        console.error('[pellucid] 两个镜像都失败:', e2?.message ?? e2);
        body.innerHTML =
          '<div style="color:#e06666;padding:32px;text-align:center;">⚠ 前端加载失败<br><small>' +
          (e2?.message ?? String(e2)) +
          '</small></div>';
        loadPromise = null;
      }
    }
  })();
  return loadPromise;
}

function whenReady(fn: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

console.log('[pellucid] v08 ESM bundle 顶层执行 (诊断锚点·webpack 编译产物)');

whenReady(() => {
  console.log('[pellucid] DOM ready, init 启动');
  tryLoadOnce();
});

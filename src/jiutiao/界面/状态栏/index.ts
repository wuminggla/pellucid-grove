/**
 * 状态栏入口 · 酒馆主页 $('body').load() 加载的目标
 *
 * 工作机制:
 *  - 酒馆侧通过状态栏正则 replaceString 输出一段 <script>$('body').load(URL)</script>
 *  - URL 指向 jsdelivr 上本工程构建产物 dist/{ProjectName}/界面/状态栏/index.html
 *  - jQuery 同源 AJAX 拿到这份单文件 HTML(JS/CSS 全内联),注入酒馆主页 DOM
 *  - script 执行时,jQuery DOM ready 钩到下面,挂载 Vue app 到 #app
 *  - 卡切换时酒馆主页触发 pagehide → Vue app 卸载防泄漏
 */
import { createApp } from 'vue';
import App from './App.vue';

$(() => {
  const app = createApp(App).use(createPinia());
  app.mount('#app');
  $(window).on('pagehide', () => app.unmount());
});

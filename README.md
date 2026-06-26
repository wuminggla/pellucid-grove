# pellucid-grove(jiutiao-frontend v2)

> 九条会角色卡的大前端工程。Vue 3 + Pinia + Webpack 5,基于 [tavern_helper_template](https://github.com/StageDog/tavern_helper_template)。

**先读**: 上层 [README](../README.md) — 工作区布局(三个工程的关系)。

## 这个工程干什么

被酒馆角色卡 `九条会.png` 的状态栏正则加载,接管 UI 和游戏循环:

```
玩家进酒馆 → 选开场白 → 状态栏正则触发
       ↓
[jQuery $('#pellucid-mount').load('https://testingcf.jsdelivr.net/gh/wuminggla/pellucid-grove/dist/jiutiao/界面/状态栏/index.html')]
       ↓
酒馆 DOM 里出现 Vue app(本工程构建产物的单文件 HTML)
       ↓
Vue 通过 defineMvuDataStore 双向绑定酒馆 MVU 变量,跑游戏循环
```

## 部署机制(关键)

- **直接 push dist 到 master 分支**(不是 gh-pages,不需要 GitHub Actions)
- jsdelivr 自动同步 git 仓库
- 卡里的状态栏正则用 `testingcf.jsdelivr.net` 镜像(对 .html 返回 text/html MIME)
- 锁版本用 commit sha(`@<sha7>` 后缀)

## 工程结构

```
jiutiao-frontend/
├── README.md                                ← 本文档
├── package.json                             ← name=pellucid-grove
├── webpack.config.ts                        ← 模板自带,扫描 src/**/index.{ts,tsx,js,jsx} 作为 entry
├── pnpm-workspace.yaml                      ← pnpm 11 的 allowBuilds 配置
├── tsconfig.json
├── tailwind.css
├── dist/                                    ← 构建产物(进 git,jsdelivr 拉这里)
│   └── jiutiao/界面/状态栏/index.html       ← 单文件 HTML(JS/CSS 内联,Vue/Pinia 走 ESM CDN)
├── src/
│   └── jiutiao/                             ← 我们的项目子目录
│       ├── schema.ts                        ← MVU schema(从 v1 迁来)
│       ├── game/                            ← 16 个业务逻辑模块(纯 TS+单测,从 v1 迁来零改动)
│       └── 界面/状态栏/                     ← Vue UI 入口(webpack 扫到的 entry)
│           ├── index.ts                     ← jQuery ready + createApp(App).mount('#app')
│           ├── index.html                   ← 极简 <div id="app"></div>
│           └── App.vue                      ← 主组件(当前是空壳"九条会"占位)
├── docs/
│   ├── 迭代日志.md                          ← 思路时间线(新对话必读)
│   ├── 迁移记录-v1到v2.md                   ← v1 废弃原因 + v2 设计决策
│   ├── v1-迭代日志.md                       ← v1 完整迭代日志(归档参考)
│   └── v1-部署与发版.md.deprecated          ← v1 部署文档(已过时)
├── 示例/                                    ← 模板自带示例(可删,不影响构建)
└── 初始模板/                                ← 模板自带初始模板(可删)
```

## 开发流程

### 本地开发

```sh
pnpm watch                # 实时构建·监控 src 变化
```

### 构建 + 发布

```sh
pnpm build                # 输出 dist/jiutiao/界面/状态栏/index.html(单文件)
git add dist
git commit -m "build: <描述>"
git push origin master    # jsdelivr 自动同步,5-10 分钟生效
```

无需重新打卡(只要卡里的正则 URL 不带 sha 锁版本)。

### 锁版本发布(给玩家)

```sh
git push
git rev-parse HEAD | cut -c1-7   # 取 commit sha 前 7 位
# 改 jiutiao/正则/状态栏界面.html 里的 URL,把 @latest 改为 @<sha7>
node ~/.claude/skills/tavern-cards/scripts/tavern-cards-forge.mjs pack jiutiao
```

## 框架/版本

| 项 | 版本 |
|---|---|
| Vue | 3.5 |
| Pinia | 最新 |
| Webpack | 5.107 |
| pnpm | 11 |
| Node | 22+ |
| TypeScript | 6.0 dev |

外部 ESM CDN(runtime 加载):
- Vue / Pinia(通过 testingcf.jsdelivr.net/npm/.../+esm)
- jQuery(酒馆已全局加载)

## 已知限制 / 待办

详见 `docs/迭代日志.md` 最新一段。当前进度:
- ✅ 工程迁移到 tavern_helper_template
- ✅ 业务代码(game/ 16 模块)迁入 src/jiutiao/
- ✅ 空壳 Vue 入口 build 通过(1.5KB 单文件 HTML)
- ⏳ UI 翻译(GameScreen.tsx → App.vue 等)·下一批
- ⏳ 接 defineMvuDataStore 双向绑定 MVU·UI 翻译时一并做

## 故障排查

| 现象 | 原因 / 解法 |
|------|-------------|
| pnpm install 失败:ERR_PNPM_IGNORED_BUILDS | `pnpm-workspace.yaml` 里 allowBuilds 没全 true |
| build 失败:找不到 createApp / pinia | unplugin-auto-import 没扫到,`pnpm install` 重装 |
| build 成功但 dist 里没 index.js,只 .map | **正常** — JS 已内联到 index.html |
| 酒馆里 mount 不显示 | jsdelivr 还没同步(看 git push);或正则没启用 |
| jsdelivr 拉到 text/plain | 用了 cdn.jsdelivr.net;切到 testingcf.jsdelivr.net |

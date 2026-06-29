# 新 UI（极道手账 · 木纹②）工程说明

> 新对话/后期改动必读。本文件解释新前端 UI 的**架构、组件职责、数据来源、占位项**，便于调整。
> 视觉定稿见 `docs/ui-mockups/变体B-木纹方案2.html`（HTML 空壳原型，是本实现的视觉真相源）。

## 1. 视觉系统（design tokens）

集中在 `src/jiutiao/界面/状态栏/global.css` 的 `:root`：

- **配色**：黑金为主（背景/边框/按钮）+ 红装饰 + 白文字。变量 `--gold/--gold-hi/--gold-dim/--red/--red-hi/--text/--text-dim/--line/--ink/--panel`。
- **字体**（zeoseven CDN，@import 在 global.css 顶部）：
  - 标题/水墨：云峰飞云体 `--brush`（YFFYT，446）
  - 正文/正体：京华老宋体 `--serif`（KingHwaOldSong，309）
- **木纹**：`--wood-h`（横向，顶栏）/`--wood-v`（纵向，左栏）= 方案② 粗犷大纹，无打光。
- **滚动条**：全局细化暗金（融合式）。

改配色/字体/木纹只动 global.css 的 `:root` 与对应 wood 变量。切换 UI 风格（设置里"更换风格"）= 换一套 tokens。

## 2. 布局与组件树

`App.vue` = 外壳，CSS Grid 三列两行（顶栏跨列）：

```
┌──────────── Masthead（顶栏·跨列）──────────────┐
│ NavRail │      Stage（主舞台）       │ RinPanel │
│ (左栏)  │  当前只渲染「行动」视图     │ (右栏凛) │
└─────────┴───────────────────────────┴──────────┘
```

| 组件 | 文件 | 职责 | 数据来源 |
|------|------|------|---------|
| **App.vue** | `界面/状态栏/App.vue` | 外壳布局 + 导航视图切换 + 「行动」视图编排（分配/逐格执行/反馈/遮罩） | runner-store |
| **Masthead.vue** | `components/Masthead.vue` | logo + 顶部状态条（资金/威望/打手/欲望/避孕套/堕落度 + 悬停浮窗 + 点击钉住） | engine |
| **NavRail.vue** | `components/NavRail.vue` | 左侧木纹导航按钮 + 存读档/设置/退出 | v-model:view |
| **DaySlider.vue** | `components/DaySlider.vue` | 日夜分配滑动长条（整格吸附·拖拽） | emit allocate(day,night) |
| **SlotCard.vue** | `components/SlotCard.vue` | 单个行动格（选行动/进行中/已结算展开正文） | App 传入 slot |
| **RinPanel.vue** | `components/RinPanel.vue` | 立绘人像 + 可折叠秘密状态（身体开发四部位/特殊性癖/生育经期） | engine |

导航 `view`：当前只有 `行动` 是完整可玩视图；`地盘/升级/影业/大小姐/留档/设置` 是占位面板（对应待办 #11~#15，玩法接入后逐个填）。

## 3. 数据映射 / 占位清单

✅=已接真数据　🟡=占位（对应后端待办，玩法/变量完善后接）

**顶部状态条**
- 资金 ✅ `engine.money`；流水明细 🟡（task #12 资源流水账本未做，先用最近一格的已知 delta 拼）
- 威望双色条 ✅ `martialPrestige`(极道) / `infamy`(淫名) 算占比
- 打手·在场 ✅ `thugTotal` / `presentCount`；招募额度 ✅ `recruitQuota`
- 群体欲望 ✅ `desire/desireCapacity`；今晨累积 ✅ `desireAddedThisMorning`
- 避孕套 ✅ `condomStock`；昨日/今日消耗 + 折线图 🟡（消耗未逐日追踪，task 待建）
- 堕落度 ✅ `corruption`/`cognition`；下阶段距离+奖励 ✅（读 COGNITION_THRESHOLDS + REWARD_GATES 计算）

**右栏秘密状态**
- 身体开发度·四部位 ✅ `engine.bodyDevelopment`（口腔/小穴/肛门/子宫生育，各 0-4 级）
- 每部位次数（插入/内射等）🟡（未分部位计数）
- 特殊性癖·三项觉醒度 🟡（受虐癖/暴露癖/便器意识，未建变量）
- 内心独白 🟡（按 cognition 给一句占位文案）
- 怀孕 ✅ `engine.pregnant`；经期 ✅ `isDangerousPeriod`

占位项都在组件里用 `// TODO(数据)` 标注，接后端时按本表替换。

## 4. 与旧实现的关系

- 旧 `App.vue`（功能版·朴素样式）整体被本版替换；业务调用（runner-store 的 allocate/runCurrent/rerunLast/nextDay 等）原样复用，只换表现层。
- `components/StatusBar.vue`（旧顶栏）废弃不再引用，保留文件备查。
- 发版流程不变（见 `../../新对话接手交接.md`），pack 后务必解码验证卡内 sha。

## 5. 改动指引（后期）

- 调色/字体/木纹 → global.css `:root`
- 加/改顶部数值 → Masthead.vue 的 `stats` 计算 + 对应浮窗
- 接某个占位数据 → 按 §3 表找到 🟡 项，组件内 `// TODO(数据)` 处替换
- 新增导航页（地盘/升级…）→ NavRail 的 items + App.vue 的视图分支换成真实面板组件

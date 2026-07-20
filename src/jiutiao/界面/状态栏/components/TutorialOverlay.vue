<!--
  TutorialOverlay · 新手教程(批G2·用户批注定稿)
  full 模式(每聊天首次): 牌匾演出(点击展开)→开场白(运行时读卡)→目标→怎么开始→避孕套警示→界面循环。
  guide 模式(设置页重看): 仅指引页(怎么开始/避孕套/界面循环),不含牌匾/开场白/目标。
-->
<template>
  <div class="tut-overlay">
    <button class="tut-skip" @click="$emit('close')">{{ mode === 'guide' ? '✕ 关闭' : '跳过教程 ✕' }}</button>

    <!-- 页0·牌匾演出(仅full) -->
    <div v-if="page === 'plaque'" class="tut-page plaque-page" @click="next">
      <div class="plaque">
        <div class="plaque-frame">
          <div class="plaque-text">血债血偿<br>百倍奉还</div>
          <div class="plaque-sub">九 条 家 家 训</div>
        </div>
      </div>
      <div class="plaque-hint">—— 点击牌匾 ——</div>
    </div>

    <!-- 页1·开场白(仅full·运行时读卡) -->
    <div v-else-if="page === 'story'" class="tut-page">
      <div class="tut-body story-body"><span class="first">{{ storyFirst }}</span>{{ storyRest }}</div>
      <div class="tut-btns"><button class="tut-next" @click="next">继续 ▸</button></div>
    </div>

    <!-- 页2·目标(仅full) -->
    <div v-else-if="page === 'goal'" class="tut-page">
      <h2 class="tut-h">你 的 目 标</h2>
      <div class="tut-body">
        <div class="goal-row"><b>白天——夺回九条会失去的一切。</b><br>攻打地盘，击败四个阶段的 Boss，最终向杀害凛父母的弥生道会长复仇。</div>
        <div class="goal-row"><b>夜晚——大宅的另一面。</b><br>打手们的忠诚需要「供奉」来维系，大小姐的处境由你的每个安排决定。</div>
        <div class="goal-row"><b>结局在你手里。</b><br>金盆洗手 / 畸形团体 / 堕落生育——右栏「结局倾向」实时显示滑向哪里。经营崩盘（威望断绝或资金枯竭）则九条会覆灭。</div>
      </div>
      <div class="tut-btns"><button class="tut-next" @click="next">继续 ▸</button></div>
    </div>

    <!-- 页3·怎么开始(指引) -->
    <div v-else-if="page === 'start'" class="tut-page">
      <h2 class="tut-h">怎 么 开 始</h2>
      <div class="tut-body">
        <div class="goal-row">每天清晨，把<b>行动格</b>分配给白天与夜晚 → 逐格选事件 → 执行看正文 → 一天结束进入次日。</div>
        <div class="goal-row"><b>战斗</b>：地盘页选目标，「攻打据点」占地盘赚产出与极道威望；驻防打手守住已占地盘。<br><b>招募</b>：「招募打手」扩充人手——打手是武力，也是夜晚的欲望来源。</div>
        <div class="goal-row">新手建议：第一天先「招募打手」「收保护费」攒家底，夜里安排「供奉」稳住忠诚。</div>
      </div>
      <div class="tut-btns"><button class="tut-next" @click="next">继续 ▸</button></div>
    </div>

    <!-- 页4·避孕套(指引·初始0警示) -->
    <div v-else-if="page === 'condom'" class="tut-page">
      <h2 class="tut-h">大 宅 的 规 矩</h2>
      <div class="tut-body">
        <div class="goal-row rose"><b>有套，就用套；没套，就直接内射。</b><br>这是大小姐与打手们的「约定」——供奉消耗避孕套，库存见底时，后果自负。</div>
        <div class="goal-row">而且这群人渣坚决不自己买，也不许网购——<b>必须大小姐亲自出门采购</b>。</div>
        <div class="goal-row warn">当前库存：<b>{{ condomStock }} 个</b>。今天就安排一格「采购避孕套」，记住这个系统。</div>
      </div>
      <div class="tut-btns"><button class="tut-next" @click="next">继续 ▸</button></div>
    </div>

    <!-- 页5·界面与循环(指引·末页) -->
    <div v-else-if="page === 'ui'" class="tut-page">
      <h2 class="tut-h">界 面 与 循 环</h2>
      <div class="tut-body">
        <div class="goal-row"><b>行动</b>——每天的主舞台（分配/执行/正文）。<br><b>地盘</b>——攻打·驻防·战报。<br><b>升级</b>——花钱强化；带♥的是另一种东西。<br><b>影业</b>——后期解锁。</div>
        <div class="goal-row dim">辅助：存档（4手动+1自动栏位）· 留档（收藏满意的正文）· 设置（前文记忆 / 副API / 重看本教程）。</div>
      </div>
      <div class="tut-btns"><button class="tut-next gold" @click="$emit('close')">开始经营 ▸</button></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { getOpeningStory } from '../../../game/story/opening';
import { useRunnerStore } from '../runner-store';

const props = defineProps<{ mode: 'full' | 'guide' }>();
defineEmits<{ close: [] }>();

const r = useRunnerStore();
const condomStock = computed(() => r.engine.condomStock);

const FULL_PAGES = ['plaque', 'story', 'goal', 'start', 'condom', 'ui'] as const;
const GUIDE_PAGES = ['start', 'condom', 'ui'] as const;
const pages = computed<readonly string[]>(() => props.mode === 'guide' ? GUIDE_PAGES : FULL_PAGES);
const idx = ref(0);
const page = computed(() => pages.value[idx.value]);
function next() { if (idx.value < pages.value.length - 1) idx.value++; }

const story = getOpeningStory();
const storyFirst = story.slice(0, 1);
const storyRest = story.slice(1);
</script>

<style scoped>
.tut-overlay { position: fixed; inset: 0; z-index: 90; background: rgba(8, 5, 4, .96); display: flex; align-items: center; justify-content: center; }
.tut-skip { position: absolute; top: 20px; right: 26px; font-family: var(--serif); background: transparent; border: 1px solid var(--line); color: var(--text-dim); border-radius: 6px; padding: 7px 16px; font-size: 13px; cursor: pointer; z-index: 2; }
.tut-skip:hover { color: var(--text); }
.tut-page { width: min(760px, 92vw); max-height: 88vh; display: flex; flex-direction: column; }
.tut-h { font-family: var(--brush); font-size: 34px; color: var(--gold-hi); letter-spacing: 10px; text-align: center; margin-bottom: 22px; flex: none; }
.tut-body { overflow-y: auto; min-height: 0; padding: 0 8px; }
.story-body { font-size: 15px; line-height: 2.1; color: var(--text); white-space: pre-wrap; }
.story-body .first { font-family: var(--brush); font-size: 34px; color: var(--gold-hi); float: left; line-height: 1; padding: 4px 8px 0 0; }
.goal-row { font-size: 15px; line-height: 1.9; color: var(--text); border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; margin-bottom: 12px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); }
.goal-row b { color: var(--gold-hi); }
.goal-row.rose b { color: var(--rose-hi); }
.goal-row.warn { border-color: var(--red); }
.goal-row.warn b { color: var(--red-hi); }
.goal-row.dim { color: var(--text-dim); font-size: 13px; }
.tut-btns { flex: none; display: flex; justify-content: center; padding-top: 20px; }
.tut-next { font-family: var(--serif); background: transparent; border: 1px solid var(--gold-dim); color: var(--gold-hi); border-radius: 8px; padding: 12px 42px; font-size: 15px; letter-spacing: 3px; cursor: pointer; }
.tut-next:hover { background: rgba(201,162,74,.1); }
.tut-next.gold { background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; font-weight: 700; box-shadow: 0 6px 18px rgba(201,162,74,.3); }
/* 牌匾演出 */
.plaque-page { align-items: center; cursor: pointer; }
.plaque { display: flex; justify-content: center; }
.plaque-frame { background: linear-gradient(180deg, #2a1c10, #1a110a); border: 3px solid var(--gold-dim); box-shadow: inset 0 0 0 6px #0a0706, inset 0 0 0 8px rgba(201,162,74,.35), 0 18px 50px rgba(0,0,0,.7); border-radius: 8px; padding: 46px 56px; text-align: center; animation: plaqueGlow 2.4s ease-in-out infinite; }
.plaque-text { font-family: var(--brush); font-size: 52px; line-height: 1.5; color: var(--text); letter-spacing: 14px; }
.plaque-sub { margin-top: 20px; font-size: 13px; color: var(--gold-dim); letter-spacing: 8px; }
.plaque-hint { text-align: center; margin-top: 34px; font-size: 14px; color: var(--gold-dim); letter-spacing: 6px; animation: hintPulse 1.8s ease-in-out infinite; }
@keyframes plaqueGlow { 0%, 100% { box-shadow: inset 0 0 0 6px #0a0706, inset 0 0 0 8px rgba(201,162,74,.35), 0 18px 50px rgba(0,0,0,.7); } 50% { box-shadow: inset 0 0 0 6px #0a0706, inset 0 0 0 8px rgba(201,162,74,.6), 0 18px 60px rgba(201,162,74,.15); } }
@keyframes hintPulse { 0%, 100% { opacity: .4; } 50% { opacity: 1; } }
</style>

<!--
  AvPanel · 影业/AV 视图（#17）
  职责: 解锁后定制AV(题材/场景/玩法多选/时长)→排入今日白天行动格,执行该格时注入定制范式。
  未解锁(未建摄影室)显示引导。数据: engine.av + av 模块 canShootAv/buildAvParadigm/consumeShoot。
  设计§9: AV 解锁后引入淫名机制;周编辑次数有限;选项注入行动格执行(置顶 pinned)。
-->
<template>
  <div class="av">
    <div class="av-head">
      <div class="a-title">影业 · 暗网AV</div>
      <div class="a-stats" v-if="unlocked">
        <span>本周次数 <b>{{ av.weeklyQuota }}/{{ av.weeklyQuotaMax }}</b></span>
        <span>时长上限 <b>{{ av.durationCap }}h</b></span>
        <span>累计拍摄 <b>{{ av.shotCount }}</b></span>
        <span>淫名 <b>{{ r.engine.infamy }}</b></span>
      </div>
    </div>

    <!-- 未解锁引导 -->
    <div v-if="!unlocked" class="locked-box">
      <div class="lb-icn">◉</div>
      <div class="lb-t">AV 系统未解锁</div>
      <div class="lb-s">前往「升级 · 扩张解锁」建造 <b>暗网摄影室</b>（¥8000）。建成后将强制演出第一部AV，并引入<b>淫名</b>机制（淫名计入总威望，让招募更易、AV 更好卖）。</div>
    </div>

    <template v-else>
      <div v-if="r.lastAv" class="a-feedback" :class="{ ok: r.lastAv.ok, bad: !r.lastAv.ok }">{{ r.lastAv.msg }}</div>

      <div class="builder">
        <div class="field">
          <label>题材</label>
          <div class="chips">
            <button v-for="t in THEMES" :key="t" class="chip" :class="{ on: def.theme === t }" @click="def.theme = t">{{ t }}</button>
          </div>
        </div>
        <div class="field">
          <label>场景</label>
          <div class="chips">
            <button v-for="s in SETTINGS" :key="s" class="chip" :class="{ on: def.setting === s }" @click="def.setting = s">{{ s }}</button>
          </div>
        </div>
        <div class="field">
          <label>玩法<span class="hint">(可多选·至少1)</span></label>
          <div class="chips">
            <button v-for="p in PLAYS" :key="p" class="chip" :class="{ on: def.plays.includes(p) }" @click="togglePlay(p)">{{ p }}</button>
          </div>
        </div>
        <div class="field" v-if="def.setting.includes('角色扮演')">
          <label>角色扮演填空</label>
          <input v-model="def.setupNote" class="text-in" placeholder="如：继兄设定 / 精灵俘虏 / 某二次元角色…" />
        </div>
        <div class="field">
          <label>时长 <b class="dur">{{ def.durationHours }}h</b><span class="hint">(上限 {{ av.durationCap }}h)</span></label>
          <input type="range" min="1" :max="av.durationCap" v-model.number="def.durationHours" class="range" />
        </div>
        <div class="actions">
          <div class="preview">{{ previewLine }}</div>
          <button class="shoot" :disabled="!ready.ok" @click="onShoot">{{ ready.ok ? '排入今日 · 开拍 ▶' : ready.reason }}</button>
        </div>
      </div>

      <div v-if="av.customs.length" class="gallery">
        <div class="g-title">拍摄档案（{{ av.customs.length }}）</div>
        <div class="g-list">
          <div v-for="(c, i) in recent" :key="i" class="g-item">
            <span class="g-th">{{ c.theme }}</span>
            <span class="g-se">{{ c.setting }}</span>
            <span class="g-pl">{{ c.plays.join('/') }}</span>
            <span class="g-du">{{ c.durationHours }}h</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useRunnerStore } from '../runner-store';
import { defaultAvState, isAvSystemUnlocked, canShootAv, buildAvPrompt } from '../../../game/av/machine';
import type { AvTheme, AvSetting, AvPlay, AvDefinition } from '../../../game/av/machine';

const r = useRunnerStore();
const unlocked = computed(() => isAvSystemUnlocked(r.engine));
const av = computed(() => r.engine.av ?? defaultAvState());

const THEMES: AvTheme[] = ['玩具调教', '高潮挑战', '男M', '女M', '本格性爱', '目隐NTR', '目前NTR', '人数挑战', '时长挑战'];
const SETTINGS: AvSetting[] = ['学校', '职场', '医院', '伦理乱伦', '奇幻角色扮演', '二次元角色扮演', '偶像'];
const PLAYS: AvPlay[] = ['口', '手', '足', '小穴', '臀'];

const def = reactive<AvDefinition>({ theme: '本格性爱', setting: '学校', plays: ['小穴'], durationHours: 8, setupNote: '' });

function togglePlay(p: AvPlay) {
  const i = def.plays.indexOf(p);
  if (i >= 0) { if (def.plays.length > 1) def.plays.splice(i, 1); }
  else def.plays.push(p);
}

const ready = computed(() => canShootAv(r.engine, def as AvDefinition));
const previewLine = computed(() => `${def.theme} × ${def.setting} · ${def.plays.join('/')} · ${def.durationHours}h`);
const recent = computed(() => av.value.customs.slice(-8).reverse());

function onShoot() {
  const ok = r.queueAvShoot(JSON.parse(JSON.stringify(def)));
  void buildAvPrompt; void ok; // prompt 由 store 注入行动格
}
</script>

<style scoped>
.av { padding: 18px 26px; overflow-y: auto; height: 100%; }
.av-head { display: flex; align-items: baseline; gap: 16px; margin-bottom: 12px; }
.a-title { font-family: var(--brush); font-size: 28px; color: var(--gold-hi); }
.a-stats { margin-left: auto; display: flex; gap: 14px; font-size: 13px; color: var(--text-dim); }
.a-stats b { color: var(--gold-hi); font-size: 15px; }
.a-feedback { margin-bottom: 12px; padding: 9px 14px; border-radius: 7px; font-size: 13px; }
.a-feedback.ok { background: rgba(94,122,72,.12); border: 1px solid #3a4a2a; color: var(--green); }
.a-feedback.bad { background: rgba(179,33,46,.1); border: 1px solid var(--red); color: var(--red-hi); }

.locked-box { border: 1px dashed var(--gold-dim); border-radius: 12px; padding: 30px; text-align: center; max-width: 560px; margin: 30px auto; }
.lb-icn { font-size: 44px; color: var(--gold-dim); }
.lb-t { font-family: var(--brush); font-size: 24px; color: var(--gold-hi); margin: 8px 0; }
.lb-s { font-size: 13px; color: var(--text-dim); line-height: 1.8; }
.lb-s b { color: var(--gold); }

.builder { border: 1px solid var(--line); border-radius: 10px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); padding: 16px 18px; }
.field { margin-bottom: 14px; }
.field > label { display: block; font-size: 13px; color: var(--gold); letter-spacing: 1px; margin-bottom: 7px; }
.field .hint { font-size: 11px; color: var(--text-dim); margin-left: 6px; }
.field .dur { color: var(--gold-hi); }
.chips { display: flex; flex-wrap: wrap; gap: 7px; }
.chip { font-family: var(--serif); font-size: 13px; color: var(--text-dim); background: rgba(0,0,0,.3); border: 1px solid var(--line); border-radius: 16px; padding: 6px 14px; cursor: pointer; transition: .12s; }
.chip:hover { color: var(--text); border-color: var(--gold-dim); }
.chip.on { color: #1a120a; font-weight: 700; background: linear-gradient(180deg, var(--gold-hi), var(--gold)); border-color: var(--gold); }
.text-in { width: 100%; background: rgba(0,0,0,.3); border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; color: var(--text); font-family: var(--serif); font-size: 13px; }
.range { width: 100%; accent-color: var(--gold); }
.actions { display: flex; align-items: center; gap: 14px; margin-top: 6px; border-top: 1px solid var(--line); padding-top: 12px; }
.preview { flex: 1; font-size: 12px; color: var(--text-dim); }
.shoot { font-family: var(--serif); background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; border-radius: 6px; padding: 10px 20px; font-size: 14px; font-weight: 700; letter-spacing: 1px; cursor: pointer; }
.shoot:disabled { background: rgba(0,0,0,.3); color: var(--text-dim); border: 1px solid var(--line); cursor: not-allowed; font-weight: 400; }

.gallery { margin-top: 18px; }
.g-title { font-family: var(--serif); font-size: 15px; color: var(--gold); letter-spacing: 1px; margin-bottom: 8px; }
.g-list { display: flex; flex-direction: column; gap: 6px; }
.g-item { display: flex; gap: 12px; font-size: 12px; padding: 7px 12px; background: rgba(0,0,0,.25); border: 1px solid var(--line); border-radius: 6px; }
.g-th { color: var(--gold-hi); } .g-se { color: var(--text); } .g-pl { color: var(--text-dim); } .g-du { margin-left: auto; color: var(--gold-dim); }
</style>

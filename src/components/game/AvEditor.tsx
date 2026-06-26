// AV 编辑面板 · 玩家定制 AV 拍摄
// 流程: 选择题材/场景/玩法/时长 → 调 buildAvParadigm 拼成 ParadigmRef → 关闭面板,等玩家把"拍 AV"格塞入定制定义
// 当前简化: 面板内点"拍这一部"后,直接更新 av state(consumeShoot)并设置一个全局 lastAvDefinition,
//   交由 GameScreen 在下次执行 av_custom 格时拿走(目前没办法走 SlotChoice.params 注入 inlinePrompt,
//   要走会污染 SlotChoice 类型;先用全局回调最少入侵)。
// 真生产做法: SlotChoice.params 加 avDefinition,settleSlot 在 av_custom 命中时覆盖 paradigm.inlinePrompt=buildAvPrompt(def)。

import { useState } from 'react';
import {
  canShootAv, consumeShoot, buildAvParadigm,
  type AvDefinition, type AvTheme, type AvSetting, type AvPlay,
} from '../../game/av/machine';
import type { EngineState } from '../../game/engine/types';

const THEMES: AvTheme[] = ['玩具调教', '高潮挑战', '男M', '女M', '本格性爱', '目隐NTR', '目前NTR', '人数挑战', '时长挑战'];
const SETTINGS: AvSetting[] = ['学校', '职场', '医院', '伦理乱伦', '奇幻角色扮演', '二次元角色扮演', '偶像'];
const PLAYS: AvPlay[] = ['口', '手', '足', '小穴', '臀'];

const C = {
  bg: '#140c0f', panel: '#1d1216', panelHi: '#241318',
  border: '#3a2128', borderSoft: '#2c1a20',
  text: '#e8dde0', dim: '#8a6b73', gold: '#e8c87a', rose: '#d96a8f', green: '#7aa37a',
};

export function AvEditor({
  engine, onClose, onCommit,
}: {
  engine: EngineState;
  onClose: () => void;
  /** 提交回调: 已扣 weeklyQuota / 已写入 customs / 返回新 engine + 用于本次执行的 inlinePrompt */
  onCommit: (engine: EngineState, inlinePrompt: string, def: AvDefinition) => void;
}) {
  const av = engine.av;
  const [theme, setTheme] = useState<AvTheme>('本格性爱');
  const [setting, setSetting] = useState<AvSetting>('学校');
  const [plays, setPlays] = useState<AvPlay[]>(['小穴', '口']);
  const [duration, setDuration] = useState(24);
  const [setupNote, setSetupNote] = useState('');

  const def: AvDefinition = {
    theme, setting, plays, durationHours: duration,
    setupNote: setupNote.trim() || undefined,
  };
  const check = canShootAv(engine, def);

  const togglePlay = (p: AvPlay) => {
    setPlays(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const handleCommit = () => {
    if (!check.ok || !av) return;
    const newAv = consumeShoot(av, def);
    const ref = buildAvParadigm(def);
    onCommit({ ...engine, av: newAv }, ref.inlinePrompt!, def);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
        width: 'min(560px, 92vw)', maxHeight: '88vh', overflowY: 'auto',
        color: C.text, fontFamily: '"Noto Serif SC", serif',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.borderSoft}`, display: 'flex', alignItems: 'center' }}>
          <span style={{ flex: 1, fontSize: 16, color: C.gold, letterSpacing: 1.5 }}>AV 定制 · 编辑器</span>
          <span style={{ fontSize: 12, color: C.dim }}>
            本周剩余 {av?.weeklyQuota ?? 0} / {av?.weeklyQuotaMax ?? 0} 次
          </span>
        </div>

        <div style={{ padding: 18 }}>
          <Section title="题材" desc="定基调">
            <Choice options={THEMES} value={theme} onChange={setTheme} />
          </Section>

          <Section title="场景" desc="定情景外壳与服装">
            <Choice options={SETTINGS} value={setting} onChange={setSetting} />
          </Section>

          <Section title="玩法" desc="多选 · 笔墨侧重选中部位">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PLAYS.map(p => (
                <button key={p} onClick={() => togglePlay(p)}
                  style={{
                    padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                    background: plays.includes(p) ? C.rose : C.panel,
                    color: plays.includes(p) ? '#1a0e12' : C.text,
                    border: `1px solid ${plays.includes(p) ? C.rose : C.borderSoft}`,
                    fontWeight: plays.includes(p) ? 700 : 400, fontSize: 13,
                  }}>{p}</button>
              ))}
            </div>
          </Section>

          <Section title="时长" desc={`小时 · 上限 ${av?.durationCap ?? 48}h(可升级)`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min={1} max={av?.durationCap ?? 48} step={1}
                value={duration} onChange={e => setDuration(Number(e.target.value))}
                style={{ flex: 1 }} />
              <span style={{ minWidth: 64, fontSize: 14, color: C.gold, fontVariantNumeric: 'tabular-nums' }}>
                {duration} 小时
              </span>
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
              {duration < 8 ? '中等(8h内·标准)' : duration < 24 ? '长(8-24h·分Part)' : '超长(24h+·环境光流转/地板垃圾堆积)'}
            </div>
          </Section>

          {setting === '奇幻角色扮演' || setting === '二次元角色扮演' || setting === '伦理乱伦' ? (
            <Section title="角色扮演填空" desc="NPC关系/扮演角色(可选)">
              <input value={setupNote} onChange={e => setSetupNote(e.target.value)}
                placeholder="例: 凛扮演护士被多名病人轮"
                style={{
                  width: '100%', padding: '8px 10px', boxSizing: 'border-box',
                  background: C.panel, color: C.text, border: `1px solid ${C.borderSoft}`,
                  borderRadius: 6, fontSize: 13,
                }} />
            </Section>
          ) : null}

          {!check.ok && (
            <div style={{ padding: 10, background: '#3a1518', border: `1px solid ${C.rose}`, borderRadius: 6, fontSize: 12, color: C.rose, marginBottom: 12 }}>
              ⚠ {check.reason}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose}
              style={{ padding: '8px 16px', background: C.border, color: C.text, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              取消
            </button>
            <button disabled={!check.ok} onClick={handleCommit}
              style={{
                padding: '8px 16px', background: check.ok ? C.rose : C.border,
                color: check.ok ? '#1a0e12' : C.dim,
                border: 'none', borderRadius: 6, cursor: check.ok ? 'pointer' : 'not-allowed',
                fontSize: 13, fontWeight: 700,
              }}>
              确认拍摄 ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ color: C.gold, fontSize: 13, letterSpacing: 1 }}>{title}</span>
        {desc && <span style={{ marginLeft: 8, color: C.dim, fontSize: 11 }}>{desc}</span>}
      </div>
      {children}
    </div>
  );
}

function Choice<T extends string>({ options, value, onChange }: {
  options: readonly T[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)}
          style={{
            padding: '5px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
            background: value === o ? C.gold : C.panel,
            color: value === o ? '#1a0e12' : C.text,
            border: `1px solid ${value === o ? C.gold : C.borderSoft}`,
            fontWeight: value === o ? 700 : 400,
          }}>{o}</button>
      ))}
    </div>
  );
}

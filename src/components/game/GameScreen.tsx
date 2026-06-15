import { useMemo, useState } from 'react';
import { useDayRunner } from '../../hooks/useDayRunner';
import { StatusBar } from './StatusBar';
import { ApiConfigPanel, loadApiSettings } from './ApiConfigPanel';
import { availableParadigms } from '../../game/paradigm/machine';
import {
  demoRegistry, demoSummaryTemplates, demoExtractBounds, createMockAi,
} from '../../game/engine/mock-ai';
import { createRealAi } from '../../game/engine/real-ai';
import { buildExpandMessages, buildExtractMessages } from '../../game/engine/prompt';
import { createApiRouter } from '../../sillytavern/api-router';
import type { ApiSettings } from '../../sillytavern/types';
import type { EngineState } from '../../game/engine/types';
import type { ActionSlot, SlotPeriod } from '../../game/action-grid/types';

const INITIAL_ENGINE: EngineState = {
  triggeredSpecials: {}, unlocked: {}, // 演示：anal 未解锁
  corruption: 0, cognition: '死撑', claimedGates: {},
  money: 8000, thugTotal: 30, presentCount: 18, isDangerousPeriod: false,
};

const C = {
  bg: '#140c0f', panel: '#1d1216', border: '#3a2128', borderSoft: '#2c1a20',
  text: '#e8dde0', dim: '#8a6b73', gold: '#e8c87a', rose: '#d96a8f', danger: '#e06666',
  btn: '#3a2128', btnHover: '#52303a',
};

/** 行动格选项下拉：列出该 optionId 池中已解锁的范式 */
function optionsForUI(engine: EngineState) {
  const ctx = { triggeredSpecials: engine.triggeredSpecials, unlocked: engine.unlocked };
  const all: Array<{ optionId: string; paradigmId: string; label: string; special: boolean }> = [];
  for (const optionId of Object.keys(demoRegistry)) {
    for (const def of availableParadigms(demoRegistry, optionId, ctx)) {
      all.push({ optionId, paradigmId: def.paradigmId, label: def.label, special: def.isSpecial });
    }
  }
  return all;
}

function SlotCard({
  slot, options, onPick, onClear, isCurrent,
}: {
  slot: ActionSlot;
  options: ReturnType<typeof optionsForUI>;
  onPick: (optionId: string, label: string) => void;
  onClear: () => void;
  isCurrent: boolean;
}) {
  const border = isCurrent ? C.rose : (slot.locked ? C.danger : C.border);
  return (
    <div style={{
      background: C.panel, border: `1px solid ${border}`, borderRadius: 8, padding: 12,
      boxShadow: isCurrent ? `0 0 0 2px ${C.rose}55` : 'none',
    }}>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>
        {slot.period === 'day' ? '白天' : '夜晚'} · 第{slot.index + 1}格
        {slot.locked && <span style={{ color: C.danger }}> ⚠{slot.lockedBy}占用</span>}
        {slot.status === 'running' && <span style={{ color: C.rose }}> ● 进行中…</span>}
        {slot.status === 'done' && <span style={{ color: '#7aa37a' }}> ✓ 完成</span>}
      </div>
      {slot.status === 'done' ? (
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{slot.resultText}</div>
      ) : slot.locked ? (
        <div style={{ fontSize: 13, color: C.danger }}>{slot.choice?.label}</div>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={slot.choice?.optionId ?? ''}
            onChange={e => {
              const opt = options.find(o => o.optionId === e.target.value);
              if (opt) onPick(opt.optionId, opt.label);
            }}
            style={{
              flex: 1, background: C.bg, color: C.text, border: `1px solid ${C.borderSoft}`,
              borderRadius: 6, padding: '6px 8px', fontSize: 13,
            }}
          >
            <option value="">— 选择行动 —</option>
            {options.map(o => (
              <option key={o.paradigmId} value={o.optionId}>
                {o.label}{o.special ? ' ★' : ''}
              </option>
            ))}
          </select>
          {slot.choice && <button onClick={onClear} style={btnStyle()}>清</button>}
        </div>
      )}
    </div>
  );
}

function btnStyle(primary = false): React.CSSProperties {
  return {
    background: primary ? C.rose : C.btn, color: primary ? '#1a0e12' : C.text,
    border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13,
    cursor: 'pointer', fontWeight: primary ? 700 : 400,
  };
}

export function GameScreen() {
  const [apiSettings, setApiSettings] = useState<ApiSettings | null>(() => loadApiSettings());
  const [showConfig, setShowConfig] = useState(false);

  // 有API配置→真AI(接api-router)，否则→mock AI
  const ai = useMemo(() => {
    if (apiSettings?.apiKey) {
      const router = createApiRouter(apiSettings);
      return createRealAi({ router, buildExpandMessages, buildExtractMessages });
    }
    return createMockAi();
  }, [apiSettings]);

  const usingReal = !!apiSettings?.apiKey;

  const r = useDayRunner({
    initialEngine: INITIAL_ENGINE,
    totalSlots: 8,
    settleOptions: {
      registry: demoRegistry, ai,
      summaryTemplates: demoSummaryTemplates, extractBounds: demoExtractBounds,
    },
  });

  const options = useMemo(() => optionsForUI(r.engine), [r.engine]);
  const phase = r.day.phase;

  const renderSlots = (period: SlotPeriod, slots: ActionSlot[]) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
      {slots.map(slot => (
        <SlotCard
          key={`${period}-${slot.index}`}
          slot={slot}
          options={options}
          isCurrent={r.day.cursor?.period === period && r.day.cursor?.index === slot.index}
          onPick={(optionId, label) => r.setChoice(period, slot.index, { optionId, label })}
          onClear={() => r.clearChoice(period, slot.index)}
        />
      ))}
    </div>
  );

  return (
    <div style={{
      maxWidth: 920, margin: '0 auto', padding: 20, minHeight: '100vh',
      background: C.bg, color: C.text, fontFamily: '"Noto Serif SC", serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, letterSpacing: 4, color: C.gold, margin: 0, fontWeight: 700 }}>
          九条会 <span style={{ fontSize: 12, color: C.dim, letterSpacing: 1 }}>· 行动格演示</span>
        </h1>
        <button onClick={() => setShowConfig(true)} style={{ ...btnStyle(), fontSize: 12, padding: '6px 12px' }}>
          ⚙ API{usingReal ? `（${apiSettings!.model}${apiSettings!.secondary?.enabled ? '·双AI' : ''}）` : '（mock）'}
        </button>
      </div>

      {showConfig && (
        <ApiConfigPanel
          onClose={() => setShowConfig(false)}
          onSave={s => { setApiSettings(s); setShowConfig(false); }}
        />
      )}

      <StatusBar engine={r.engine} day={r.day} />

      {r.error && (
        <div style={{ margin: '12px 0', padding: 10, background: '#3a1518', border: `1px solid ${C.danger}`, borderRadius: 6, color: C.danger, fontSize: 13 }}>
          ⚠ {r.error}
        </div>
      )}

      {/* 快进开关 */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0', fontSize: 13, color: C.dim, cursor: 'pointer' }}>
        <input type="checkbox" checked={r.fastForward} onChange={e => r.setFastForward(e.target.checked)} />
        快进模式（非首次事件不调AI，直接出总结词+CG）
      </label>

      {/* —— 分配阶段 —— */}
      {phase === 'allocating' && (
        <AllocatePanel r={r} renderSlots={renderSlots} />
      )}

      {/* —— 白天/夜晚执行 —— */}
      {(phase === 'day_running' || phase === 'day_settled') && (
        <Section title="白天 · A面经营">
          {renderSlots('day', r.day.daySlots)}
          {phase === 'day_running' && (
            <button disabled={r.busy} onClick={r.runCurrent} style={{ ...btnStyle(true), marginTop: 14 }}>
              {r.busy ? '结算中…' : '执行当前格 ▶'}
            </button>
          )}
          {phase === 'day_settled' && (
            <button onClick={r.beginNight} style={{ ...btnStyle(true), marginTop: 14 }}>进入夜晚 ▶</button>
          )}
        </Section>
      )}

      {(phase === 'night_running' || phase === 'night_settled') && (
        <>
          {r.day.daySlots.length > 0 && (
            <Section title="白天 · 已结算" dim>
              {renderSlots('day', r.day.daySlots)}
            </Section>
          )}
          <Section title="夜晚 · B面供奉">
            {renderSlots('night', r.day.nightSlots)}
            {phase === 'night_running' && (
              <button disabled={r.busy} onClick={r.runCurrent} style={{ ...btnStyle(true), marginTop: 14 }}>
                {r.busy ? '结算中…' : '执行当前格 ▶'}
              </button>
            )}
            {phase === 'night_settled' && (
              <button onClick={r.nextDay} style={{ ...btnStyle(true), marginTop: 14 }}>结束今天 · 进入次日 ▶</button>
            )}
          </Section>
        </>
      )}

      {/* 结算反馈 */}
      {r.lastSettle && (r.lastSettle.events.isFirstSpecial || r.lastSettle.events.firedGateIds.length > 0) && (
        <div style={{ marginTop: 16, padding: 12, background: '#22141a', border: `1px solid ${C.rose}`, borderRadius: 8 }}>
          {r.lastSettle.events.isFirstSpecial && (
            <div style={{ color: C.rose, fontSize: 13 }}>
              ◆ 首次特殊事件！堕落度 +{r.lastSettle.events.corruptionGain}
              {r.lastSettle.events.cognitionAdvancedTo && ` → 认知防线推进至「${r.lastSettle.events.cognitionAdvancedTo}」`}
            </div>
          )}
          {r.lastSettle.events.firedGateIds.length > 0 && (
            <div style={{ color: C.gold, fontSize: 13, marginTop: 4 }}>
              ◆ 触发奖励闸门：{r.lastSettle.events.firedGateIds.join(', ')}（资源涌入）
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children, dim }: { title: string; children: React.ReactNode; dim?: boolean }) {
  return (
    <div style={{ marginTop: 18, opacity: dim ? 0.6 : 1 }}>
      <div style={{ fontSize: 13, color: '#b08a93', letterSpacing: 2, marginBottom: 10, borderLeft: '3px solid #d96a8f', paddingLeft: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function AllocatePanel({ r, renderSlots }: {
  r: ReturnType<typeof useDayRunner>;
  renderSlots: (period: SlotPeriod, slots: ActionSlot[]) => React.ReactNode;
}) {
  const total = r.day.totalSlots;
  const allocated = r.day.daySlots.length + r.day.nightSlots.length > 0;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 13, color: '#b08a93', letterSpacing: 2, marginBottom: 10 }}>
        早 7:00 · 分配今日 {total} 行动格（白天经营 / 夜晚供奉；白天0格=请假）
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {Array.from({ length: total + 1 }, (_, dayN) => (
          <button key={dayN} onClick={() => r.allocate(dayN, total - dayN)}
            style={{
              ...btnStyle(r.day.dayCount === dayN && allocated),
              padding: '6px 10px', fontSize: 12,
            }}>
            白{dayN}/夜{total - dayN}
          </button>
        ))}
      </div>

      {allocated && (
        <>
          {r.day.daySlots.length > 0 && <Section title="白天行动安排">{renderSlots('day', r.day.daySlots)}</Section>}
          {r.day.nightSlots.length > 0 && <Section title="夜晚行动安排">{renderSlots('night', r.day.nightSlots)}</Section>}
          <button onClick={r.beginDay} style={{ ...btnStyle(true), marginTop: 16 }}>确定分配 · 开始这一天 ▶</button>
        </>
      )}
    </div>
  );
}

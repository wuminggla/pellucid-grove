import { useMemo, useState, useEffect } from 'react';
import { useDayRunner } from '../../hooks/useDayRunner';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { StatusBar } from './StatusBar';
import { CharacterPane } from './CharacterPane';
import { ApiConfigPanel, loadApiSettings } from './ApiConfigPanel';
import { SavePanel } from './SavePanel';
import { autosave } from '../../game/save/store';
import { buildMenu } from '../../game/events/machine';
import type { EventContext } from '../../game/events/types';
import {
  demoEventOptions, demoSummaryTemplates, demoExtractBounds, demoForcedPool, createMockAi,
} from '../../game/engine/mock-ai';
import { createRealAi } from '../../game/engine/real-ai';
import { buildExpandMessages, buildExtractMessages } from '../../game/engine/prompt';
import { createApiRouter } from '../../sillytavern/api-router';
import type { ApiSettings } from '../../sillytavern/types';
import type { EngineState } from '../../game/engine/types';
import type { ActionSlot, SlotPeriod } from '../../game/action-grid/types';

const INITIAL_ENGINE: EngineState = {
  triggeredSpecials: {}, unlocked: {},
  corruption: 0, cognition: '死撑', claimedGates: {},
  money: 8000, thugTotal: 30, garrison: 0, loyalty: 60,
  condomStock: 480, desire: 0, desireCapacity: 60, perSlotThroughput: 6,
  infamy: 0, martialPrestige: 0,
  recruitQuota: 0, presentCount: 18, isDangerousPeriod: false,
  servedThisNight: 0,
};

const C = {
  bg: '#140c0f', bg2: '#0e0809', panel: '#1d1216', panelHi: '#241318',
  border: '#3a2128', borderSoft: '#2c1a20',
  text: '#e8dde0', dim: '#8a6b73', gold: '#e8c87a', rose: '#d96a8f', danger: '#e06666', green: '#7aa37a',
};

/** 从 EngineState 构造 events 上下文 */
function eventCtx(engine: EngineState): EventContext {
  return {
    corruption: engine.corruption, cognition: engine.cognition,
    infamy: engine.infamy, thugs: engine.thugTotal,
    triggeredLedger: engine.triggeredSpecials, unlocked: engine.unlocked,
  };
}

/** 某时段菜单（统一模型 buildMenu：已解锁/♥标记/置顶排序）。 */
function optionsForPeriod(engine: EngineState, period: SlotPeriod) {
  return buildMenu(Object.values(demoEventOptions), eventCtx(engine), period)
    .map(e => ({ optionId: e.option.id, label: e.label, isNsfw: e.isNsfw }));
}

function btn(primary = false, small = false): React.CSSProperties {
  return {
    background: primary ? C.rose : C.border, color: primary ? '#1a0e12' : C.text,
    border: 'none', borderRadius: 6, padding: small ? '5px 10px' : '9px 18px',
    fontSize: small ? 12 : 14, cursor: 'pointer', fontWeight: primary ? 700 : 400,
    transition: 'background .15s',
  };
}

/** 折叠式行动格卡片：默认紧凑(只显示标题/状态)，点击展开看正文 */
function SlotCard({
  slot, period, options, onPick, onClear, isCurrent, expanded, onToggle,
}: {
  slot: ActionSlot; period: SlotPeriod;
  options: ReturnType<typeof optionsForPeriod>;
  onPick: (optionId: string, label: string) => void;
  onClear: () => void;
  isCurrent: boolean; expanded: boolean; onToggle: () => void;
}) {
  const border = isCurrent ? C.rose : (slot.locked ? C.danger : C.border);
  const statusTag = slot.locked ? <span style={{ color: C.danger }}>⚠{slot.lockedBy}</span>
    : slot.status === 'running' ? <span style={{ color: C.rose }}>● 进行中</span>
    : slot.status === 'done' ? <span style={{ color: C.green }}>✓</span>
    : slot.status === 'planned' ? <span style={{ color: C.gold }}>●</span>
    : <span style={{ color: C.dim }}>○</span>;

  const canExpand = slot.status === 'done' && !!slot.resultText;

  return (
    <div style={{
      background: isCurrent ? C.panelHi : C.panel,
      border: `1px solid ${border}`, borderRadius: 8, overflow: 'hidden',
      boxShadow: isCurrent ? `0 0 0 2px ${C.rose}44` : 'none',
    }}>
      {/* 卡头：始终紧凑 */}
      <div
        onClick={canExpand ? onToggle : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          cursor: canExpand ? 'pointer' : 'default',
        }}
      >
        <span style={{ fontSize: 11, color: C.dim, minWidth: 38 }}>
          {period === 'day' ? '白' : '夜'}{slot.index + 1}
        </span>
        <span style={{ flex: 1, fontSize: 13, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {slot.choice?.label ?? <span style={{ color: C.dim }}>未安排</span>}
        </span>
        <span style={{ fontSize: 12 }}>{statusTag}</span>
        {canExpand && <span style={{ fontSize: 10, color: C.dim }}>{expanded ? '▲' : '▼'}</span>}
      </div>

      {/* 编辑态：下拉选行动 */}
      {!slot.locked && slot.status !== 'done' && slot.status !== 'running' && (
        <div style={{ display: 'flex', gap: 6, padding: '0 10px 10px' }}>
          <select
            value={slot.choice?.optionId ?? ''}
            onChange={e => {
              const opt = options.find(o => o.optionId === e.target.value);
              if (opt) onPick(opt.optionId, opt.label);
            }}
            style={{ flex: 1, background: C.bg2, color: C.text, border: `1px solid ${C.borderSoft}`, borderRadius: 6, padding: '6px 8px', fontSize: 13 }}
          >
            <option value="">— 选择{period === 'day' ? '经营' : '供奉'}行动 —</option>
            {options.map(o => (
              <option key={o.optionId} value={o.optionId}>{o.label}</option>
            ))}
          </select>
          {slot.choice && <button onClick={onClear} style={btn(false, true)}>清</button>}
        </div>
      )}

      {/* 展开态：正文 */}
      {expanded && canExpand && (
        <div style={{
          padding: '10px 12px', borderTop: `1px solid ${C.borderSoft}`,
          fontSize: 13.5, color: C.text, lineHeight: 1.75, background: C.bg2,
          maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap',
        }}>
          {slot.resultText}
        </div>
      )}
    </div>
  );
}

export function GameScreen() {
  const [apiSettings, setApiSettings] = useState<ApiSettings | null>(() => loadApiSettings());
  const [showConfig, setShowConfig] = useState(false);
  const [showSaves, setShowSaves] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const ai = useMemo(() => {
    if (apiSettings?.apiKey) {
      const router = createApiRouter(apiSettings);
      return createRealAi({ router, buildExpandMessages, buildExtractMessages });
    }
    return createMockAi();
  }, [apiSettings]);
  const usingReal = !!apiSettings?.apiKey;

  const r = useDayRunner({
    initialEngine: INITIAL_ENGINE, totalSlots: 8,
    settleOptions: {
      eventOptions: demoEventOptions, ai, summaryTemplates: demoSummaryTemplates,
      extractBounds: demoExtractBounds, forcedPool: demoForcedPool,
    },
  });

  const isMobile = useMediaQuery('(max-width: 720px)');
  const phase = r.day.phase;

  // 每进入新一天自动存档（dayNumber 变化时）
  useEffect(() => {
    if (r.day.dayNumber > 1) {
      void autosave(r.runnerState, r.fastForward, Date.now());
    }
  }, [r.day.dayNumber]);
  const dayOpts = useMemo(() => optionsForPeriod(r.engine, 'day'), [r.engine]);
  const nightOpts = useMemo(() => optionsForPeriod(r.engine, 'night'), [r.engine]);

  // 执行格时自动展开当前格正文
  const autoExpand = (period: SlotPeriod, idx: number) => setExpandedKey(`${period}-${idx}`);

  const slotGrid = (period: SlotPeriod, slots: ActionSlot[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {slots.map(slot => {
        const key = `${period}-${slot.index}`;
        return (
          <SlotCard
            key={key} slot={slot} period={period}
            options={period === 'day' ? dayOpts : nightOpts}
            isCurrent={r.day.cursor?.period === period && r.day.cursor?.index === slot.index}
            expanded={expandedKey === key}
            onToggle={() => setExpandedKey(expandedKey === key ? null : key)}
            onPick={(optionId, label) => r.setChoice(period, slot.index, { optionId, label })}
            onClear={() => r.clearChoice(period, slot.index)}
          />
        );
      })}
    </div>
  );

  const runCurrent = async () => {
    if (r.day.cursor) autoExpand(r.day.cursor.period, r.day.cursor.index);
    await r.runCurrent();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      background: C.bg, color: C.text, fontFamily: '"Noto Serif SC", serif', overflow: 'hidden',
    }}>
      {/* 顶部状态栏 */}
      <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ flex: 1, padding: '8px 12px' }}>
          <StatusBar engine={r.engine} day={r.day} />
        </div>
        <div style={{ display: 'flex', gap: 8, margin: 12, alignSelf: 'center' }}>
          <button onClick={() => setShowSaves(true)} style={{ ...btn(false, true), whiteSpace: 'nowrap' }}>💾 存档</button>
          <button onClick={() => setShowConfig(true)} style={{ ...btn(false, true), whiteSpace: 'nowrap' }}>
            ⚙ {usingReal ? `${apiSettings!.model}${apiSettings!.secondary?.enabled ? '·双AI' : ''}` : 'mock'}
          </button>
        </div>
      </div>

      {/* 主体：左立绘 + 右内容 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 0 }}>
        {/* 立绘区：桌面左侧窄栏(26%)，移动端顶部短栏 */}
        <div style={isMobile
          ? { height: '34vh', minHeight: 200, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }
          : { width: '26%', minWidth: 200, maxWidth: 360, borderRight: `1px solid ${C.border}` }}>
          <CharacterPane engine={r.engine} />
        </div>

        {/* 右内容区 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, position: 'relative' }}>
          {/* 顶部工具行 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 18px', borderBottom: `1px solid ${C.borderSoft}` }}>
            <span style={{ fontSize: 13, color: C.dim, letterSpacing: 1 }}>
              {phaseLabel(phase)}
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.dim, cursor: 'pointer', marginLeft: 'auto' }}>
              <input type="checkbox" checked={r.fastForward} onChange={e => r.setFastForward(e.target.checked)} />
              快进
            </label>
          </div>

          {/* 滚动内容 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
            {r.error && (
              <div style={{ marginBottom: 12, padding: 10, background: '#3a1518', border: `1px solid ${C.danger}`, borderRadius: 6, color: C.danger, fontSize: 13 }}>
                ⚠ {r.error}
              </div>
            )}

            {phase === 'allocating' && <AllocatePanel r={r} slotGrid={slotGrid} />}

            {(phase === 'day_running' || phase === 'day_settled') && (
              <Section title="白天 · A面经营">
                {slotGrid('day', r.day.daySlots)}
              </Section>
            )}

            {(phase === 'night_running' || phase === 'night_settled') && (
              <>
                {r.day.daySlots.length > 0 && (
                  <Section title="白天 · 已结算" dim>{slotGrid('day', r.day.daySlots)}</Section>
                )}
                <Section title="夜晚 · B面供奉"
                  action={phase === 'night_running'
                    ? <button onClick={() => r.fillEmpty('night', { optionId: 'serve', label: '供奉打手' })} style={btn(false, true)}>一键全供奉</button>
                    : undefined}>
                  {slotGrid('night', r.day.nightSlots)}
                </Section>
              </>
            )}

            {/* 结算反馈 */}
            {r.lastSettle && (r.lastSettle.events.isFirstSpecial || r.lastSettle.events.firedGateIds.length > 0) && (
              <div style={{ marginTop: 14, padding: 12, background: '#22141a', border: `1px solid ${C.rose}`, borderRadius: 8 }}>
                {r.lastSettle.events.isFirstSpecial && (
                  <div style={{ color: C.rose, fontSize: 13 }}>
                    ◆ 首次特殊事件！堕落度 +{r.lastSettle.events.corruptionGain}
                    {r.lastSettle.events.cognitionAdvancedTo && ` → 认知防线推进至「${r.lastSettle.events.cognitionAdvancedTo}」`}
                  </div>
                )}
                {r.lastSettle.events.firedGateIds.length > 0 && (
                  <div style={{ color: C.gold, fontSize: 13, marginTop: 4 }}>
                    ◆ 奖励闸门触发：{r.lastSettle.events.firedGateIds.join(', ')}（资源涌入）
                  </div>
                )}
              </div>
            )}

            {/* 避孕套不足警告 */}
            {r.lastServe?.condomShort && (
              <div style={{ marginTop: 10, padding: 10, background: '#3a1518', border: `1px solid ${C.danger}`, borderRadius: 6, color: C.danger, fontSize: 13 }}>
                ⚠ 避孕套库存不足！本场出现无套内射风险（怀孕判定链）
              </div>
            )}

            {/* 夜晚收尾结算反馈 */}
            {r.lastNight && (
              <div style={{ marginTop: 10, padding: 10, background: '#1a1420', border: `1px solid ${C.borderSoft}`, borderRadius: 6, fontSize: 13, color: C.dim }}>
                夜晚收尾：未供奉 {r.lastNight.unserved} 人 → 群体欲望 +{r.lastNight.desireGained}
                {r.lastNight.overflow && <span style={{ color: C.danger, marginLeft: 8 }}>⚠ 欲望溢出！次日将触发强制请假轮奸</span>}
              </div>
            )}
          </div>

          {/* 底部操作栏（固定） */}
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 18px', display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', background: C.bg2 }}>
            {(phase === 'day_running' || phase === 'night_running') && (
              <>
                {!r.canRunCurrent && (
                  <span style={{ fontSize: 12, color: C.dim, marginRight: 'auto' }}>请先为当前格选择行动</span>
                )}
                <button disabled={r.busy || !r.canRunCurrent} onClick={runCurrent}
                  style={{ ...btn(true), opacity: (r.busy || !r.canRunCurrent) ? 0.45 : 1, cursor: (r.busy || !r.canRunCurrent) ? 'not-allowed' : 'pointer' }}>
                  {r.busy ? '结算中…' : '执行当前格 ▶'}
                </button>
              </>
            )}
            {phase === 'day_settled' && <button onClick={r.beginNight} style={btn(true)}>进入夜晚 ▶</button>}
            {phase === 'night_settled' && <button onClick={r.nextDay} style={btn(true)}>结束今天 · 次日 ▶</button>}
          </div>
        </div>
      </div>

      {showConfig && (
        <ApiConfigPanel onClose={() => setShowConfig(false)} onSave={s => { setApiSettings(s); setShowConfig(false); }} />
      )}
      {showSaves && (
        <SavePanel
          current={r.runnerState}
          fastForward={r.fastForward}
          onLoad={(state, ff) => { r.loadState(state, ff); setShowSaves(false); }}
          onClose={() => setShowSaves(false)}
        />
      )}
    </div>
  );
}

function phaseLabel(phase: string): string {
  return ({
    allocating: '早 7:00 · 分配今日行动',
    day_running: '白天进行中', day_settled: '白天结束',
    night_running: '夜晚进行中', night_settled: '今日结束',
  } as Record<string, string>)[phase] ?? phase;
}

function Section({ title, children, dim, action }: { title: string; children: React.ReactNode; dim?: boolean; action?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18, opacity: dim ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ flex: 1, fontSize: 13, color: '#b08a93', letterSpacing: 2, borderLeft: '3px solid #d96a8f', paddingLeft: 8 }}>
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function AllocatePanel({ r, slotGrid }: {
  r: ReturnType<typeof useDayRunner>;
  slotGrid: (period: SlotPeriod, slots: ActionSlot[]) => React.ReactNode;
}) {
  const total = r.day.totalSlots;
  const allocated = r.day.daySlots.length + r.day.nightSlots.length > 0;
  return (
    <div>
      <div style={{ fontSize: 13, color: '#b08a93', letterSpacing: 1, marginBottom: 10 }}>
        分配 {total} 行动格（白天经营 / 夜晚供奉；白天0格 = 请假）
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {Array.from({ length: total + 1 }, (_, dayN) => {
          const active = allocated && r.day.dayCount === dayN;
          return (
            <button key={dayN} onClick={() => r.allocate(dayN, total - dayN)}
              style={{ ...btn(active, true), background: active ? '#d96a8f' : '#2c1a20', color: active ? '#1a0e12' : '#b08a93' }}>
              白{dayN}/夜{total - dayN}
            </button>
          );
        })}
      </div>

      {allocated && (
        <>
          {r.day.daySlots.length > 0 && <Section title="白天行动安排">{slotGrid('day', r.day.daySlots)}</Section>}
          {r.day.nightSlots.length > 0 && <Section title="夜晚行动安排">{slotGrid('night', r.day.nightSlots)}</Section>}
          <button onClick={r.beginDay} style={{ ...btn(true), marginTop: 8 }}>确定分配 · 开始这一天 ▶</button>
        </>
      )}
    </div>
  );
}

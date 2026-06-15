import type { EngineState } from '../../game/engine/types';
import type { DayState } from '../../game/action-grid/types';

/** 状态栏：顶部显示核心数值。九条会主题（深色+暗红/金）。 */
export function StatusBar({ engine, day }: { engine: EngineState; day: DayState }) {
  const cells: Array<{ label: string; value: string | number; tone?: string }> = [
    { label: '第', value: `${day.dayNumber} 天` },
    { label: '资金', value: `¥${engine.money.toLocaleString()}`, tone: '#e8c87a' },
    { label: '打手', value: engine.thugTotal },
    { label: '堕落度', value: engine.corruption, tone: '#d96a8f' },
    { label: '认知防线', value: engine.cognition, tone: '#d96a8f' },
    { label: '在场', value: `${engine.presentCount}人` },
    { label: '经期', value: engine.isDangerousPeriod ? '危险期' : '安全期', tone: engine.isDangerousPeriod ? '#e06666' : undefined },
  ];
  return (
    <div style={{
      display: 'flex', gap: 0, flexWrap: 'wrap',
      background: 'linear-gradient(180deg,#1a1014,#241318)',
      border: '1px solid #3a2128', borderRadius: 8, overflow: 'hidden',
      fontFamily: '"Noto Serif SC", serif',
    }}>
      {cells.map((c, i) => (
        <div key={i} style={{
          flex: '1 1 auto', minWidth: 72, padding: '6px 12px',
          borderRight: i < cells.length - 1 ? '1px solid #2c1a20' : 'none',
        }}>
          <div style={{ fontSize: 10, color: '#8a6b73', letterSpacing: 1 }}>{c.label}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: c.tone ?? '#e8dde0', marginTop: 1 }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { listSaves, putSave, deleteSave } from '../../game/save/store';
import type { GameSave } from '../../game/save/types';
import type { RunnerState } from '../../game/engine/day-runner';

const C = {
  bg: '#140c0f', bg2: '#0e0809', panel: '#1d1216', border: '#3a2128', borderSoft: '#2c1a20',
  text: '#e8dde0', dim: '#8a6b73', gold: '#e8c87a', rose: '#d96a8f', danger: '#e06666', green: '#7aa37a',
};

function btn(kind: 'primary' | 'normal' | 'danger' = 'normal'): React.CSSProperties {
  const bg = kind === 'primary' ? C.rose : kind === 'danger' ? '#5a2228' : C.border;
  const color = kind === 'primary' ? '#1a0e12' : kind === 'danger' ? C.danger : C.text;
  return { background: bg, color, border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' };
}

/** 存档面板：列出存档槽，可存/读/删（删带二次确认）。 */
export function SavePanel({ current, fastForward, onLoad, onClose }: {
  current: RunnerState;
  fastForward: boolean;
  onLoad: (state: RunnerState, ff: boolean) => void;
  onClose: () => void;
}) {
  const [saves, setSaves] = useState<GameSave[]>([]);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const refresh = async () => setSaves(await listSaves());
  useEffect(() => { void refresh(); }, []);

  const doSaveNew = async () => {
    const slotNums = saves.filter(s => s.slot !== 'auto').map(s => s.slot as number);
    const slot = (slotNums.length ? Math.max(...slotNums) : 0) + 1;
    const name = newName.trim() || `存档 ${slot}（第${current.day.dayNumber}天）`;
    await putSave({ slot, name, state: current, fastForward, now: Date.now() });
    setNewName('');
    await refresh();
  };

  const doOverwrite = async (s: GameSave) => {
    await putSave({ id: s.id, slot: s.slot, name: s.name, state: current, fastForward, now: Date.now() });
    await refresh();
  };

  const doDelete = async (id: string) => {
    await deleteSave(id);
    setConfirmDel(null);
    await refresh();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div style={{
        width: 'min(560px,94vw)', maxHeight: '88vh', overflowY: 'auto',
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 22,
        fontFamily: '"Noto Serif SC", serif', color: C.text,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: C.gold, flex: 1 }}>存档 / 读档</h2>
          <button onClick={onClose} style={btn()}>关闭</button>
        </div>

        {/* 新建存档 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            placeholder={`新存档名（默认：第${current.day.dayNumber}天）`}
            style={{ flex: 1, background: C.bg2, color: C.text, border: `1px solid ${C.borderSoft}`, borderRadius: 6, padding: '8px 10px', fontSize: 13 }}
          />
          <button onClick={doSaveNew} style={btn('primary')}>＋ 新建存档</button>
        </div>

        {saves.length === 0 && <div style={{ color: C.dim, fontSize: 13, textAlign: 'center', padding: 20 }}>暂无存档</div>}

        {/* 存档列表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {saves.map(s => (
            <div key={s.id} style={{
              background: C.bg2, border: `1px solid ${s.slot === 'auto' ? C.gold + '55' : C.borderSoft}`,
              borderRadius: 8, padding: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, color: s.slot === 'auto' ? C.gold : C.text, fontWeight: 600 }}>
                  {s.slot === 'auto' ? '⟳ ' : ''}{s.name}
                </span>
                <span style={{ fontSize: 11, color: C.dim, marginLeft: 'auto' }}>
                  {new Date(s.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ fontSize: 12, color: C.dim, margin: '6px 0 10px' }}>
                第{s.summary.dayNumber}天 · 堕落{s.summary.corruption} · {s.summary.cognition} · ¥{s.summary.money.toLocaleString()} · 打手{s.summary.thugTotal}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => onLoad(s.state, s.fastForward)} style={btn('primary')}>读取</button>
                {s.slot !== 'auto' && <button onClick={() => doOverwrite(s)} style={btn()}>覆盖存入</button>}
                {confirmDel === s.id ? (
                  <>
                    <button onClick={() => doDelete(s.id)} style={btn('danger')}>确认删除</button>
                    <button onClick={() => setConfirmDel(null)} style={btn()}>取消</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDel(s.id)} style={{ ...btn(), marginLeft: 'auto', color: C.dim }}>删除</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

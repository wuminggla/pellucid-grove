import { useState } from 'react';
import type { ApiSettings } from '../../sillytavern/types';

const LS_KEY = 'jiutiao_api_settings';

export function loadApiSettings(): ApiSettings | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveApiSettings(s: ApiSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

const C = {
  bg: '#140c0f', panel: '#1d1216', border: '#3a2128', text: '#e8dde0', dim: '#8a6b73', rose: '#d96a8f',
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: C.bg, color: C.text, border: `1px solid ${C.border}`,
  borderRadius: 6, padding: '8px 10px', fontSize: 13, marginTop: 4, boxSizing: 'border-box',
};

/** 轻量 API 配置面板。配置存 localStorage。支持主API + 可选次API(双AI)。 */
export function ApiConfigPanel({ onSave, onClose }: { onSave: (s: ApiSettings) => void; onClose: () => void }) {
  const existing = loadApiSettings();
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? 'https://api.deepseek.com/v1');
  const [apiKey, setApiKey] = useState(existing?.apiKey ?? '');
  const [model, setModel] = useState(existing?.model ?? 'deepseek-chat');
  const [dualEnabled, setDualEnabled] = useState(existing?.secondary?.enabled ?? false);
  const [secBaseUrl, setSecBaseUrl] = useState(existing?.secondary?.baseUrl ?? 'https://api.deepseek.com/v1');
  const [secKey, setSecKey] = useState(existing?.secondary?.apiKey ?? '');
  const [secModel, setSecModel] = useState(existing?.secondary?.model ?? 'deepseek-chat');

  const save = () => {
    const s: ApiSettings = {
      baseUrl: baseUrl.trim().replace(/\/$/, ''), apiKey: apiKey.trim(), model: model.trim(), timeout: 60000,
      secondary: {
        enabled: dualEnabled,
        baseUrl: secBaseUrl.trim().replace(/\/$/, ''), apiKey: secKey.trim(), model: secModel.trim(),
      },
    };
    saveApiSettings(s);
    onSave(s);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }}>
      <div style={{
        width: 'min(520px,92vw)', maxHeight: '90vh', overflowY: 'auto',
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 22,
        fontFamily: '"Noto Serif SC", serif', color: C.text,
      }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 17, color: C.rose }}>API 配置</h2>
        <p style={{ fontSize: 12, color: C.dim, margin: '0 0 16px' }}>
          OpenAI 兼容端点。AI1(主)跑剧情扩写，AI2(次)抓数值；不开次API则都走主API。
        </p>

        <label style={{ fontSize: 12, color: C.dim }}>主 API · Base URL
          <input style={inputStyle} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" />
        </label>
        <label style={{ fontSize: 12, color: C.dim, display: 'block', marginTop: 10 }}>API Key
          <input style={inputStyle} type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." />
        </label>
        <label style={{ fontSize: 12, color: C.dim, display: 'block', marginTop: 10 }}>Model
          <input style={inputStyle} value={model} onChange={e => setModel(e.target.value)} placeholder="deepseek-chat" />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 6px', fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={dualEnabled} onChange={e => setDualEnabled(e.target.checked)} />
          启用次 API（双AI：数值抽取分流，可省主模型token/用小模型）
        </label>
        {dualEnabled && (
          <div style={{ paddingLeft: 12, borderLeft: `2px solid ${C.border}`, marginTop: 8 }}>
            <label style={{ fontSize: 12, color: C.dim }}>次 API · Base URL
              <input style={inputStyle} value={secBaseUrl} onChange={e => setSecBaseUrl(e.target.value)} />
            </label>
            <label style={{ fontSize: 12, color: C.dim, display: 'block', marginTop: 10 }}>API Key
              <input style={inputStyle} type="password" value={secKey} onChange={e => setSecKey(e.target.value)} />
            </label>
            <label style={{ fontSize: 12, color: C.dim, display: 'block', marginTop: 10 }}>Model
              <input style={inputStyle} value={secModel} onChange={e => setSecModel(e.target.value)} />
            </label>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: C.border, color: C.text, border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>取消</button>
          <button onClick={save} style={{ background: C.rose, color: '#1a0e12', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>保存</button>
        </div>
      </div>
    </div>
  );
}

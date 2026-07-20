// api-settings · 副 AI 独立端点配置(批E1·v19遗留待办落地)
// 副 AI 负责后台任务: 小总结/大总结/数值抽取——都是轻量结构化任务,适合换便宜快模型。
// 主 AI(正文)不受影响,仍走酒馆当前预设端点。
// 配置存 localStorage(跨聊天全局);调用时读取(getExtractApiForCall)→改配置即时生效,无需重启。

export interface ExtractApiConfig {
  enabled: boolean;
  apiurl: string;   // OpenAI 兼容端点,如 https://api.xxx.com/v1
  key: string;      // ⚠ 明文存浏览器 localStorage,仅限本机使用
  model: string;    // 模型名,如 gpt-4o-mini / deepseek-chat
}

const KEY = 'pellucid_extract_api';
const DEFAULTS: ExtractApiConfig = { enabled: false, apiurl: '', key: '', model: '' };

export function getExtractApiConfig(): ExtractApiConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<ExtractApiConfig>;
    return {
      enabled: !!p.enabled,
      apiurl: typeof p.apiurl === 'string' ? p.apiurl : '',
      key: typeof p.key === 'string' ? p.key : '',
      model: typeof p.model === 'string' ? p.model : '',
    };
  } catch { return { ...DEFAULTS }; }
}

export function setExtractApiConfig(cfg: ExtractApiConfig) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* 无localStorage环境忽略 */ }
}

/**
 * 供 generateRaw custom_api 的副端点配置。未启用/未填端点 → undefined(回落主端点)。
 * source 固定 'openai'(酒馆 custom_api 的 OpenAI 兼容通道)。
 */
export function getExtractApiForCall(): { apiurl: string; key?: string; model?: string; source: string } | undefined {
  const c = getExtractApiConfig();
  if (!c.enabled || !c.apiurl.trim()) return undefined;
  return {
    apiurl: c.apiurl.trim(),
    ...(c.key.trim() ? { key: c.key.trim() } : {}),
    ...(c.model.trim() ? { model: c.model.trim() } : {}),
    source: 'openai',
  };
}

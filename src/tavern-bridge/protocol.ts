// 酒馆 ↔ React app 的 postMessage 协议
// ============================================================
//
// 部署形态: 角色卡的状态栏正则 replaceString 输出一个 <iframe>,src 指向 jsdelivr 上的 index.html。
// iframe 内是 pellucid-grove React app,通过 postMessage 与酒馆主页(父窗口)双向通信。
//
// 协议设计原则:
//   - 请求-响应模式 (每个请求带 requestId,响应回原 requestId)
//   - 单向通知模式 (酒馆主动推送状态变化,无需响应)
//   - 类型化: 所有消息都有 type 字段,便于路由
//
// 兼容本地开发: 检测到不在 iframe(window===window.parent) 时, bridge 降级为本地 mock,
// 仍可走 pnpm dev 完整开发流程。

// ───────────────────────────────────────────────
// 消息类型 (React → 酒馆)
// ───────────────────────────────────────────────

export type AppToTavernMessage =
  | { type: 'ready'; version: string }                                            // app 就绪通知
  | { type: 'getVariables'; requestId: string }                                   // 读 MVU 变量(全量)
  | { type: 'setVariables'; requestId: string; patch: Record<string, unknown> }   // 写 MVU 变量(增量补丁)
  | { type: 'generate'; requestId: string; prompt: GeneratePrompt }               // 请求 AI 生成(主/次 API)
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }            // 日志透传到酒馆控制台
  | { type: 'resize'; height: number };                                           // iframe 自适应高度

// ───────────────────────────────────────────────
// 消息类型 (酒馆 → React)
// ───────────────────────────────────────────────

export type TavernToAppMessage =
  | { type: 'response'; requestId: string; data?: unknown; error?: string }       // 请求-响应回包
  | { type: 'variablesChanged'; variables: Record<string, unknown> }              // 玩家手动改了变量(单向通知)
  | { type: 'theme'; dark: boolean }                                              // 酒馆主题切换通知
  | { type: 'inactive' };                                                         // 酒馆 chat 离开/暂停

// ───────────────────────────────────────────────
// LLM 请求载荷
// ───────────────────────────────────────────────

export interface GeneratePrompt {
  /** 调主API(剧情扩写)还是次API(变量抽取);两者酒馆侧映射到不同的 model/preset */
  channel: 'main' | 'secondary';
  /** OpenAI 风格 messages 数组 */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  /** 采样参数 */
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** 是否要 JSON 输出(secondary 通常 true) */
  json?: boolean;
}

export interface GenerateResponse {
  text: string;
  /** 若 channel=secondary 且 json=true, 返回结构化对象 */
  data?: Record<string, unknown>;
}

// ───────────────────────────────────────────────
// Bridge 接口(React 这边用)
// ───────────────────────────────────────────────

export interface TavernBridge {
  /** 当前是否在酒馆 iframe 里(false=本地 mock 模式) */
  readonly isInTavern: boolean;

  /** 读 MVU 全量变量 */
  getVariables(): Promise<Record<string, unknown>>;

  /** 写 MVU 增量补丁(undefined=删除该键) */
  setVariables(patch: Record<string, unknown>): Promise<void>;

  /** 请求 AI 生成 */
  generate(prompt: GeneratePrompt): Promise<GenerateResponse>;

  /** 日志透传 */
  log(level: 'info' | 'warn' | 'error', message: string): void;

  /** 订阅酒馆侧主动通知(变量手动变更/主题切换/暂停等) */
  onMessage(handler: (msg: TavernToAppMessage) => void): () => void;

  /** 通知酒馆调整 iframe 高度 */
  resize(height: number): void;
}

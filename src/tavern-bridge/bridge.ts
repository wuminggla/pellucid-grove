// Tavern Bridge 实现 · postMessage 客户端 + 本地 mock 双模式
// 部署到酒馆 iframe 内时: 走 window.parent.postMessage 与父窗口通信
// 本地 pnpm dev 开发时: 检测到非 iframe 环境,自动降级 mock(全部数据存内存)

import type {
  TavernBridge, AppToTavernMessage, TavernToAppMessage, GeneratePrompt, GenerateResponse,
} from './protocol';

const APP_VERSION = '0.1.0';

// ───────────────────────────────────────────────
// 真实桥 · postMessage
// ───────────────────────────────────────────────

class PostMessageBridge implements TavernBridge {
  readonly isInTavern = true;
  private nextId = 1;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private listeners = new Set<(msg: TavernToAppMessage) => void>();

  constructor() {
    window.addEventListener('message', this.onTavernMessage);
    // 通知酒馆 ready
    this.post({ type: 'ready', version: APP_VERSION });
  }

  private onTavernMessage = (e: MessageEvent) => {
    // 安全: 只接受 parent 来源(嵌套 iframe 场景)
    if (e.source !== window.parent) return;
    const msg = e.data as TavernToAppMessage;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'response') {
      const p = this.pending.get(msg.requestId);
      if (!p) return;
      this.pending.delete(msg.requestId);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.data);
      return;
    }
    for (const l of this.listeners) l(msg);
  };

  private post(msg: AppToTavernMessage) {
    window.parent.postMessage(msg, '*');
  }

  private request<T>(build: (requestId: string) => AppToTavernMessage): Promise<T> {
    const requestId = String(this.nextId++);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      this.post(build(requestId));
      // 超时兜底: 10s 没回包
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error(`bridge timeout: ${build(requestId).type}`));
        }
      }, 10_000);
    });
  }

  getVariables() {
    return this.request<Record<string, unknown>>((requestId) => ({ type: 'getVariables', requestId }));
  }

  setVariables(patch: Record<string, unknown>) {
    return this.request<void>((requestId) => ({ type: 'setVariables', requestId, patch }));
  }

  generate(prompt: GeneratePrompt) {
    return this.request<GenerateResponse>((requestId) => ({ type: 'generate', requestId, prompt }));
  }

  log(level: 'info' | 'warn' | 'error', message: string) {
    this.post({ type: 'log', level, message });
  }

  onMessage(handler: (msg: TavernToAppMessage) => void) {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  resize(height: number) {
    this.post({ type: 'resize', height });
  }
}

// ───────────────────────────────────────────────
// Mock 桥 · 本地开发(不在 iframe 中)
// ───────────────────────────────────────────────

class MockBridge implements TavernBridge {
  readonly isInTavern = false;
  private variables: Record<string, unknown> = {};
  private listeners = new Set<(msg: TavernToAppMessage) => void>();

  async getVariables() {
    return { ...this.variables };
  }

  async setVariables(patch: Record<string, unknown>) {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete this.variables[k];
      else this.variables[k] = v;
    }
  }

  async generate(prompt: GeneratePrompt): Promise<GenerateResponse> {
    // mock: 返回固定字符串。真生产由酒馆 AI 处理。
    const last = prompt.messages[prompt.messages.length - 1]?.content ?? '';
    return {
      text: `[本地 mock 回复] 收到 prompt(${prompt.channel}): ${last.slice(0, 60)}...`,
      data: prompt.json ? { presentCount: 18 } : undefined,
    };
  }

  log(level: 'info' | 'warn' | 'error', message: string) {

    console[level === 'info' ? 'log' : level](`[mock-bridge] ${message}`);
  }

  onMessage(handler: (msg: TavernToAppMessage) => void) {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  resize(_height: number) {
    // mock: 无操作
  }
}

// ───────────────────────────────────────────────
// 工厂 · 自动判断环境
// ───────────────────────────────────────────────

let bridgeInstance: TavernBridge | null = null;

/** 取得当前 bridge(单例·首次调用按环境选择 real/mock) */
export function getBridge(): TavernBridge {
  if (bridgeInstance) return bridgeInstance;
  // 检测是否在 iframe 里
  const inIframe = typeof window !== 'undefined' && window !== window.parent;
  bridgeInstance = inIframe ? new PostMessageBridge() : new MockBridge();
  return bridgeInstance;
}

/** 测试用: 重置实例(允许换桥) */
export function _resetBridgeForTest() {
  bridgeInstance = null;
}

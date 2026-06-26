// 酒馆桥 AiPort 适配器
// 当 React 跑在酒馆 iframe 中时,LLM 调用走 bridge.generate(交给酒馆主页处理);
// 替代 real-ai.ts 的 ApiRouter 路径(那条走 React app 自带 api 配置)。
// 设计: 酒馆主页拥有 user 配的 API/preset/世界书叠加规则,我们不该绕开它另接 LLM。

import type { AiPort, ExpandRequest, ExtractRequest, ExpandResult } from '../game/engine/types';
import type { TavernBridge } from './protocol';
import { extractMaintext, extractContinuity, extractVarsJson } from '../game/engine/real-ai';

export interface BridgeAiDeps {
  bridge: TavernBridge;
  /** 组 AI1 prompt: 复用 buildGamePrompt */
  buildExpandMessages: (req: ExpandRequest) => Array<{ role: string; content: string }>;
  /** 组 AI2 prompt: 复用 buildExtractMessages */
  buildExtractMessages: (req: ExtractRequest) => Array<{ role: string; content: string }>;
  /** 采样参数透传(从预设取) */
  sampling?: { temperature?: number; maxTokens?: number; topP?: number };
}

/**
 * 构造走酒馆桥的 AiPort。
 * 调 bridge.generate({ channel: 'main' / 'secondary', messages, ... }) → 酒馆主页代调 LLM 返回。
 */
export function createBridgeAi(deps: BridgeAiDeps): AiPort {
  return {
    async expand(req: ExpandRequest): Promise<ExpandResult> {
      const messages = deps.buildExpandMessages(req)
        .map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content }));
      const res = await deps.bridge.generate({
        channel: 'main',
        messages,
        ...(deps.sampling ?? {}),
      });
      // 主 API 走文本(可能含 <maintext>/<continuity> 标签)
      const raw = res.text ?? '';
      return { text: extractMaintext(raw), continuity: extractContinuity(raw) };
    },

    async extract(req: ExtractRequest): Promise<Record<string, unknown>> {
      const messages = deps.buildExtractMessages(req)
        .map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content }));
      const res = await deps.bridge.generate({
        channel: 'secondary',
        messages,
        json: true,
      });
      // 次 API 优先用结构化 data,失败回落到文本解析
      if (res.data && typeof res.data === 'object') {
        return res.data as Record<string, unknown>;
      }
      return extractVarsJson(res.text ?? '');
    },
  };
}

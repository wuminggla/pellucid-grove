// tavern-ai · 接酒馆 generate 的 AiPort 实现(主 API 套预设 + 副 API 抓数值)
// ============================================================
//
// 设计(对齐用户产品要求):
//  - 主 API(expand 正文): 调酒馆 generate(),套用酒馆当前预设/JB/文风/采样参数。
//    游戏范式+态度+状态作为 injects 注入。system(预设 main/JB)交给酒馆,不重复拼。
//  - 副 API(extract 抓数值): 调酒馆 generate({ should_silence:true }),静默后台,
//    可选 custom_api 切便宜小模型(接口留好,默认走主端点)。
//  - 输出零正则污染: 拿 generate 原始返回串,不调 formatAsTavernRegexedString,
//    用户全局正则/第三方扩展不影响我们的事件正文格式。
//  - 信息流零内容: generate 默认不产生楼层消息(只返回字符串)。
//
// 酒馆全局(前端界面无沙盒 iframe 里可用): generate / getCurrentMessageId 等。
// 类型来自 @types/function/generate.d.ts(GenerateConfig.injects / custom_api / should_silence)。

import { buildGameInject, buildExtractInject } from './prompt-inject';
import { extractMaintext, extractContinuity, extractVarsJson } from '../../game/engine/real-ai';
import type { AiPort, ExpandRequest, ExtractRequest, ExpandResult } from '../../game/engine/types';
import type { Lorebook } from '../../sillytavern/types';

// 酒馆 generate 的最小类型声明(只声明我们用到的字段;完整见 @types/function/generate.d.ts)
interface TavernInject {
  role: 'system' | 'assistant' | 'user';
  content: string;
  position: 'in_chat' | 'none';
  depth: number;
  should_scan?: boolean;
}
interface TavernCustomApi {
  apiurl?: string;
  key?: string;
  model?: string;
  source?: string;
}
interface TavernGenerateConfig {
  user_input?: string;
  injects?: TavernInject[];
  should_stream?: boolean;
  should_silence?: boolean;
  custom_api?: TavernCustomApi;
  preset_name?: string;
}
declare function generate(config: TavernGenerateConfig): Promise<string>;

export interface TavernAiOpts {
  /** 游戏世界书(含范式条目真实内容)。注入用,非酒馆世界书。 */
  lorebook: Lorebook;
  /** 副 API(抓数值)的独立端点配置。不传则与主 API 同端点。 */
  extractApi?: TavernCustomApi;
}

/** 构造接酒馆 generate 的 AiPort。 */
export function createTavernAi(opts: TavernAiOpts): AiPort {
  return {
    async expand(req: ExpandRequest): Promise<ExpandResult> {
      // 游戏范式+态度+状态 → inject;system(预设/JB/文风)交给酒馆 generate 自动套
      const inject = buildGameInject(req, opts.lorebook);
      const raw = await generate({
        user_input: '（系统：按下方注入的本格范式与态度生成正文）',
        injects: [{ role: 'system', content: inject, position: 'in_chat', depth: 0, should_scan: false }],
        should_stream: false,
      });
      return { text: extractMaintext(raw), continuity: extractContinuity(raw) };
    },

    async extract(req: ExtractRequest): Promise<Record<string, unknown>> {
      const inject = buildExtractInject(req);
      const raw = await generate({
        user_input: '（系统：抓取数值，只输出 JSON）',
        injects: [{ role: 'system', content: inject, position: 'in_chat', depth: 0, should_scan: false }],
        should_stream: false,
        should_silence: true, // 后台静默,不打扰酒馆 UI
        ...(opts.extractApi ? { custom_api: opts.extractApi } : {}),
      });
      return extractVarsJson(raw);
    },
  };
}

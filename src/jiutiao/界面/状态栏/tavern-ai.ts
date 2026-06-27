// tavern-ai · 接酒馆 generateRaw 的 AiPort 实现
// ============================================================
//
// 设计(对齐用户产品要求 + #3/#2 根治):
//  - 用 generateRaw + ordered_prompts 白名单制: 只发 [预设JB/文风块 + 我们的游戏范式],
//    **不放 chat_history** → AI 不会续写酒馆楼层历史(根治 #3"续写前文")。
//  - 预设的 JB/越狱/文风从 getPreset('in_use') 读出塞进 ordered_prompts(保留过审基调+文风)。
//  - 采样参数 custom_api: 'same_as_preset' 继承预设温度/top_p/max_tokens。
//  - 强制 AI 用 <jiutiao_text>...</jiutiao_text> 包正文 → 剥离思维链/尾部数学题(根治 #2)。
//  - 输出零正则污染: 拿 generateRaw 原始返回串,不调 formatAsTavernRegexedString。
//  - 信息流零内容: generateRaw 默认不产生楼层消息。
//
// 已知坑(子代理调查): generateRaw 仍可能注入"按深度的世界书条目"。我们的卡世界书条目
//   都是 constant 蓝灯(范式按 key 直取,非绿灯扫描),且玩家第三方世界书不归我们管。
//   若实测有世界书漏入干扰,再考虑 overrides 屏蔽。

import { buildGameInject, buildExtractInject } from './prompt-inject';
import { extractGameText, extractContinuity, extractVarsJson } from './extract';
import type { AiPort, ExpandRequest, ExtractRequest, ExpandResult } from '../../game/engine/types';
import type { Lorebook } from '../../sillytavern/types';

// ─── 酒馆 generateRaw / getPreset 最小类型声明 ───
interface RolePrompt { role: 'system' | 'assistant' | 'user'; content: string; }
type PlaceholderPrompt = string;
interface CustomApiConfig {
  apiurl?: string; key?: string; model?: string; source?: string;
  temperature?: 'same_as_preset' | 'unset' | number;
  top_p?: 'same_as_preset' | 'unset' | number;
  max_tokens?: 'same_as_preset' | 'unset' | number;
}
interface GenerateRawConfig {
  user_input?: string;
  ordered_prompts?: (PlaceholderPrompt | RolePrompt)[];
  should_stream?: boolean;
  should_silence?: boolean;
  custom_api?: CustomApiConfig;
}
declare function generateRaw(config: GenerateRawConfig): Promise<string>;

interface PresetPrompt { id: string; name: string; enabled: boolean; role: 'system' | 'user' | 'assistant'; content?: string; }
interface Preset { prompts: PresetPrompt[]; }
declare function getPreset(name: 'in_use' | string): Preset;

/** 从当前预设抽出 JB/main/nsfw 系统块(保留过审基调+文风),转成 RolePrompt[]。 */
function presetSystemBlocks(): RolePrompt[] {
  try {
    const preset = getPreset('in_use');
    if (!preset?.prompts) return [];
    // 系统块 id: main(主提示/文风) / nsfw(NSFW强化) / jailbreak(越狱·过审)
    // 另抓名字含 文风/风格/style 的普通启用条目
    return preset.prompts
      .filter(p => p.enabled && p.content && (
        ['main', 'nsfw', 'jailbreak'].includes(p.id) || /文风|风格|style/i.test(p.name)
      ))
      .map(p => ({ role: p.role, content: p.content as string }));
  } catch {
    return []; // 取预设失败(无预设/异常)→ 空,只发我们的范式
  }
}

const SAMPLING: CustomApiConfig = {
  temperature: 'same_as_preset',
  top_p: 'same_as_preset',
  max_tokens: 'same_as_preset',
};

export interface TavernAiOpts {
  /** 游戏世界书(含范式条目真实内容)。注入用,非酒馆世界书。 */
  lorebook: Lorebook;
  /** 副 API(抓数值)的独立端点配置。不传则与主 API 同端点。 */
  extractApi?: CustomApiConfig;
}

/** 构造接酒馆 generateRaw 的 AiPort。 */
export function createTavernAi(opts: TavernAiOpts): AiPort {
  return {
    async expand(req: ExpandRequest): Promise<ExpandResult> {
      const inject = buildGameInject(req, opts.lorebook);
      const ordered: (PlaceholderPrompt | RolePrompt)[] = [
        ...presetSystemBlocks(),                         // 预设 JB/文风(过审基调)
        { role: 'system', content: inject },             // 我们的范式+态度+状态+输出格式
        // 不放 'chat_history' → 不发楼层历史,AI 只看范式
      ];
      const raw = await generateRaw({
        ordered_prompts: ordered,
        should_stream: false,
        custom_api: SAMPLING,
      });
      return { text: extractGameText(raw), continuity: extractContinuity(raw) };
    },

    async extract(req: ExtractRequest): Promise<Record<string, unknown>> {
      const inject = buildExtractInject(req);
      const raw = await generateRaw({
        ordered_prompts: [{ role: 'system', content: inject }],
        should_stream: false,
        should_silence: true,                            // 后台静默
        custom_api: { ...(opts.extractApi ?? {}), max_tokens: 'unset' },
      });
      return extractVarsJson(raw);
    },
  };
}

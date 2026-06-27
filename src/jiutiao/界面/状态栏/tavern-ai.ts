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

import { buildGameInject, buildExtractInject, buildDirectorBriefPrompt } from './prompt-inject';
import { extractGameText, extractContinuity, extractVarsJson, stripThinking } from './extract';
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

// ─── 连贯性简报(代替前文)调参 ───
const PROSE_KEEP = 3;          // 滚动缓冲保留最近 N 段正文(喂给副AI提炼简报)
const PROSE_CHARS = 700;       // 每段截断字数(控副AI prompt 体积)
const BRIEF_TIMEOUT_MS = 45_000; // 副AI简报生成超时(失败则跳过,不阻断主生成)
const MIN_PROSE_LEN = 20;      // 过短(空回/截断)不入缓冲

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('brief-timeout')), ms)),
  ]);
}

export interface TavernAiOpts {
  /** 游戏世界书(含范式条目真实内容)。注入用,非酒馆世界书。 */
  lorebook: Lorebook;
  /** 副 API(抓数值)的独立端点配置。不传则与主 API 同端点。 */
  extractApi?: CustomApiConfig;
}

/** 构造接酒馆 generateRaw 的 AiPort。 */
export function createTavernAi(opts: TavernAiOpts): AiPort {
  // 滚动缓冲:最近 N 段已生成正文。不发原始楼层历史(根治 #3),改由副AI提炼成
  //   连贯性简报注入主AI(用户定的"堵不如疏")——既保逻辑连贯,又压连续事件格的审美疲劳。
  let recentProse: string[] = [];

  /** 副AI:读最近正文 → 产出连贯性简报(代替前文)。失败/无前文返回空串(不阻断主生成)。 */
  async function buildBrief(req: ExpandRequest): Promise<string> {
    if (recentProse.length === 0) return '';
    try {
      const briefPrompt = buildDirectorBriefPrompt(recentProse, req);
      const rawBrief = await withTimeout(generateRaw({
        ordered_prompts: [{ role: 'system', content: briefPrompt }],
        should_stream: false,
        should_silence: true,                            // 后台静默,不产生楼层消息
        custom_api: { ...(opts.extractApi ?? {}), max_tokens: 'unset' },
      }), BRIEF_TIMEOUT_MS);
      return stripThinking(rawBrief);
    } catch {
      return ''; // 简报失败 → 主生成照常(退化为"只看范式")
    }
  }

  return {
    async expand(req: ExpandRequest): Promise<ExpandResult> {
      // 1. 副AI 先提炼连贯性简报(有前文时)
      const brief = await buildBrief(req);
      // 2. 主AI 出正文(简报注入,代替前楼层)
      const inject = buildGameInject(req, opts.lorebook, brief);
      const ordered: (PlaceholderPrompt | RolePrompt)[] = [
        ...presetSystemBlocks(),                         // 预设 JB/文风(过审基调)
        { role: 'system', content: inject },             // 范式+态度+状态+简报+输出格式
        // 不放 'chat_history' → 不发楼层历史
      ];
      const raw = await generateRaw({
        ordered_prompts: ordered,
        should_stream: false,
        custom_api: SAMPLING,
      });
      const text = extractGameText(raw);
      // 3. 有效正文入滚动缓冲(截断控体积,供下一格提炼简报)
      if (text && text.length >= MIN_PROSE_LEN) {
        recentProse = [...recentProse, text.slice(-PROSE_CHARS)].slice(-PROSE_KEEP);
      }
      return { text, continuity: extractContinuity(raw) };
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

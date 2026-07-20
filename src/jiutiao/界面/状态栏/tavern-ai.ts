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

// ─── 第三方预设块开关(批B-3) ───
// 此前无条件把酒馆当前预设的 main/nsfw/jailbreak 块注入在我们指令之前——
// 社区预设多为"{{user}}与{{char}}对话式RP"写的(第二人称指令),是"主视角变你"的污染源。
// 现默认关闭;想借第三方预设文风时在设置页手动打开。偏好存 localStorage(跨聊天全局)。
const PRESET_TOGGLE_KEY = 'pellucid_include_tavern_preset';
let includeTavernPreset = false;
try { includeTavernPreset = localStorage.getItem(PRESET_TOGGLE_KEY) === '1'; } catch { /* 无localStorage环境默认关 */ }
export function getIncludeTavernPreset(): boolean { return includeTavernPreset; }
export function setIncludeTavernPreset(v: boolean) {
  includeTavernPreset = v;
  try { localStorage.setItem(PRESET_TOGGLE_KEY, v ? '1' : '0'); } catch { /* 忽略 */ }
}

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

// ─── prompt 审计(批B-1) ───
// 记录最近几次实际发出的 ordered_prompts 全量与 AI 原始返回,
// DEBUG 工具条一键导出——怀疑"注入是否生效"时直接看实证。
export interface PromptAuditRecord {
  when: string;
  kind: 'expand' | 'brief' | 'extract';
  label: string;
  prompts: { role: string; content: string }[];
  rawResponse?: string;
}
const AUDIT_KEEP = 6;
const auditLog: PromptAuditRecord[] = [];
function auditPush(rec: PromptAuditRecord) {
  auditLog.push(rec);
  if (auditLog.length > AUDIT_KEEP) auditLog.splice(0, auditLog.length - AUDIT_KEEP);
}
/** 导出审计日志为可读文本 */
export function dumpPromptAudit(): string {
  if (auditLog.length === 0) return '(暂无记录:先执行一个行动格)';
  return auditLog.map(r =>
    `====== [${r.kind}] ${r.label} - ${r.when} ======\n`
    + r.prompts.map((p, i) => `--- prompt[${i}] role=${p.role} ---\n${p.content}`).join('\n\n')
    + (r.rawResponse != null ? `\n\n--- AI raw ---\n${r.rawResponse}` : '')
  ).join('\n\n\n');
}

// ─── 连贯性简报(代替前文)调参 ───
// 批B-4: 滚动缓冲已迁入 EngineState.recentProse(engine/machine.ts settleSlot 维护,随存档持久化),
//   这里只保留简报生成本身的参数。
const BRIEF_TIMEOUT_MS = 45_000; // 副AI简报生成超时(失败则跳过,不阻断主生成)

// 简报状态(批B-4·失败可见): 每次 expand 后更新,UI 读取显示"⚠ 本格无前情简报"。
export type BriefStatus = 'ok' | 'none' | 'failed';
let lastBriefStatus: BriefStatus = 'none';
export function getLastBriefStatus(): BriefStatus { return lastBriefStatus; }

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
  // 前情正文来自 req.state.recentProse(engine 维护·随存档持久化)。不发原始楼层历史(根治 #3),
  //   改由副AI提炼成连贯性简报注入主AI(用户定的"堵不如疏")——既保逻辑连贯,又压连续事件格的审美疲劳。

  /** 副AI:读最近正文 → 产出连贯性简报(代替前文)。失败/无前文返回空串(不阻断主生成)。 */
  async function buildBrief(req: ExpandRequest): Promise<string> {
    const recentProse = req.state.recentProse ?? [];
    if (recentProse.length === 0) { lastBriefStatus = 'none'; return ''; }
    try {
      const briefPrompt = buildDirectorBriefPrompt(recentProse, req);
      const briefPrompts = [{ role: 'system' as const, content: briefPrompt }];
      const rawBrief = await withTimeout(generateRaw({
        ordered_prompts: briefPrompts,
        should_stream: false,
        should_silence: true,                            // 后台静默,不产生楼层消息
        custom_api: { ...(opts.extractApi ?? {}), max_tokens: 'unset' },
      }), BRIEF_TIMEOUT_MS);
      auditPush({ when: new Date().toISOString(), kind: 'brief', label: req.resolution.option.label, prompts: briefPrompts, rawResponse: rawBrief });
      const brief = stripThinking(rawBrief);
      lastBriefStatus = brief ? 'ok' : 'failed';
      return brief;
    } catch {
      lastBriefStatus = 'failed';
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
        ...(includeTavernPreset ? presetSystemBlocks() : []), // 酒馆预设块(默认关·批B-3开关)
        { role: 'system', content: inject },             // 任务框架+强指令+简报+main/JB+世界书+范式+态度+状态+输出格式
        // 不放 'chat_history' → 不发楼层历史
      ];
      const raw = await generateRaw({
        ordered_prompts: ordered,
        should_stream: false,
        custom_api: SAMPLING,
      });
      auditPush({
        when: new Date().toISOString(), kind: 'expand', label: req.resolution.option.label,
        prompts: ordered.filter((p): p is RolePrompt => typeof p !== 'string'),
        rawResponse: raw,
      });
      const text = extractGameText(raw);
      // 正文入缓冲由 engine settleSlot 维护(EngineState.recentProse·批B-4),此处不再持有状态
      return { text, continuity: extractContinuity(raw) };
    },

    async extract(req: ExtractRequest): Promise<Record<string, unknown>> {
      const inject = buildExtractInject(req);
      const exPrompts = [{ role: 'system' as const, content: inject }];
      const raw = await generateRaw({
        ordered_prompts: exPrompts,
        should_stream: false,
        should_silence: true,                            // 后台静默
        custom_api: { ...(opts.extractApi ?? {}), max_tokens: 'unset' },
      });
      auditPush({ when: new Date().toISOString(), kind: 'extract', label: '数值抽取', prompts: exPrompts, rawResponse: raw });
      return extractVarsJson(raw);
    },
  };
}

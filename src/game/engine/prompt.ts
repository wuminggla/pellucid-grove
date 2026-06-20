// Prompt 组装 · AI1扩写(buildGamePrompt) / AI2抓数值(buildExtractMessages)
// buildGamePrompt = 代码驱动组装器(prompt组装管线设计 §1):
//   预设(main/JB) + 常驻世界书 + 记忆层(故事脉络/近期发生) + 本格范式(按key直取) + 态度 + 场景 + 规格 + 输出格式。
// 复用底座 replaceMacros + worldbook 接入;不走关键词驱动的 assemblePrompt。

import type { ExpandRequest, ExtractRequest } from './types';
import type { Lorebook, ChatPreset } from '../../sillytavern/types';
import { renderConstantBlock, getParadigmByKey } from '../worldbook/machine';
import { buildMemoryContext } from '../memory/machine';
import { replaceMacros } from '../../sillytavern/prompt-assembler';

/** 记忆层注入内容(阶段3-3 填充;现可空) */
export interface MemoryContext {
  storyThread?: string; // 故事脉络(延续摘要+里程碑·永久)
  recentLog?: string;   // 近期发生(结构化日志滑动窗口)
}

export interface GamePromptCtx {
  lorebook: Lorebook;
  preset: ChatPreset;
  /** 记忆层覆盖(测试用);缺省从 req.state 计算 */
  memory?: MemoryContext;
  /** 强制 needsContinuity(测试用);缺省取 option.needsContinuity */
  needsContinuity?: boolean;
}

/** 角色基线兜底(预设无 main 时用) */
const BASE_SYSTEM =
  '你是色情文字游戏《九条会》的叙事AI。主角九条凛：成年(18+)，娇小童颜清纯的极道千金。'
  + '风格：直白、感官、色情而轻松，不沉重不说教。所有角色均成年。';

/** 认知防线态度层(判定二) */
const ATTITUDE_LAYER: Record<string, string> = {
  堕落前: '【凛的态度·堕落前】抗拒、嘴硬、屈辱；努力维持极道千金的尊严与体面，身体被迫反应但意志不服。',
  堕落后: '【凛的态度·堕落后(崩溃)】假面开裂、身体诚实地背叛意志、开始主动沉溺；屈辱感与快感交织。',
  母猪化: '【凛的态度·母猪化】平静接受甚至主动求欢，认同肉便器/生育容器身份，不再有抵抗，沉浸在被使用中。',
};

/** 扩写规格(按 renderMode) */
const SPEC_BY_MODE: Record<string, string> = {
  ai_full: '这是【首次里程碑·堕落节点】，重点扩写，着墨细节，按范式骨架演足这"第一次"的落差冲击。',
  ai_normal: '这是NSFW场景的常规体验，正常生成完整色情内容（非略写），贴合范式，保持鲜活。',
  ai_brief: '这是日常SFW行动，略写，简短交代结果+少量氛围，推进数值即可。',
};

/** 从预设取采样参数(传 api-router) */
export function presetSampling(preset: ChatPreset): Record<string, unknown> {
  const s = preset.settings ?? {};
  const out: Record<string, unknown> = {};
  if (s.temp_openai != null) out.temperature = s.temp_openai;
  if (s.openai_max_tokens != null) out.max_tokens = s.openai_max_tokens;
  if (s.top_p_openai != null) out.top_p = s.top_p_openai;
  return out;
}

/**
 * AI1 代码驱动组装。返回 [system, user] 两条消息。
 * system = 预设main/JB + 常驻世界书 + 记忆层;user = 本格范式+态度+场景+规格+输出格式。
 */
export function buildGamePrompt(req: ExpandRequest, ctx: GamePromptCtx): Array<{ role: string; content: string }> {
  const { resolution, attitude, state } = req;
  const { option, paradigm, renderMode, isNsfw } = resolution;
  const { lorebook, preset } = ctx;
  // 记忆层:缺省从 state 计算(narrativeLog/continuityNotes);needsContinuity 缺省取 option
  const memory = ctx.memory ?? buildMemoryContext(state);
  const needsContinuity = ctx.needsContinuity ?? !!option.needsContinuity;

  const macro = { userName: '玩家', characterName: '九条凛', userInput: '', variables: {} as Record<string, string | number> };
  const mc = (t: string) => replaceMacros(t, macro);

  // —— system：预设(main/JB) + 常驻世界书 + 记忆层 ——
  const sysParts: string[] = [];
  sysParts.push(mc(preset.settings?.main || BASE_SYSTEM));
  if (preset.settings?.jailbreak) sysParts.push(mc(String(preset.settings.jailbreak)));
  const constants = renderConstantBlock(lorebook);
  if (constants) sysParts.push(constants);
  if (memory?.storyThread) sysParts.push(`[故事脉络]\n${memory.storyThread}`);
  if (memory?.recentLog) sysParts.push(`[近期发生]\n${memory.recentLog}`);
  const system = sysParts.join('\n\n');

  // —— user：本格范式 + 态度 + 场景 + 规格 + 输出格式 ——
  const paradigmText = paradigm.inlinePrompt
    ? `[定制范式]\n${paradigm.inlinePrompt}`
    : (getParadigmByKey(lorebook, paradigm.worldbookKey)
       ?? `[范式条目] ${paradigm.worldbookKey}（世界书未写,按事件名扩写）`);

  const outputSpec = needsContinuity
    ? '只输出 <maintext>正文</maintext>;并在其后追加一行 <continuity>一句话延续摘要:本格引入的需后续回调的具体实体/独特事实</continuity>。'
    : '只输出 <maintext>正文</maintext>，不要其它标签或解释。';

  const user =
    `[本格行动] ${option.label}${isNsfw ? '（NSFW·♥）' : ''}\n`
    + `${paradigmText}\n\n`
    + `${ATTITUDE_LAYER[attitude] ?? ''}\n`
    + `[当前场景] 在场约 ${state.presentCount} 人；${state.isDangerousPeriod ? '危险期' : '安全期'}；认知防线「${state.cognition}」；堕落度 ${state.corruption}。\n`
    + `[扩写规格] ${SPEC_BY_MODE[renderMode] ?? '正常扩写。'}\n`
    + `[输出格式] ${outputSpec}\n`
    + `请按以上范式与态度生成本格正文。`;

  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** AI2：从正文抓"叙事性数值"，要求 JSON。硬经营数值不抓(由economy算)。 */
export function buildExtractMessages(req: ExtractRequest): Array<{ role: string; content: string }> {
  const sys =
    '你是数值抽取器。从给定正文中抽取本回合发生的【叙事性数值】，只输出 JSON，不要解释。'
    + '只抽取你能从正文确证的数字。不要编造。无法确定的字段不要输出。';
  const user =
    `[正文]\n${req.narrative}\n\n`
    + `[抽取目标] 输出 <vars>{...}</vars>，可含字段：\n`
    + `- presentCount: 本场在场施暴/参与人数(整数)\n`
    + `（只输出能从正文确证的字段；硬数值如资金/避孕套由系统算，不要抽。）`;

  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}

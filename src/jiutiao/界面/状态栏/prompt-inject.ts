// prompt-inject · 生成注入酒馆 generate 的游戏 prompt 文本
// ============================================================
//
// 与 game/engine/prompt.ts(buildGamePrompt)的关系:
//  - buildGamePrompt 是 v1 "自己拼完整 prompt(含预设 main/JB)"的组装器
//  - 这里改为"只生成注入内容":世界书常驻条目 + 范式 + 态度 + 状态 + 输出格式
//  - 预设 main/JB/文风/采样参数 交给酒馆 generate 自动套(不在注入里重复)
//
// 做法: 调 buildGamePrompt 但传一个 main/jailbreak 为空的预设,
//   这样它生成的 system 只含【常驻世界书 + 记忆层】(我们的游戏内容,酒馆预设里没有),
//   user 含【范式 + 态度 + 场景 + 规格 + 输出格式】。两段合并即为注入文本。

import { buildGamePrompt, buildExtractMessages } from '../../game/engine/prompt';
import type { ExpandRequest, ExtractRequest } from '../../game/engine/types';
import type { Lorebook, ChatPreset } from '../../sillytavern/types';

// main/jailbreak 留空的预设: 让 buildGamePrompt 跳过预设提示词(交给酒馆),
// 但仍组装常驻世界书 + 记忆 + 范式 + 态度 + 状态。
const EMPTY_PRESET: ChatPreset = {
  id: 'inject-empty',
  name: 'inject',
  settings: { main: '', jailbreak: '' },
  createdAt: 0,
  updatedAt: 0,
} as ChatPreset;

/** 生成主 AI(正文)的注入文本:世界书常驻 + 范式 + 态度 + 状态 + 输出格式。 */
export function buildGameInject(req: ExpandRequest, lorebook: Lorebook): string {
  const msgs = buildGamePrompt(req, { lorebook, preset: EMPTY_PRESET });
  // msgs = [{role:system, content: 常驻世界书+记忆}, {role:user, content: 范式+态度+场景+规格+输出格式}]
  // 合并为单段注入(system 段去掉空预设留下的开头空行)
  const sys = (msgs[0]?.content ?? '').trim();
  const user = (msgs[1]?.content ?? '').trim();
  return [
    '【以下是本回合游戏指令,严格遵守。生成的正文只输出 <maintext> 标签内容。】',
    sys,
    user,
  ].filter(Boolean).join('\n\n');
}

/** 生成副 AI(抓数值)的注入文本。 */
export function buildExtractInject(req: ExtractRequest): string {
  const msgs = buildExtractMessages(req);
  const sys = (msgs[0]?.content ?? '').trim();
  const user = (msgs[1]?.content ?? '').trim();
  return [sys, user].filter(Boolean).join('\n\n');
}

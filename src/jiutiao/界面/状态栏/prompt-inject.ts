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

/** 生成主 AI(正文)的注入文本:强指令 + 世界书常驻 + 范式 + 态度 + 状态 + 输出格式。 */
export function buildGameInject(req: ExpandRequest, lorebook: Lorebook): string {
  const msgs = buildGamePrompt(req, { lorebook, preset: EMPTY_PRESET });
  const sys = (msgs[0]?.content ?? '').trim();
  const user = (msgs[1]?.content ?? '').trim();

  // 强指令(置顶·根治 #3 续写前文 + #2 思维链/尾部混入):
  //  - 明确"这是独立场景生成,不是续写";忽略任何前文/历史
  //  - 严格按下方【本格行动】范式演,不得写成别的场景
  //  - 正文必须且只能包在 <jiutiao_text> 内,其它思考/格式块放标签外(会被剥离)
  const directive =
    '【最高指令·游戏事件生成】\n'
    + '你现在为一个文字游戏生成【单个独立事件】的正文,不是续写对话历史。\n'
    + '忽略任何聊天历史/上一条消息的情节——本次只演下方【本格行动】指定的事件,场景从该事件本身起笔。\n'
    + '严禁把正文写成与【本格行动】无关的其它场景(如把"口交侍奉"写成"便利店采购")。必须严格命中本格事件的范式。\n'
    + '【输出格式·强制】正文必须完整包裹在 <jiutiao_text> 与 </jiutiao_text> 之间。\n'
    + '你的思维链/分析/预设要求的尾部格式块照常输出,但放在 <jiutiao_text> 标签【之外】——标签内只有给玩家看的纯故事正文,不含任何标签/注释/格式块。';

  return [directive, sys, user].filter(Boolean).join('\n\n');
}

/** 生成副 AI(抓数值)的注入文本。 */
export function buildExtractInject(req: ExtractRequest): string {
  const msgs = buildExtractMessages(req);
  const sys = (msgs[0]?.content ?? '').trim();
  const user = (msgs[1]?.content ?? '').trim();
  return [sys, user].filter(Boolean).join('\n\n');
}

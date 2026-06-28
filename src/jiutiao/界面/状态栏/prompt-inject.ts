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

/**
 * 生成主 AI(正文)的注入文本:强指令 + 连贯性简报 + 世界书常驻 + 范式 + 态度 + 状态 + 输出格式。
 * @param directorBrief 副AI对最近正文产出的"连贯性简报"(代替前楼层内容)。空=开局首格,无前文。
 */
export function buildGameInject(req: ExpandRequest, lorebook: Lorebook, directorBrief = ''): string {
  const msgs = buildGamePrompt(req, { lorebook, preset: EMPTY_PRESET });
  const sys = (msgs[0]?.content ?? '').trim();
  const user = (msgs[1]?.content ?? '').trim();

  // 强指令(置顶):
  //  #3 命中范式不跑偏 + 衔接连续状态不重置(堵不如疏:不发原始楼层,改发副AI简报)
  //  #2 思维链/尾部块放标签外
  const directive =
    '【最高指令·游戏事件生成】\n'
    + '你在为一个文字游戏生成【本格事件】的正文。遵守:\n'
    + '1. 命中范式:严格演下方【本格行动】指定的事件,严禁写成与之无关的其它场景(如把"口交侍奉"写成"便利店采购")。\n'
    + '2. 衔接而非重置:必须承接下方【连贯性简报】描述的当前局面自然往下写——若简报指出凛已在某场景(如已在供奉现场),就从那个状态继续推进,严禁把场景退回更早的起点(如再写"她刚从外面回家/刚被叫来/刚进门")。无简报时(开局首格)才从本事件自身起笔。\n'
    + '3. 只认简报:不要续写酒馆聊天楼层里的其它历史对话,本次只依据【连贯性简报】+【本格行动】。\n'
    + '4. 防重复:不要重复【连贯性简报】中"防重复"列出的、最近已用过的开场/桥段/句式/意象,换新的写法。\n'
    + '5. 【绝不跨时间段·硬约束】本格只演当前这一小段时间内发生的事,严禁擅自推进到别的时段、严禁给一整天收尾:\n'
    + '   · 若本格是【夜晚】事件: 绝对不许写到天亮/早晨/第二天/起床/晨光——后面可能还有别的夜晚行动格,写到天亮逻辑就崩。结尾停在本格事件刚结束的深夜。\n'
    + '   · 若本格是【白天】事件: 绝对不许写到天黑/入夜/夜晚/华灯初上。结尾停在本格事件刚结束的白天。\n'
    + '   · 正文是这一天里的一个片段,不是一天的总结。禁止出现"这一天结束了""一夜过去""翌日"之类的跨时段收尾。\n'
    + '【输出格式·强制】正文必须完整包裹在 <jiutiao_text> 与 </jiutiao_text> 之间。思维链/分析/预设要求的尾部格式块放在标签【之外】——标签内只有给玩家看的纯故事正文,不含任何标签/注释/格式块。';

  const briefBlock = directorBrief.trim()
    ? `【连贯性简报·必须严格遵守(由前情提炼,代替前文)】\n${directorBrief.trim()}`
    : '';

  // 本格时段(具体化"绝不跨时段"规则·让 AI 明确知道现在是白天还是夜晚)
  const period = req.resolution.option.period;
  const periodNote = period === 'night'
    ? '【本格时段·硬约束】现在是【夜晚】。正文绝对不许写到天亮/早晨/起床/第二天,结尾必须停在本格事件刚结束的深夜(后面可能还有别的夜晚格)。'
    : period === 'day'
    ? '【本格时段·硬约束】现在是【白天】。正文绝对不许写到天黑/入夜/夜晚,结尾必须停在本格事件刚结束的白天。'
    : '';

  return [directive, periodNote, briefBlock, sys, user].filter(Boolean).join('\n\n');
}

/**
 * 生成副 AI(连贯性导演)的简报 prompt。读最近已生成正文,产出给主AI的衔接简报:
 *  情节概要 + 连贯锚点(防逻辑矛盾,如凛已在供奉就别再写回家) + 防重复(已用过的桥段/句式)。
 * 这份简报"代替前楼层内容"注入主AI(堵不如疏),既保连贯又压审美疲劳。
 */
export function buildDirectorBriefPrompt(recentProse: string[], req: ExpandRequest): string {
  const { resolution, attitude, state } = req;
  const nextLabel = resolution.option.label + (resolution.isNsfw ? '（NSFW）' : '');
  const proseBlock = recentProse
    .map((p, i) => `【片段${i + 1}${i === recentProse.length - 1 ? '·最新' : ''}】\n${p}`)
    .join('\n\n');

  return (
    '你是色情文字游戏《九条会》的"连贯性导演"。下面按时间顺序给出最近已生成的正文片段。\n'
    + '你的任务:为【即将生成的下一个事件】写一份简短的衔接简报(中文),只服务"逻辑连贯 + 避免重复",绝不要自己写正文。\n\n'
    + `【下一个事件】${nextLabel}；当前认知防线「${state.cognition}」、堕落度 ${state.corruption}、当前态度档「${attitude}」。\n\n`
    + `【最近正文片段(旧→新)】\n${proseBlock}\n\n`
    + '请只输出下面三段(每段 1-3 条,精炼,不展开描写):\n'
    + '1. 局面:用1-2句点明凛此刻的处境/状态/所在地点(承接【最新】片段的结尾,而不是回到更早)。\n'
    + '2. 衔接锚点:明确新正文必须承接的连续状态,列出"禁止重置"的点。例:凛上一格已在供奉现场→新正文应从供奉持续或其间隙写起,禁止再写她从外面回家/刚进门/刚被叫来。\n'
    + '3. 防重复:列出最近正文里已经用过、本次不要再重复的具体开场/桥段/台词/句式/意象(例:已写过夜间告白/已用过"从外面回到家"的开场/已描写过XX动作)。\n\n'
    + '只输出简报本身,分点列出。不要写正文,不要解释,不要输出思维链。'
  );
}

/** 生成副 AI(抓数值)的注入文本。 */
export function buildExtractInject(req: ExtractRequest): string {
  const msgs = buildExtractMessages(req);
  const sys = (msgs[0]?.content ?? '').trim();
  const user = (msgs[1]?.content ?? '').trim();
  return [sys, user].filter(Boolean).join('\n\n');
}

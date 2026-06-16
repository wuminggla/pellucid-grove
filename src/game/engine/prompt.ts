// Prompt 组装 · AI1扩写 / AI2抓数值 的消息构造（MVP简化版）
// 真实范式正文在世界书(后续接prompt-assembler按worldbookKey注入)；这里先用元数据拼可跑的prompt。

import type { ExpandRequest, ExtractRequest } from './types';

/** 角色基线（成年）+ 输出格式约定，作为 system 注入 */
const BASE_SYSTEM =
  '你是色情文字游戏《九条会》的叙事AI。主角九条凛：成年(18+)，娇小童颜清纯的极道千金。'
  + '风格：直白、感官、色情而轻松，不沉重不说教。所有角色均成年。';

/** 认知防线态度层（判定二）：按当前堕落态度给凛的表现要求 */
const ATTITUDE_LAYER: Record<string, string> = {
  堕落前: '【凛的态度·堕落前】抗拒、嘴硬、屈辱；努力维持极道千金的尊严与体面，身体被迫反应但意志不服。',
  堕落后: '【凛的态度·堕落后(崩溃)】假面开裂、身体诚实地背叛意志、开始主动沉溺；屈辱感与快感交织。',
  母猪化: '【凛的态度·母猪化】平静接受甚至主动求欢，认同肉便器/生育容器身份，不再有抵抗，沉浸在被使用中。',
};

/** 扩写规格（按 renderMode） */
const SPEC_BY_MODE: Record<string, string> = {
  ai_full: '这是【首次里程碑·堕落节点】，重点扩写，着墨细节，按范式骨架演足这"第一次"的落差冲击。',
  ai_normal: '这是NSFW场景的常规体验，正常生成完整色情内容（非略写），贴合范式，保持鲜活。',
  ai_brief: '这是日常SFW行动，略写，简短交代结果+少量氛围，推进数值即可。',
};

/**
 * AI1：双判定拼接 —— 范式骨架(判定一) + 认知防线态度层(判定二) + 场景上下文。
 * 要求只产出 <maintext>。
 */
export function buildExpandMessages(req: ExpandRequest): Array<{ role: string; content: string }> {
  const { resolution, attitude, state } = req;
  const { option, paradigm, renderMode, isNsfw } = resolution;

  const sys = `${BASE_SYSTEM}\n\n[输出格式]\n只输出 <maintext>正文</maintext>，不要其它标签或解释。`;
  // 范式来源：动态范式(AV定制)直接用 inlinePrompt；否则注入世界书 worldbookKey
  const paradigmLine = paradigm.inlinePrompt
    ? `[定制范式]\n${paradigm.inlinePrompt}`
    : `[范式条目] ${paradigm.worldbookKey}（将注入世界书范式骨架：场景/必含节拍/打手态度/爽点轴/禁忌）`;

  const user =
    `[本格行动] ${option.label}${isNsfw ? '（NSFW）' : ''}\n`
    + `${paradigmLine}\n`
    + `${ATTITUDE_LAYER[attitude] ?? ''}\n`
    + `[当前场景] 在场约 ${state.presentCount} 人；${state.isDangerousPeriod ? '危险期' : '安全期'}；认知防线「${state.cognition}」；堕落度 ${state.corruption}。\n`
    + `[扩写规格] ${SPEC_BY_MODE[renderMode] ?? '正常扩写。'}\n`
    + `请生成本格正文。`;

  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
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

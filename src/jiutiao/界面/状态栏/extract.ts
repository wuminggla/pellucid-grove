// extract · 从 AI 原始返回中提取纯正文 / 延续摘要 / 数值 JSON
// ============================================================
// AI 按酒馆预设输出时会夹带思维链(前)+ 尾部格式块(如数学题)。我们强制 AI 用
// <jiutiao_text>...</jiutiao_text> 包正文,这里只提取标签内内容,自动剥离思维链/尾部。

/**
 * 提取游戏正文。优先 <jiutiao_text> 标签;无标签时尽力剥离常见思维链/尾部块兜底。
 */
export function extractGameText(raw: string): string {
  if (!raw) return '';
  // 1. 优先取 <jiutiao_text>...</jiutiao_text>(大小写不敏感,跨行)
  const m = raw.match(/<jiutiao_text>([\s\S]*?)<\/jiutiao_text>/i);
  if (m) return m[1].trim();

  // 2. 兜底: 没按标签输出时,剥离常见思维链/尾部 XML 块,尽量留正文
  let t = raw;
  // 去思维链常见标签块
  t = t.replace(/<(thinking|think|thought|reasoning|cot|分析|思考)[\s\S]*?<\/\1>/gi, '');
  // 去尾部格式块(预设常用大写标签如 <Q>/<REALIEZ>/<WF> 等·保守只去成对标签)
  t = t.replace(/<([A-Z][A-Z_]{1,20})>[\s\S]*?<\/\1>/g, '');
  // 去残留的 continuity 段
  t = t.replace(/<continuity>[\s\S]*?<\/continuity>/i, '');
  return t.trim();
}

/**
 * 剥离思维链/推理块,留纯文本。用于副AI产出的连贯性简报(无 jiutiao_text 包裹)。
 * 只去成对的思考标签块,不动正常中文分点内容。
 */
export function stripThinking(raw: string): string {
  if (!raw) return '';
  let t = raw;
  t = t.replace(/<(thinking|think|thought|reasoning|cot|分析|思考)[\s\S]*?<\/\1>/gi, '');
  // 去 markdown 代码围栏(模型偶尔把简报包进 ```)
  t = t.replace(/```[a-z]*\n?/gi, '');
  return t.trim();
}

/** 提取 <continuity> 延续摘要;无则 undefined。 */
export function extractContinuity(raw: string): string | undefined {
  const m = raw.match(/<continuity>([\s\S]*?)<\/continuity>/i);
  const t = m ? m[1].trim() : '';
  return t || undefined;
}

/** 提取 <vars>{...}</vars> 或裸 JSON;失败返回 {}。 */
export function extractVarsJson(raw: string): Record<string, unknown> {
  const m = raw.match(/<vars>([\s\S]*?)<\/vars>/i);
  const body = m ? m[1] : raw;
  // 尝试从 body 里抓第一个 {...}
  const jsonMatch = body.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};
  try {
    const obj = JSON.parse(jsonMatch[0]);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

import { describe, it, expect } from 'vitest';
import { getConstantEntries, renderConstantBlock, getParadigmByKey, hasParadigm } from './machine';
import { demoLorebook } from './demo';

describe('世界书接入', () => {
  it('getConstantEntries 只取常驻,按order升序', () => {
    const cs = getConstantEntries(demoLorebook);
    expect(cs.every(e => e.constant)).toBe(true);
    expect(cs.map(e => e.id)).toEqual(['c_aesthetic', 'c_narrative', 'c_rin_origin', 'c_thug_attitude', 'c_taboo']);
    // 范式条目(非常驻)不在内
    expect(cs.some(e => e.id === 'p_serve')).toBe(false);
  });

  it('renderConstantBlock 拼成文本', () => {
    const block = renderConstantBlock(demoLorebook);
    expect(block).toContain('美学纲领');
    expect(block).toContain('打手态度');
    expect(block).not.toContain('范式·供奉'); // 范式条目不进常驻块
  });

  it('getParadigmByKey 按key直取(不scan)', () => {
    expect(getParadigmByKey(demoLorebook, 'wb_serve')).toContain('供奉');
    expect(getParadigmByKey(demoLorebook, 'wb_bribe_first')).toContain('首次身体贿赂');
    expect(getParadigmByKey(demoLorebook, 'wb_不存在')).toBeNull();
  });

  it('hasParadigm 判定存在', () => {
    expect(hasParadigm(demoLorebook, 'wb_oral')).toBe(true);
    expect(hasParadigm(demoLorebook, 'wb_nope')).toBe(false);
  });
});

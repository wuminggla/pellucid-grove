import rinDefault from '../../assets/characters/rin_default.png';
import type { EngineState } from '../../game/engine/types';

/**
 * 立绘区：显示凛的立绘，可随剧情/认知防线档替换。
 * 当前只有 default 立绘；后续按 认知防线/场景 切换不同图(占位接口已留)。
 */

/** 按引擎状态选立绘（后续扩展：不同认知防线档/场景用不同图） */
function pickPortrait(_engine: EngineState): string {
  // TODO: 接入多立绘后按 _engine.cognition / 场景切换
  return rinDefault;
}

const C = {
  rose: '#d96a8f', dim: '#8a6b73', gold: '#e8c87a', text: '#e8dde0',
};

export function CharacterPane({ engine }: { engine: EngineState }) {
  const src = pickPortrait(engine);

  // 认知防线档→气质标签(立绘下方小字,过程可感知)
  const moodByStage: Record<string, string> = {
    死撑: '清冷·戒备', 动摇: '动摇·潮红', 崩溃: '失神·沉溺', 母猪化: '空洞·甘落',
  };

  return (
    <div style={{
      position: 'relative', height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      // 场景背景层（未来按剧情地点替换；立绘背景透明后此层即"地点背景"）
      background: 'radial-gradient(120% 80% at 50% 25%, #2a1620 0%, #1a0e13 60%, #140c0f 100%)',
    }}>
      {/* 暗红光晕氛围 */}
      <div style={{
        position: 'absolute', top: '6%', left: '50%', transform: 'translateX(-50%)',
        width: '90%', height: '70%',
        background: 'radial-gradient(ellipse at center, #d96a8f22 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* 立绘裁切窗：只显示膝盖往上(大腿可见)。
          用 aspect-ratio 限定窗口高度=宽度×1.18(约显示全身上75%)，图顶对齐。
          白底图暂用底部羽化融入；后续换透明PNG后此处自然干净。 */}
      <div style={{
        position: 'relative', zIndex: 1, width: '100%', aspectRatio: '1 / 1.18',
        overflow: 'hidden',
        WebkitMaskImage: 'linear-gradient(to bottom, #000 86%, transparent 100%)',
        maskImage: 'linear-gradient(to bottom, #000 86%, transparent 100%)',
      }}>
        <img
          src={src}
          alt="九条凛"
          style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', height: 'auto', display: 'block',
            filter: 'drop-shadow(0 8px 24px #00000088) saturate(1.05)',
          }}
        />
      </div>

      {/* 名牌 + 气质 */}
      <div style={{
        position: 'absolute', bottom: 16, left: 0, right: 0, zIndex: 2,
        textAlign: 'center', pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: C.gold, letterSpacing: 3, textShadow: '0 2px 8px #000' }}>
          九条 凛
        </div>
        <div style={{ fontSize: 12, color: C.rose, letterSpacing: 2, marginTop: 2, textShadow: '0 2px 6px #000' }}>
          {moodByStage[engine.cognition] ?? ''}
        </div>
      </div>
    </div>
  );
}

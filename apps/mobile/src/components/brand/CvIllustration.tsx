import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from '../../theme/colors';

const CARD = '#ffffff';
const LINE = '#e2e8f0';
const LINE_DARK = '#cbd5e1';

/** One CV sheet: navy header with "CV", then text lines. */
function Sheet({ x, y, w, h, rotate = 0, compact = false }: { x: number; y: number; w: number; h: number; rotate?: number; compact?: boolean }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const head = compact ? 18 : 30;
  const rows = compact ? [0.7, 0.55, 0.8, 0.5, 0.65, 0.45] : [];
  return (
    <G transform={`rotate(${rotate} ${cx} ${cy})`}>
      <Rect x={x + 2} y={y + 4} width={w} height={h} rx={10} fill={colors.navy} opacity={0.08} />
      <Rect x={x} y={y} width={w} height={h} rx={10} fill={CARD} stroke="#e7e5e4" strokeWidth={1} />
      <Path d={`M${x} ${y + 10}a10 10 0 0 1 10 -10h${w - 20}a10 10 0 0 1 10 10v${head - 10}h-${w}z`} fill={colors.navy} />
      <SvgText x={x + 10} y={y + (compact ? 13 : 21)} fill="#ffffff" fontSize={compact ? 9 : 14} fontWeight="bold">
        CV
      </SvgText>
      <Rect x={x + (compact ? 26 : 38)} y={y + (compact ? 7 : 12)} width={w * 0.35} height={compact ? 3 : 4} rx={2} fill="#ffffff" opacity={0.55} />
      {rows.map((r, i) => (
        <Rect key={i} x={x + 10} y={y + head + 10 + i * 12} width={(w - 20) * r} height={4} rx={2} fill={i === 2 ? LINE_DARK : LINE} />
      ))}
    </G>
  );
}

/**
 * Sign-in illustration: a stack of CV sheets on a soft brand blob with a
 * completed check. Decorative only (hidden from screen readers).
 */
export function CvIllustration({ width = 260 }: { width?: number }) {
  const height = (width * 200) / 280;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignItems: 'center' }}>
      <Svg width={width} height={height} viewBox="0 0 280 200">
        <Path
          d="M30 118C14 66 66 20 138 26C206 32 266 58 262 118C258 176 202 198 134 194C68 190 44 162 30 118Z"
          fill={colors.brand[100]}
        />
        <Circle cx={214} cy={38} r={24} fill="#fde68a" opacity={0.45} />
        <Sheet x={36} y={70} w={92} h={112} rotate={-11} compact />
        <Sheet x={160} y={62} w={88} h={108} rotate={9} compact />
        {/* Main sheet */}
        <G>
          <Rect x={86} y={30} width={116} height={150} rx={12} fill={colors.navy} opacity={0.1} transform="translate(3 5)" />
          <Rect x={86} y={30} width={116} height={150} rx={12} fill={CARD} stroke="#e7e5e4" strokeWidth={1} />
          <Path d="M86 42a12 12 0 0 1 12 -12h92a12 12 0 0 1 12 12v18h-116z" fill={colors.navy} />
          <SvgText x={98} y={52} fill="#ffffff" fontSize={15} fontWeight="bold">
            CV
          </SvgText>
          <Rect x={126} y={41} width={56} height={4} rx={2} fill="#ffffff" opacity={0.6} />
          <Rect x={126} y={49} width={38} height={4} rx={2} fill="#ffffff" opacity={0.35} />
          {/* Portrait */}
          <Circle cx={110} cy={82} r={13} fill="#e0e7ff" />
          <Circle cx={110} cy={78} r={5} fill="#7c5a43" />
          <Path d="M100 92c2-6 6-8 10-8s8 2 10 8z" fill={colors.navy} />
          <Rect x={130} y={74} width={58} height={5} rx={2.5} fill={LINE_DARK} />
          <Rect x={130} y={84} width={44} height={4} rx={2} fill={LINE} />
          <Rect x={98} y={104} width={50} height={5} rx={2.5} fill={colors.brand[500]} />
          <Rect x={98} y={116} width={92} height={4} rx={2} fill={LINE} />
          <Rect x={98} y={126} width={84} height={4} rx={2} fill={LINE} />
          <Rect x={98} y={136} width={88} height={4} rx={2} fill={LINE} />
          <Rect x={98} y={150} width={60} height={4} rx={2} fill={LINE} />
        </G>
        {/* Done badge */}
        <Circle cx={200} cy={164} r={22} fill={colors.brand[600]} />
        <Circle cx={200} cy={164} r={22} fill="none" stroke="#ffffff" strokeWidth={3} />
        <Path d="M190 164l7 7 13-14" stroke="#ffffff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}

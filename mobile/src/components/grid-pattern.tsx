import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Path, Pattern, RadialGradient, Rect, Stop, Mask } from 'react-native-svg';

/**
 * Background grid (React Native port of Magic UI "Grid Pattern", MIT): SVG lines every `size` px, a few filled
 * squares, faded towards the edges. Purely decorative: no touches, hidden from screen readers.
 */
type Props = { size?: number; squares?: [number, number][]; color?: string; fill?: string };

const DEFAULT_SQUARES: [number, number][] = [[2, 1], [5, 4], [8, 2], [3, 7], [10, 6], [12, 9], [6, 11], [14, 3], [1, 13], [9, 14]];

export function GridPattern({ size = 40, squares = DEFAULT_SQUARES, color = 'rgba(37, 99, 235, 0.10)', fill = 'rgba(37, 99, 235, 0.05)' }: Props) {
  const id = useId().replace(/:/g, '');
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={`grid${id}`} width={size} height={size} patternUnits="userSpaceOnUse" x={-1} y={-1}>
            <Path d={`M.5 ${size}V.5H${size}`} fill="none" stroke={color} strokeWidth={1} />
          </Pattern>
          <RadialGradient id={`fade${id}`} cx="50%" cy="35%" r="75%">
            <Stop offset="0" stopColor="#fff" stopOpacity={1} />
            <Stop offset="1" stopColor="#fff" stopOpacity={0} />
          </RadialGradient>
          <Mask id={`mask${id}`}>
            <Rect width="100%" height="100%" fill={`url(#fade${id})`} />
          </Mask>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#grid${id})`} mask={`url(#mask${id})`} />
        {squares.map(([x, y]) => (
          <Rect key={`${x}-${y}`} x={x * size} y={y * size} width={size - 1} height={size - 1} fill={fill} mask={`url(#mask${id})`} />
        ))}
      </Svg>
    </View>
  );
}

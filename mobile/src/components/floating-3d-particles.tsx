import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/** Native welcome decoration is static: no canvas runtime or extra dependency. */
export function Floating3DParticles({color='#95BFD1',opacity=.3}: {quantity?:number;color?:string;size?:number;opacity?:number;drift?:number;depth?:number}) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" viewBox="0 0 100 160" preserveAspectRatio="none">
      {[[8,12],[76,18],[91,38],[18,57],[62,72],[93,101],[9,116],[39,137],[79,151]].map(([x,y],i)=><Circle key={i} cx={x} cy={y} r={i%2 ? .5 : .9} fill={color} opacity={opacity} />)}
    </Svg>
  </View>;
}

import { Image, type ImageStyle, type StyleProp } from 'react-native';

/** Sahhanito mascot poses (transparent PNGs, assets/images/mascot). */
const POSES = {
  front: require('../../assets/images/mascot/front.png'),
  thinking: require('../../assets/images/mascot/front-up.png'),
  lookLeft: require('../../assets/images/mascot/look-left.png'),
  lookRight: require('../../assets/images/mascot/look-right.png'),
  reading: require('../../assets/images/mascot/front-down.png'),
} as const;

export type MascotPose = keyof typeof POSES;

export function Mascot({ pose = 'front', size = 32, style }: { pose?: MascotPose; size?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={POSES[pose]}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      accessible={false}
    />
  );
}

import { ArrowRight, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, Fonts, Radius, Shadow } from '@/constants/theme';
import { useI18n } from '@/i18n';

/**
 * React Native port of Magic UI "Interactive Hover Button" (MIT): a white pill with a small primary dot; on hover
 * (web) or press (phone) the dot floods the button, the label slides out and comes back in white with an arrow.
 */
type Props = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

const DOT = 8;
const SLIDE = 48;

export function InteractiveButton({ label, onPress, disabled, icon: Icon, style, accessibilityLabel }: Props) {
  const { rtl } = useI18n();
  const [progress] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(320);
  const dir = rtl ? -1 : 1;

  const animate = (to: number) =>
    Animated.timing(progress, { toValue: to, duration: 300, useNativeDriver: Platform.OS !== 'web' }).start();

  // Large enough for the dot to cover the whole pill from its position near the centre.
  const scale = Math.max(40, (width * 2.4) / DOT);
  const AnimatedText = Animated.Text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => animate(1)}
      onHoverOut={() => animate(0)}
      onPressIn={() => animate(1)}
      onPressOut={() => Platform.OS !== 'web' && animate(0)}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.pill, disabled && styles.disabled, style]}>
      <View style={styles.row}>
        <Animated.View style={[styles.dot, { transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) }] }]} />
        <AnimatedText numberOfLines={1} style={[styles.label, {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, SLIDE * dir] }) }],
        }]}>{label}</AnimatedText>
      </View>
      <Animated.View pointerEvents="none" style={[styles.overlay, {
        opacity: progress,
        transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [SLIDE * dir, 0] }) }],
      }]}>
        {Icon && <Icon size={17} color={Colors.primaryFg} strokeWidth={2.25} />}
        <AnimatedText numberOfLines={1} style={[styles.label, styles.labelOn]}>{label}</AnimatedText>
        <ArrowRight size={17} color={Colors.primaryFg} strokeWidth={2.5} style={rtl ? styles.flip : undefined} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 52, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card,
    overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 24, ...Shadow,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: Colors.primary },
  label: { fontSize: 16, fontFamily: Fonts.semibold, color: Colors.foreground },
  labelOn: { color: Colors.primaryFg },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disabled: { opacity: 0.5 },
  flip: { transform: [{ scaleX: -1 }] },
});

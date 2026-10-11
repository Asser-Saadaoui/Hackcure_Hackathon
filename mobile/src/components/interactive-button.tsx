import { ArrowRight, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { Colors, Fonts, Radius, Shadow } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { AppText } from './app-text';
import { AnimatedShinyText } from './animated-shiny-text';

/** Magic UI Interactive Hover Button (MIT), adapted for native press and web focus/hover. */
type Props = Omit<PressableProps, 'children'> & {
  label: string; icon?: LucideIcon; iconRight?: LucideIcon;
  variant?: 'default' | 'outline' | 'secondary' | 'destructive';
  size?: 'default' | 'sm' | 'lg'; shiny?: boolean;
};

export function InteractiveButton({ label, icon: Icon, iconRight: IconRight, variant = 'outline', size = 'lg', shiny = false, disabled, style, ...rest }: Props) {
  const { rtl } = useI18n();
  const [progress] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(320);
  const [reduceMotion, setReduceMotion] = useState(true);
  const interaction = useRef({ hover: false, focus: false, press: false });
  useEffect(() => {
    if (Platform.OS === 'web') {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      const update = () => setReduceMotion(media.matches);
      update(); media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (reduceMotion || disabled) { progress.stopAnimation(); progress.setValue(0); }
    return () => progress.stopAnimation();
  }, [disabled, progress, reduceMotion]);
  const update = (kind: 'hover' | 'focus' | 'press', active: boolean) => {
    interaction.current[kind] = active;
    if (disabled) return;
    const toValue = Object.values(interaction.current).some(Boolean) ? 1 : 0;
    Animated.timing(progress, { toValue, duration: reduceMotion ? 0 : 300, useNativeDriver: Platform.OS !== 'web' }).start();
  };
  const filled = variant === 'default' || variant === 'destructive';
  const fg = filled ? '#FFFFFF' : Colors.foreground;
  const fill = variant === 'destructive' ? '#A81919' : variant === 'default' ? '#194987' : Colors.primary;
  const labelStyle = [styles.label, { fontSize: size === 'lg' ? 16 : 14 }];
  const renderLabel = (color: string) => shiny
    ? <AnimatedShinyText color={color} enabled={!disabled} style={labelStyle}>{label}</AnimatedShinyText>
    : <AppText style={[labelStyle, { color }]}>{label}</AppText>;
  return (
    <Pressable {...rest} disabled={disabled} accessibilityRole="button"
      accessibilityLabel={rest.accessibilityLabel ?? label}
      accessibilityState={{ ...rest.accessibilityState, disabled: !!disabled }}
      hitSlop={rest.hitSlop ?? (size === 'sm' ? 6 : 2)}
      onHoverIn={e => { update('hover', true); rest.onHoverIn?.(e); }}
      onHoverOut={e => { update('hover', false); rest.onHoverOut?.(e); }}
      onFocus={e => { update('focus', true); rest.onFocus?.(e); }}
      onBlur={e => { update('focus', false); rest.onBlur?.(e); }}
      onPressIn={e => { update('press', true); rest.onPressIn?.(e); }}
      onPressOut={e => { update('press', false); rest.onPressOut?.(e); }}
      onLayout={e => { setWidth(e.nativeEvent.layout.width); rest.onLayout?.(e); }}
      style={state => [styles.pill, { minHeight: size === 'sm' ? 36 : size === 'lg' ? 48 : 44,
        paddingHorizontal: size === 'sm' ? 12 : size === 'lg' ? 24 : 16,
        backgroundColor: variant === 'destructive' ? Colors.destructive : variant === 'default' ? Colors.primary : variant === 'secondary' ? Colors.secondary : Colors.card,
        borderColor: filled ? 'transparent' : Colors.input }, disabled && styles.disabled,
        typeof style === 'function' ? style(state) : style]}>
      <View aria-hidden accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.row}>
        <Animated.View style={[styles.dot, { backgroundColor: fill, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, Math.max(40, width * 2.4 / 8)] }) }] }]} />
        <Animated.View style={[styles.row, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, rtl ? -48 : 48] }) }] }]}>
          {Icon && <Icon size={16} color={fg} />}
          {renderLabel(fg)}
          {IconRight && <IconRight size={16} color={fg} />}
        </Animated.View>
      </View>
      <Animated.View aria-hidden pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[styles.overlay, { opacity: progress, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [rtl ? -48 : 48, 0] }) }] }]}>
        {Icon && <Icon size={16} color="#FFFFFF" />}
        {renderLabel('#FFFFFF')}
        {IconRight ? <IconRight size={16} color="#FFFFFF" /> : !shiny && <ArrowRight size={16} color="#FFFFFF" style={rtl ? styles.flip : undefined} />}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: Radius.pill, borderWidth: 1, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', ...Shadow },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontFamily: Fonts.semibold, flexShrink: 1, textAlign: 'center' },
  overlay: { position: 'absolute', top: 0, right: 8, bottom: 0, left: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disabled: { opacity: 0.5 },
  flip: { transform: [{ scaleX: -1 }] },
});

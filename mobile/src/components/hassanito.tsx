import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AccessibilityInfo, Animated, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n';
import { mascotCopy, mascotFrame, type MascotProps } from './hassanito-state';

/** Explicit native atlas states; Page Mascot's cursor interaction lives in .web.tsx. */
export function Hassanito({ state = 'idle', compact = false, message, presentation = 'inline' }: MascotProps) {
  const { language } = useI18n();
  const { width } = useWindowDimensions();
  const size = presentation === 'hero' ? width < 600 ? 140 : 190 : compact ? 64 : 112;
  const frame = mascotFrame(state);
  const [opacity] = useState(() => new Animated.Value(1));
  const [float] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(true);
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    opacity.setValue(1);
    if (!focused || reduceMotion || state !== 'thinking') return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.75, duration: 1000, useNativeDriver: true, isInteraction: false }),
      Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true, isInteraction: false }),
    ]));
    animation.start();
    return () => { animation.stop(); opacity.setValue(1); };
  }, [opacity, focused, reduceMotion, state]);
  useEffect(() => {
    float.setValue(0);
    if (!focused || reduceMotion || state === 'alert') return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: -3, duration: 1800, useNativeDriver: true, isInteraction: false }),
      Animated.timing(float, { toValue: 0, duration: 1800, useNativeDriver: true, isInteraction: false }),
    ]));
    animation.start();
    return () => { animation.stop(); float.setValue(0); };
  }, [float, focused, reduceMotion, state]);
  return <View style={[styles.row, presentation === 'hero' && styles.hero]}>
    <Animated.View style={{ width: size, height: size, overflow: 'hidden', opacity, transform: [{ translateY: float }] }} accessible={false}>
      <Image source={frame.sheet === 'directions' ? require('../../assets/mascots/sahhanito-directions.webp') : require('../../assets/mascots/sahhanito-reactions.webp')}
        style={{ width: size * 3, height: size * 3, position: 'absolute', left: -(frame.index % 3) * size, top: -Math.floor(frame.index / 3) * size }} />
    </Animated.View>
    <AppText accessibilityLiveRegion={state === 'alert' ? 'assertive' : 'polite'} style={[styles.copy, presentation === 'hero' && styles.heroCopy]}>
      {message ?? mascotCopy(language, state)}
    </AppText>
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, copy: { flex: 1, flexShrink: 1 }, hero: { flexDirection: 'column' }, heroCopy: { flex: 0, width: '100%', textAlign: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 12 } });

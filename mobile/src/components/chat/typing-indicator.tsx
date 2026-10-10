import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AssistantAvatar } from '@/components/chat/assistant-avatar';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';

/** Thinking mascot + pulsing dots + label while waiting for the AI. After `slowAfterMs` the label switches
 *  to a reassuring "one moment" text (the LLM can take several seconds). */
export function TypingIndicator({ label, slowLabel, slowAfterMs = 4000 }: { label: string; slowLabel?: string; slowAfterMs?: number }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [slowAfterMs]);
  const [d1] = useState(() => new Animated.Value(0.3));
  const [d2] = useState(() => new Animated.Value(0.3));
  const [d3] = useState(() => new Animated.Value(0.3));

  useEffect(() => {
    const anims = [d1, d2, d3].map((d, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 150),
        Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(d, { toValue: 0.3, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
      ])));
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [d1, d2, d3]);

  return (
    <View style={styles.row} accessibilityLiveRegion="polite" accessibilityLabel={slow && slowLabel ? slowLabel : label}>
      <AssistantAvatar />
      <View style={styles.bubble}>
        {[d1, d2, d3].map((d, i) => <Animated.View key={i} style={[styles.dot, { opacity: d }]} />)}
      </View>
      <AppText variant="small" style={styles.label}>{slow && slowLabel ? slowLabel : label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  bubble: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.xl,
    borderBottomStartRadius: Radius.sm,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.primary },
  label: { flexShrink: 1 },
});

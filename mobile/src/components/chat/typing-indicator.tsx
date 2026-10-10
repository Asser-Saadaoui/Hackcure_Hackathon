import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AssistantAvatar } from '@/components/chat/assistant-avatar';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';

/** Assistant avatar + pulsing teal dots + label, while waiting for the AI's answer. */
export function TypingIndicator({ label }: { label: string }) {
  const d1 = useRef(new Animated.Value(0.3)).current;
  const d2 = useRef(new Animated.Value(0.3)).current;
  const d3 = useRef(new Animated.Value(0.3)).current;

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
    <View style={styles.row} accessibilityLabel={label}>
      <AssistantAvatar pose="thinking" />
      <View style={styles.bubble}>
        {[d1, d2, d3].map((d, i) => <Animated.View key={i} style={[styles.dot, { opacity: d }]} />)}
      </View>
      <AppText variant="small">{label}</AppText>
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
});

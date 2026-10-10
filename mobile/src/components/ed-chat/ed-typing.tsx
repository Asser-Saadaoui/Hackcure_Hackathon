import { Hospital } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';

/** "The ED is typing…": hospital tile + pulsing dots. */
export function EdTyping({ label }: { label: string }) {
  const [d1] = useState(() => new Animated.Value(0.3));
  const [d2] = useState(() => new Animated.Value(0.3));
  const [d3] = useState(() => new Animated.Value(0.3));

  useEffect(() => {
    const native = Platform.OS !== 'web';
    const anims = [d1, d2, d3].map((d, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 150),
        Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: native }),
        Animated.timing(d, { toValue: 0.3, duration: 300, useNativeDriver: native }),
      ])));
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [d1, d2, d3]);

  return (
    <View style={styles.row} accessibilityLabel={label}>
      <View style={styles.avatar}><Hospital size={14} color={Colors.accentFg} strokeWidth={2.5} /></View>
      <View style={styles.bubble}>
        {[d1, d2, d3].map((d, i) => <Animated.View key={i} style={[styles.dot, { opacity: d }]} />)}
      </View>
      <AppText variant="small">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  avatar: { width: 26, height: 26, borderRadius: Radius.sm, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  bubble: { flexDirection: 'row', gap: 4, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md + 2, borderRadius: Radius.xl, borderBottomStartRadius: Radius.sm, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, ...Shadow },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.primary },
});

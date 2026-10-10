import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Colors, Spacing } from '@/constants/theme';

/** Bullet list. `autoDirection` for text typed by the patient (mixed scripts). */
export function BulletList({ items, muted, color, autoDirection }: { items: string[]; muted?: boolean; color?: string; autoDirection?: boolean }) {
  const textColor = color ?? (muted ? Colors.mutedFg : Colors.foreground);
  return (
    <View style={styles.list}>
      {items.map((item, i) => (
        <View key={`${i}-${item}`} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: textColor }]} />
          <AppText autoDirection={autoDirection} style={[styles.text, { color: textColor }]}>{item}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 9 },
  text: { flex: 1 },
});

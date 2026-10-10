import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Colors, Spacing } from '@/constants/theme';

/** Compact timeline: muted time column + event text (events can contain patient text → autoDirection). */
export function TimelineList({ items }: { items: { at: string; event: string }[] }) {
  return (
    <View style={styles.list}>
      {items.map((item, i) => (
        <View key={`${i}-${item.at}`} style={[styles.row, i < items.length - 1 && styles.divider]}>
          <AppText variant="small" style={styles.time}>{item.at}</AppText>
          <AppText autoDirection variant="small" style={styles.event}>{item.event}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0 },
  row: { flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  time: { width: 48, fontVariant: ['tabular-nums'] },
  event: { flex: 1, color: Colors.foreground },
});

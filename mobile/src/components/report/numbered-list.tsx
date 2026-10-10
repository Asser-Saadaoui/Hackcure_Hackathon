import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

/** Numbered steps with small light-teal circles (same look as the Emergency first-aid list). */
export function NumberedList({ items }: { items: string[] }) {
  return (
    <View style={styles.list}>
      {items.map((item, i) => (
        <View key={`${i}-${item}`} style={styles.row}>
          <View style={styles.number}>
            <AppText style={styles.numberText}>{i + 1}</AppText>
          </View>
          <AppText style={styles.text}>{item}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  number: { width: 24, height: 24, borderRadius: Radius.pill, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  numberText: { color: Colors.accentFg, fontFamily: Fonts.semibold, fontSize: 13 },
  text: { flex: 1 },
});

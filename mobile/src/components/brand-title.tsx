import { StyleSheet, Text, View } from 'react-native';

import { Mascot } from '@/components/mascot';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

/** Header brand: Sahhanito mascot + name + "· section". */
export function BrandTitle({ section }: { section?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.tile}>
        <Mascot size={28} />
      </View>
      <Text style={styles.name}>Sahhanito</Text>
      {section ? <Text style={styles.section} numberOfLines={1}>· {section}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 2 },
  tile: { width: 32, height: 32, borderRadius: Radius.md, backgroundColor: Colors.brandBg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  name: { fontSize: 15, fontFamily: Fonts.semibold, letterSpacing: -0.2, color: Colors.foreground },
  section: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.mutedFg, flexShrink: 1 },
});

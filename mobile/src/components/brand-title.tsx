import { Activity } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

/** Header brand, like central-park: teal tile with a pulse icon + name + "· section". */
export function BrandTitle({ section }: { section?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.tile}>
        <Activity size={16} color={Colors.primaryFg} strokeWidth={2.25} />
      </View>
      <Text style={styles.name}>Sahhanito</Text>
      {section ? <Text style={styles.section} numberOfLines={1}>· {section}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 2 },
  tile: { width: 28, height: 28, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontFamily: Fonts.semibold, letterSpacing: -0.2, color: Colors.foreground },
  section: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.mutedFg, flexShrink: 1 },
});

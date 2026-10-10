import { Image, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

/** Header brand (Mourad's design): Hassanito on a teal tile + "Sahhanito · صحة نيتو" + "· section". */
export function BrandTitle({ section }: { section?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.tile}>
        <Image source={require('../../assets/images/hassanito.png')} style={styles.image} accessibilityIgnoresInvertColors />
      </View>
      <Text style={styles.name}>Sahhanito · صحة نيتو</Text>
      {section ? <Text style={styles.section} numberOfLines={1}>· {section}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 2 },
  tile: { width: 28, height: 28, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: 28, height: 28 },
  name: { fontSize: 15, fontFamily: Fonts.semibold, letterSpacing: -0.2, color: Colors.foreground },
  section: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.mutedFg, flexShrink: 1 },
});

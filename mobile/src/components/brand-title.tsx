import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors, Fonts } from '@/constants/theme';

/** Lightweight, bilingual wordmark inspired by the supplied mascot pack. */
export function BrandTitle({ section, inverse = false }: { section?: string; inverse?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={styles.tile}>
        <Image source={require('../../assets/images/hassanito.png')} style={styles.image} accessibilityIgnoresInvertColors />
      </View>
      <View style={styles.wordmark} accessible accessibilityLabel="Sahhanito — صحة نيتو">
        <Text style={[styles.name, inverse && { color: '#FFFFFF' }]} numberOfLines={1}>Sahha<Text style={styles.coral}>nito</Text></Text>
        <View style={styles.signature}><Text style={[styles.arabic, inverse && { color: '#B8CCE5' }]}>صحة نيتو</Text>
          <Svg width={56} height={13} viewBox="0 0 56 13" aria-hidden={true}><Path d="M1 7H18L22 3L26 11L30 1L34 7H55" stroke={inverse ? '#80BAFA' : '#4D94DA'} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </View>
      </View>
      {section ? <Text style={styles.section} numberOfLines={1}>{section}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  tile: { width: 43, height: 43, borderRadius: 15, backgroundColor: '#E5F1FF', alignItems: 'center', justifyContent: 'center' },
  image: { width: 39, height: 39 },
  wordmark: { flexShrink: 1, gap: 1 },
  name: { fontSize: 24, fontFamily: Fonts.bold, letterSpacing: -1.2, color: Colors.navy },
  coral: { color: Colors.coral },
  signature: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  arabic: { fontSize: 11, color: Colors.mutedFg },
  section: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.mutedFg, flexShrink: 1 },
});

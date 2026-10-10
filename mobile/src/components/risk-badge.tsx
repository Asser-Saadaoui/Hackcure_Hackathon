import { StyleSheet, Text, View } from 'react-native';

import { Fonts, RiskColors, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import type { RiskLevel } from '@/lib/types';

/** Uppercase pill like central-park's "URGENT CARE". Color + text, never color alone. */
export function RiskBadge({ level }: { level: RiskLevel }) {
  const { t } = useI18n();
  const c = RiskColors[level];
  const label = t(`risk${level}`);
  return (
    <View accessibilityLabel={label} style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.pill },
  text: { fontSize: 12, fontFamily: Fonts.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
});

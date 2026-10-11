import { ArrowDown, ArrowUp, Info } from 'lucide-react-native';
import { useId } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { RiskBadge } from '@/components/risk-badge';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import type { PatientExplain } from '@/lib/types';

/** Explainability in the chat: why this level (system reasons) and what the analysis relied on. */
export function ExplainCard({ explain }: { explain: PatientExplain }) {
  const id = useId();
  const { t } = useI18n();
  const max = Math.max(...explain.factors.map((f) => f.weight), 0.05);
  return (
    <View nativeID={`magic-card-${id}`} style={styles.card} accessibilityLabel={t('explainTitle')}>
      <View style={styles.head}>
        <Info size={16} color={Colors.primary} strokeWidth={2.25} />
        <AppText variant="label" style={styles.flex}>{t('explainTitle')}</AppText>
        <RiskBadge level={explain.level} />
      </View>

      {explain.reasons.length > 0 && (
        <View style={styles.block}>
          <AppText variant="overline" style={styles.muted}>{t('explainWhy')}</AppText>
          {explain.reasons.map((r) => <AppText key={r} autoDirection>• {r}</AppText>)}
        </View>
      )}

      {(explain.factors.length > 0 || explain.saturated) && (
        <View style={styles.block}>
          <AppText variant="overline" style={styles.muted}>{t('explainFactors')}</AppText>
          {explain.factors.map((f) => {
            const up = f.direction === 'up';
            return (
              <View key={f.label} style={styles.factor}>
                {up ? <ArrowUp size={14} color="#B91C1C" strokeWidth={2.5} /> : <ArrowDown size={14} color="#047857" strokeWidth={2.5} />}
                <View style={styles.flex}>
                  <AppText autoDirection>{f.label}</AppText>
                  <View style={styles.track}>
                    <View style={[styles.bar, { width: `${Math.max(6, Math.round((f.weight / max) * 100))}%`, backgroundColor: up ? '#EF4444' : '#10B981' }]} />
                  </View>
                </View>
                <AppText variant="small" style={up ? styles.upText : styles.downText}>{up ? t('explainUp') : t('explainDown')}</AppText>
              </View>
            );
          })}
          {explain.factors.length === 0 && <AppText variant="small">{t('explainSaturated')}</AppText>}
        </View>
      )}

      <AppText variant="small" style={styles.muted}>{t('explainNote')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.md, padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  flex: { flex: 1 },
  block: { gap: Spacing.xs },
  muted: { color: Colors.mutedFg },
  factor: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.secondary, marginTop: 4, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
  upText: { color: '#B91C1C', fontFamily: Fonts.medium },
  downText: { color: '#047857', fontFamily: Fonts.medium },
});

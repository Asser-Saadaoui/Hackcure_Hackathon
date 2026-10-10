import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { RiskBadge } from '@/components/risk-badge';
import { Screen } from '@/components/screen';
import { Colors, Fonts, Radius, Shadow, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { Keys, setJSON } from '@/lib/storage';
import type { CaseSummary } from '@/lib/types';

/** Past cases on this device (or on the linked account later). */
export default function HistoryScreen() {
  const { t, rtl } = useI18n();
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const Chevron = rtl ? ChevronLeft : ChevronRight;

  useFocusEffect(useCallback(() => {
    api.listCases().then(setCases).catch(() => setCases([]));
  }, []));

  const open = async (c: CaseSummary) => {
    if (c.facilityName) return router.push({ pathname: '/care', params: { caseId: c.id } });
    if (c.status === 'RESULT_READY' || c.status === 'UNDER_REVIEW') return router.push({ pathname: '/result', params: { caseId: c.id } });
    await setJSON(Keys.currentCase, c.id);
    router.push('/chat');
  };

  return (
    <Screen>
      <AppText variant="title">{t('historyTitle')}</AppText>

      {cases === null && <ActivityIndicator color={Colors.primary} />}

      {cases?.length === 0 && (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Inbox size={24} color={Colors.mutedFg} strokeWidth={2} /></View>
          <AppText style={styles.muted}>{t('historyEmpty')}</AppText>
        </View>
      )}

      {cases?.map((c) => {
        const closed = c.status === 'CLOSED';
        return (
          <Pressable key={c.id} accessibilityRole="button" onPress={() => open(c)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={styles.flex}>
              <View style={styles.top}>
                {c.level && <RiskBadge level={c.level} />}
                <View style={[styles.pill, closed ? styles.pillClosed : styles.pillOpen]}>
                  <AppText variant="small" style={closed ? styles.pillClosedText : styles.pillOpenText}>
                    {closed ? t('statusClosed') : t('statusOpen')}
                  </AppText>
                </View>
              </View>
              <AppText style={styles.code}>{c.referenceCode}</AppText>
              <AppText variant="small">{new Date(c.createdAt).toLocaleString()}</AppText>
              {c.facilityName && <AppText variant="small" style={styles.facility}>{c.facilityName}</AppText>}
            </View>
            <Chevron size={18} color={Colors.mutedFg} />
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 4 },
  muted: { color: Colors.mutedFg, textAlign: 'center' },
  empty: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xxl },
  emptyIcon: { width: 48, height: 48, borderRadius: Radius.pill, backgroundColor: Colors.secondary, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg,
    backgroundColor: Colors.card, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, ...Shadow,
  },
  pressed: { opacity: 0.85 },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  code: { fontSize: 16, fontFamily: Fonts.semibold, letterSpacing: 0.5 },
  facility: { color: Colors.secondaryFg },
  pill: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill },
  pillOpen: { backgroundColor: Colors.accent },
  pillOpenText: { color: Colors.accentFg, fontFamily: Fonts.medium },
  pillClosed: { backgroundColor: Colors.secondary },
  pillClosedText: { color: Colors.secondaryFg, fontFamily: Fonts.medium },
});

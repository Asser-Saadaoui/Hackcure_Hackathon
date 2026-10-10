import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
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
  const { t, rtl, language } = useI18n();
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const searchLabel = rtl ? 'ابحث برمز الحالة أو المستشفى' : language === 'fr' ? 'Rechercher un dossier ou un hôpital' : 'Search by case code or hospital';
  const filtered = cases?.filter(c => `${c.referenceCode} ${c.facilityName ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const load = useCallback(() => {
    setFailed(false);
    setCases(null);
    api.listCases().then(setCases).catch(() => { setFailed(true); setCases(null); });
  }, []);
  const Chevron = rtl ? ChevronLeft : ChevronRight;

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const open = async (c: CaseSummary) => {
    if (c.level === 'EMERGENCY') return router.push({ pathname: '/emergency', params: { caseId: c.id } });
    if (c.facilityName) return router.push({ pathname: '/care', params: { caseId: c.id } });
    if (c.status === 'RESULT_READY' || c.status === 'UNDER_REVIEW') return router.push({ pathname: '/result', params: { caseId: c.id } });
    await setJSON(Keys.currentCase, c.id);
    router.push('/chat');
  };

  return (
    <Screen maxWidth={900}>
      <AppText variant="title">{t('historyTitle')}</AppText>
      <TextInput accessibilityLabel={searchLabel} placeholder={searchLabel} value={query} onChangeText={setQuery}
        style={[styles.search, { textAlign: rtl ? 'right' : 'left' }]} placeholderTextColor={Colors.mutedFg} />

      {cases === null && !failed && <ActivityIndicator color={Colors.primary} />}

      {failed && <Button label={t('retry')} variant="outline" onPress={load} />}

      {cases?.length === 0 && (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Inbox size={24} color={Colors.mutedFg} strokeWidth={2} /></View>
          <AppText style={styles.muted}>{t('historyEmpty')}</AppText>
        </View>
      )}

      {cases && cases.length > 0 && filtered?.length === 0 && <AppText>{rtl ? 'ما فماش نتائج.' : language === 'fr' ? 'Aucun résultat.' : 'No matching cases.'}</AppText>}
      {filtered?.map((c) => {
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
  search: { padding: 14, minHeight: 48, fontSize: 15, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.card, color: Colors.foreground },
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

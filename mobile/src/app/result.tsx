import { router, useLocalSearchParams } from 'expo-router';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, ClipboardList, HeartPulse, MapPin, MessageSquare,
  Phone, ShieldAlert, Stethoscope, type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import { Alert } from '@/components/alert';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { RiskBadge } from '@/components/risk-badge';
import { Screen } from '@/components/screen';
import { Hassanito } from '@/components/hassanito';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import type { StringKey } from '@/i18n/strings';
import { api } from '@/lib/api';
import { getJSON, Keys, remove } from '@/lib/storage';
import type { CaseDetail, Decision, RiskLevel } from '@/lib/types';

/**
 * Result screen: what the NLP + rules + clinicians decided, and what to do next.
 * LOW → self-care advice · HIGH → find my hospital (automatic assignment from location)
 * UNCERTAIN → a clinician is reviewing (live update via `case.reviewed`) · EMERGENCY → Emergency screen.
 */

const TONES: Record<Exclude<RiskLevel, 'EMERGENCY'>, { icon: LucideIcon; bg: string; fg: string; title: StringKey; body: StringKey }> = {
  LOW: { icon: HeartPulse, bg: '#DCFCE7', fg: '#166534', title: 'resultLowTitle', body: 'resultLowBody' },
  HIGH: { icon: AlertTriangle, bg: '#FFEDD5', fg: '#C2410C', title: 'resultHighTitle', body: 'resultHighBody' },
  UNCERTAIN: { icon: Stethoscope, bg: '#EDE9FE', fg: '#6D28D9', title: 'resultUncertainTitle', body: 'resultUncertainBody' },
};

const SELF_CARE: StringKey[] = ['selfCare1', 'selfCare2', 'selfCare3'];
const BRING: StringKey[] = ['bring1', 'bring2', 'bring3'];
const COME_BACK: StringKey[] = ['lowReturn1', 'lowReturn2', 'lowReturn3'];
const REVIEW_STEPS: StringKey[] = ['reviewStep1', 'reviewStep2', 'reviewStep3'];

function NumberedList({ items, t, tone = 'accent' }: { items: StringKey[]; t: (k: StringKey) => string; tone?: 'accent' | 'warning' }) {
  return (
    <>
      {items.map((key, i) => (
        <View key={key} style={styles.step}>
          <View style={[styles.stepNumber, tone === 'warning' && styles.stepNumberWarning]}>
            <AppText style={[styles.stepNumberText, tone === 'warning' && styles.stepNumberTextWarning]}>{i + 1}</AppText>
          </View>
          <AppText style={styles.flex}>{t(key)}</AppText>
        </View>
      ))}
    </>
  );
}

export default function ResultScreen() {
  const { t, rtl } = useI18n();
  const params = useLocalSearchParams<{ caseId?: string }>();
  const [caseId, setCaseId] = useState<string | null>(params.caseId ?? null);
  const [c, setCase] = useState<CaseDetail | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    if (params.caseId) return;
    getJSON<string>(Keys.currentCase).then((id) => { setCaseId(id); if (!id) setLoading(false); });
  }, [params.caseId]);

  useEffect(() => {
    if (!caseId) return;
    api.getCase(caseId)
      .then((data) => { setCase(data); setDecision(data.decision); })
      .catch(() => setCase(null))
      .finally(() => setLoading(false));
    // A clinician reviewed the UNCERTAIN case → switch to the new level live.
    return api.subscribe(caseId, (e) => {
      if (e.type === 'case.reviewed') {
        setDecision(e.decision);
        setCase((prev) => (prev ? { ...prev, level: e.level, decision: e.decision } : prev));
        setReviewed(true);
      }
      if (e.type === 'referral.status') setCase((prev) => (prev ? { ...prev, referral: e.referral } : prev));
    });
  }, [caseId]);

  const level: RiskLevel | null = decision?.level ?? c?.level ?? null;

  useEffect(() => {
    if (level === 'EMERGENCY' && caseId) router.replace({ pathname: '/emergency', params: { caseId } });
  }, [level, caseId]);

  if (loading) return <Screen><ActivityIndicator color={Colors.primary} /></Screen>;

  if (!c || !level || level === 'EMERGENCY') {
    return (
      <Screen>
        {!c && <AppText style={styles.muted}>{t('noActiveCase')}</AppText>}
        <Button label={t('backToConversation')} icon={MessageSquare} onPress={() => router.replace('/chat')} />
      </Screen>
    );
  }

  const tone = TONES[level];
  const Icon = tone.icon;
  const Arrow = rtl ? ArrowLeft : ArrowRight;

  const backToChat = () => (router.canGoBack() ? router.back() : router.replace('/chat'));
  const newConversation = async () => {
    await remove(Keys.currentCase);
    router.replace('/chat');
  };

  return (
    <Screen>
      <Hassanito state={level === 'LOW' ? 'happy' : level === 'UNCERTAIN' ? 'thinking' : 'guiding'} />
      <View style={styles.head}>
        <AppText variant="title">{t('resultTitle')}</AppText>
        <View style={styles.headMeta}>
          <RiskBadge level={level} />
          <AppText variant="small">{t('caseCode')} · {c.referenceCode}</AppText>
        </View>
      </View>

      {reviewed && (
        <View style={styles.reviewed}>
          <Check size={16} color="#166534" strokeWidth={2.5} />
          <AppText variant="small" style={styles.reviewedText}>{t('reviewDone')}</AppText>
        </View>
      )}

      {/* Main outcome */}
      <Card>
        <View style={[styles.tile, { backgroundColor: tone.bg }]}>
          <Icon size={26} color={tone.fg} strokeWidth={2.25} />
        </View>
        <AppText variant="subtitle">{t(tone.title)}</AppText>
        <AppText style={styles.muted}>{t(tone.body)}</AppText>
        {level === 'UNCERTAIN' && (
          <View style={styles.timeline} accessibilityLiveRegion="polite">
            {REVIEW_STEPS.map((key, i) => (
              <View key={key} style={styles.tlRow}>
                <View style={styles.tlRail}>
                  <View style={[styles.tlDot, i === 0 && styles.tlDone, i === 1 && styles.tlCurrent]}>
                    {i === 0 && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                    {i === 1 && <ActivityIndicator size="small" color={tone.fg} />}
                  </View>
                  {i < REVIEW_STEPS.length - 1 && <View style={[styles.tlLine, i === 0 && styles.tlLineDone]} />}
                </View>
                <AppText style={[styles.tlText, i === 1 && styles.tlTextCurrent, i === 2 && styles.muted]}>{t(key)}</AppText>
              </View>
            ))}
            <AppText variant="small">{t('reviewMeanwhile')}</AppText>
          </View>
        )}
      </Card>

      {level === 'UNCERTAIN' && (
        <Button label={t('worseButton')} size="lg" variant="destructive" icon={AlertTriangle} onPress={backToChat} />
      )}

      {level === 'HIGH' && !c.referral && (
        <Button label={t('findHospital')} size="lg" icon={MapPin} iconRight={Arrow}
          onPress={() => router.push({ pathname: '/location', params: { caseId: c.id } })} />
      )}

      {level === 'HIGH' && (
        <Card>
          <AppText variant="subtitle">{t('bringTitle')}</AppText>
          <NumberedList items={BRING} t={t} />
        </Card>
      )}

      {c.referral && (
        <Button label={t('statusTitle')} size="lg" icon={ClipboardList} iconRight={Arrow}
          onPress={() => router.push({ pathname: '/care', params: { caseId: c.id } })} />
      )}

      {level === 'LOW' && (
        <>
          <Card>
            <AppText variant="subtitle">{t('selfCareTitle')}</AppText>
            <NumberedList items={SELF_CARE} t={t} />
          </Card>
          <Card style={styles.warnCard}>
            <AppText variant="subtitle">{t('lowReturnTitle')}</AppText>
            <NumberedList items={COME_BACK} t={t} tone="warning" />
          </Card>
        </>
      )}

      {/* Explanation + red flags */}
      {decision?.rationale ? (
        <Card>
          <AppText variant="overline" style={styles.muted}>{t('resultWhy')}</AppText>
          <AppText>{decision.rationale}</AppText>
        </Card>
      ) : null}

      {decision && decision.triggeredRules.length > 0 && (
        <Alert variant="destructive" icon={ShieldAlert} title={t('reportRedFlags')}>
          {decision.triggeredRules.map((r) => (
            <AppText key={r.id} variant="small" style={styles.flagText}>• {r.name}</AppText>
          ))}
        </Alert>
      )}

      {level === 'LOW' && (
        <>
          <Button label={t('symptomsChanged')} variant="outline" icon={MessageSquare} onPress={backToChat} />
          <Button label={t('newConversation')} variant="ghost" onPress={newConversation} />
        </>
      )}
      {level === 'HIGH' && (
        <Button label={t('symptomsChanged')} variant="ghost" icon={MessageSquare} onPress={backToChat} />
      )}

      <Button label={t('call190')} variant="outline" icon={Phone} onPress={() => Linking.openURL('tel:190')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { color: Colors.mutedFg },
  head: { gap: Spacing.sm },
  headMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' },
  tile: { width: 52, height: 52, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.sm },
  reviewed: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill, backgroundColor: '#DCFCE7' },
  reviewedText: { color: '#166534', fontFamily: Fonts.medium },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  stepNumber: { width: 24, height: 24, borderRadius: Radius.pill, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumberText: { color: Colors.accentFg, fontFamily: Fonts.semibold, fontSize: 13 },
  flagText: { color: Colors.destructiveText },
  stepNumberWarning: { backgroundColor: '#FFEDD5' },
  stepNumberTextWarning: { color: '#C2410C' },
  warnCard: { borderColor: '#FED7AA', backgroundColor: '#FFF7ED' },
  timeline: { marginTop: Spacing.sm, gap: Spacing.xs },
  tlRow: { flexDirection: 'row', gap: Spacing.md },
  tlRail: { alignItems: 'center', width: 22 },
  tlDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.input, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center' },
  tlDone: { backgroundColor: '#6D28D9', borderColor: '#6D28D9' },
  tlCurrent: { borderColor: '#6D28D9' },
  tlLine: { width: 2, flex: 1, minHeight: 12, backgroundColor: Colors.border },
  tlLineDone: { backgroundColor: '#6D28D9' },
  tlText: { paddingBottom: Spacing.md, lineHeight: 22 },
  tlTextCurrent: { fontFamily: Fonts.semibold },
});

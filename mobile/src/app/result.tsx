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
import { PrototypeNotice } from '@/components/prototype-notice';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import type { StringKey } from '@/i18n/strings';
import { api, API_MODE } from '@/lib/api';
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
      <PrototypeNotice />
      <Hassanito state={level === 'LOW' ? 'happy' : 'guiding'} />
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
        <AppText variant="subtitle">{API_MODE === 'ai' ? 'Prototype assessment' : t(tone.title)}</AppText>
        <AppText style={styles.muted}>{API_MODE === 'ai' ? decision?.rationale : t(tone.body)}</AppText>
        {level === 'UNCERTAIN' && API_MODE === 'mock' && (
          <View style={styles.waiting}>
            <ActivityIndicator color={tone.fg} />
            <AppText variant="small">{t('routingReview')}</AppText>
          </View>
        )}
      </Card>

      {level === 'HIGH' && !c.referral && (
        <Button label={t('findHospital')} size="lg" icon={MapPin} iconRight={Arrow}
          onPress={() => router.push({ pathname: '/location', params: { caseId: c.id } })} />
      )}

      {c.referral && (
        <Button label={t('statusTitle')} size="lg" icon={ClipboardList} iconRight={Arrow}
          onPress={() => router.push({ pathname: '/care', params: { caseId: c.id } })} />
      )}

      {level === 'LOW' && (
        <Card>
          <AppText variant="subtitle">{t('selfCareTitle')}</AppText>
          {SELF_CARE.map((key, i) => (
            <View key={key} style={styles.step}>
              <View style={styles.stepNumber}>
                <AppText style={styles.stepNumberText}>{i + 1}</AppText>
              </View>
              <AppText style={styles.flex}>{t(key)}</AppText>
            </View>
          ))}
        </Card>
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
      {level !== 'LOW' && (
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
});

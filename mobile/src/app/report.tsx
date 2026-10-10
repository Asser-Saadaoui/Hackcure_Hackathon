import { useLocalSearchParams } from 'expo-router';
import { Download, RotateCcw, ShieldAlert, ShieldCheck, Smartphone, Sparkles } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Alert } from '@/components/alert';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { BulletList } from '@/components/report/bullet-list';
import { NumberedList } from '@/components/report/numbered-list';
import { Section } from '@/components/report/section';
import { TimelineList } from '@/components/report/timeline-list';
import { RiskBadge } from '@/components/risk-badge';
import { Screen } from '@/components/screen';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { getJSON, Keys } from '@/lib/storage';
import type { PatientReport } from '@/lib/types';

/**
 * Report screen: the structured report written by the LLM (AI /report, docs §6.3),
 * stored and versioned by the backend — the same content the hospital received.
 * The QR code opens the case page (/p/:token) at the reception desk or on another device.
 */

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function ReportScreen() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ caseId?: string }>();
  const [caseId, setCaseId] = useState<string | null>(params.caseId ?? null);
  const [data, setData] = useState<PatientReport | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  // No caseId in the URL → the case in progress on this device.
  useEffect(() => {
    if (params.caseId) return;
    getJSON<string>(Keys.currentCase).then((id) => {
      if (id) setCaseId(id);
      else setState('error');
    });
  }, [params.caseId]);

  const load = useCallback(async () => {
    if (!caseId) return;
    setState('loading');
    try {
      setData(await api.getReport(caseId));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [caseId]);

  useEffect(() => {
    if (!caseId) return;
    let active = true;
    api.getReport(caseId).then(data => { if (active) { setData(data); setState('ready'); } })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [caseId]);

  if (state === 'loading') {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
          <AppText style={styles.muted}>{t('reportGenerating')}</AppText>
        </View>
      </Screen>
    );
  }

  if (state === 'error' || !data) {
    return (
      <Screen>
        <AppText style={styles.muted}>{t('reportError')}</AppText>
        {caseId && <Button label={t('retry')} variant="outline" icon={RotateCcw} onPress={load} />}
      </Screen>
    );
  }

  const { report } = data;

  const openOtherDevice = async () => {
    if (Platform.OS === 'web') {
      Linking.openURL(data.caseLink);
      return;
    }
    try {
      await Share.share({ message: data.caseLink });
    } catch {
      Linking.openURL(data.caseLink);
    }
  };

  return (
    <Screen>
      {/* 1. Header */}
      <View style={styles.head}>
        <AppText variant="title">{t('myReport')}</AppText>
        <View style={styles.meta}>
          <RiskBadge level={report.risk.level} />
          <AppText variant="small">{t('reportVersion')} {data.version} · {timeOf(data.generatedAt)}</AppText>
          {data.reviewedByClinician && (
            <View style={styles.reviewed}>
              <ShieldCheck size={13} color="#166534" strokeWidth={2.5} />
              <AppText variant="small" style={styles.reviewedText}>{t('reportReviewed')}</AppText>
            </View>
          )}
        </View>
        <View style={styles.aiNotice}>
          <Sparkles size={14} color={Colors.primary} strokeWidth={2.25} />
          <AppText variant="small" style={styles.flex}>{t('reportAiNotice')}</AppText>
        </View>
      </View>

      {/* 2. Show at the desk: QR + reference code */}
      <Card style={styles.deskCard}>
        <View style={styles.qrBox}>
          <QRCode value={data.caseLink} size={160} color={Colors.foreground} backgroundColor="#FFFFFF" />
        </View>
        <AppText style={styles.code}>{data.referenceCode}</AppText>
        <AppText variant="small" style={styles.centerText}>{t('reportShowAtDesk')}</AppText>
        {data.facilityName && <AppText variant="label" style={styles.centerText}>{data.facilityName}</AppText>}
      </Card>

      {/* 3. Sections */}
      <Section title={t('reportSummary')}>
        <AppText autoDirection>{report.summary}</AppText>
      </Section>

      <Section title={t('reportChiefComplaint')}>
        <AppText autoDirection style={styles.complaint}>{report.chiefComplaint}</AppText>
      </Section>

      {report.positives.length > 0 && (
        <Section title={t('reportReported')}>
          <BulletList items={report.positives} autoDirection />
        </Section>
      )}

      {report.redFlags.length > 0 && (
        <Alert variant="destructive" icon={ShieldAlert} title={t('reportRedFlags')}>
          <BulletList items={report.redFlags} color={Colors.destructiveText} />
        </Alert>
      )}

      <Section title={t('reportRisk')}>
        <View style={styles.riskRow}>
          <RiskBadge level={report.risk.level} />
          {report.risk.pFinal !== null && (
            <AppText style={styles.riskValue}>{Math.round(report.risk.pFinal * 100)} %</AppText>
          )}
          <AppText variant="small">· {t(`uncertainty${report.risk.uncertainty}`)}</AppText>
        </View>
      </Section>

      {report.recommendedActions.length > 0 && (
        <Section title={t('reportActions')}>
          <NumberedList items={report.recommendedActions} />
        </Section>
      )}

      {report.timeline.length > 0 && (
        <Section title={t('reportTimeline')}>
          <TimelineList items={report.timeline} />
        </Section>
      )}

      {report.openQuestions.length > 0 && (
        <Section title={t('reportOpenQuestions')}>
          <BulletList items={report.openQuestions} muted />
        </Section>
      )}

      <AppText variant="small" style={styles.disclaimer}>{report.disclaimer}</AppText>

      {/* 4. Actions */}
      <Button
        label={t('reportDownloadPdf')}
        variant="outline"
        icon={Download}
        disabled={!data.pdfUrl}
        onPress={() => data.pdfUrl && Linking.openURL(data.pdfUrl)}
      />
      <Button label={t('reportOpenOtherDevice')} variant="outline" icon={Smartphone} onPress={openOtherDevice} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { color: Colors.mutedFg },
  center: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xxl },
  centerText: { textAlign: 'center' },
  head: { gap: Spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.md },
  reviewed: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill, backgroundColor: '#DCFCE7' },
  reviewedText: { color: '#166534', fontFamily: Fonts.medium },
  aiNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.accent },
  deskCard: { alignItems: 'center', gap: Spacing.sm },
  qrBox: { padding: Spacing.md, backgroundColor: '#FFFFFF', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  code: { fontSize: 26, lineHeight: 32, fontFamily: Fonts.bold, letterSpacing: 1.5, marginTop: Spacing.sm },
  complaint: { fontFamily: Fonts.medium },
  riskRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.md },
  riskValue: { fontFamily: Fonts.semibold, fontSize: 16 },
  disclaimer: { textAlign: 'center', paddingHorizontal: Spacing.md },
});

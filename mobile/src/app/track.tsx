import { useLocalSearchParams } from 'expo-router';
import { Ambulance, Check, Hospital, Navigation, Phone, RotateCcw } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LiveMap } from '@/components/map/live-map';
import { Screen } from '@/components/screen';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import type { StringKey } from '@/i18n/strings';
import { api } from '@/lib/api';
import { attention } from '@/lib/attention';
import { getJSON, Keys } from '@/lib/storage';
import type { AmbulanceStatus, TrackingView } from '@/lib/types';

/**
 * Map screen: route from the patient's location to the assigned hospital,
 * or the (simulated) ambulance moving toward the patient with a live ETA.
 */

const STEPS: AmbulanceStatus[] = ['DISPATCHED', 'EN_ROUTE_TO_PATIENT', 'AT_PATIENT', 'TRANSPORTING', 'ARRIVED'];

export default function TrackScreen() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ caseId?: string }>();
  const [caseId, setCaseId] = useState<string | null>(params.caseId ?? null);
  const [view, setView] = useState<TrackingView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (params.caseId) return;
    getJSON<string>(Keys.currentCase).then((id) => { setCaseId(id); if (!id) setState('error'); });
  }, [params.caseId]);

  const load = useCallback(async () => {
    if (!caseId) return;
    try {
      setView(await api.getTracking(caseId));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [caseId]);

  useEffect(() => {
    if (!caseId) return;
    api.getTracking(caseId).then(data => { setView(data); setState('ready'); }).catch(() => setState('error'));
    return api.subscribe(caseId, (e) => {
      if (e.type === 'tracking.position') {
        setView((v) => {
          if (v?.ambulance && v.ambulance.status !== e.ambulance.status) attention();
          return v ? { ...v, ambulance: e.ambulance, etaMinutes: e.ambulance.etaMinutes } : v;
        });
      }
      if (e.type === 'referral.status') load();
    });
  }, [caseId, load]);

  if (state === 'loading') return <Screen><ActivityIndicator color={Colors.primary} /></Screen>;

  if (state === 'error' || !view) {
    return (
      <Screen>
        <AppText style={styles.muted}>{t('mapUnavailable')}</AppText>
        <Button label={t('retry')} variant="outline" icon={RotateCcw} onPress={() => { setState('loading'); load(); }} />
      </Screen>
    );
  }

  const amb = view.ambulance;
  const ambulanceMode = !!amb || view.arrivalMode === 'AMBULANCE';
  const { hospital, patient } = view;

  const openMaps = () => {
    if (!patient) return;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${patient.lat},${patient.lng}&destination=${hospital.lat},${hospital.lng}`);
  };
  // Unknown ED number → never invent one: offer 190 instead.
  const callEd = () => Linking.openURL(`tel:${(hospital.edPhone ?? '190').replace(/\s/g, '')}`);

  return (
    <Screen>
      <AppText variant="title">{ambulanceMode ? t('trackTitleAmbulance') : t('trackTitleRoute')}</AppText>

      <LiveMap
        hospital={hospital}
        patient={patient}
        ambulance={amb}
        route={patient ? view.route : []}
        height={380}
        labels={{ you: t('you'), ambulance: amb?.unitName ?? t('ambulanceSimulated') }}
      />

      {!patient && (
        <Card>
          <AppText style={styles.muted}>{t('locationNeededForRoute')}</AppText>
        </Card>
      )}

      {ambulanceMode ? (
        <Card>
          <View style={styles.row}>
            <View style={styles.iconTile}><Ambulance size={20} color={Colors.destructive} strokeWidth={2.25} /></View>
            <View style={styles.flex}>
              <AppText variant="subtitle">{amb?.unitName ?? t('ambulanceSimulated')}</AppText>
              {amb && <AppText variant="small">{t(`amb${amb.status}` as StringKey)}</AppText>}
            </View>
            <View style={styles.simPill}><AppText style={styles.simText}>{t('simulatedLabel')}</AppText></View>
          </View>

          {amb && amb.status !== 'ARRIVED' && (
            <AppText style={styles.eta}>~{amb.etaMinutes} {t('minutes')}</AppText>
          )}

          {amb && (
            <View style={styles.steps}>
              {STEPS.map((s, i) => {
                const current = STEPS.indexOf(amb.status);
                const done = i < current || amb.status === 'ARRIVED';
                const active = i === current && amb.status !== 'ARRIVED';
                return (
                  <View key={s} style={styles.stepRow}>
                    <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                      {done && <Check size={11} color={Colors.primaryFg} strokeWidth={3} />}
                    </View>
                    <AppText variant="small" style={[active && styles.stepActive, done && styles.stepDone]}>{t(`amb${s}` as StringKey)}</AppText>
                  </View>
                );
              })}
            </View>
          )}

          {(!amb || amb.status === 'DISPATCHED' || amb.status === 'EN_ROUTE_TO_PATIENT') && (
            <AppText variant="small">{t('ambulanceComing')}</AppText>
          )}
        </Card>
      ) : (
        <Card>
          <View style={styles.row}>
            <View style={[styles.iconTile, styles.iconTileTeal]}><Hospital size={20} color={Colors.primary} strokeWidth={2.25} /></View>
            <View style={styles.flex}>
              <AppText variant="subtitle">{hospital.name}</AppText>
              <AppText variant="small">
                {view.distanceKm != null ? `${t('distanceLabel')} · ${view.distanceKm} km` : ''}
                {view.etaMinutes != null ? `${view.distanceKm != null ? '  ·  ' : ''}~${view.etaMinutes} ${t('minutes')}` : ''}
              </AppText>
            </View>
          </View>
          {patient && <Button label={t('openInMaps')} icon={Navigation} onPress={openMaps} />}
        </Card>
      )}

      <Button label={hospital.edPhone ? t('callEd') : t('call190')} variant="outline" icon={Phone} onPress={callEd} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { color: Colors.mutedFg },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconTile: { width: 40, height: 40, borderRadius: Radius.lg, backgroundColor: Colors.destructiveBg, alignItems: 'center', justifyContent: 'center' },
  iconTileTeal: { backgroundColor: Colors.accent },
  simPill: { backgroundColor: Colors.warningBg, borderColor: Colors.warningBorder, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  simText: { color: '#6B4F36', fontSize: 11, fontFamily: Fonts.semibold, letterSpacing: 0.6 },
  eta: { fontSize: 28, lineHeight: 34, fontFamily: Fonts.bold, color: Colors.foreground, letterSpacing: -0.5 },
  steps: { gap: Spacing.sm, marginTop: Spacing.xs },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot: { width: 18, height: 18, borderRadius: Radius.pill, borderWidth: 2, borderColor: Colors.input, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dotActive: { borderColor: Colors.destructive },
  stepActive: { color: Colors.foreground, fontFamily: Fonts.semibold },
  stepDone: { color: Colors.foreground },
});

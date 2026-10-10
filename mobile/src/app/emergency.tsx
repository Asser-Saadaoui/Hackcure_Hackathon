import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ArrowRight, Ambulance, ClipboardList, Hospital, LocateFixed, Navigation, Phone, ShieldAlert } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Hassanito } from '@/components/hassanito';
import { PrototypeNotice } from '@/components/prototype-notice';
import { Colors, Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { NEIGHBORHOODS } from '@/constants/neighborhoods';
import { useI18n } from '@/i18n';
import type { StringKey } from '@/i18n/strings';
import { api, API_MODE } from '@/lib/api';
import { locate } from '@/lib/location';
import type { Referral } from '@/lib/types';

/**
 * Emergency screen (Step 6). Shown the moment the backend says EMERGENCY.
 * - "Call 190" and first aid are bundled in the app: they work offline and with the backend down.
 * - The backend sends the case to the nearest capable ED as soon as a location is known (autoEmergency);
 *   this screen only provides the location and shows what happens. It never waits for the hospital.
 * First-aid wording must be validated by a clinician before any real use.
 */

type EdState =
  | { kind: 'locating' }
  | { kind: 'needLocation' }
  | { kind: 'alerting' }
  | { kind: 'referred'; referral: Referral };

const FIRST_AID: StringKey[] = ['firstAid1', 'firstAid2', 'firstAid3', 'firstAid4', 'firstAid5'];

const call = (number: string) => Linking.openURL(`tel:${number.replace(/\s/g, '')}`);
const directions = (lat: number, lng: number) => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);

export default function EmergencyScreen() {
  const { t, rtl } = useI18n();
  const { caseId } = useLocalSearchParams<{ caseId?: string }>();
  const [ed, setEd] = useState<EdState>({ kind: API_MODE === 'mock' && caseId ? 'locating' : 'needLocation' });
  const [referenceCode, setReferenceCode] = useState<string | null>(null);

  const sendLocation = useCallback(async (location: Parameters<typeof api.setLocation>[1]) => {
    if (!caseId) return;
    setEd({ kind: 'alerting' });
    try {
      await api.setLocation(caseId, location);
    } catch {
      setEd({ kind: 'needLocation' });
    }
  }, [caseId]);

  const findMe = useCallback(async () => {
    setEd({ kind: 'locating' });
    const r = await locate(10_000);
    if (r.ok) await sendLocation(r.location);
    else setEd({ kind: 'needLocation' });
  }, [sendLocation]);

  useEffect(() => {
    if (API_MODE !== 'mock' || !caseId) return;

    // Live updates: referral created by the backend, then accepted by the hospital.
    const unsubscribe = api.subscribe(caseId, (e) => {
      if (e.type === 'referral.status') setEd({ kind: 'referred', referral: e.referral });
    });

    api.getCase(caseId).then((c) => {
      setReferenceCode(c.referenceCode);
      if (c.referral) setEd({ kind: 'referred', referral: c.referral });
      else if (c.location) setEd({ kind: 'alerting' });
      else findMe();
    }).catch(() => setEd({ kind: 'needLocation' }));

    return unsubscribe;
  }, [caseId, findMe]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 1. Call 190 — first thing on screen, works offline */}
        <View style={styles.hero}>
          <View style={styles.heroInner}>
            <View style={styles.heroIcon}>
              <ShieldAlert size={28} color={Colors.destructive} strokeWidth={2.25} />
            </View>
            <AppText style={styles.heroTitle}>{t('emergencyTitle')}</AppText>
            <AppText style={styles.heroSubtitle}>{t('emergencySubtitle')}</AppText>
            <Button label={t('call190')} size="lg" variant="outline" icon={Phone} onPress={() => call('190')} style={styles.heroButton} />
            {referenceCode && (
              <AppText style={styles.heroCode}>{t('caseCode')} · {referenceCode}</AppText>
            )}
          </View>
        </View>

        <View style={styles.column}>
          <PrototypeNotice />
          <Hassanito compact state="alert" />
          {/* 2. Nearest emergency department */}
          {API_MODE === 'mock' && <Card>
            <View style={styles.cardHead}>
              <Hospital size={18} color={Colors.primary} strokeWidth={2.25} />
              <AppText variant="subtitle">{t('nearestEd')}</AppText>
            </View>

            {(ed.kind === 'locating' || ed.kind === 'alerting') && (
              <View style={styles.waiting}>
                <ActivityIndicator color={Colors.primary} />
                <AppText style={styles.muted}>{ed.kind === 'locating' ? t('locating') : t('alerting')}</AppText>
              </View>
            )}

            {ed.kind === 'needLocation' && (
              <View style={styles.block}>
                <AppText style={styles.muted}>{t('locationNeeded')}</AppText>
                {caseId && <Button label={t('useMyLocation')} variant="outline" icon={LocateFixed} onPress={findMe} />}
                <AppText variant="label">{t('chooseArea')}</AppText>
                <View style={styles.chips}>
                  {NEIGHBORHOODS.map((n) => (
                    <Chip key={n.name} label={n.name}
                      onPress={() => sendLocation({ lat: n.lat, lng: n.lng, source: 'MANUAL', address: n.name })} />
                  ))}
                </View>
              </View>
            )}

            {ed.kind === 'referred' && (
              <View style={styles.block}>
                <AppText style={styles.hospitalName}>{ed.referral.facilityName}</AppText>
                <AppText variant="small">{ed.referral.matchReason}</AppText>
                <View style={[styles.statusPill, ed.referral.status === 'ACCEPTED' ? styles.pillOk : styles.pillSent]}>
                  <AppText variant="small" style={ed.referral.status === 'ACCEPTED' ? styles.pillOkText : styles.pillSentText}>
                    {ed.referral.status === 'ACCEPTED' ? t('edAccepted') : t('edReceived')}
                  </AppText>
                </View>
                {ed.referral.arrivalMode === 'AMBULANCE' && (
                  <View style={styles.ambulance}>
                    <Ambulance size={18} color={Colors.accentFg} strokeWidth={2.25} />
                    <View style={styles.flex}>
                      <AppText variant="label" style={styles.ambulanceTitle}>{t('ambulanceSimulated')}</AppText>
                      {ed.referral.acceptNote && <AppText variant="small" style={styles.ambulanceText}>{ed.referral.acceptNote}</AppText>}
                    </View>
                  </View>
                )}
                <AppText variant="small">{t('etaLabel')} · ~{ed.referral.etaMinutes} {t('minutes')}</AppText>
                <View style={styles.actions}>
                  {ed.referral.edPhone && <Button label={t('callEd')} icon={Phone} onPress={() => call(ed.referral.edPhone!)} />}
                  <Button label={t('directions')} variant="outline" icon={Navigation}
                    onPress={() => directions(ed.referral.lat, ed.referral.lng)} />
                  <Button label={t('statusTitle')} variant="outline" icon={ClipboardList}
                    onPress={() => router.push({ pathname: '/care', params: { caseId: ed.referral.caseId } })} />
                </View>
              </View>
            )}
          </Card>}

          {/* 3. First aid while waiting — bundled, works offline */}
          <Card>
            <AppText variant="subtitle">{t('whileWaiting')}</AppText>
            {FIRST_AID.map((key, i) => (
              <View key={key} style={styles.step}>
                <View style={styles.stepNumber}>
                  <AppText style={styles.stepNumberText}>{i + 1}</AppText>
                </View>
                <AppText style={styles.flex}>{t(key)}</AppText>
              </View>
            ))}
            <View style={styles.note}>
              <AppText variant="small" style={styles.noteText}>{t('unconsciousNote')}</AppText>
            </View>
          </Card>

          <Button label={t('backToChat')} variant="ghost" icon={rtl ? ArrowRight : ArrowLeft}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/chat'))} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.destructive },
  scroll: { flexGrow: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  hero: { backgroundColor: Colors.destructive, paddingHorizontal: Spacing.xl, paddingTop: Spacing.xxl, paddingBottom: Spacing.xl },
  heroInner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', alignItems: 'center', gap: Spacing.md },
  heroIcon: { width: 56, height: 56, borderRadius: Radius.pill, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#FFFFFF', fontSize: 28, lineHeight: 34, fontFamily: Fonts.bold, textAlign: 'center', letterSpacing: -0.5 },
  heroSubtitle: { color: '#FEE2E2', textAlign: 'center' },
  heroButton: { alignSelf: 'stretch', marginTop: Spacing.sm },
  heroCode: { color: '#FECACA', fontSize: 13, fontFamily: Fonts.medium },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.xl, gap: Spacing.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  muted: { color: Colors.mutedFg },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  block: { gap: Spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hospitalName: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.semibold, letterSpacing: -0.2 },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.pill },
  pillSent: { backgroundColor: Colors.secondary },
  pillSentText: { color: Colors.secondaryFg, fontFamily: Fonts.medium },
  pillOk: { backgroundColor: '#DCFCE7' },
  pillOkText: { color: '#166534', fontFamily: Fonts.medium },
  ambulance: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.accent },
  ambulanceTitle: { color: Colors.accentFg },
  ambulanceText: { color: Colors.accentFg },
  actions: { gap: Spacing.sm },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  stepNumber: { width: 24, height: 24, borderRadius: Radius.pill, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumberText: { color: Colors.accentFg, fontFamily: Fonts.semibold, fontSize: 13 },
  note: { borderStartWidth: 2, borderStartColor: Colors.warningBorder, backgroundColor: Colors.warningBg, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.xs },
  noteText: { color: '#9A3412' },
});

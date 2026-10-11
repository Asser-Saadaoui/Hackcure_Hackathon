import { router } from 'expo-router';
import { ArrowRight, Phone, ShieldAlert } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert } from '@/components/alert';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Hassanito } from '@/components/hassanito';
import { Highlighter } from '@/components/highlighter';
import { Floating3DParticles } from '@/components/floating-3d-particles';
import { Screen } from '@/components/screen';
import { NetworkStatus } from '@/components/network-status';
import { EXPERIENCE } from '@/i18n/experience';
import { Colors, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { LANGUAGES } from '@/i18n/strings';
import { api } from '@/lib/api';
import { getNotificationStatus } from '@/lib/notifications';
import { Keys, setJSON } from '@/lib/storage';

/** Version of the consent text the patient accepts (stored with the onboarding). */
export const CONSENT_VERSION = '2026-10-v1';

type Phase = 'consent' | 'starting';

export default function WelcomeScreen() {
  const { t, language, setLanguage } = useI18n();
  const copy = EXPERIENCE[language];
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 900 && fontScale <= 1.4;
  const [phase, setPhase] = useState<Phase>('consent');
  const [error, setError] = useState(false);

  /** One screen: language + consent, then straight to the triage chat. Notifications are asked later,
   *  on the Care screen, when a hospital has been assigned and they are clearly useful. */
  const finish = async () => {
    setPhase('starting');
    setError(false);
    try {
      const session = await api.startSession();
      await setJSON(Keys.session, session);
      await setJSON(Keys.onboarding, { consentVersion: CONSENT_VERSION, consentAt: new Date().toISOString(), notifications: await getNotificationStatus() });
      router.replace('/home');
    } catch {
      setError(true);
      setPhase('consent');
    }
  };

  return (
    <View style={{ flex: 1 }}><Screen maxWidth={wide ? 1000 : 560}>
      <View style={styles.field}><AppText variant="label">{t('chooseLanguage')}</AppText>
        <View style={styles.chips} accessibilityRole="radiogroup">{LANGUAGES.map(l => <Chip key={l.code} role="radio" label={l.label} selected={l.code === language} onPress={() => setLanguage(l.code)} />)}</View>
      </View>
      {/* Always visible, even before consent: emergencies never wait. */}
      <Alert
        variant="destructive"
        icon={ShieldAlert}
        title={t('emergencyQuestion')}
        action={<Button label={t('call190')} variant="destructive" size="sm" icon={Phone} onPress={() => Linking.openURL('tel:190')} />}
      />

      <View style={[styles.layout, wide && styles.desktopLayout]}>
      <View style={styles.panel}>
      <Floating3DParticles />
      <View style={styles.foreground}>
      <View style={styles.intro}>
        <AppText variant="small" style={styles.eyebrow}>SAHHANITO · صحة نيتو</AppText>
        <AppText variant="title" style={styles.welcomeTitle}>{copy.welcomeTitle}</AppText>
        <AppText style={styles.lead}>{copy.welcomeIntro}</AppText>
        <Highlighter color="#FF94A3" style={styles.tagline}>{copy.workspaceTagline}</Highlighter>
      </View>
      <Card><AppText variant="subtitle">{copy.howTitle}</AppText>
        {[copy.how1, copy.how2, copy.how3].map((step, i) => <View key={i} style={styles.step}><AppText style={styles.number}>{i + 1}</AppText><AppText style={{ flex: 1 }}>{step}</AppText></View>)}
      </Card>
      <Hassanito state={phase === 'starting' ? 'thinking' : 'idle'} presentation="hero" />
      </View>
      </View>

      <View style={[styles.panel, styles.consentPanel]}>
      {phase === 'consent' && (
        <>
          <Card>
            <AppText variant="subtitle">{t('consentTitle')}</AppText>
            <AppText style={styles.muted}>{t('consentBody')}</AppText>
          </Card>

          {error && <AppText variant="small" style={styles.error} accessibilityRole="alert">{copy.sessionError}</AppText>}
          <Button label={t('agreeContinue')} size="lg" iconRight={ArrowRight} onPress={finish} />
        </>
      )}

      {phase === 'starting' && (
        <View style={styles.starting}>
          <ActivityIndicator color={Colors.primary} />
          <AppText variant="small">{t('gettingReady')}</AppText>
        </View>
      )}
      </View>
      </View>
      <Alert variant="destructive" icon={ShieldAlert} title={copy.emergencyTitle}><AppText>{copy.emergencyBody}</AppText></Alert>
      <Card><AppText variant="subtitle">{copy.prepareTitle}</AppText><AppText>{copy.prepareBody}</AppText></Card>
      <Card><AppText variant="subtitle">{copy.privacyTitle}</AppText><AppText>{copy.privacyBody}</AppText></Card>
      <NetworkStatus />
    </Screen>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.emergencyDock}>
        <AppText variant="small" style={{ flex: 1 }}>{copy.emergencyTitle}</AppText>
        <Button label={t('call190')} icon={Phone} variant="destructive" onPress={() => Linking.openURL('tel:190')} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { gap: Spacing.xxl },
  emergencyDock: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  number: { color: Colors.primary, fontWeight: '700', minWidth: 20 },
  desktopLayout: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: Spacing.xxl },
  panel: { flex: 1, gap: Spacing.lg, minWidth: 0, padding: 28, backgroundColor: Colors.navy, borderRadius: 28, overflow:'hidden', position:'relative' },
  foreground: { gap:Spacing.lg, position:'relative', zIndex:1 },
  consentPanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: Colors.border },
  eyebrow: { color: '#B6D8FF', fontSize: 11, letterSpacing: 1.5 },
  welcomeTitle: { fontSize: 36, lineHeight: 44, fontFamily: 'Inter_700Bold', color:'#FFFFFF' },
  intro: { gap: Spacing.sm, paddingTop: Spacing.lg },
  lead: { color:'#D8E6F7', fontSize: 15, lineHeight: 24 },
  tagline: { color:'#B6D8FF', marginTop:8, marginBottom:8 },
  field: { gap: Spacing.sm, paddingTop: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  muted: { color: Colors.mutedFg },
  error: { color: Colors.destructive },
  starting: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
});

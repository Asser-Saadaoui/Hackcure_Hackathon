import { router } from 'expo-router';
import { ArrowRight, Phone, ShieldAlert } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import { Alert } from '@/components/alert';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Mascot } from '@/components/mascot';
import { Screen } from '@/components/screen';
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
      router.replace('/chat');
    } catch {
      setError(true);
      setPhase('consent');
    }
  };

  return (
    <Screen>
      {/* Always visible, even before consent: emergencies never wait. */}
      <Alert
        variant="destructive"
        icon={ShieldAlert}
        title={t('emergencyQuestion')}
        action={<Button label={t('call190')} variant="destructive" size="sm" icon={Phone} onPress={() => Linking.openURL('tel:190')} />}
      />

      <View style={styles.intro}>
        <View style={styles.hero}>
          <Mascot size={120} />
        </View>
        <AppText variant="title">{t('welcomeTitle')}</AppText>
        <AppText style={styles.lead}>{t('tagline')}</AppText>
      </View>

      {phase === 'consent' && (
        <>
          <View style={styles.field}>
            <AppText variant="label">{t('chooseLanguage')}</AppText>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {LANGUAGES.map((l) => (
                <Chip key={l.code} role="radio" label={l.label} selected={l.code === language} onPress={() => setLanguage(l.code)} />
              ))}
            </View>
          </View>

          <Card>
            <AppText variant="subtitle">{t('consentTitle')}</AppText>
            <AppText style={styles.muted}>{t('consentBody')}</AppText>
          </Card>

          {error && <AppText variant="small" style={styles.error} accessibilityRole="alert">{t('errorRetry')}</AppText>}
          <Button label={t('agreeContinue')} size="lg" iconRight={ArrowRight} onPress={finish} />
        </>
      )}

      {phase === 'starting' && (
        <View style={styles.starting}>
          <ActivityIndicator color={Colors.primary} />
          <AppText variant="small">{t('gettingReady')}</AppText>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignSelf: 'center', width: 144, height: 144, borderRadius: 72, backgroundColor: Colors.brandBg, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  intro: { gap: Spacing.sm, paddingTop: Spacing.lg },
  lead: { color: Colors.mutedFg, fontSize: 15, lineHeight: 24 },
  field: { gap: Spacing.sm, paddingTop: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  muted: { color: Colors.mutedFg },
  error: { color: Colors.destructive },
  starting: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
});

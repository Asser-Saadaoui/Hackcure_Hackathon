import { router } from 'expo-router';
import { ArrowRight, Bell, Phone, ShieldAlert } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import { Alert } from '@/components/alert';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Mascot } from '@/components/mascot';
import { Screen } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { LANGUAGES } from '@/i18n/strings';
import { api } from '@/lib/api';
import { requestNotifications, type NotificationStatus } from '@/lib/notifications';
import { Keys, setJSON } from '@/lib/storage';

/** Version of the consent text the patient accepts (stored with the onboarding). */
export const CONSENT_VERSION = '2026-10-v1';

type Phase = 'consent' | 'notifications' | 'starting';

export default function WelcomeScreen() {
  const { t, language, setLanguage } = useI18n();
  const [phase, setPhase] = useState<Phase>('consent');
  const [notif, setNotif] = useState<NotificationStatus | null>(null);
  const [error, setError] = useState(false);

  /** Anonymous session + onboarding saved → straight to the triage chat. */
  const finish = async (notifications: NotificationStatus) => {
    setPhase('starting');
    setError(false);
    try {
      const session = await api.startSession();
      await setJSON(Keys.session, session);
      await setJSON(Keys.onboarding, { consentVersion: CONSENT_VERSION, consentAt: new Date().toISOString(), notifications });
      router.replace('/chat');
    } catch {
      setError(true);
      setPhase('notifications');
    }
  };

  const allow = async () => {
    const status = await requestNotifications();
    setNotif(status);
    if (status === 'granted') finish(status);
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

          <Button label={t('agreeContinue')} size="lg" iconRight={ArrowRight} onPress={() => setPhase('notifications')} />
        </>
      )}

      {phase === 'notifications' && (
        <>
          <Card>
            <View style={styles.iconTile}>
              <Bell size={20} color={Colors.primary} strokeWidth={2.25} />
            </View>
            <AppText variant="subtitle">{t('notifTitle')}</AppText>
            <AppText style={styles.muted}>{t('notifBody')}</AppText>
            {notif === 'denied' && <AppText variant="small">{t('notifDenied')}</AppText>}
            {notif === 'unsupported' && <AppText variant="small">{t('notifUnsupported')}</AppText>}
            {error && <AppText variant="small" style={styles.error}>{t('errorRetry')}</AppText>}
          </Card>
          {notif !== 'denied' && notif !== 'unsupported' && (
            <Button label={t('allowNotifications')} size="lg" icon={Bell} onPress={allow} />
          )}
          <Button label={t('notNow')} variant="ghost" onPress={() => finish(notif ?? 'undetermined')} />
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
  iconTile: { width: 40, height: 40, borderRadius: Radius.lg, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  error: { color: Colors.destructive },
  starting: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
});

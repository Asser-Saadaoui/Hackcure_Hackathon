import { router } from 'expo-router';
import { Bell, Phone, RotateCcw } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Screen } from '@/components/screen';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { LANGUAGES } from '@/i18n/strings';
import { getNotificationStatus, requestNotifications, type NotificationStatus } from '@/lib/notifications';
import { Keys, remove } from '@/lib/storage';

export default function SettingsScreen() {
  const { t, language, setLanguage } = useI18n();
  const [notif, setNotif] = useState<NotificationStatus | null>(null);

  useEffect(() => { getNotificationStatus().then(setNotif); }, []);

  const enableNotifications = async () => setNotif(await requestNotifications());

  /** Forget this device's onboarding, session and current case (cases stay on the server). */
  const resetApp = async () => {
    await remove(Keys.onboarding, Keys.session, Keys.language, Keys.currentCase);
    router.replace('/welcome');
  };

  return (
    <Screen>
      <AppText variant="title">{t('settingsTitle')}</AppText>

      <Section title={t('languageSection')}>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {LANGUAGES.map((l) => (
            <Chip key={l.code} role="radio" label={l.label} selected={l.code === language} onPress={() => setLanguage(l.code)} />
          ))}
        </View>
      </Section>

      <Section title={t('notificationsSection')}>
        <View style={styles.row}>
          <Bell size={18} color={Colors.primary} strokeWidth={2.25} />
          <View style={[styles.pill, notif === 'granted' ? styles.pillOn : styles.pillOff]}>
            <AppText variant="small" style={notif === 'granted' ? styles.pillOnText : styles.pillOffText}>
              {notif === 'granted' ? t('notifOn') : t('notifOff')}
            </AppText>
          </View>
        </View>
        {notif === 'denied' && <AppText variant="small">{t('notifDenied')}</AppText>}
        {notif === 'unsupported' && <AppText variant="small">{t('notifUnsupported')}</AppText>}
        {notif !== null && notif !== 'granted' && notif !== 'unsupported' && (
          <Button label={t('notifEnable')} variant="outline" icon={Bell} onPress={enableNotifications} />
        )}
      </Section>

      <Section>
        <View style={[styles.row, styles.disabled]}>
          <Phone size={18} color={Colors.mutedFg} strokeWidth={2.25} />
          <AppText style={styles.mutedText}>{t('linkPhoneSoon')}</AppText>
        </View>
      </Section>

      <Button label={t('resetApp')} variant="destructive" icon={RotateCcw} onPress={resetApp} />

      <AppText variant="small" style={styles.footer}>Sahhanito · v1.0</AppText>
    </Screen>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <Card>
      {title && <AppText variant="overline" style={styles.mutedText}>{title}</AppText>}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  disabled: { opacity: 0.6 },
  mutedText: { color: Colors.mutedFg },
  pill: { paddingHorizontal: Spacing.md, paddingVertical: 3, borderRadius: Radius.pill },
  pillOn: { backgroundColor: '#DCFCE7' },
  pillOnText: { color: '#166534', fontFamily: Fonts.medium },
  pillOff: { backgroundColor: Colors.secondary },
  pillOffText: { color: Colors.secondaryFg, fontFamily: Fonts.medium },
  footer: { textAlign: 'center' },
});

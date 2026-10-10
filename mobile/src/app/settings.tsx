import { router } from 'expo-router';
import { Bell, Phone, RotateCcw, Wrench } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
import { getTestMode, setTestMode, TEST_SCENARIOS, type TestMode } from '@/lib/test-mode';
import { resetMockData } from '@/mock/mock-api';

export default function SettingsScreen() {
  const { t, language, setLanguage } = useI18n();
  const [notif, setNotif] = useState<NotificationStatus | null>(null);
  const [mode, setMode] = useState<TestMode>(getTestMode());

  useEffect(() => { getNotificationStatus().then(setNotif); }, []);

  const enableNotifications = async () => setNotif(await requestNotifications());

  const chooseMode = async (m: TestMode) => {
    setMode(m);
    await setTestMode(m);
  };

  const resetApp = async () => {
    await remove(Keys.onboarding, Keys.session, Keys.language, Keys.currentCase, Keys.testMode);
    await resetMockData(); // also wipe the mock backend's saved cases
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

      <Section title={t('testSection')}>
        <ModeOption selected={mode === 'demo'} title={t('testDemo')} hint={t('testDemoHint')} onPress={() => chooseMode('demo')} />
        <ModeOption selected={mode === 'triage'} title={t('testTriage')} hint={t('testTriageHint')} onPress={() => chooseMode('triage')} />

        <AppText variant="label" style={styles.scenariosTitle}>{t('testScenarios')}</AppText>
        {TEST_SCENARIOS.map((s) => (
          <View key={s.label} style={styles.scenario}>
            <View style={styles.scenarioHead}>
              <AppText variant="label" style={styles.flex}>{s.label}</AppText>
              <View style={[styles.tag, s.mode === mode && styles.tagActive]}>
                <AppText variant="small" style={[styles.tagText, s.mode === mode && styles.tagTextActive]}>
                  {s.mode === 'demo' ? t('testDemo') : t('testTriage')}
                </AppText>
              </View>
            </View>
            <View style={styles.mono}><AppText variant="mono" autoDirection style={styles.monoText}>{s.message}</AppText></View>
            {s.then && <AppText variant="small">{s.then}</AppText>}
          </View>
        ))}
      </Section>

      <Section>
        <View style={[styles.row, styles.disabled]}>
          <Phone size={18} color={Colors.mutedFg} strokeWidth={2.25} />
          <AppText style={styles.mutedText}>{t('linkPhoneSoon')}</AppText>
        </View>
      </Section>

      {__DEV__ && <Button label={t('devTools')} variant="ghost" icon={Wrench} onPress={() => router.push('/hub')} />}
      <Button label={t('resetApp')} variant="destructive" icon={RotateCcw} onPress={resetApp} />

      <AppText variant="small" style={styles.footer}>Sahhanito · patient · v1.0 (mock backend)</AppText>
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

function ModeOption({ selected, title, hint, onPress }: { selected: boolean; title: string; hint: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}>
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected && <View style={styles.radioDot} />}</View>
      <View style={styles.flex}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="small">{hint}</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  disabled: { opacity: 0.6 },
  mutedText: { color: Colors.mutedFg },
  pill: { paddingHorizontal: Spacing.md, paddingVertical: 3, borderRadius: Radius.pill },
  pillOn: { backgroundColor: '#DCFCE7' },
  pillOnText: { color: '#166534', fontFamily: Fonts.medium },
  pillOff: { backgroundColor: Colors.secondary },
  pillOffText: { color: Colors.secondaryFg, fontFamily: Fonts.medium },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.input },
  optionSelected: { borderColor: Colors.primary, backgroundColor: Colors.accent },
  pressed: { opacity: 0.85 },
  radio: { width: 18, height: 18, borderRadius: Radius.pill, borderWidth: 2, borderColor: Colors.input, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioSelected: { borderColor: Colors.primary },
  radioDot: { width: 8, height: 8, borderRadius: Radius.pill, backgroundColor: Colors.primary },
  scenariosTitle: { marginTop: Spacing.md },
  scenario: { gap: 4, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  scenarioHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  tag: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill, backgroundColor: Colors.secondary },
  tagActive: { backgroundColor: Colors.accent },
  tagText: { fontSize: 11 },
  tagTextActive: { color: Colors.accentFg, fontFamily: Fonts.medium },
  mono: { alignSelf: 'flex-start', backgroundColor: Colors.muted, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  monoText: { color: Colors.foreground },
  footer: { textAlign: 'center' },
});

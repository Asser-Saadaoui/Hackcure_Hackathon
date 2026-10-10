import { Link, router, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { Keys, remove } from '@/lib/storage';

/** TEMPORARY dev hub: jump to any screen while the app is built step by step. Remove before the demo. */
const SCREENS: { href: Href; label: string; step: number }[] = [
  { href: '/welcome', label: 'Welcome (consent, notifications)', step: 4 },
  { href: '/chat', label: 'Triage chat', step: 5 },
  { href: '/emergency', label: 'Emergency', step: 6 },
  { href: '/result', label: 'Result', step: 7 },
  { href: '/location', label: 'Location confirm / adjust', step: 8 },
  { href: '/care', label: 'Status & assigned hospital', step: 9 },
  { href: '/track', label: 'Map: route / ambulance', step: 12 },
  { href: '/ed-chat', label: 'Chat with the ED', step: 11 },
  { href: '/report', label: 'Report & QR', step: 13 },
  { href: '/history', label: 'History', step: 14 },
  { href: '/settings', label: 'Settings', step: 14 },
];

export default function DevHub() {
  const resetOnboarding = async () => {
    await remove(Keys.onboarding, Keys.session, Keys.language);
    router.replace('/welcome');
  };

  return (
    <Screen>
      <AppText variant="title">HELIOS · patient</AppText>
      <AppText variant="small">Temporary navigation while we build the app step by step.</AppText>

      <Link href="/dev" asChild>
        <Pressable style={StyleSheet.flatten([styles.row, styles.devRow])}>
          <AppText variant="subtitle" style={styles.devText}>Test the mock backend</AppText>
          <AppText variant="small" style={styles.devText}>Step 3 · run scripted flows and watch live events</AppText>
        </Pressable>
      </Link>

      <Button label="Reset first open (show Welcome again)" variant="secondary" onPress={resetOnboarding} />

      {SCREENS.map((s) => (
        <Link key={String(s.href)} href={s.href} asChild>
          <Pressable style={styles.row}>
            <AppText>{s.label}</AppText>
            <AppText variant="small">Step {s.step}</AppText>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  devRow: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  devText: { color: '#FFFFFF' },
});

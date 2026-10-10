import { WifiOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { connection } from '@/lib/connection';
import { API_CONFIGURED, API_URL } from '@/lib/http-api';

/** Thin banner under the header while the backend cannot be reached. Requests keep retrying by themselves. */
export function ConnectionBanner() {
  const { t } = useI18n();
  const [online, setOnline] = useState(connection.online);
  useEffect(() => connection.subscribe(setOnline), []);
  // While offline, check the backend every 5 s so the banner clears even if the user is just waiting.
  useEffect(() => {
    if (online || !API_CONFIGURED) return;
    const timer = setInterval(() => {
      fetch(`${API_URL}/api/v1/health`).then((r) => r.ok && connection.set(true)).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [online]);
  if (online) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <WifiOff size={16} color="#FFFFFF" strokeWidth={2.5} />
      <AppText variant="small" style={styles.text}>{t('connLost')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: 6, paddingHorizontal: Spacing.lg, backgroundColor: '#B45309' },
  text: { color: '#FFFFFF' },
});

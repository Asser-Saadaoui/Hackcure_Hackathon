import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AppText } from './app-text';
import { Button } from './button';
import { Card } from './card';
import { Colors } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { EXPERIENCE } from '@/i18n/experience';
import { API_URL } from '@/lib/http-api';

/** Public health endpoint only; no patient session, bed claim, or location request. */
export function NetworkStatus() {
  const { language, t } = useI18n();
  const copy = EXPERIENCE[language];
  const [status, setStatus] = useState<{ hospitals: number; connected: boolean; checked: Date }>();
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    let controller: AbortController;
    let timeout: ReturnType<typeof setTimeout>;
    const load = async () => {
      controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`${API_URL}/api/v1/health`, { signal: controller.signal });
        if (!res.ok) throw new Error('Unavailable');
        const data = await res.json();
        if (!Number.isInteger(data.hospitals) || data.hospitals < 0 || typeof data.simulator?.ok !== 'boolean') throw new Error('Invalid status');
        if (active) { setStatus({ hospitals: data.hospitals, connected: data.simulator.ok, checked: new Date() }); setFailed(false); }
      } catch { if (active) setFailed(true); }
      finally { clearTimeout(timeout); if (active) setLoading(false); }
    };
    void load();
    const timer = setInterval(load, 60000);
    return () => { active = false; clearInterval(timer); clearTimeout(timeout); controller?.abort(); };
    // The retry counter intentionally restarts this focus lifecycle and aborts its old request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry]));
  const locale = language === 'en' ? 'en-GB' : language === 'fr' ? 'fr-TN' : 'ar-TN';
  return <Card>
    <AppText variant="subtitle">{copy.statusTitle}</AppText>
    <View accessibilityLiveRegion="polite" style={{ gap: 6 }}>
      {loading && !failed ? <><ActivityIndicator color={Colors.primary} /><AppText>{copy.statusLoading}</AppText></> :
        failed ? <><AppText accessibilityRole="alert">{copy.statusError}</AppText><Button variant="outline" label={t('retry')} onPress={() => { setLoading(true); setFailed(false); setRetry(x => x + 1); }} /></> :
        status && <><AppText>{status.connected ? copy.statusReady : copy.statusOffline}</AppText>
          <AppText variant="small">{copy.statusCount}: {status.hospitals} · {copy.statusUpdated}: {status.checked.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })}</AppText></>}
    </View>
    <AppText variant="small">{copy.statusNote}</AppText>
  </Card>;
}

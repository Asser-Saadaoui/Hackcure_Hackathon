import { router, useLocalSearchParams } from 'expo-router';
import { Check, LocateFixed, MapPin, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Alert } from '@/components/alert';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { LocationMap } from '@/components/location/location-map';
import { Screen } from '@/components/screen';
import { Hassanito } from '@/components/hassanito';
import { PrototypeNotice } from '@/components/prototype-notice';
import { NEIGHBORHOODS } from '@/constants/neighborhoods';
import { Colors, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { locate } from '@/lib/location';
import { getJSON, Keys } from '@/lib/storage';
import type { CaseLocation, LatLng } from '@/lib/types';

/**
 * Location screen: confirm or correct the position before the automatic hospital assignment.
 * The patient never chooses a hospital; confirming the location lets the backend assign one.
 */

type Phase = 'locating' | 'ready' | 'assigning';

const DEFAULT = NEIGHBORHOODS[0]; // Tunis Centre, used when location is refused
const NO_ASSIGNMENT_TIMEOUT = 4000;

export default function LocationScreen() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ caseId?: string }>();
  const [caseId, setCaseId] = useState<string | null>(params.caseId ?? null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [denied, setDenied] = useState(false);
  const [loc, setLoc] = useState<CaseLocation>({ lat: DEFAULT.lat, lng: DEFAULT.lng, source: 'MANUAL', address: DEFAULT.name });
  const done = useRef(false);

  useEffect(() => {
    if (params.caseId) return;
    getJSON<string>(Keys.currentCase).then(setCaseId);
  }, [params.caseId]);

  const findMe = useCallback(async () => {
    setPhase('locating');
    const r = await locate(10_000);
    if (r.ok) {
      setLoc(r.location);
      setDenied(false);
    } else {
      setDenied(true);
    }
    setPhase('ready');
  }, []);

  // Request location only after the patient taps the location button.

  // Hospital assigned (live event) → status screen.
  useEffect(() => {
    if (!caseId) return;
    return api.subscribe(caseId, (e) => {
      if (e.type === 'referral.status' && !done.current) {
        done.current = true;
        router.replace({ pathname: '/care', params: { caseId } });
      }
    });
  }, [caseId]);

  const moveTo = (p: LatLng) => setLoc({ lat: p.lat, lng: p.lng, source: 'ADJUSTED' });

  const confirm = async () => {
    if (!caseId) return;
    setPhase('assigning');
    try {
      await api.setLocation(caseId, loc);
      const c = await api.getCase(caseId);
      if (c.referral && !done.current) {
        done.current = true;
        router.replace({ pathname: '/care', params: { caseId } });
        return;
      }
      // No assignment (e.g. LOW case): go back.
      setTimeout(() => {
        if (done.current) return;
        done.current = true;
        if (router.canGoBack()) router.back();
        else router.replace('/chat');
      }, NO_ASSIGNMENT_TIMEOUT);
    } catch {
      setPhase('ready');
    }
  };

  const imprecise = !denied && ((loc.accuracyM ?? 0) > 200 || loc.source === 'LAST_KNOWN');

  return (
    <Screen>
      <PrototypeNotice />
      <Hassanito compact state={phase === 'assigning' ? 'thinking' : 'guiding'} />
      <View style={styles.head}>
        <AppText variant="title">{t('locationTitle')}</AppText>
        <AppText style={styles.muted}>{t('locationHint')}</AppText>
      </View>

      {phase === 'locating' ? (
        <Card>
          <View style={styles.waiting}>
            <ActivityIndicator color={Colors.primary} />
            <AppText style={styles.muted}>{t('locating')}</AppText>
          </View>
        </Card>
      ) : (
        <>
          {denied && <Alert variant="warning" icon={TriangleAlert} title={t('locationDenied')} />}
          {imprecise && <Alert variant="warning" icon={TriangleAlert} title={t('imprecise')} />}

          <LocationMap value={loc} accuracyM={loc.accuracyM} onChange={moveTo} height={320} youLabel={t('you')} />
          <AppText variant="small">{t('dragHint')}</AppText>

          <View style={styles.info}>
            <MapPin size={16} color={Colors.mutedFg} strokeWidth={2.25} />
            <AppText variant="small" style={styles.flex}>
              {loc.address ?? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`}
              {loc.accuracyM ? `  ·  ${t('accuracyLabel')} ±${loc.accuracyM} m` : ''}
            </AppText>
          </View>

          <View style={styles.field}>
            <AppText variant="label">{t('chooseArea')}</AppText>
            <View style={styles.chips}>
              {NEIGHBORHOODS.map((n) => (
                <Chip key={n.name} label={n.name} selected={loc.source === 'MANUAL' && loc.address === n.name}
                  onPress={() => setLoc({ lat: n.lat, lng: n.lng, source: 'MANUAL', address: n.name })} />
              ))}
            </View>
          </View>

          <Button label={t('useMyLocation')} variant="outline" icon={LocateFixed} onPress={findMe} disabled={phase === 'assigning'} />

          {phase === 'assigning' ? (
            <View style={styles.waiting}>
              <ActivityIndicator color={Colors.primary} />
              <AppText style={styles.muted}>{t('assigning')}</AppText>
            </View>
          ) : (
            <Button label={t('confirmLocation')} size="lg" icon={Check} onPress={confirm} disabled={!caseId} />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { color: Colors.mutedFg },
  head: { gap: Spacing.sm },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  info: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  field: { gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});

import * as Location from 'expo-location';
import { Platform } from 'react-native';

import type { CaseLocation } from '@/lib/types';

export type LocateResult =
  | { ok: true; location: CaseLocation }
  | { ok: false; reason: 'denied' | 'unavailable' };

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

/** Readable address on Android/iOS (reverse geocoding isn't available on web). */
async function addressOf(lat: number, lng: number): Promise<string | undefined> {
  if (Platform.OS === 'web') return undefined;
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return [a?.street, a?.district ?? a?.city].filter(Boolean).join(', ') || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Current position for matching. Never blocks for long:
 * permission → high-accuracy fix (≤ timeout) → last known position → give up.
 */
export async function locate(timeoutMs = 10_000): Promise<LocateResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { ok: false, reason: 'denied' };

    let fix: Location.LocationObject | null = null;
    let source: CaseLocation['source'] = 'GPS';
    try {
      fix = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), timeoutMs);
    } catch {
      fix = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
      source = 'LAST_KNOWN';
    }
    if (!fix) return { ok: false, reason: 'unavailable' };

    const { latitude: lat, longitude: lng, accuracy } = fix.coords;
    return { ok: true, location: { lat, lng, accuracyM: accuracy ? Math.round(accuracy) : undefined, source, address: await addressOf(lat, lng) } };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Small JSON wrapper over AsyncStorage (works on Android, iOS and web). */
export const Keys = {
  onboarding: 'sahhanito.onboarding',   // { consentVersion, consentAt, notifications }
  language: 'sahhanito.language',
  session: 'sahhanito.session',
  currentCase: 'sahhanito.currentCase',  // id of the case in progress
} as const;

export async function getJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setJSON(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function remove(...keys: string[]) {
  await AsyncStorage.multiRemove(keys);
}

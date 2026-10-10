import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type NotificationStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** Android 13+: the permission prompt only appears once a channel exists. */
async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('critical', {
    name: 'Urgent updates',
    importance: Notifications.AndroidImportance.MAX,
  });
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Updates',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function toStatus(p: Notifications.NotificationPermissionsStatus): NotificationStatus {
  if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  return p.status === 'denied' ? 'denied' : 'undetermined';
}

export async function getNotificationStatus(): Promise<NotificationStatus> {
  return toStatus(await Notifications.getPermissionsAsync());
}

export async function requestNotifications(): Promise<NotificationStatus> {
  await ensureChannels();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  return toStatus(await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  }));
}

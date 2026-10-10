/**
 * Web version: expo-notifications does not support web, so use the browser's
 * Notification API. Web Push subscription (service worker + VAPID) comes in Step 15.
 */
export type NotificationStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

function toStatus(p: NotificationPermission): NotificationStatus {
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'undetermined';
}

export async function getNotificationStatus(): Promise<NotificationStatus> {
  return supported() ? toStatus(Notification.permission) : 'unsupported';
}

/** Must be called from a click: browsers block prompts that aren't triggered by the user. */
export async function requestNotifications(): Promise<NotificationStatus> {
  if (!supported()) return 'unsupported';
  return toStatus(await Notification.requestPermission());
}

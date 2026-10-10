import { getJSON, setJSON } from '@/lib/storage';
import type { ChatMessage } from '@/lib/types';

/** When the patient last read the ED chat of a referral (to show an unread badge elsewhere). */
const key = (referralId: string) => `sahhanito.chatSeen.${referralId}`;

export async function markChatSeen(referralId: string, messages: ChatMessage[]) {
  const last = messages.at(-1)?.createdAt;
  if (last) await setJSON(key(referralId), last);
}

export async function unreadCount(referralId: string, messages: ChatMessage[]): Promise<number> {
  const seen = await getJSON<string>(key(referralId));
  return messages.filter((m) => m.sender === 'STAFF' && (!seen || m.createdAt > seen)).length;
}

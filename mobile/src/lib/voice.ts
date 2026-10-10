import { Platform } from 'react-native';

import type { Language } from '@/lib/types';

/** Browser dictation (Web Speech API). Native builds need a speech library: returns null there. */
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void;
};

const LOCALE: Record<Language, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar-SA', darija: 'ar-TN' };

export function voiceSupported(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function startDictation(language: Language, onText: (text: string, final: boolean) => void, onEnd: () => void): (() => void) | null {
  if (!voiceSupported()) return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition!;
  const rec = new Ctor();
  rec.lang = LOCALE[language];
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    const parts = Array.from(e.results);
    const text = parts.map((r) => r[0].transcript).join(' ');
    onText(text, parts.every((r) => r.isFinal));
  };
  rec.onend = onEnd;
  rec.onerror = onEnd;
  rec.start();
  return () => rec.stop();
}

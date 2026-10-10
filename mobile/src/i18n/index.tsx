import { getLocales } from 'expo-localization';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { LANGUAGES, STRINGS, type StringKey } from '@/i18n/strings';
import { getJSON, Keys, setJSON } from '@/lib/storage';
import type { Language } from '@/lib/types';

type Ctx = { language: Language; rtl: boolean; setLanguage: (l: Language) => void; t: (k: StringKey) => string; ready: boolean };

const LanguageContext = createContext<Ctx | null>(null);

/** Device language → app language. Tunisia: French is the safe default. */
function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  if (code === 'ar') return 'ar';
  if (code === 'en') return 'en';
  return 'fr';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [forced] = useState(() => {
    const candidate = Platform.OS === 'web' && typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('lang') : null;
    return LANGUAGES.some(l => l.code === candidate) ? candidate as Language : null;
  });
  const [language, setLang] = useState<Language>(() => forced ?? deviceLanguage());
  const [ready, setReady] = useState(!!forced);

  useEffect(() => {
    // Web only: ?lang=ar|darija|fr|en forces a language (testing and demos).
    if (forced) return;
    getJSON<Language>(Keys.language).then((saved) => {
      if (saved) setLang(saved);
      setReady(true);
    });
  }, [forced]);

  const rtl = LANGUAGES.find((l) => l.code === language)?.rtl ?? false;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = language === 'darija' ? 'ar-TN' : language;
    }
  }, [rtl, language]);

  const setLanguage = (l: Language) => {
    setLang(l);
    setJSON(Keys.language, l);
  };

  const t = (k: StringKey) => STRINGS[language][k];

  return <LanguageContext.Provider value={{ language, rtl, setLanguage, t, ready }}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useI18n must be used inside <LanguageProvider>');
  return ctx;
}

import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n';
import { USING_MOCK } from '@/lib/api';

/** Visible even with a connected backend: hospital capacity/dispatch remain simulated. */
export function PrototypeNotice({ compact = false }: { compact?: boolean }) {
  const { language } = useI18n();
  const copy = language === 'en'
    ? 'Integration prototype. Not clinically validated. Hospital capacity and ambulance tracking are simulated; this app does not dispatch emergency services.'
    : language === 'fr'
      ? 'Prototype d’intégration non validé cliniquement. Capacités hospitalières et suivi ambulance simulés ; cette application ne déclenche pas les secours.'
      : 'نموذج تجريبي، موش مثبت طبّياً. طاقة المستشفيات وتتبع الإسعاف محاكاة؛ التطبيق ما يبعثش إسعاف.';
  const demo = language === 'en' ? 'Offline demo — AI and hospital responses are mocked.'
    : language === 'fr' ? 'Démo hors ligne — réponses IA et hôpital simulées.'
      : 'عرض تجريبي — إجابات الذكاء الاصطناعي والمستشفى محاكاة.';
  return <AppText variant="small" style={{ color: '#526a66', paddingVertical: compact ? 4 : 8 }}>
    {copy}{USING_MOCK ? ` ${demo}` : ''}
  </AppText>;
}

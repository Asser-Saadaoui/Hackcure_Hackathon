import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n';
import { API_MODE } from '@/lib/api';

export function PrototypeNotice() {
  const { language } = useI18n();
  const text = language === 'fr'
    ? API_MODE === 'mock' ? 'DÉMO : réponses, hôpitaux et acceptations simulés. Aucun secours envoyé.' : 'Prototype AI local. Pas de validation clinique, de médecin connecté ni de secours envoyés.'
    : language === 'en'
      ? API_MODE === 'mock' ? 'DEMO: simulated answers, hospitals and acceptance. No help is dispatched.' : 'Local AI prototype. No clinical validation, connected clinician or emergency dispatch.'
      : API_MODE === 'mock' ? 'نسخة تجريبية: الإجابات والمستشفيات والقبول محاكاة. ما يتمش إرسال إسعاف.' : 'نموذج ذكاء اصطناعي محلي. موش معتمد طبيا وما فماش طبيب متصل ولا إرسال إسعاف.';
  return <AppText variant="small" accessibilityRole="text">{text}</AppText>;
}

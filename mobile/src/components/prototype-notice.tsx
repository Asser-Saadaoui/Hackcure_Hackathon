import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n';
import { USING_MOCK } from '@/lib/api';

/** Honest one-liner on every main screen (Mourad's design): what is simulated and what is not validated. */
const TEXT = {
  mock: {
    fr: 'DÉMO : réponses, hôpitaux et acceptations simulés. Aucun secours envoyé.',
    en: 'DEMO: simulated answers, hospitals and acceptance. No help is dispatched.',
    ar: 'نسخة تجريبية: الإجابات والمستشفيات والقبول محاكاة. لا يتم إرسال إسعاف.',
    darija: 'نسخة تجريبية: الأجوبة والسبيطارات والقبول محاكاة. ما يتبعثش إسعاف.',
  },
  live: {
    fr: 'Prototype : disponibilités des hôpitaux et ambulance simulées, triage non validé cliniquement. En cas de danger, appelez le 190.',
    en: 'Prototype: hospital availability and ambulance are simulated; triage is not clinically validated. In danger, call 190.',
    ar: 'نموذج تجريبي: توفر المستشفيات والإسعاف محاكاة، والفرز غير معتمد طبيًا. في حالة الخطر اتصل بالرقم 190.',
    darija: 'نموذج تجريبي: البلايص في السبيطارات والإسعاف محاكاة، والفرز موش معتمد طبيا. كان فما خطر عيّط للـ190.',
  },
};

export function PrototypeNotice() {
  const { language } = useI18n();
  return <AppText variant="small" accessibilityRole="text">{TEXT[USING_MOCK ? 'mock' : 'live'][language]}</AppText>;
}

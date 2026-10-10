import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n';

/** Honest one-liner on every main screen (Mourad's design): what is simulated and what is not validated. */
const TEXT = {
  live: {
    fr: 'Prototype : disponibilités des hôpitaux et ambulance simulées, triage non validé cliniquement. Cette application ne déclenche pas les secours. En cas de danger, appelez le 190.',
    en: 'Prototype: hospital availability and ambulance are simulated; triage is not clinically validated. This app does not dispatch emergency services. In danger, call 190.',
    ar: 'نموذج تجريبي: توفر المستشفيات والإسعاف محاكاة، والفرز غير معتمد طبيًا. في حالة الخطر اتصل بالرقم 190.',
    darija: 'نموذج تجريبي: البلايص في السبيطارات والإسعاف محاكاة، والفرز موش معتمد طبيا. كان فما خطر عيّط للـ190.',
  },
};

export function PrototypeNotice({ compact = false }: { compact?: boolean }) {
  const { language } = useI18n();
  return <AppText variant="small" accessibilityRole="text" style={{ color: "#526a80", paddingVertical: compact ? 4 : 8 }}>{TEXT.live[language]}</AppText>;
}

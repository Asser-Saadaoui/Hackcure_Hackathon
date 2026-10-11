import { Check, Hospital } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import type { Language, ReferralOptions, ReferralReason } from '@/lib/types';

/**
 * Why the assigned hospital is the most adequate, and the next two options the system compared it with
 * (travel time, distance, free beds). Information only: the hospital is chosen by the system / the ED teams.
 */

type L = Record<Language, string>;
const TXT: Record<string, L> = {
  why: { fr: 'Pourquoi cet hôpital est le plus adapté', en: 'Why this hospital is the best choice', ar: 'لماذا هذا المستشفى هو الأنسب', darija: 'علاش هالسبيطار هو الأنسب' },
  others: { fr: 'Autres options comparées', en: 'Other options compared', ar: 'خيارات أخرى تمت مقارنتها', darija: 'سبيطارات أخرى قارنّاهم' },
  min: { fr: 'min', en: 'min', ar: 'د', darija: 'د' },
  km: { fr: 'km', en: 'km', ar: 'كم', darija: 'كم' },
  beds: { fr: 'lits libres', en: 'free beds', ar: 'أسرّة شاغرة', darija: 'بلايص فارغين' },
  full: { fr: 'complet', en: 'full', ar: 'ممتلئ', darija: 'معبّي' },
  simulated: { fr: 'disponibilités simulées', en: 'simulated availability', ar: 'توفر محاكى', darija: 'التوفر محاكى' },
  note: { fr: 'Le choix est fait automatiquement et confirmé par les équipes des urgences.', en: 'The choice is made automatically and confirmed by the emergency teams.', ar: 'يتم الاختيار آليًا ويؤكده فريق الاستعجالي.', darija: 'الاختيار يصير وحدو ويثبّتو فريق الاستعجالي.' },
};

const SPECIALTY: Record<string, L> = {
  CARDIO: { fr: 'cardiologie', en: 'cardiology', ar: 'أمراض القلب', darija: 'القلب' },
  NEURO: { fr: 'neurologie', en: 'neurology', ar: 'الأعصاب', darija: 'الأعصاب' },
  NEUROSURG: { fr: 'neurochirurgie', en: 'neurosurgery', ar: 'جراحة الأعصاب', darija: 'جراحة الأعصاب' },
  TRAUMA: { fr: 'traumatologie', en: 'trauma care', ar: 'جراحة العظام والإصابات', darija: 'الكسور والضربات' },
  BURNS: { fr: 'grands brûlés', en: 'burns', ar: 'الحروق', darija: 'الحروق' },
  OBGYN: { fr: 'maternité', en: 'maternity', ar: 'التوليد', darija: 'الولادة' },
  PEDIA: { fr: 'pédiatrie', en: 'paediatrics', ar: 'طب الأطفال', darija: 'الصغار' },
  PNEUMO: { fr: 'pneumologie', en: 'respiratory medicine', ar: 'الأمراض الصدرية', darija: 'الصدر والتنفس' },
  OPHTA: { fr: 'ophtalmologie', en: 'eye care', ar: 'طب العيون', darija: 'العينين' },
  PSY: { fr: 'psychiatrie', en: 'psychiatry', ar: 'الطب النفسي', darija: 'الطب النفسي' },
  SURG: { fr: 'chirurgie', en: 'surgery', ar: 'الجراحة', darija: 'الجراحة' },
  INTMED: { fr: 'médecine interne', en: 'internal medicine', ar: 'الطب الباطني', darija: 'الطب الباطني' },
  EMERG: { fr: 'urgences générales', en: 'general emergency care', ar: 'الاستعجالي العام', darija: 'الاستعجالي' },
};

function reasonText(r: ReferralReason, lang: Language): string {
  const sp = r.specialty ? (SPECIALTY[r.specialty]?.[lang] ?? r.specialty) : '';
  const n = r.minutes ?? 0;
  const texts: Record<string, L> = {
    faster: { fr: `${n} min plus proche que les autres options`, en: `${n} min closer than the other options`, ar: `أقرب بـ ${n} دقيقة من الخيارات الأخرى`, darija: `أقرب بـ ${n} دقايق من البقية` },
    as_fast: { fr: 'Aussi proche que les autres options, et mieux équipé pour votre cas', en: 'As close as the other options, and better suited to your case', ar: 'قريب مثل الخيارات الأخرى ومناسب أكثر لحالتك', darija: 'قريب كيف البقية ومناسب أكثر لحالتك' },
    equipment: { fr: 'Dispose de l’équipement nécessaire pour votre cas (disponible maintenant)', en: 'Has the equipment your case needs (available now)', ar: 'يتوفر على المعدات التي تحتاجها حالتك (متاحة الآن)', darija: 'عندو المعدات اللي تلزم حالتك (خدّامة توّا)' },
    specialty: { fr: `Service spécialisé : ${sp}`, en: `Specialised department: ${sp}`, ar: `قسم مختص: ${sp}`, darija: `قسم مختص: ${sp}` },
    more_beds: { fr: `Plus de lits libres (${r.beds ?? '?'})`, en: `More free beds (${r.beds ?? '?'})`, ar: `أسرّة شاغرة أكثر (${r.beds ?? '?'})`, darija: `بلايص فارغين أكثر (${r.beds ?? '?'})` },
    shorter_wait: { fr: `Attente plus courte (environ ${n} min de moins)`, en: `Shorter wait (about ${n} min less)`, ar: `انتظار أقصر (حوالي ${n} دقيقة أقل)`, darija: `تستنّى أقل (قريب ${n} دقايق أقل)` },
    emergency_time: { fr: 'Urgence vitale : le délai d’arrivée aux soins passe en premier', en: 'Life-threatening emergency: the time to reach care comes first', ar: 'حالة طارئة خطيرة: الوقت للوصول إلى العلاج هو الأولوية', darija: 'حالة خطيرة: الوقت باش توصل للعلاج هو الأهم' },
    saturated: { fr: 'Tous les services sont pleins : le plus proche reçoit quand même les urgences vitales', en: 'All departments are full: the nearest one still receives life-threatening emergencies', ar: 'كل الأقسام ممتلئة: الأقرب يستقبل الحالات الخطيرة رغم ذلك', darija: 'الكل معبّي: الأقرب يقبل الحالات الخطيرة زادة' },
    staff_choice: { fr: 'Choisi par l’équipe des urgences pour votre cas', en: 'Chosen by the emergency team for your case', ar: 'اختاره فريق الاستعجالي لحالتك', darija: 'اختارو فريق الاستعجالي لحالتك' },
    best_overall: { fr: 'Meilleur compromis entre distance, capacité et attente', en: 'Best balance of distance, capacity and waiting time', ar: 'أفضل توازن بين المسافة والطاقة والانتظار', darija: 'أحسن توازن بين البعد والبلايص والانتظار' },
  };
  return texts[r.code]?.[lang] ?? r.code;
}

export function HospitalOptions({ options }: { options: ReferralOptions }) {
  const { language } = useI18n();
  const lang: Language = language;
  const tx = (k: string) => TXT[k][lang];
  const beds = (b: number | null | undefined) => (b == null ? null : b === 0 ? tx('full') : `${b} ${tx('beds')}`);

  return (
    <View style={styles.wrap}>
      <AppText variant="overline" style={styles.muted}>{tx('why')}</AppText>
      {options.why.map((r, i) => (
        <View key={`${r.code}-${i}`} style={styles.reason}>
          <Check size={15} color={Colors.primary} strokeWidth={2.75} />
          <AppText variant="small" style={styles.reasonText}>{reasonText(r, lang)}</AppText>
        </View>
      ))}

      {options.alternatives.length > 0 && (
        <>
          <AppText variant="overline" style={[styles.muted, styles.othersTitle]}>{tx('others')}</AppText>
          {options.alternatives.map((o, i) => (
            <View key={o.key} style={styles.option}>
              <View style={styles.rank}><AppText variant="small" style={styles.rankText}>{i + 2}</AppText></View>
              <Hospital size={16} color={Colors.mutedFg} strokeWidth={2.25} />
              <View style={styles.flex}>
                <AppText variant="small" style={styles.optionName} numberOfLines={2}>{o.name}</AppText>
                <AppText variant="small" style={styles.muted}>
                  ~{o.etaMinutes} {tx('min')} · {o.distanceKm} {tx('km')}{beds(o.bedsAvailable) ? ` · ${beds(o.bedsAvailable)}` : ''}
                </AppText>
              </View>
            </View>
          ))}
        </>
      )}
      <AppText variant="small" style={styles.note}>
        {tx('note')}{options.chosen.simulated ? ` (${tx('simulated')})` : ''}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.secondary },
  muted: { color: Colors.mutedFg },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  reasonText: { flex: 1, color: Colors.foreground },
  othersTitle: { marginTop: Spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  rank: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  rankText: { fontFamily: Fonts.semibold, fontSize: 11, lineHeight: 14 },
  optionName: { fontFamily: Fonts.medium, color: Colors.foreground },
  flex: { flex: 1 },
  note: { color: Colors.mutedFg, marginTop: Spacing.xs, fontSize: 11 },
});

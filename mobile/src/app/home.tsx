import { router, Stack, useFocusEffect } from 'expo-router';
import { ArrowRight, Clock3, FileText, MessageCircle, Phone, ShieldCheck } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Hassanito } from '@/components/hassanito';
import { PrototypeNotice } from '@/components/prototype-notice';
import { RiskBadge } from '@/components/risk-badge';
import { Screen } from '@/components/screen';
import { Colors, Fonts } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { getJSON, Keys, setJSON } from '@/lib/storage';
import type { CaseSummary } from '@/lib/types';

/** Device-scoped overview: counts and cases come from the existing patient API. */
export default function HomeScreen() {
  const { language, t } = useI18n();
  const { width, fontScale } = useWindowDimensions();
  const columns = width >= 1000 && fontScale <= 1.4;
  const ar = language === 'ar' || language === 'darija';
  const fr = language === 'fr';
  const copy = (en: string, french: string, arabic: string) => ar ? arabic : fr ? french : en;
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const focused = useRef(false);
  const request = useRef(0);
  const load = useCallback(() => {
    const id = ++request.current;
    api.listCases().then(value => { if (focused.current && id === request.current) { setCases(value); setFailed(false); } })
      .catch(() => { if (focused.current && id === request.current) setFailed(true); });
  }, []);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    load();
    return () => { focused.current = false; request.current++; };
  }, [load]));
  const start = async () => router.push(await getJSON(Keys.onboarding) ? '/chat' : '/welcome');
  const open = async (item: CaseSummary) => {
    if (item.level === 'EMERGENCY') return router.push({ pathname: '/emergency', params: { caseId: item.id } });
    if (item.facilityName) return router.push({ pathname: '/care', params: { caseId: item.id } });
    if (item.status === 'RESULT_READY' || item.status === 'UNDER_REVIEW') return router.push({ pathname: '/result', params: { caseId: item.id } });
    await setJSON(Keys.currentCase, item.id);
    router.push('/chat');
  };
  const overview = useMemo(() => {
    if (!cases) return { open: undefined, closed: undefined, recent: [] as CaseSummary[] };
    const closed = cases.reduce((count, item) => count + Number(item.status === 'CLOSED'), 0);
    return { open: cases.length - closed, closed, recent: [...cases].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3) };
  }, [cases]);
  const metrics = [
    { Icon: MessageCircle, label: copy('Conversations', 'Conversations', 'المحادثات'), value: cases?.length },
    { Icon: Clock3, label: copy('Open cases', 'Dossiers ouverts', 'الحالات المفتوحة'), value: overview.open },
    { Icon: FileText, label: copy('Closed cases', 'Dossiers clôturés', 'الحالات المغلقة'), value: overview.closed },
  ];
  return <Screen maxWidth={1150}>
    <Stack.Screen options={{ headerRight: () => <Button label="190" accessibilityLabel={t('call190')} size="sm" variant="outline" icon={Phone} onPress={() => Linking.openURL('tel:190')} /> }} />
    <View style={styles.heading}>
      <AppText style={styles.eyebrow}>{copy('PATIENT DASHBOARD', 'TABLEAU DE BORD PATIENT', 'لوحة متابعة المريض')}</AppText>
      <AppText variant="title">{copy('Your care starts here.', 'Votre parcours commence ici.', 'رحلة العناية تبدأ هنا.')}</AppText>
      <AppText style={styles.muted}>{copy('One space for your conversations and next steps.', 'Un espace pour vos échanges et les prochaines étapes.', 'بلاصة واحدة للمحادثات والخطوات الجاية.')}</AppText>
    </View>
    <View style={[styles.hero, columns && styles.horizontal]}>
      <View style={styles.orbit} pointerEvents="none" />
      <View style={styles.heroCopy}>
        <View style={styles.heroTag}><ShieldCheck size={16} color={Colors.primary} /><AppText variant="small">{copy('Here to guide you', 'Pour vous orienter', 'هنا باش نوجّهك')}</AppText></View>
        <AppText variant="title" style={[styles.heroTitle, !columns && { fontSize: 28, lineHeight: 35 }]}>{copy(columns ? 'Labess?\nLet’s talk about you.' : 'Labess?\nHow do you feel?', 'Labess ?\nParlons de vous.', 'لاباس؟\nنحكيو عليك.')}</AppText>
        <AppText style={styles.muted}>{copy('Tell us in your own words. English, French, Darija and Arabic are welcome.', 'Expliquez avec vos mots : français, anglais, darija ou arabe.', 'احكي بكلامك: دارجة، عربي، فرنسي ولا إنجليزي.')}</AppText>
        <Button label={copy('Describe my symptoms', 'Décrire mes symptômes', 'نحكي على الأعراض')} size="lg" iconRight={ArrowRight} onPress={start} />
        <AppText variant="small">{copy('No account needed · Choose your language', 'Sans compte · Choisissez votre langue', 'بلا حساب · اختار لغتك')}</AppText>
      </View>
      <View style={columns ? styles.heroMascot : undefined}><Hassanito state="idle" presentation="hero" message={copy('I’m Hassanito. We’ll take it one step at a time.', 'Je suis Hassanito. Une étape à la fois.', 'أنا حسنّيتو. نمشيو خطوة بخطوة.')} /></View>
    </View>
    <View style={styles.metrics}>{metrics.map(({ Icon, label, value }) => <View key={label} style={[styles.card, styles.metric]}><Icon size={20} color={Colors.primary} /><AppText variant="title">{failed ? '—' : value ?? '—'}</AppText><AppText variant="small">{label}</AppText></View>)}</View>
    <View style={[styles.row, columns && styles.horizontal]}>
    <View style={[styles.card, styles.grow]}>
      <View style={styles.sectionHead}><AppText variant="subtitle">{copy('Recent activity', 'Activité récente', 'آخر النشاطات')}</AppText><Button size="sm" variant="ghost" label={copy('View history', 'Voir l’historique', 'عرض المحادثات')} onPress={() => router.push('/history')} /></View>
      {failed ? <><AppText>{t('errorRetry')}</AppText><Button label={t('retry')} onPress={() => { setFailed(false); setCases(null); load(); }} /></>
        : cases === null ? <ActivityIndicator color={Colors.primary} />
        : overview.recent.length === 0 ? <View style={styles.empty}><MessageCircle size={26} color={Colors.mutedFg} /><AppText>{t('historyEmpty')}</AppText><AppText variant="small">{copy('Your conversations on this device will appear here.', 'Les conversations de cet appareil apparaîtront ici.', 'المحادثات في الجهاز هذا تظهر هنا.')}</AppText></View>
        : overview.recent.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => open(item)} style={styles.caseRow}><View style={styles.grow}><AppText style={{ fontFamily: Fonts.semibold }}>{item.referenceCode}</AppText><AppText variant="small">{new Date(item.createdAt).toLocaleDateString(language === 'darija' ? 'ar-TN' : language)}{item.facilityName ? ` · ${item.facilityName}` : ''}</AppText></View>{item.level && <RiskBadge level={item.level} />}<ArrowRight size={16} color={Colors.primary} /></Pressable>)}
    </View>
    <View style={[styles.card, columns && styles.side]}>
      <View style={styles.emergencyIcon}><Phone size={20} color={Colors.destructive} /></View>
      <AppText variant="subtitle">{t('emergencyQuestion')}</AppText>
      <AppText variant="small">{copy('If you need emergency help, contact 190 directly. Do not wait for the app.', 'Besoin de secours ? Appelez directement le 190. N’attendez pas l’application.', 'إذا تستحق إسعاف اتصل مباشرة بـ190. ما تستناش التطبيق.')}</AppText>
      <Button label={t('call190')} variant="destructive" icon={Phone} onPress={() => Linking.openURL('tel:190')} />
    </View>
    </View>
    <View style={styles.steps}>{[
      copy('Tell us what is happening', 'Expliquez ce qui se passe', 'احكيلنا شنوّة صاير'),
      copy('Answer a few questions', 'Répondez à quelques questions', 'جاوب على الأسئلة'),
      copy('Follow your next steps', 'Consultez les prochaines étapes', 'شوف الخطوات الجاية'),
    ].map((label, index) => <View key={label} style={styles.step}><View style={styles.number}><AppText style={{ color: Colors.primary }}>{index + 1}</AppText></View><AppText style={styles.grow}>{label}</AppText></View>)}</View>
    <PrototypeNotice />
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { gap: 8, paddingBottom: 8 },
  eyebrow: { fontSize: 10, letterSpacing: 1.8, fontFamily: Fonts.semibold, color: Colors.primary },
  muted: { color: Colors.mutedFg, lineHeight: 23 },
  row: { gap: 20 }, horizontal: { flexDirection: 'row', alignItems: 'stretch' }, grow: { flex: 1, minWidth: 0 },
  hero: { backgroundColor: '#E5F1FF', borderWidth: 1, borderColor: '#D1E3FA', padding: 28, borderRadius: 28, gap: 24, overflow: 'hidden', position: 'relative' },
  orbit: { position: 'absolute', width: 340, height: 340, borderRadius: 170, backgroundColor: '#D7E9FC', right: -85, top: -110 },
  heroCopy: { flex: 1, gap: 18, minWidth: 0 },
  heroTitle: { fontSize: 38, lineHeight: 46, fontFamily: Fonts.bold, letterSpacing: -1.4, color: Colors.navy },
  heroMascot: { width: 225, alignSelf: 'center' },
  heroTag: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { padding: 22, borderWidth: 1, borderColor: Colors.border, borderRadius: 22, backgroundColor: Colors.card, gap: 16 },
  side: { width: 235 },
  emergencyIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0F2' },
  step: { flex: 1, minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: 12 },
  number: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#E2EDFC', alignItems: 'center', justifyContent: 'center' },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, paddingVertical: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, metric: { flex: 1, minWidth: 150, gap: 8, padding: 18 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  empty: { alignItems: 'center', gap: 12, padding: 22 },
  caseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderColor: Colors.border },
});

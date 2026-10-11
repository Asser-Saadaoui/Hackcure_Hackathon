import { router, useFocusEffect } from 'expo-router';
import { ArrowRight, Clock3, FileText, MessageCircle, Phone, RefreshCw, ShieldCheck } from 'lucide-react-native';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AnimatedList } from '@/components/animated-list';
import { Button } from '@/components/button';
import { CareNetwork } from '@/components/care-network';
import { Hassanito } from '@/components/hassanito';
import { RiskBadge } from '@/components/risk-badge';
import { Screen } from '@/components/screen';
import { Colors, Fonts } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { EXPERIENCE } from '@/i18n/experience';
import { api } from '@/lib/api';
import { getJSON, Keys, setJSON } from '@/lib/storage';
import type { CaseSummary } from '@/lib/types';

/** Device-scoped overview: counts and cases come from the existing patient API. */
export default function HomeScreen() {
  const surfaceId = useId();
  const { language, t } = useI18n();
  const companionCopy = EXPERIENCE[language];
  const { width, fontScale } = useWindowDimensions();
  const docked = Platform.OS === 'web' && width >= 1400 && fontScale <= 1.4;
  const columns = width >= 1000 && fontScale <= 1.4;
  const ar = language === 'ar' || language === 'darija';
  const fr = language === 'fr';
  const copy = (en: string, french: string, arabic: string) => ar ? arabic : fr ? french : en;
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const focused = useRef(false);
  const request = useRef(0);
  const load = useCallback(() => {
    const id = ++request.current;
    setRefreshing(true);
    api.listCases().then(value => { if (focused.current && id === request.current) { setCases(value); setFailed(false); setUpdated(new Date()); } })
      .catch(() => { if (focused.current && id === request.current) setFailed(true); })
      .finally(() => { if (focused.current && id === request.current) setRefreshing(false); });
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
  const current = cases ? [...cases].filter(item => item.status !== 'CLOSED').sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt))[0] : undefined;
  const statusLabels = { TRIAGING:companionCopy.caseTriaging, EMERGENCY:companionCopy.caseEmergency, UNDER_REVIEW:companionCopy.caseReview, RESULT_READY:companionCopy.caseResult, REFERRED:companionCopy.caseReferred, CLOSED:companionCopy.caseClosed };
  const overviewMetrics = <View style={styles.metrics}>{metrics.map(({ Icon, label, value },index) => <Pressable key={label} nativeID={`magic-card-${surfaceId}-metric-${index}`} accessibilityRole="button" accessibilityLabel={`${label}: ${value ?? '—'}. ${copy('View history','Voir l’historique','عرض المحادثات')}`} onPress={() => router.push('/history')} style={({pressed}) => [styles.card, styles.metric, pressed && {backgroundColor:Colors.accent}]}><View style={styles.metricIcon}><Icon size={20} color={Colors.primary} /></View><View style={styles.grow}>{cases === null && !failed ? <ActivityIndicator color={Colors.primary} /> : <AppText variant="label" style={{fontSize:24,lineHeight:30}}>{value ?? '—'}</AppText>}<AppText variant="small">{label}</AppText></View><ArrowRight size={16} color={Colors.mutedFg} /></Pressable>)}</View>;
  return <Screen maxWidth={1150}>
    <View style={[styles.pageContent, docked && styles.mascotGutter]}>
    <View style={[styles.pageHeader, columns && styles.horizontal]}>
    <View style={[styles.heading, columns && styles.grow]}>
      <AppText style={styles.eyebrow}>{copy('PATIENT DASHBOARD', 'TABLEAU DE BORD PATIENT', 'لوحة متابعة المريض')}</AppText>
      <AppText variant="title">{copy('Your care starts here.', 'Votre parcours commence ici.', 'رحلة العناية تبدأ هنا.')}</AppText>
      <AppText style={styles.muted}>{copy('One space for your conversations and next steps.', 'Un espace pour vos échanges et les prochaines étapes.', 'بلاصة واحدة للمحادثات والخطوات الجاية.')}</AppText>
    </View>
    <View style={styles.sectionHead}>
      <AppText variant="small" accessibilityLiveRegion="polite">{refreshing ? companionCopy.overviewRefreshing : updated ? `${companionCopy.overviewUpdated} · ${updated.toLocaleTimeString(language === 'darija' ? 'ar-TN' : language, {hour:'2-digit',minute:'2-digit'})}` : ''}</AppText>
      <Button label={companionCopy.overviewRefresh} size="sm" variant="outline" icon={RefreshCw} disabled={refreshing} onPress={load} />
    </View>
    </View>
    {failed && <View nativeID={`magic-card-warning-${surfaceId}`} accessibilityRole="alert" style={styles.failure}><AppText variant="small">{cases ? companionCopy.overviewStale : companionCopy.historyError}</AppText></View>}
    {columns && overviewMetrics}
    <View style={[styles.workspace, columns && styles.horizontal]}>
      <View style={[styles.mainColumn, columns && styles.grow]}>
    <View nativeID={`magic-card-${surfaceId}-hero`} style={styles.hero}>
      <View style={styles.heroCopy}>
        <View style={styles.heroTag}><ShieldCheck size={16} color={Colors.primary} /><AppText variant="small">{copy('Here to guide you', 'Pour vous orienter', 'هنا باش نوجّهك')}</AppText></View>
        <AppText variant="title" style={[styles.heroTitle, !columns && { fontSize: 28, lineHeight: 35 }]}>{copy('Labess? How do you feel?', 'Labess ? Parlons de vous.', 'لاباس؟ نحكيو عليك.')}</AppText>
        <AppText style={styles.muted}>{copy('Tell us in your own words. English, French, Darija and Arabic are welcome.', 'Expliquez avec vos mots : français, anglais, darija ou arabe.', 'احكي بكلامك: دارجة، عربي، فرنسي ولا إنجليزي.')}</AppText>
        <Button label={copy('Describe my symptoms', 'Décrire mes symptômes', 'نحكي على الأعراض')} size="lg" iconRight={ArrowRight} onPress={start} />
        <AppText variant="small">{copy('No account needed · Choose your language', 'Sans compte · Choisissez votre langue', 'بلا حساب · اختار لغتك')}</AppText>
      </View>
    </View>
    {!columns && overviewMetrics}
    {current && <View nativeID={`magic-card-${surfaceId}-resume`} style={[styles.card, styles.resume, styles.resumeLayout]}>
      <View style={[styles.grow, {gap:6}]}>
        <AppText variant="subtitle">{companionCopy.overviewResume}</AppText>
        <AppText variant="small">{companionCopy.overviewResumeNote}</AppText>
        <View style={styles.heroTag}><AppText variant="label">{current.referenceCode} · {statusLabels[current.status]}</AppText>{current.level && <RiskBadge level={current.level} />}</View>
      </View>
      <Button label={companionCopy.overviewResumeAction} iconRight={ArrowRight} onPress={() => open(current)} />
    </View>}
    <View nativeID={`magic-card-${surfaceId}-activity`} style={styles.card}>
      <View style={styles.sectionHead}><AppText variant="subtitle">{copy('Recent activity', 'Activité récente', 'آخر النشاطات')}</AppText><Button size="sm" variant="ghost" label={copy('View history', 'Voir l’historique', 'عرض المحادثات')} onPress={() => router.push('/history')} /></View>
      {failed && cases === null ? <><AppText>{t('errorRetry')}</AppText><Button label={t('retry')} disabled={refreshing} onPress={load} /></>
        : cases === null ? <ActivityIndicator color={Colors.primary} />
        : overview.recent.length === 0 ? <View style={styles.empty}><MessageCircle size={26} color={Colors.mutedFg} /><AppText>{t('historyEmpty')}</AppText><AppText variant="small">{copy('Your conversations on this device will appear here.', 'Les conversations de cet appareil apparaîtront ici.', 'المحادثات في الجهاز هذا تظهر هنا.')}</AppText></View>
        : overview.recent.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => open(item)} style={styles.caseRow}><View style={styles.grow}><AppText style={{ fontFamily: Fonts.semibold }}>{item.referenceCode}</AppText><AppText variant="small">{statusLabels[item.status]}</AppText><AppText variant="small">{new Date(item.createdAt).toLocaleDateString(language === 'darija' ? 'ar-TN' : language)}{item.facilityName ? ` · ${item.facilityName}` : ''}</AppText></View>{item.level && <RiskBadge level={item.level} />}<ArrowRight size={16} color={Colors.primary} /></Pressable>)}
    </View>
      </View>
      <View style={[styles.supportColumn, columns && styles.supportDesktop]}>
      <View nativeID={`magic-card-${surfaceId}-companion`} style={[styles.card, styles.heroAside]}>
        <View style={docked ? { width:0 } : undefined}><Hassanito state="idle" presentation="hero" message={copy('I’m Hassanito. We’ll take it one step at a time.', 'Je suis Hassanito. Une étape à la fois.', 'أنا حسنّيتو. نمشيو خطوة بخطوة.')} /></View>
        <AppText variant="small" style={styles.messageTitle}>{companionCopy.mascotMessagesTitle}</AppText>
        <AnimatedList key={language} delay={600}>
          {[companionCopy.mascotMessage1, companionCopy.mascotMessage2, companionCopy.mascotMessage3].map((message,index) => <View key={message} nativeID={`magic-card-${surfaceId}-message-${index}`} style={styles.mascotMessage}>
            <MessageCircle size={16} color={Colors.primary} />
            <AppText variant="small" style={styles.messageText}>{message}</AppText>
          </View>)}
        </AnimatedList>
      </View>
    <View nativeID={`magic-card-danger-${surfaceId}`} style={[styles.card, styles.emergency]}>
      <View style={styles.emergencyIcon}><Phone size={20} color={Colors.destructive} /></View>
      <AppText variant="subtitle">{t('emergencyQuestion')}</AppText>
      <AppText variant="small">{copy('If you need emergency help, contact 190 directly. Do not wait for the app.', 'Besoin de secours ? Appelez directement le 190. N’attendez pas l’application.', 'إذا تستحق إسعاف اتصل مباشرة بـ190. ما تستناش التطبيق.')}</AppText>
      <Button label={t('call190')} variant="destructive" icon={Phone} onPress={() => Linking.openURL('tel:190')} />
    </View>
      </View>
    </View>
    <CareNetwork />
    <View style={styles.steps}>{[
      copy('Tell us what is happening', 'Expliquez ce qui se passe', 'احكيلنا شنوّة صاير'),
      copy('Answer a few questions', 'Répondez à quelques questions', 'جاوب على الأسئلة'),
      copy('Follow your next steps', 'Consultez les prochaines étapes', 'شوف الخطوات الجاية'),
    ].map((label, index) => <View key={label} style={styles.step}><View style={styles.number}><AppText style={{ color: Colors.primary }}>{index + 1}</AppText></View><AppText style={styles.grow}>{label}</AppText></View>)}</View>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  pageContent: {gap:20},
  // The floating companion gets its own unboxed edge space, clear of emergency instructions.
  mascotGutter: {paddingEnd:164},
  resume: {backgroundColor:'#F5F9FB',borderColor:'#95BFD1',alignItems:'stretch'},
  resumeLayout: {gap:18},
  pageHeader: {gap:16, justifyContent:'space-between'},
  workspace: {gap:22},
  mainColumn: {minWidth:0, gap:22},
  supportColumn: {gap:22, minWidth:0},
  supportDesktop: {width:310},
  emergency: {backgroundColor:'#FFFAFA',borderColor:'#F4D5D8'},
  failure: {padding:14,borderRadius:14,backgroundColor:Colors.warningBg,borderWidth:1,borderColor:Colors.warningBorder},
  heading: {minWidth:0, gap:8},
  eyebrow: { fontSize: 10, letterSpacing: 1.8, fontFamily: Fonts.semibold, color: Colors.primary },
  muted: { color: Colors.mutedFg, lineHeight: 23 },
  horizontal: { flexDirection: 'row', alignItems: 'flex-start' }, grow: { flex: 1, minWidth: 0 },
  hero: {backgroundColor:'#E5F0F5', borderWidth:1, borderColor:'#C5DCE6', padding:26, borderRadius:22, gap:20},
  heroCopy: {gap:18, minWidth:0},
  heroTitle: { fontSize:32, lineHeight:40, fontFamily: Fonts.bold, letterSpacing:-.8, color: Colors.navy },
  heroAside: { gap:12, justifyContent:'center', minWidth:0 },
  messageTitle: { fontFamily:Fonts.semibold, color:Colors.primary },
  mascotMessage: { flexDirection:'row', alignItems:'flex-start', gap:10, padding:13, backgroundColor:'#FFFFFF', borderRadius:16, borderWidth:1, borderColor:'#D6E5EC' },
  messageText: { flex:1, color:Colors.foreground, lineHeight:21 },
  heroTag: {flexDirection:'row', flexWrap:'wrap', alignItems:'center', gap:8},
  card: { padding: 22, borderWidth: 1, borderColor: Colors.border, borderRadius: 22, backgroundColor: Colors.card, gap: 16 },
  emergencyIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0F2' },
  step: { flex: 1, minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: 12 },
  number: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#DCEBF2', alignItems: 'center', justifyContent: 'center' },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, paddingVertical: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, metric: {flex:1, minWidth:220, gap:12, padding:16, flexDirection:'row', alignItems:'center'},
  metricIcon: {width:42, height:42, borderRadius:13, backgroundColor:'#EAF3F6', alignItems:'center', justifyContent:'center'},
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  empty: { alignItems: 'center', gap: 12, padding: 22 },
  caseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderColor: Colors.border },
});

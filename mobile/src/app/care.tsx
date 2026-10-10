import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import {
  Ambulance, Bell, Check, ChevronLeft, ChevronRight, FileText, Footprints, Hospital, MapPinned,
  MessageSquare, Navigation, Phone, ShieldAlert, type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { RiskBadge } from '@/components/risk-badge';
import { Screen } from '@/components/screen';
import { Colors, Fonts, Radius, Shadow, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import type { StringKey } from '@/i18n/strings';
import { api } from '@/lib/api';
import { attention } from '@/lib/attention';
import { unreadCount } from '@/lib/chat-seen';
import { getNotificationStatus, requestNotifications, type NotificationStatus } from '@/lib/notifications';
import { getJSON, Keys } from '@/lib/storage';
import type { CaseDetail, Referral } from '@/lib/types';

/**
 * Status screen: the hub once a hospital is assigned (automatically — the patient never chooses).
 * Shows the assigned hospital and why, the live timeline, how to get there
 * (on my own → route, ambulance → follow it on the map), and opens the LLM report and the ED chat.
 */

const call = (number: string) => Linking.openURL(`tel:${number.replace(/\s/g, '')}`);

type StepState = 'done' | 'current' | 'todo';

function timeline(referral: Referral | null, arrived: boolean): { key: StringKey; state: StepState }[] {
  const accepted = referral?.status === 'ACCEPTED' || referral?.status === 'ARRIVED' || referral?.status === 'COMPLETED';
  const isArrived = arrived || referral?.status === 'ARRIVED' || referral?.status === 'COMPLETED';
  return [
    { key: 'stepAssigned', state: referral ? 'done' : 'current' },
    { key: 'stepAccepted', state: accepted ? 'done' : referral ? 'current' : 'todo' },
    { key: 'stepOnTheWay', state: isArrived ? 'done' : accepted ? 'current' : 'todo' },
    { key: 'stepArrived', state: isArrived ? 'done' : 'todo' },
  ];
}

export default function StatusScreen() {
  const { t, rtl } = useI18n();
  const params = useLocalSearchParams<{ caseId?: string }>();
  const [caseId, setCaseId] = useState<string | null>(params.caseId ?? null);
  const [c, setCase] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [arrived, setArrived] = useState(false);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [escalation, setEscalation] = useState<string | null>(null);
  const [notif, setNotif] = useState<NotificationStatus | null>(null);

  useEffect(() => { getNotificationStatus().then(setNotif); }, []);

  // No caseId in the URL → the case in progress on this device.
  useEffect(() => {
    if (params.caseId) return;
    getJSON<string>(Keys.currentCase).then((id) => { setCaseId(id); if (!id) setLoading(false); });
  }, [params.caseId]);

  useEffect(() => {
    if (!caseId) return;
    const load = () => api.getCase(caseId).then(setCase).catch(() => setCase(null)).finally(() => setLoading(false));
    load();
    // Live: assignment, acceptance by the ED, urgency raised, ED messages, ambulance position.
    return api.subscribe(caseId, (e) => {
      if (e.type === 'referral.status') { setCase((prev) => (prev ? { ...prev, referral: e.referral } : prev)); attention(); }
      if (e.type === 'case.escalated') { setEscalation(e.instruction ?? ''); attention(); load(); }
      if (e.type === 'tracking.position') setEta(e.ambulance.etaMinutes);
      if (e.type === 'chat.message' && e.message.sender === 'STAFF') {
        setUnread((n) => n + 1);
        setToast(e.message.text);
        attention();
      }
    });
  }, [caseId]);

  // Unread ED messages, recomputed whenever this screen comes back into view.
  useFocusEffect(useCallback(() => {
    const id = c?.referral?.id;
    if (!id) return;
    api.getChat(id).then((list) => unreadCount(id, list)).then(setUnread).catch(() => {});
    setToast(null);
  }, [c?.referral?.id]));

  if (loading) {
    return <Screen><ActivityIndicator color={Colors.primary} /></Screen>;
  }

  if (!c) {
    return (
      <Screen>
        <AppText style={styles.muted}>{t('noActiveCase')}</AppText>
        <Button label={t('backToConversation')} onPress={() => router.replace('/chat')} />
      </Screen>
    );
  }

  const referral = c.referral;
  const accepted = referral?.status === 'ACCEPTED';
  const ambulance = referral?.arrivalMode === 'AMBULANCE';
  const Chevron = rtl ? ChevronLeft : ChevronRight;

  const markArrived = async () => {
    await api.closeCase(c.id, true);
    setArrived(true);
    setCase({ ...c, status: 'CLOSED', referral: referral ? { ...referral, status: 'ARRIVED' } : referral });
  };

  return (
    <Screen>
      <View style={styles.head}>
        <AppText variant="title">{t('statusTitle')}</AppText>
        <View style={styles.headMeta}>
          {c.level && <RiskBadge level={c.level} />}
          <AppText variant="small">{t('caseCode')} · {c.referenceCode}</AppText>
        </View>
      </View>

      {escalation !== null && (
        <View style={styles.escalated} accessibilityRole="alert">
          <ShieldAlert size={20} color="#FFFFFF" strokeWidth={2.25} />
          <View style={styles.flex}>
            <AppText style={styles.escalatedTitle}>{t('escalatedTitle')}</AppText>
            {escalation ? <AppText variant="small" style={styles.escalatedText}>{escalation}</AppText> : null}
          </View>
          <Button label="190" variant="outline" size="sm" icon={Phone} onPress={() => call('190')} />
        </View>
      )}

      {toast && referral && (
        <Pressable accessibilityRole="button" style={styles.toast}
          onPress={() => router.push({ pathname: '/ed-chat', params: { caseId: c.id, referralId: referral.id } })}>
          <MessageSquare size={18} color={Colors.primaryFg} strokeWidth={2.25} />
          <View style={styles.flex}>
            <AppText variant="label" style={styles.toastTitle}>{t('newEdMessage')}</AppText>
            <AppText variant="small" style={styles.toastText} numberOfLines={2} autoDirection>{toast}</AppText>
          </View>
          <AppText variant="label" style={styles.toastTitle}>{t('open')}</AppText>
        </Pressable>
      )}

      {/* Assigned hospital (automatic) + live timeline */}
      <Card>
        <AppText variant="overline" style={styles.muted}>{t('assignedHospital')}</AppText>
        {referral ? (
          <>
            <View style={styles.row}>
              <View style={styles.iconTile}><Hospital size={20} color={Colors.primary} strokeWidth={2.25} /></View>
              <View style={styles.flex}>
                <AppText style={styles.hospitalName}>{referral.facilityName}</AppText>
                <AppText variant="small">~{referral.etaMinutes} {t('minutes')}</AppText>
              </View>
            </View>
            <View style={styles.reason}>
              <AppText variant="overline" style={styles.muted}>{t('whyThisHospital')}</AppText>
              <AppText variant="small" style={styles.reasonText}>{referral.matchReason}</AppText>
            </View>
          </>
        ) : (
          <View style={styles.waiting}>
            <ActivityIndicator color={Colors.primary} />
            <AppText style={styles.muted}>{t('alerting')}</AppText>
          </View>
        )}

        <View style={styles.timeline}>
          {timeline(referral, arrived).map((s, i, all) => (
            <View key={s.key} style={styles.stepRow}>
              <View style={styles.stepRail}>
                <View style={[styles.stepDot, s.state === 'done' && styles.dotDone, s.state === 'current' && styles.dotCurrent]}>
                  {s.state === 'done' && <Check size={12} color={Colors.primaryFg} strokeWidth={3} />}
                </View>
                {i < all.length - 1 && <View style={[styles.stepLine, s.state === 'done' && styles.lineDone]} />}
              </View>
              <AppText style={[styles.stepText, s.state === 'todo' && styles.muted, s.state === 'current' && styles.stepCurrent]}>
                {t(s.key)}
              </AppText>
            </View>
          ))}
        </View>
        {referral && !accepted && !arrived && <AppText variant="small">{t('waitingHospital')}</AppText>}
      </Card>

      {/* How to get there: on my own (route) or ambulance (follow it) */}
      {referral && accepted && !arrived && (
        <Card style={ambulance ? styles.ambulanceCard : undefined}>
          <View style={styles.row}>
            <View style={[styles.iconTile, ambulance && styles.iconTileWhite]}>
              {ambulance
                ? <Ambulance size={20} color={Colors.accentFg} strokeWidth={2.25} />
                : <Footprints size={20} color={Colors.primary} strokeWidth={2.25} />}
            </View>
            <View style={styles.flex}>
              <AppText variant="subtitle">{ambulance ? t('ambulanceSimulated') : t('goOnYourOwn')}</AppText>
              <AppText variant="small">{ambulance ? t('ambulanceComing') : referral.acceptNote}</AppText>
              {ambulance && eta != null && (
                <AppText style={styles.eta} accessibilityLiveRegion="polite">{t('etaLabel')} · ~{eta} {t('minutes')}</AppText>
              )}
            </View>
          </View>
          <Button
            label={ambulance ? t('followAmbulance') : t('viewRoute')}
            icon={ambulance ? MapPinned : Navigation}
            onPress={() => router.push({ pathname: '/track', params: { caseId: c.id } })}
          />
        </Card>
      )}

      {/* LLM report + direct chat with the ED staff */}
      {referral && (
        <View style={styles.tiles}>
          <Tile icon={FileText} title={t('myReport')} hint={t('myReportHint')} Chevron={Chevron}
            href={{ pathname: '/report', params: { caseId: c.id } }} />
          <Tile icon={MessageSquare} title={t('chatWithEd')} hint={t('chatWithEdHint')} Chevron={Chevron} badge={unread}
            href={{ pathname: '/ed-chat', params: { caseId: c.id, referralId: referral.id } }} />
        </View>
      )}

      {/* Asked here, not at onboarding: the moment it is clearly useful. */}
      {referral && !arrived && (notif === 'undetermined') && (
        <Card>
          <View style={styles.row}>
            <View style={styles.iconTile}><Bell size={20} color={Colors.primary} strokeWidth={2.25} /></View>
            <View style={styles.flex}>
              <AppText variant="label">{t('notifCardTitle')}</AppText>
              <AppText variant="small">{t('notifBody')}</AppText>
            </View>
          </View>
          <Button label={t('allowNotifications')} variant="outline" icon={Bell} onPress={() => requestNotifications().then(setNotif)} />
        </Card>
      )}

      {referral && (referral.edPhone
        ? <Button label={t('callEd')} variant="outline" icon={Phone} onPress={() => call(referral.edPhone!)} />
        : <Button label={t('call190')} variant="outline" icon={Phone} onPress={() => call('190')} />)}

      {referral && accepted && !arrived && (
        <Button label={t('iArrived')} variant="secondary" icon={Check} onPress={markArrived} />
      )}
      {arrived && (
        <View style={styles.arrived}>
          <Check size={18} color="#166534" strokeWidth={2.5} />
          <AppText style={styles.arrivedText}>{t('arrivedThanks')}</AppText>
        </View>
      )}
    </Screen>
  );
}

function Tile({ icon: Icon, title, hint, href, Chevron, badge = 0 }: { icon: LucideIcon; title: string; hint: string; href: Href; Chevron: LucideIcon; badge?: number }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(href)} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.iconTile}><Icon size={20} color={Colors.primary} strokeWidth={2.25} /></View>
      <View style={styles.flex}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="small">{hint}</AppText>
      </View>
      {badge > 0 && (
        <View style={styles.badge} accessibilityLabel={`${badge}`}><AppText style={styles.badgeText}>{badge > 9 ? '9+' : badge}</AppText></View>
      )}
      <Chevron size={18} color={Colors.mutedFg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { color: Colors.mutedFg },
  head: { gap: Spacing.sm },
  headMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconTile: { width: 40, height: 40, borderRadius: Radius.lg, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  iconTileWhite: { backgroundColor: '#FFFFFF' },
  hospitalName: { fontSize: 17, lineHeight: 23, fontFamily: Fonts.semibold, letterSpacing: -0.2 },
  reason: { backgroundColor: Colors.muted, borderRadius: Radius.md, padding: Spacing.md, gap: 2 },
  reasonText: { color: Colors.secondaryFg },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  timeline: { marginTop: Spacing.sm },
  stepRow: { flexDirection: 'row', gap: Spacing.md },
  stepRail: { alignItems: 'center', width: 20 },
  stepDot: { width: 20, height: 20, borderRadius: Radius.pill, borderWidth: 2, borderColor: Colors.input, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dotCurrent: { borderColor: Colors.primary },
  stepLine: { width: 2, flex: 1, minHeight: 14, backgroundColor: Colors.border },
  lineDone: { backgroundColor: Colors.primary },
  stepText: { paddingBottom: Spacing.md, lineHeight: 20 },
  stepCurrent: { fontFamily: Fonts.semibold },
  ambulanceCard: { backgroundColor: Colors.accent, borderColor: '#BFE5EC' },
  tiles: { gap: Spacing.sm },
  tile: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg,
    backgroundColor: Colors.card, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, ...Shadow,
  },
  pressed: { opacity: 0.85 },
  arrived: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: '#DCFCE7' },
  arrivedText: { color: '#166534', flex: 1 },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: Colors.destructive, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontFamily: Fonts.semibold },
  toast: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.primary },
  toastTitle: { color: Colors.primaryFg },
  toastText: { color: '#D7EEF2' },
  escalated: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.destructive },
  escalatedTitle: { color: '#FFFFFF', fontFamily: Fonts.semibold },
  escalatedText: { color: '#FEE2E2' },
  eta: { marginTop: 2, fontFamily: Fonts.semibold, color: Colors.accentFg },
});

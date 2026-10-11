import { router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { AlertTriangle, Phone, ShieldAlert } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert } from '@/components/alert';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChatInput } from '@/components/chat/chat-input';
import { EdMessage } from '@/components/ed-chat/ed-message';
import { EdTyping } from '@/components/ed-chat/ed-typing';
import { usePhotoCapture } from '@/components/photo/use-photo-capture';
import { GridPattern } from '@/components/grid-pattern';
import { Colors, Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { markChatSeen } from '@/lib/chat-seen';
import { getJSON, Keys } from '@/lib/storage';
import type { ChatKind, ChatMessage } from '@/lib/types';

/**
 * Direct channel between the patient and the ED staff of the assigned hospital.
 * Messages are sent with REST (saved first) and received live (subscribe → SSE / push later).
 */

const TYPING_TIMEOUT_MS = 10_000;

export default function EdChatScreen() {
  const headerHeight = useHeaderHeight();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ caseId?: string; referralId?: string }>();
  const [caseId, setCaseId] = useState<string | null>(params.caseId ?? null);
  const [referralId, setReferralId] = useState<string | null>(params.referralId ?? null);
  const [hospital, setHospital] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [waitingStaff, setWaitingStaff] = useState(false);
  const [escalation, setEscalation] = useState<string | null>(null);
  const [sendError, setSendError] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToEnd = useCallback(() => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true })), []);

  /** Add a message once (the sender also receives its own message back live). */
  const upsert = useCallback((m: ChatMessage) => {
    setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
    scrollToEnd();
  }, [scrollToEnd]);

  // Everything shown here counts as read (the Care screen shows an unread badge otherwise).
  useEffect(() => {
    if (referralId && messages.length) markChatSeen(referralId, messages);
  }, [referralId, messages]);

  // caseId: URL param, else the case in progress on this device.
  useEffect(() => {
    if (params.caseId) return;
    getJSON<string>(Keys.currentCase).then((id) => { if (id) setCaseId(id); });
  }, [params.caseId]);

  // Hospital name + referralId if not passed.
  useEffect(() => {
    if (!caseId) return;
    api.getCase(caseId).then((c) => {
      setHospital(c.referral?.facilityName ?? null);
      if (!params.referralId && c.referral) setReferralId(c.referral.id);
    }).catch(() => {});
  }, [caseId, params.referralId]);

  // History + live messages.
  useEffect(() => {
    if (!caseId || !referralId) return;
    api.getChat(referralId).then((list) => {
      setMessages((current) => {
        const ids = new Set(list.map((m) => m.id));
        return [...list, ...current.filter((m) => !ids.has(m.id))];
      });
      scrollToEnd();
    }).catch(() => {});

    return api.subscribe(caseId, (e) => {
      if (e.type === 'chat.message' && e.message.referralId === referralId) {
        upsert(e.message);
        if (e.message.sender === 'STAFF') setWaitingStaff(false);
      }
      if (e.type === 'case.escalated') {
        setEscalation(e.instruction ?? '');
        if (e.level === 'EMERGENCY') router.push({ pathname: '/emergency', params: { caseId } });
      }
    });
  }, [caseId, referralId, scrollToEnd, upsert]);

  useEffect(() => () => { if (typingTimer.current) clearTimeout(typingTimer.current); }, []);

  const send = async (text: string, kind: ChatKind = 'TEXT', questionId?: string) => {
    if (!referralId) return;
    setSendError(false);
    try {
      upsert(await api.sendChat(referralId, text, kind, questionId));
      setWaitingStaff(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setWaitingStaff(false), TYPING_TIMEOUT_MS);
    } catch {
      setSendError(true);
    }
  };

  /** Photo for the ED team (camera or gallery), signed and sent at once. Never read by the AI. */
  const photo = usePhotoCapture(async (data) => {
    if (referralId) upsert(await api.sendChatImage(referralId, data));
  }, t('photoHint'));
  const photoSending = photo.sending;
  const photoError = photo.error;

  const answerOf = (q: ChatMessage) => messages.find((m) => m.sender === 'PATIENT' && m.replyTo === q.id);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <GridPattern />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
        <View style={styles.column}>
          <View style={styles.top}>
            <AppText variant="subtitle">{hospital ?? t('chatWithEd')}</AppText>
            <AppText variant="small">{t('edChatIntro')}</AppText>
            <Alert
              variant="warning"
              action={<Button label={t('call190')} variant="destructive" size="sm" icon={Phone} onPress={() => Linking.openURL('tel:190')} />}>
              <AppText variant="small" style={styles.noticeText}>{t('edChatNotice')}</AppText>
            </Alert>
            {escalation !== null && (
              <Alert variant="destructive" icon={ShieldAlert} title={t('urgencyRaised')}>
                {!!escalation && <AppText style={styles.escalationText}>{escalation}</AppText>}
              </Alert>
            )}
          </View>

          <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.messages} onContentSizeChange={scrollToEnd}>
            {messages.map((m) => (
              <EdMessage key={m.id} message={m} answer={m.kind === 'QUESTION' ? answerOf(m) : undefined}
                onAnswer={(q, option) => send(option, 'ANSWER', q.id)} />
            ))}
            {waitingStaff && <EdTyping label={t('edTyping')} />}
            {sendError && <AppText variant="small" style={styles.error}>{t('sendFailed')}</AppText>}
            {photoSending && <ActivityIndicator color={Colors.primary} style={styles.sending} />}
            {photoError && <AppText variant="small" style={styles.error}>{photoError}</AppText>}
          </ScrollView>

          <View style={styles.worseWrap}>
            <Pressable
              accessibilityRole="button"
              onPress={() => send(t('iFeelWorseDefault'), 'WORSE')}
              disabled={!referralId}
              style={({ pressed }) => [styles.worse, pressed && styles.pressed]}>
              <AlertTriangle size={16} color="#6B4F36" strokeWidth={2.5} />
              <AppText style={styles.worseText}>{t('iFeelWorse')}</AppText>
            </Pressable>
          </View>

          <ChatInput onSend={(text) => send(text)} disabled={!referralId}
            onAttach={photoSending ? undefined : photo.open} />

          {photo.element}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  top: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.sm },
  noticeText: { color: '#6B4F36' },
  escalationText: { color: Colors.destructiveText, fontFamily: Fonts.semibold },
  messages: { padding: Spacing.lg, gap: Spacing.lg },
  error: { color: Colors.destructive, alignSelf: 'flex-end' },
  worseWrap: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  worse: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    minHeight: 44, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.warningBorder, backgroundColor: Colors.warningBg,
  },
  worseText: { color: '#6B4F36', fontFamily: Fonts.semibold },
  pressed: { opacity: 0.85 },
  sending: { alignSelf: 'flex-end' },
});

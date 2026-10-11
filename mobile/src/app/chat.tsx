import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { ArrowRight, ClipboardList, History, Phone, RotateCcw, Settings, ShieldAlert, Stethoscope } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert } from '@/components/alert';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { AnswerButtons } from '@/components/chat/answer-buttons';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { ChatInput } from '@/components/chat/chat-input';
import { ExplainCard } from '@/components/chat/explain-card';
import { TypingIndicator } from '@/components/chat/typing-indicator';
import { ChatPhoto } from '@/components/ed-chat/chat-photo';
import { Hassanito } from '@/components/hassanito';
import { usePhotoCapture } from '@/components/photo/use-photo-capture';
import { GridPattern } from '@/components/grid-pattern';
import { Colors, Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { casePhotoPath, HttpError } from '@/lib/http-api';
import { getJSON, Keys, remove, setJSON } from '@/lib/storage';
import type { PatientExplain, Turn, TurnResult } from '@/lib/types';

/**
 * Triage chat (Step 5).
 * The screen never decides anything medical: it shows the conversation and reacts to the
 * NLP service's answer for each message (docs §6, §21):
 *   question     → show the assistant's next question (+ quick replies)
 *   emergency    → open the Emergency screen immediately
 *   under_review → a clinician is reviewing → Result screen (review state)
 *   result       → Result screen
 *   degraded     → AI unavailable: safe message + call 190
 */

type Item = {
  id: string;
  role: Turn['role'];
  text: string;
  time: string;
  failed?: boolean;
  /** A photo for the hospital team (never sent to the AI: no effect on the triage). */
  photoId?: string;
  /** Taken before the first message: kept on the device, uploaded once the case exists. */
  photoLocal?: string;
};

const dataUri = (data: string) => (data.startsWith('data:') ? data : `data:image/jpeg;base64,${data}`);

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const localId = () => 'local-' + Math.random().toString(36).slice(2);

export default function ChatScreen() {
  const { t, language } = useI18n();
  const [caseId, setCaseId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [degraded, setDegraded] = useState<string | null>(null);   // last patient message, to retry
  const [listening, setListening] = useState(false);
  const [resumeError, setResumeError] = useState(false);
  const [mascotState, setMascotState] = useState<'idle' | 'guiding' | 'alert' | 'happy'>('idle');
  // The decision is explained in the chat; the patient opens the decision page with a button.
  const [outcome, setOutcome] = useState<{ kind: 'emergency' | 'result' | 'under_review'; caseId: string } | null>(null);
  const [explain, setExplain] = useState<PatientExplain | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Photos go to the hospital team with the case; they are never sent to the AI (no effect on the triage).
  const photo = usePhotoCapture(async (data) => {
    if (!caseId) {
      // No case yet: keep it here, it goes with the first message.
      setItems((list) => [...list, { id: localId(), role: 'PATIENT', text: '', time: timeOf(new Date().toISOString()), photoLocal: data }]);
      return;
    }
    const p = await api.addCasePhoto(caseId, data);
    setItems((list) => [...list, { id: p.id, role: 'PATIENT', text: '', time: timeOf(p.createdAt), photoId: p.id }]);
  }, t('photoHintTriage'));

  /** Upload the photos taken before the case existed. */
  const uploadPending = async (newCaseId: string, pending: Item[]) => {
    for (const item of pending) {
      try {
        const p = await api.addCasePhoto(newCaseId, item.photoLocal!);
        setItems((list) => list.map((i) => (i.id === item.id ? { ...i, photoId: p.id, photoLocal: undefined } : i)));
      } catch {
        setItems((list) => list.map((i) => (i.id === item.id ? { ...i, failed: true } : i)));
      }
    }
  };

  // Resume the case in progress (if the backend still has it).
  const resume = useCallback(() => {
    getJSON<string>(Keys.currentCase).then(async (id) => {
      if (!id) return;
      try {
        const c = await api.getCase(id);
        setResumeError(false);
        setCaseId(c.id);
        const entries = [
          ...c.turns.map((tr) => ({ at: tr.createdAt, item: { id: tr.id, role: tr.role, text: tr.text, time: timeOf(tr.createdAt) } as Item })),
          ...(c.photos ?? []).map((p) => ({ at: p.createdAt, item: { id: p.id, role: 'PATIENT', text: '', time: timeOf(p.createdAt), photoId: p.id } as Item })),
        ].sort((a, b) => a.at.localeCompare(b.at));
        setItems(entries.map((e) => e.item));
        setQuickReplies(c.turns.at(-1)?.quickReplies ?? []);
        if (c.status !== 'TRIAGING' && c.status !== 'CLOSED') {
          setExplain(c.explain ?? null);
          setOutcome({ caseId: c.id, kind: c.status === 'EMERGENCY' || c.level === 'EMERGENCY' ? 'emergency' : c.status === 'UNDER_REVIEW' ? 'under_review' : 'result' });
          setMascotState(c.level === 'EMERGENCY' ? 'alert' : 'happy');
        } else if (c.status === 'TRIAGING' && c.turns.at(-1)?.role === 'ASSISTANT') setMascotState('guiding');
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) await remove(Keys.currentCase);
        else {
          setCaseId(id); // retain the reference across network failures
          setResumeError(true);
        }
      }
    });
  }, []);
  useEffect(() => { resume(); }, [resume]);

  const scrollToEnd = () => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

  const addItem = (item: Item) => {
    setItems((list) => [...list, item]);
    scrollToEnd();
  };

  const handleResult = (r: TurnResult) => {
    switch (r.kind) {
      case 'question':
        setMascotState('guiding');
        addItem({ id: r.turn.id, role: 'ASSISTANT', text: r.turn.text, time: timeOf(r.turn.createdAt) });
        setQuickReplies(r.turn.quickReplies ?? []);
        break;
      case 'emergency':
      case 'under_review':
      case 'result':
        // The assistant explains the decision here; the button below opens the decision page.
        setMascotState(r.kind === 'emergency' ? 'alert' : r.kind === 'result' ? 'happy' : 'idle');
        if (r.turn) addItem({ id: r.turn.id, role: 'ASSISTANT', text: r.turn.text, time: timeOf(r.turn.createdAt) });
        setExplain(r.explain ?? null);
        setOutcome({ kind: r.kind, caseId: r.caseId });   // stays in the chat; the patient opens the decision page with the button
        break;
      case 'degraded':
        // Shown as a clear alert with "try again" + 190 below, not as a grey chat line.
        break;
    }
  };

  const send = async (text: string, retryOf?: string) => {
    const id = retryOf ?? localId();
    if (retryOf) {
      setItems((list) => list.map((i) => (i.id === retryOf ? { ...i, failed: false } : i)));
    } else {
      addItem({ id, role: 'PATIENT', text, time: timeOf(new Date().toISOString()) });
    }
    setQuickReplies([]);
    setSending(true);
    setListening(false);
    scrollToEnd();
    try {
      const result = caseId ? await api.sendMessage(caseId, text, language) : await api.createCase(text, language);
      if (!caseId) {
        setCaseId(result.caseId);
        await setJSON(Keys.currentCase, result.caseId);
        uploadPending(result.caseId, items.filter((i) => i.photoLocal));
      }
      setDegraded(result.kind === 'degraded' ? text : null);
      handleResult(result);
    } catch {
      setItems((list) => list.map((i) => (i.id === id ? { ...i, failed: true } : i)));
    } finally {
      setSending(false);
      scrollToEnd();
    }
  };

  const newConversation = async () => {
    await remove(Keys.currentCase);
    setCaseId(null);
    setResumeError(false);
    setListening(false);
    setItems([]);
    setQuickReplies([]);
    setDegraded(null);
    setMascotState('idle');
    setOutcome(null);
    setExplain(null);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              {items.length > 0 && (
                <Pressable accessibilityRole="button" accessibilityLabel={t('newConversation')} onPress={newConversation} disabled={sending} hitSlop={8} style={styles.headerIcon}>
                  <RotateCcw size={18} color={Colors.mutedFg} strokeWidth={2.25} />
                </Pressable>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel={t('historyTitle')} onPress={() => router.push('/history')} hitSlop={8} style={styles.headerIcon}>
                <History size={18} color={Colors.mutedFg} strokeWidth={2.25} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('settingsTitle')} onPress={() => router.push('/settings')} hitSlop={8} style={styles.headerIcon}>
                <Settings size={18} color={Colors.mutedFg} strokeWidth={2.25} />
              </Pressable>
            </View>
          ),
        }}
      />
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <GridPattern />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
          <View style={styles.column}>
            {/* Always reachable: emergencies never wait for the conversation. */}
            <View style={styles.emergencyWrap}>
              <Alert
                variant="destructive"
                icon={ShieldAlert}
                title={t('emergencyQuestion')}
                action={<Button label={t('call190')} variant="destructive" size="sm" icon={Phone} onPress={() => Linking.openURL('tel:190')} />}
              />
            </View>

            <View style={styles.pageHead}>
              <AppText variant="subtitle">{t('chatTitle')}</AppText>
              {items.length > 0 && <Button label={t('newConversation')} size="sm" variant="ghost" icon={RotateCcw} onPress={newConversation} disabled={sending} />}
            </View>
            <View style={styles.companion}><Hassanito compact state={mascotState === 'alert' ? 'alert' : sending ? 'thinking' : listening ? 'listening' : mascotState} /></View>

            <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.messages} onContentSizeChange={scrollToEnd}>
              {resumeError && <Alert variant="warning" title={t('errorRetry')}>
                <Button label={t('retry')} variant="outline" onPress={resume} disabled={sending} />
              </Alert>}
              <ChatBubble role="ASSISTANT" text={t('chatGreeting')} />
              {items.map((item) => (
                <View key={item.id} style={styles.itemWrap}>
                  {item.photoId && caseId ? (
                    <View style={styles.photoItem}>
                      <ChatPhoto path={casePhotoPath(caseId, item.photoId)} />
                      <AppText variant="small" style={styles.photoNote}>{t('photoNotUsed')} · {item.time}</AppText>
                    </View>
                  ) : item.photoLocal ? (
                    <View style={styles.photoItem}>
                      <Image source={{ uri: dataUri(item.photoLocal) }} style={styles.photoLocal} contentFit="cover" />
                      <AppText variant="small" style={[styles.photoNote, item.failed && styles.photoError]}>
                        {item.failed ? t('photoFailed') : t('photoPending')} · {item.time}
                      </AppText>
                    </View>
                  ) : (
                    <ChatBubble role={item.role} text={item.text} time={item.time} failed={item.failed} />
                  )}
                  {item.failed && !item.photoLocal && (
                    <Pressable accessibilityRole="button" onPress={() => send(item.text, item.id)} style={styles.retry}>
                      <AppText variant="small" style={styles.retryText}>{t('sendFailed')} {t('retry')} ↻</AppText>
                    </Pressable>
                  )}
                </View>
              ))}
              {outcome && explain && !sending && <ExplainCard explain={explain} />}
              {sending && <TypingIndicator label={t('typing')} slowLabel={t('typingLong')} />}
              {photo.sending && <ActivityIndicator color={Colors.primary} style={styles.photoSending} />}
              {photo.error && <AppText variant="small" style={styles.photoError}>{photo.error}</AppText>}
              {degraded && !sending && (
                <Alert variant="destructive" icon={ShieldAlert} title={t('aiUnavailableTitle')}>
                  <AppText variant="small" style={styles.alertText}>{t('aiUnavailableBody')}</AppText>
                  <View style={styles.degradedActions}>
                    <Button label={t('call190')} variant="destructive" size="sm" icon={Phone} onPress={() => Linking.openURL('tel:190')} />
                    <Button label={t('retryNow')} variant="outline" size="sm" onPress={() => send(degraded)} />
                  </View>
                </Alert>
              )}
            </ScrollView>

            {quickReplies.length > 0 && !sending && !outcome && <AnswerButtons options={quickReplies} onPick={(q) => send(q)} />}

            {outcome && !sending && (
              <View style={styles.outcome}>
                {outcome.kind === 'emergency' ? (
                  <>
                    <Button label={t('call190')} size="lg" variant="destructive" icon={Phone} onPress={() => Linking.openURL('tel:190')} />
                    <Button label={t('openEmergency')} size="lg" variant="outline" icon={ShieldAlert} iconRight={ArrowRight}
                      onPress={() => router.push({ pathname: '/emergency', params: { caseId: outcome.caseId } })} />
                  </>
                ) : (
                  <Button label={outcome.kind === 'result' ? t('openResult') : t('openReview')} size="lg"
                    icon={outcome.kind === 'result' ? ClipboardList : Stethoscope} iconRight={ArrowRight}
                    onPress={() => router.push({ pathname: '/result', params: { caseId: outcome.caseId } })} />
                )}
              </View>
            )}

            {/* After a decision only a case under review can still receive information. */}
            {(!outcome || outcome.kind === 'under_review') && (
              <ChatInput onSend={(text) => send(text)} disabled={sending} onActivity={setListening}
                onAttach={photo.sending ? undefined : photo.open} />
            )}
            {photo.element}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  photoItem: { alignSelf: 'flex-end', alignItems: 'flex-end', gap: 4, maxWidth: '82%' },
  photoNote: { color: Colors.mutedFg, textAlign: 'right' },
  photoSending: { alignSelf: 'flex-end' },
  photoLocal: { width: 200, height: 200, borderRadius: 10 },
  photoError: { color: Colors.destructive, alignSelf: 'flex-end' },
  flex: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: MaxContentWidth + 200, alignSelf: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm },
  degradedActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  outcome: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.card },
  headerIcon: { padding: 10, borderRadius: 999 },   // ≥ 44 px touch target
  headerLink: { color: Colors.primary, fontFamily: Fonts.medium, fontSize: 14 },
  emergencyWrap: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  pageHead: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  companion: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  messages: { padding: Spacing.lg, gap: Spacing.lg },
  itemWrap: { gap: Spacing.xs },
  retry: { alignSelf: 'flex-end' },
  retryText: { color: Colors.destructive },
  alertText: { color: Colors.destructiveText },
});

import { router, Stack } from 'expo-router';
import { History, Phone, RotateCcw, Settings, ShieldAlert } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert } from '@/components/alert';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { AnswerButtons } from '@/components/chat/answer-buttons';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { ChatInput } from '@/components/chat/chat-input';
import { TypingIndicator } from '@/components/chat/typing-indicator';
import { Hassanito } from '@/components/hassanito';
import { PrototypeNotice } from '@/components/prototype-notice';
import { Colors, Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { api, USING_MOCK } from '@/lib/api';
import { HttpError } from '@/lib/http-api';
import { getJSON, Keys, remove, setJSON } from '@/lib/storage';
import type { Turn, TurnResult } from '@/lib/types';

/**
 * Triage chat (Step 5).
 * The screen never decides anything medical: it shows the conversation and reacts to the
 * NLP service's answer for each message (docs §6, §21):
 *   question     → show the assistant's next question (+ quick replies)
 *   emergency    → open the Emergency screen immediately
 *   under_review → a clinician is reviewing → Result screen (review state)
 *   result       → Result screen
 *   degraded     → AI unavailable: safe message + call 190
 * In demo mode the mock always answers `question` with a demo reply.
 */

type Item = {
  id: string;
  role: Turn['role'];
  text: string;
  time: string;
  failed?: boolean;
};

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
  const scrollRef = useRef<ScrollView>(null);

  // Resume the case in progress (if the backend still has it).
  const resume = useCallback(() => {
    getJSON<string>(Keys.currentCase).then(async (id) => {
      if (!id) return;
      try {
        const c = await api.getCase(id);
        setResumeError(false);
        setCaseId(c.id);
        setItems(c.turns.map((tr) => ({ id: tr.id, role: tr.role, text: tr.text, time: timeOf(tr.createdAt) })));
        setQuickReplies(c.turns.at(-1)?.quickReplies ?? []);
        if (c.level === 'EMERGENCY') {
          setMascotState('alert');
          router.push({ pathname: '/emergency', params: { caseId: c.id } });
        } else if (c.status === 'TRIAGING' && c.turns.at(-1)?.role === 'ASSISTANT') setMascotState('guiding');
      } catch (error) {
        if (USING_MOCK || error instanceof HttpError && error.status === 404) await remove(Keys.currentCase);
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

  const systemLine = (text: string) => addItem({ id: localId(), role: 'SYSTEM', text, time: timeOf(new Date().toISOString()) });

  const handleResult = (r: TurnResult) => {
    switch (r.kind) {
      case 'question':
        setMascotState('guiding');
        addItem({ id: r.turn.id, role: 'ASSISTANT', text: r.turn.text, time: timeOf(r.turn.createdAt) });
        setQuickReplies(r.turn.quickReplies ?? []);
        break;
      case 'emergency':
        setMascotState('alert');
        // Emergency wins: open the instructions right away, no extra tap.
        systemLine(t('routingEmergency'));
        router.push({ pathname: '/emergency', params: { caseId: r.caseId } });
        break;
      case 'under_review':
        systemLine(t('routingReview'));
        router.push({ pathname: '/result', params: { caseId: r.caseId } });
        break;
      case 'result':
        setMascotState('happy');
        systemLine(t('routingResult'));
        router.push({ pathname: '/result', params: { caseId: r.caseId } });
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
              <PrototypeNotice />
              {resumeError && <Alert variant="warning" title={t('errorRetry')}>
                <Button label={t('retry')} variant="outline" onPress={resume} disabled={sending} />
              </Alert>}
              <ChatBubble role="ASSISTANT" text={t('chatGreeting')} />
              {items.map((item) => (
                <View key={item.id} style={styles.itemWrap}>
                  <ChatBubble role={item.role} text={item.text} time={item.time} failed={item.failed} />
                  {item.failed && (
                    <Pressable accessibilityRole="button" onPress={() => send(item.text, item.id)} style={styles.retry}>
                      <AppText variant="small" style={styles.retryText}>{t('sendFailed')} {t('retry')} ↻</AppText>
                    </Pressable>
                  )}
                </View>
              ))}
              {sending && <TypingIndicator label={t('typing')} slowLabel={t('typingLong')} />}
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

            {quickReplies.length > 0 && !sending && <AnswerButtons options={quickReplies} onPick={(q) => send(q)} />}

            <ChatInput onSend={(text) => send(text)} disabled={sending} onActivity={setListening} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: MaxContentWidth + 200, alignSelf: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm },
  degradedActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
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

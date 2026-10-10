import { router, Stack } from 'expo-router';
import { History, Phone, RotateCcw, Settings, ShieldAlert } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert } from '@/components/alert';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { ChatInput } from '@/components/chat/chat-input';
import { TypingIndicator } from '@/components/chat/typing-indicator';
import { Colors, Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
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
  const [degraded, setDegraded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Resume the case in progress (if the backend still has it).
  useEffect(() => {
    getJSON<string>(Keys.currentCase).then(async (id) => {
      if (!id) return;
      try {
        const c = await api.getCase(id);
        setCaseId(c.id);
        setItems(c.turns.map((tr) => ({ id: tr.id, role: tr.role, text: tr.text, time: timeOf(tr.createdAt) })));
        setQuickReplies(c.turns.at(-1)?.quickReplies ?? []);
      } catch {
        await remove(Keys.currentCase); // unknown case (e.g. mock data lost on reload) → start fresh
      }
    });
  }, []);

  const scrollToEnd = () => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

  const addItem = (item: Item) => {
    setItems((list) => [...list, item]);
    scrollToEnd();
  };

  const systemLine = (text: string) => addItem({ id: localId(), role: 'SYSTEM', text, time: timeOf(new Date().toISOString()) });

  const handleResult = (r: TurnResult) => {
    switch (r.kind) {
      case 'question':
        addItem({ id: r.turn.id, role: 'ASSISTANT', text: r.turn.text, time: timeOf(r.turn.createdAt) });
        setQuickReplies(r.turn.quickReplies ?? []);
        break;
      case 'emergency':
        // Emergency wins: open the instructions right away, no extra tap.
        systemLine(t('routingEmergency'));
        router.push({ pathname: '/emergency', params: { caseId: r.caseId } });
        break;
      case 'under_review':
        systemLine(t('routingReview'));
        router.push({ pathname: '/result', params: { caseId: r.caseId } });
        break;
      case 'result':
        systemLine(t('routingResult'));
        router.push({ pathname: '/result', params: { caseId: r.caseId } });
        break;
      case 'degraded':
        systemLine(r.message);
        setDegraded(true);
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
    scrollToEnd();
    try {
      const result = caseId ? await api.sendMessage(caseId, text, language) : await api.createCase(text, language);
      if (!caseId) {
        setCaseId(result.caseId);
        await setJSON(Keys.currentCase, result.caseId);
      }
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
    setItems([]);
    setQuickReplies([]);
    setDegraded(false);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              {items.length > 0 && (
                <Pressable accessibilityRole="button" accessibilityLabel={t('newConversation')} onPress={newConversation} hitSlop={8} style={styles.headerIcon}>
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
            </View>

            <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.messages} onContentSizeChange={scrollToEnd}>
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
              {sending && <TypingIndicator label={t('typing')} />}
              {degraded && (
                <Alert variant="destructive" icon={ShieldAlert} title={t('callNow')}
                  action={<Button label="190" variant="destructive" icon={Phone} onPress={() => Linking.openURL('tel:190')} />}>
                  <AppText variant="small" style={styles.alertText}>{t('aiDegradedNote')}</AppText>
                </Alert>
              )}
            </ScrollView>

            {quickReplies.length > 0 && !sending && (
              <ScrollView horizontal style={styles.quickBar} contentContainerStyle={styles.quickRow} keyboardShouldPersistTaps="handled">
                {quickReplies.map((q) => <Chip key={q} label={q} onPress={() => send(q)} />)}
              </ScrollView>
            )}

            <ChatInput onSend={(text) => send(text)} disabled={sending} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md },
  headerIcon: { padding: 4 },
  headerLink: { color: Colors.primary, fontFamily: Fonts.medium, fontSize: 14 },
  emergencyWrap: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  pageHead: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  messages: { padding: Spacing.lg, gap: Spacing.lg },
  itemWrap: { gap: Spacing.xs },
  retry: { alignSelf: 'flex-end' },
  retryText: { color: Colors.destructive },
  alertText: { color: Colors.destructiveText },
  quickBar: { flexGrow: 0 },
  quickRow: { gap: 6, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
});

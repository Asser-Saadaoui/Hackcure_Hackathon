import { Mic, Square, SendHorizontal } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Colors, Fonts, Radius, Shadow, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { startDictation, voiceSupported } from '@/lib/voice';

type Props = { onSend: (text: string) => void; disabled?: boolean };

const MAX_LENGTH = 1000;

/** shadcn-style textarea + icon send button. Enter sends on web; Shift+Enter makes a new line. */
export function ChatInput({ onSend, disabled }: Props) {
  const { t, rtl, language } = useI18n();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const baseRef = useRef('');
  const canDictate = voiceSupported();
  useEffect(() => () => stopRef.current?.(), []);

  const toggleVoice = () => {
    if (listening) { stopRef.current?.(); return; }
    baseRef.current = text ? text.trimEnd() + ' ' : '';
    stopRef.current = startDictation(language, (spoken) => setText((baseRef.current + spoken).slice(0, MAX_LENGTH)),
      () => { setListening(false); stopRef.current = null; });
    setListening(Boolean(stopRef.current));
  };
  const canSend = !disabled && text.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    stopRef.current?.();
    onSend(text.trim());
    setText('');
  };

  return (
    <View style={styles.bar}>
      <TextInput
        style={[styles.input, focused && styles.inputFocused, { textAlign: rtl ? 'right' : 'left' }]}
        value={text}
        onChangeText={setText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={listening ? t('voiceListening') : t('chatPlaceholder')}
        placeholderTextColor={Colors.mutedFg}
        multiline
        maxLength={MAX_LENGTH}
        accessibilityLabel={t('chatPlaceholder')}
        onKeyPress={(e) => {
          const ne = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
          if (ne.key === 'Enter' && !ne.shiftKey) {
            (e as unknown as { preventDefault?: () => void }).preventDefault?.();
            send();
          }
        }}
      />
      {canDictate && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listening ? t('voiceStop') : t('voiceDictate')}
          onPress={toggleVoice}
          disabled={disabled}
          style={({ pressed }) => [styles.mic, listening && styles.micOn, pressed && styles.pressed]}>
          {listening ? <Square size={18} color={Colors.primaryFg} strokeWidth={2.5} /> : <Mic size={20} color={Colors.primary} strokeWidth={2.25} />}
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('send')}
        onPress={send}
        disabled={!canSend}
        style={({ pressed }) => [styles.send, !canSend && styles.sendDisabled, pressed && styles.pressed]}>
        <SendHorizontal size={20} color={Colors.primaryFg} strokeWidth={2.25} style={rtl ? styles.flip : undefined} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md - 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.input,
    backgroundColor: Colors.card,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.foreground,
  },
  // focus-visible:ring-2 ring-primary
  inputFocused: { borderColor: Colors.primary, borderWidth: 2, paddingHorizontal: Spacing.md - 1 },
  send: { width: 46, height: 46, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', ...Shadow },
  sendDisabled: { opacity: 0.4 },
  mic: { width: 46, height: 46, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.input, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center' },
  micOn: { backgroundColor: Colors.destructive, borderColor: Colors.destructive },
  pressed: { opacity: 0.88 },
  flip: { transform: [{ scaleX: -1 }] },
});

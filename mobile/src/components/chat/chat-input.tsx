import { SendHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Colors, Fonts, Radius, Shadow, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';

type Props = { onSend: (text: string) => void; disabled?: boolean; onActivity?: (active: boolean) => void };

const MAX_LENGTH = 1000;

/** shadcn-style textarea + icon send button. Enter sends on web; Shift+Enter makes a new line. */
export function ChatInput({ onSend, disabled, onActivity }: Props) {
  const { t, rtl } = useI18n();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const canSend = !disabled && text.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
    onActivity?.(false);
  };

  return (
    <View style={styles.bar}>
      <TextInput
        style={[styles.input, focused && styles.inputFocused, { textAlign: rtl ? 'right' : 'left' }]}
        value={text}
        onChangeText={(value) => { setText(value); onActivity?.(value.length > 0); }}
        onFocus={() => { setFocused(true); onActivity?.(true); }}
        onBlur={() => { setFocused(false); onActivity?.(false); }}
        placeholder={t('chatPlaceholder')}
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
  pressed: { opacity: 0.88 },
  flip: { transform: [{ scaleX: -1 }] },
});

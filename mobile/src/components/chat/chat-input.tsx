import { Camera, Mic, Square, SendHorizontal } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { InputGroup, InputGroupAddon, InputGroupButton } from '@/components/input-group';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { startDictation, voiceSupported } from '@/lib/voice';

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  busy?: boolean;
  onActivity?: (active: boolean) => void;
  /** Shows a photo button. Photos are for the hospital team: the AI never reads them. */
  onAttach?: () => void;
};

const MAX_LENGTH = 1000;

const HINT = {
  en:'Enter to send · Shift + Enter for a new line',
  fr:'Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne',
  ar:'Enter للإرسال · Shift + Enter لسطر جديد',
  darija:'Enter تبعث · Shift + Enter تزيد سطر',
};

/** shadcn Input Group composer. Existing photo, dictation and send callbacks stay screen-owned. */
export function ChatInput({ onSend, disabled, busy = false, onActivity, onAttach }: Props) {
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
      () => { setListening(false); stopRef.current = null; onActivity?.(false); });
    setListening(Boolean(stopRef.current));
    if (stopRef.current) onActivity?.(true);
  };
  const canSend = !disabled && text.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    stopRef.current?.();
    onSend(text.trim());
    setText('');
    onActivity?.(false);
  };

  return (
    <View style={styles.bar}>
    <InputGroup focused={focused || listening}>
      <TextInput
        style={[styles.input, { textAlign: rtl ? 'right' : 'left' }, rtl && styles.arabic]}
        value={text}
        onChangeText={(value) => { setText(value); onActivity?.(value.length > 0); }}
        onFocus={() => { setFocused(true); onActivity?.(true); }}
        onBlur={() => { setFocused(false); onActivity?.(false); }}
        placeholder={listening ? t('voiceListening') : t('chatPlaceholder')}
        placeholderTextColor={Colors.mutedFg}
        multiline
        maxLength={MAX_LENGTH}
        accessibilityLabel={t('chatPlaceholder')}
        onKeyPress={(e) => {
          if (Platform.OS !== 'web') return;
          const ne = e.nativeEvent as unknown as { key: string; shiftKey?: boolean; isComposing?:boolean; keyCode?:number };
          if (ne.key === 'Enter' && !ne.shiftKey && !ne.isComposing && ne.keyCode !== 229) {
            (e as unknown as { preventDefault?: () => void }).preventDefault?.();
            send();
          }
        }}
      />
      <InputGroupAddon>
      <View style={styles.tools}>
      {onAttach && <InputGroupButton accessibilityLabel={t('attachPhoto')}
        onPress={onAttach} disabled={disabled}>
        <Camera size={20} color={Colors.primary} strokeWidth={2} />
      </InputGroupButton>}
      {canDictate && (
        <InputGroupButton
          accessibilityLabel={listening ? t('voiceStop') : t('voiceDictate')}
          accessibilityState={{selected:listening}}
          onPress={toggleVoice}
          disabled={disabled}
          style={listening && styles.micOn}>
          {listening ? <Square size={18} color={Colors.primaryFg} strokeWidth={2.5} /> : <Mic size={20} color={Colors.primary} strokeWidth={2.25} />}
        </InputGroupButton>
      )}
      </View>
      <View style={styles.sendTools}>
      {listening && <AppText variant="small" accessibilityLiveRegion="polite" style={styles.listening}>{t('voiceListening')}</AppText>}
      {text.length > MAX_LENGTH - 100 && <AppText variant="small">{text.length}/{MAX_LENGTH}</AppText>}
      <InputGroupButton
        accessibilityLabel={t('send')}
        accessibilityState={{busy}}
        onPress={send}
        disabled={!canSend}
        style={[styles.send, !canSend && styles.sendDisabled]}>
        {busy ? <ActivityIndicator size="small" color={Colors.primary} /> : <SendHorizontal size={20} color={canSend ? Colors.primaryFg : Colors.mutedFg} strokeWidth={2.25} style={rtl ? styles.flip : undefined} />}
      </InputGroupButton>
      </View>
      </InputGroupAddon>
    </InputGroup>
    {Platform.OS === 'web' && <AppText variant="small" style={styles.hint}>{HINT[language]}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap:6,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
  },
  input: {
    minHeight:52,
    maxHeight:140,
    paddingHorizontal:16,
    paddingTop:14,
    paddingBottom:8,
    borderWidth:0,
    borderRadius:22,
    backgroundColor:'transparent',
    textAlignVertical:'top',
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.foreground,
  },
  arabic: {fontFamily:Platform.OS === 'web' ? 'Arial' : undefined},
  tools: {flexDirection:'row', alignItems:'center', gap:4},
  sendTools: {flexDirection:'row', alignItems:'center', justifyContent:'flex-end', gap:8, flex:1, minWidth:0},
  send: {backgroundColor:Colors.primary, borderRadius:999},
  sendDisabled: {backgroundColor:Colors.secondary, opacity:1},
  micOn: {backgroundColor:Colors.destructive},
  listening: {color:Colors.destructive, flexShrink:1},
  hint: {fontSize:11, lineHeight:16, textAlign:'center'},
  flip: { transform: [{ scaleX: -1 }] },
});

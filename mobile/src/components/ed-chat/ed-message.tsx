import { AlertTriangle, Check, Hospital } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Chip } from '@/components/chip';
import { Colors, Fonts, Radius, Shadow, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import type { ChatMessage } from '@/lib/types';

type Props = {
  message: ChatMessage;
  /** For a QUESTION: the patient's answer, if already given. */
  answer?: ChatMessage;
  onAnswer?: (question: ChatMessage, option: string) => void;
};

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** One message of the patient ↔ ED chat. */
export function EdMessage({ message: m, answer, onAnswer }: Props) {
  const { t } = useI18n();

  if (m.sender === 'SYSTEM') {
    return (
      <View style={styles.system}>
        <AppText variant="small" style={styles.systemText}>{m.text}</AppText>
      </View>
    );
  }

  if (m.sender === 'PATIENT') {
    return (
      <View style={[styles.row, styles.rowMine]}>
        <View style={[styles.bubble, styles.mine]}>
          {m.kind === 'WORSE' && (
            <View style={styles.worseTag}>
              <AlertTriangle size={12} color="#9A3412" strokeWidth={2.5} />
              <AppText style={styles.worseText}>{t('iFeelWorse')}</AppText>
            </View>
          )}
          <AppText autoDirection style={styles.mineText}>{m.text}</AppText>
          <AppText variant="small" style={[styles.time, styles.mineTime]}>{timeOf(m.createdAt)}</AppText>
        </View>
      </View>
    );
  }

  // STAFF
  const instruction = m.kind === 'INSTRUCTION';
  const question = m.kind === 'QUESTION';
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Hospital size={14} color={Colors.accentFg} strokeWidth={2.5} />
      </View>
      <View style={[styles.bubble, styles.theirs, instruction && styles.instruction]}>
        {m.senderName && <AppText variant="small" style={styles.sender}>{m.senderName}</AppText>}
        {question && <AppText variant="overline" style={styles.questionLabel}>{t('questionFromEd')}</AppText>}
        <AppText autoDirection style={instruction ? styles.instructionText : undefined}>{m.text}</AppText>
        {question && !!m.options?.length && (
          answer ? (
            <View style={styles.answered}>
              <Check size={14} color={Colors.primary} strokeWidth={2.5} />
              <AppText variant="small" style={styles.answeredText}>{t('yourAnswer')} : {answer.text}</AppText>
            </View>
          ) : (
            <View style={styles.options}>
              {m.options.map((o) => <Chip key={o} label={o} onPress={() => onAnswer?.(m, o)} />)}
            </View>
          )
        )}
        <AppText variant="small" style={styles.time}>{timeOf(m.createdAt)}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  rowMine: { justifyContent: 'flex-end' },
  avatar: { width: 26, height: 26, borderRadius: Radius.sm, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '82%', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.xl, gap: 4 },
  mine: { backgroundColor: Colors.primary, borderBottomEndRadius: Radius.sm, ...Shadow },
  mineText: { color: Colors.primaryFg },
  theirs: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderBottomStartRadius: Radius.sm, flexShrink: 1, ...Shadow },
  instruction: { backgroundColor: Colors.destructiveBg, borderColor: Colors.destructiveBorder, borderStartWidth: 3 },
  instructionText: { color: Colors.destructiveText, fontFamily: Fonts.semibold },
  sender: { fontFamily: Fonts.medium, color: Colors.mutedFg },
  questionLabel: { color: Colors.primary },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.xs },
  answered: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.xs },
  answeredText: { color: Colors.primary, fontFamily: Fonts.medium },
  worseTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: Colors.warningBg, borderRadius: Radius.pill, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  worseText: { fontSize: 11, color: '#9A3412', fontFamily: Fonts.semibold },
  time: { fontSize: 11, lineHeight: 14, alignSelf: 'flex-end' },
  mineTime: { color: '#CFE7EC' },
  system: { alignSelf: 'center', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill, backgroundColor: Colors.secondary },
  systemText: { textAlign: 'center', color: Colors.secondaryFg },
});

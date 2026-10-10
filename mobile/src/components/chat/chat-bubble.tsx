import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AssistantAvatar } from '@/components/chat/assistant-avatar';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';

type Props = {
  role: 'PATIENT' | 'ASSISTANT' | 'SYSTEM';
  text: string;
  time?: string;
  failed?: boolean;
};

/** One chat message. Patient text keeps its own direction (dir auto): people mix Arabizi, Arabic and French. */
export function ChatBubble({ role, text, time, failed }: Props) {
  if (role === 'SYSTEM') {
    return (
      <View style={styles.system}>
        <AppText variant="small" style={styles.systemText}>{text}</AppText>
      </View>
    );
  }

  if (role === 'PATIENT') {
    return (
      <View style={[styles.row, styles.rowMine]}>
        <View style={[styles.bubble, styles.mine, failed && styles.failed]}>
          <AppText autoDirection style={styles.mineText}>{text}</AppText>
          {time && <AppText variant="small" style={[styles.time, styles.mineTime]}>{time}</AppText>}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <AssistantAvatar />
      <View style={[styles.bubble, styles.theirs]}>
        <AppText autoDirection>{text}</AppText>
        {time && <AppText variant="small" style={styles.time}>{time}</AppText>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  rowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.xl, gap: 2 },
  mine: { backgroundColor: Colors.primary, borderBottomEndRadius: Radius.sm, ...Shadow },
  theirs: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderBottomStartRadius: Radius.sm, flexShrink: 1, ...Shadow },
  failed: { opacity: 0.55 },
  mineText: { color: Colors.primaryFg },
  time: { fontSize: 11, lineHeight: 14, alignSelf: 'flex-end' },
  mineTime: { color: '#CFE7EC' },
  system: { alignSelf: 'center', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill, backgroundColor: Colors.secondary },
  systemText: { textAlign: 'center', color: Colors.secondaryFg },
});

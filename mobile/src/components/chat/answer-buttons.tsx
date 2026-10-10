import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

/** Large, full-width answer buttons for the assistant's question (≥ 48 px touch targets).
 *  Short answers (Oui / Non / Je ne sais pas) sit side by side; longer ones stack. */
export function AnswerButtons({ options, onPick, disabled }: { options: string[]; onPick: (o: string) => void; disabled?: boolean }) {
  const short = options.length <= 3 && options.every((o) => o.length <= 16);
  return (
    <View style={[styles.wrap, short && styles.row]} accessibilityRole="radiogroup">
      {options.map((o) => (
        <Pressable key={o} accessibilityRole="button" accessibilityLabel={o} disabled={disabled} onPress={() => onPick(o)}
          style={({ pressed }) => [styles.button, short && styles.flex, pressed && styles.pressed, disabled && styles.disabled]}>
          <Text style={styles.text} numberOfLines={2}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  row: { flexDirection: 'row' },
  flex: { flex: 1 },
  button: {
    minHeight: 48, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center',
  },
  pressed: { backgroundColor: Colors.accent },
  disabled: { opacity: 0.5 },
  text: { fontSize: 16, fontFamily: Fonts.medium, color: Colors.primary, textAlign: 'center' },
});

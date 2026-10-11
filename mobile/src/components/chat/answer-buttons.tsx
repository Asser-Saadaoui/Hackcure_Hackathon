import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { AppText } from '@/components/app-text';

/** Wrapping answer choices; long labels and large system text keep their full wording. */
export function AnswerButtons({ options, onPick, disabled }: { options: string[]; onPick: (o: string) => void; disabled?: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const columns = width >= 360 && fontScale <= 1.3;
  return (
    <View style={styles.wrap}>
      {options.map((o) => (
        <Pressable key={o} accessibilityRole="button" accessibilityLabel={o} disabled={disabled} onPress={() => onPick(o)}
          style={({ pressed }) => [styles.button, columns && o.length <= 40 && styles.half, pressed && styles.pressed, disabled && styles.disabled]}>
          <AppText style={styles.text}>{o}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingVertical: Spacing.xs },
  half: { flexBasis: '46%', flexGrow: 1 },
  button: {
    flexBasis: '100%', minHeight: 48, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.input, backgroundColor: Colors.secondary, alignItems: 'center', justifyContent: 'center',
  },
  pressed: { backgroundColor: Colors.accent },
  disabled: { opacity: 0.5 },
  text: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.medium, color: Colors.primary, textAlign: 'center' },
});

import { Pressable, StyleSheet, Text } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

type Props = { label: string; selected?: boolean; onPress: () => void; role?: 'radio' | 'button' };

/** Pill chip: selected = light teal fill + teal border (central-park language picker). */
export function Chip({ label, selected, onPress, role = 'button' }: Props) {
  return (
    <Pressable
      accessibilityRole={role}
      aria-checked={role === 'radio' ? !!selected : undefined}
      accessibilityState={role === 'radio' ? { checked: !!selected, selected: !!selected } : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.pressed]}>
      <Text style={[styles.text, selected && styles.textSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.input,
    backgroundColor: Colors.card,
    justifyContent: 'center',
  },
  selected: { backgroundColor: Colors.accent, borderColor: Colors.primary },
  pressed: { opacity: 0.85 },
  text: { fontSize: 15, fontFamily: Fonts.regular, color: Colors.mutedFg },
  textSelected: { color: Colors.foreground, fontFamily: Fonts.medium },
});

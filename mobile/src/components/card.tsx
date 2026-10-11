import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';

/** rounded-xl border bg-card shadow-sm (central-park Card). */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const id = useId();
  const danger = style?.backgroundColor === Colors.destructiveBg || style?.borderColor === Colors.destructiveBorder || style?.borderColor === Colors.destructive;
  const warning = style?.backgroundColor === Colors.warningBg || style?.borderColor === Colors.warningBorder;
  return <View nativeID={`magic-card-${danger ? 'danger-' : warning ? 'warning-' : ''}${id}`} style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    gap: Spacing.sm,
    ...Shadow,
  },
});

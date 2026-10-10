import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Colors, Radius, Spacing } from '@/constants/theme';

/** Temporary content for screens that are built in a later roadmap step. */
export function Placeholder({ step, description }: { step: number; description: string }) {
  return (
    <View style={styles.box}>
      <AppText variant="subtitle">Coming in Step {step}</AppText>
      <AppText variant="small">{description}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
  },
});

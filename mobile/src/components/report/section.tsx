import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { Colors, Spacing } from '@/constants/theme';

/** Report section: a Card with an uppercase overline title. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <AppText variant="overline" style={styles.title}>{title}</AppText>
      <View style={styles.body}>{children}</View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { color: Colors.mutedFg },
  body: { gap: Spacing.sm },
});

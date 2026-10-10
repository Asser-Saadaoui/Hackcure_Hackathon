import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

type Props = { children: ReactNode; scroll?: boolean; edges?: Edge[] };

/** Page container: safe area, background, centered max width (useful on web). */
export function Screen({ children, scroll = true, edges = ['bottom', 'left', 'right'] }: Props) {
  const content = <View style={styles.inner}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1 },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    gap: Spacing.lg,
  },
});

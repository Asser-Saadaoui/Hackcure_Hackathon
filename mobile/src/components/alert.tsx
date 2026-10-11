import type { LucideIcon } from 'lucide-react-native';
import { useId, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Colors, Radius, Spacing } from '@/constants/theme';

type Props = { variant?: 'destructive' | 'warning'; icon?: LucideIcon; title?: string; children?: ReactNode; action?: ReactNode };

const TONES = {
  destructive: { border: Colors.destructiveBorder, bg: Colors.destructiveBg, fg: Colors.destructiveText },
  warning: { border: Colors.warningBorder, bg: Colors.warningBg, fg: '#9A3412' },
};

/** Left-border callout used for red flags / urgent notices (central-park case detail). */
export function Alert({ variant = 'destructive', icon: Icon, title, children, action }: Props) {
  const id = useId();
  const tone = TONES[variant];
  return (
    <View nativeID={`magic-card-${variant === 'destructive' ? 'danger' : 'warning'}-${id}`} accessibilityRole="alert" style={[styles.box, { borderStartColor: tone.border, backgroundColor: tone.bg }]}>
      <View style={styles.content}>
        {title && (
          <View style={styles.titleRow}>
            {Icon && <Icon size={14} color={tone.fg} strokeWidth={2.5} />}
            <AppText variant="overline" style={{ color: tone.fg }}>{title}</AppText>
          </View>
        )}
        {children}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderStartWidth: 2,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  content: { flex: 1, gap: Spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

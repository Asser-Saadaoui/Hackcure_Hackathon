import { StyleSheet, Text, type TextProps } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useI18n } from '@/i18n';

type Variant = 'title' | 'subtitle' | 'body' | 'label' | 'small' | 'overline' | 'mono';

type Props = TextProps & {
  variant?: Variant;
  /** Text typed by a person (chat): let its own characters decide the direction. */
  autoDirection?: boolean;
};

/** App text (Inter). Follows the UI language's direction unless autoDirection is set. */
export function AppText({ variant = 'body', autoDirection, style, ...rest }: Props) {
  const { rtl } = useI18n();
  const direction = autoDirection ? undefined : { writingDirection: rtl ? ('rtl' as const) : ('ltr' as const) };
  return <Text style={[styles.base, styles[variant], direction, style]} {...rest} />;
}

const styles = StyleSheet.create({
  base: { color: Colors.foreground, fontFamily: Fonts.regular },
  // text-2xl font-semibold tracking-tight
  title: { fontSize: 24, lineHeight: 30, fontFamily: Fonts.semibold, letterSpacing: -0.4 },
  subtitle: { fontSize: 17, lineHeight: 24, fontFamily: Fonts.semibold, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 23 },
  label: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.medium },
  // text-sm text-muted-foreground
  small: { fontSize: 13, lineHeight: 19, color: Colors.mutedFg },
  // text-xs font-semibold uppercase tracking-wide
  overline: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  mono: { fontSize: 12, fontFamily: 'monospace', color: Colors.mutedFg },
});

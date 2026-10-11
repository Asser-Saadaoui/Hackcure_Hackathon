import { Phone, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { Colors, Fonts, Radius, Shadow, Spacing } from '@/constants/theme';
import { AppText } from './app-text';
import { AnimatedShinyText } from './animated-shiny-text';
import { InteractiveButton } from './interactive-button';

type Variant = 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive';
type Size = 'default' | 'sm' | 'lg';

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: Variant;
  size?: Size;
  /** Lucide icon before the label… */
  icon?: LucideIcon;
  /** …or after it (e.g. ArrowRight on "Continue"). */
  iconRight?: LucideIcon;
};

const FG: Record<Variant, string> = {
  default: Colors.primaryFg,
  outline: Colors.foreground,
  ghost: Colors.foreground,
  secondary: Colors.secondaryFg,
  destructive: '#FFFFFF',
};

/** Shared actions use Magic UI's pill treatment; quiet controls keep their compact style. */
export function Button({ label, variant = 'default', size = 'default', icon: Icon, iconRight: IconRight, disabled, style, ...rest }: Props) {
  const emergencyCall = Icon === Phone && /190/.test(label);
  // Shared action treatment, including every emergency call. Quiet controls stay compact.
  if (variant !== 'ghost' || emergencyCall) {
    return <InteractiveButton {...rest} label={label} icon={Icon} iconRight={IconRight}
      variant={emergencyCall || variant === 'ghost' ? 'destructive' : variant} size={size} shiny={emergencyCall} disabled={disabled} style={style} />;
  }
  const fg = FG[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rest.accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={size === 'sm' ? 6 : 2}
      disabled={disabled}
      style={(state) => [
        styles.base,
        sizes[size],
        variants[variant],
        state.pressed && styles.pressed,
        disabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      <View style={styles.row}>
        {Icon && <Icon size={16} color={fg} strokeWidth={2.25} />}
        {emergencyCall
          ? <AnimatedShinyText color={fg} enabled={!disabled} style={[styles.label,size === 'lg' && styles.labelLg,{color:fg}]}>{label}</AnimatedShinyText>
          : <AppText style={[styles.label, size === 'lg' && styles.labelLg, { color: fg }]}>{label}</AppText>}
        {IconRight && <IconRight size={16} color={fg} strokeWidth={2.25} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, maxWidth: '100%' },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.5 },
  label: { fontSize: 14, fontFamily: Fonts.medium, flexShrink: 1, textAlign: 'center' },
  labelLg: { fontSize: 16 },
});

const sizes = StyleSheet.create({
  default: { minHeight: 44, paddingHorizontal: Spacing.lg },
  sm: { minHeight: 36, paddingHorizontal: Spacing.md },
  lg: { minHeight: 48, paddingHorizontal: Spacing.xl },
});

const variants = StyleSheet.create({
  default: { backgroundColor: Colors.primary, ...Shadow },
  outline: { backgroundColor: Colors.card, borderColor: Colors.input, ...Shadow },
  ghost: { backgroundColor: 'transparent' },
  secondary: { backgroundColor: Colors.secondary },
  destructive: { backgroundColor: Colors.destructive, ...Shadow },
});

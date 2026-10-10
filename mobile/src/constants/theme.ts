import type { RiskLevel } from '@/lib/types';

/**
 * Design tokens, taken from central-park/ui (shadcn "clinical palette":
 * cool slate ground, deep teal accent). HSL tokens converted to hex.
 */
export const Colors = {
  background: '#F9FAFB',     // hsl(210 20% 98%)
  foreground: '#222C39',     // hsl(215 25% 18%)
  card: '#FFFFFF',
  primary: '#177082',        // hsl(190 70% 30%) deep teal
  primaryFg: '#FFFFFF',
  secondary: '#EDF0F3',      // hsl(210 20% 94%)
  secondaryFg: '#344256',
  muted: '#F3F5F7',
  mutedFg: '#56667C',        // darkened from #65758B for ≥ 4.5:1 contrast on the slate background        // hsl(215 16% 47%)
  accent: '#E7F6F9',         // hsl(190 60% 94%) light teal
  accentFg: '#125A68',
  destructive: '#C52020',    // hsl(0 72% 45%)
  destructiveBg: '#FDF2F2',  // red-50
  destructiveBorder: '#F87171', // red-400 (alert left border)
  destructiveText: '#B91C1C',   // red-700
  warningBorder: '#FB923C',  // orange-400
  warningBg: '#FFF7ED',      // orange-50
  border: '#DAE0E7',         // hsl(214 20% 88%)
  input: '#D4DAE2',          // hsl(214 20% 86%)

  // aliases used by the screens
  text: '#222C39',
  textSecondary: '#65758B',
  surface: '#FFFFFF',
} as const;

/** Risk badges: uppercase pill, color + text (never color alone). */
export const RiskColors: Record<RiskLevel, { bg: string; fg: string }> = {
  EMERGENCY: { bg: '#DC2626', fg: '#FFFFFF' },  // red-600
  HIGH: { bg: '#F97316', fg: '#FFFFFF' },       // orange-500 ("URGENT CARE" in central-park)
  LOW: { bg: '#16A34A', fg: '#FFFFFF' },        // green-600
  UNCERTAIN: { bg: '#7C3AED', fg: '#FFFFFF' },  // violet-600
};

/** Inter, loaded in _layout (falls back to the system font for Arabic glyphs). */
export const Fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** --radius: 0.65rem ≈ 10 px; cards use rounded-xl (12 px); chips are pills. */
export const Radius = { sm: 6, md: 8, lg: 10, xl: 12, pill: 999 } as const;

/** shadow-sm */
export const Shadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;

export const MaxContentWidth = 560;

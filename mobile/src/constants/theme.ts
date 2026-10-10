import type { RiskLevel } from '@/lib/types';

/** Shared Sahhanito identity: deep blue, soft ice, and coral from the mascot pack. */
export const Colors = {
  background: '#F2F6FC',
  foreground: '#183455',
  card: '#FFFFFF',
  primary: '#245CAF',
  primaryFg: '#FFFFFF',
  secondary: '#EAF0F8',
  secondaryFg: '#304C70',
  muted: '#F3F5F7',
  mutedFg: '#56667C',        // darkened from #65758B for ≥ 4.5:1 contrast on the slate background        // hsl(215 16% 47%)
  accent: '#E8F2FF',
  accentFg: '#24518E',
  coral: '#E85466',
  navy: '#142D50',
  destructive: '#C52020',    // hsl(0 72% 45%)
  destructiveBg: '#FDF2F2',  // red-50
  destructiveBorder: '#F87171', // red-400 (alert left border)
  destructiveText: '#B91C1C',   // red-700
  warningBorder: '#FB923C',  // orange-400
  warningBg: '#FFF7ED',      // orange-50
  border: '#DDE6F1',
  input: '#D4DAE2',          // hsl(214 20% 86%)

  // aliases used by the screens
  text: '#183455',
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
export const Radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/** shadow-sm */
export const Shadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;

export const MaxContentWidth = 560;

import type { RiskLevel } from '@/lib/types';

/** Sahhanito palette: #95BFD1 soft blue, #185079 deep blue, #3885AB accent. */
export const Colors = {
  background: '#F3F8FA',
  foreground: '#185079',
  card: '#FFFFFF',
  primary: '#185079',
  primaryFg: '#FFFFFF',
  secondary: '#EAF3F6',
  secondaryFg: '#185079',
  muted: '#F3F5F7',
  mutedFg: '#56667C', // Readable secondary text on the light surfaces.
  accent: '#E5F0F5',
  accentFg: '#185079',
  brandAccent: '#3885AB',
  softBlue: '#95BFD1',
  navy: '#185079',
  destructive: '#C52020',    // hsl(0 72% 45%)
  destructiveBg: '#FDF2F2',  // red-50
  destructiveBorder: '#F87171', // red-400 (alert left border)
  destructiveText: '#B91C1C',   // red-700
  warningBorder: '#FB923C',  // orange-400
  warningBg: '#FFF7ED',      // orange-50
  border: '#D6E5EC',
  input: '#C7DAE3',          // hsl(214 20% 86%)

  // aliases used by the screens
  text: '#185079',
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

/** Cards use rounded corners; chips are pills. */
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

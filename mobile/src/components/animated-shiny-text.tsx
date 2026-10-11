import type { ReactNode } from 'react';
import type { TextProps } from 'react-native';
import { AppText } from './app-text';

/** Native labels remain static and readable; the web component supplies the decorative shimmer. */
export function AnimatedShinyText({ children, color, style }: {
  children: ReactNode; color: string; style?: TextProps['style']; shimmerWidth?: number; enabled?: boolean;
}) {
  return <AppText style={[style,{color}]}>{children}</AppText>;
}

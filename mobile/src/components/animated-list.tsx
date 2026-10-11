import { Children, type ReactNode } from 'react';
import { View } from 'react-native';

/** Static native companion: supportive messages are available immediately without DOM animation. */
export function AnimatedList({ children }: { children: ReactNode; delay?: number }) {
  return <View style={{gap:10}} accessibilityRole="list">
    {Children.map(children, child => <View>{child}</View>)}
  </View>;
}

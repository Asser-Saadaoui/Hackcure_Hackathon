import { Pressable, StyleSheet, View, type PressableProps, type ViewProps } from 'react-native';

import { Colors, Shadow } from '@/constants/theme';

/** Lightweight React Native adaptation of shadcn/ui Input Group (MIT).
 * https://ui.shadcn.com/docs/components/input-group
 * Textarea first, block-end addon second; preserve the same keyboard reading order on every platform.
 */
export function InputGroup({ focused, style, ...props }: ViewProps & { focused?: boolean }) {
  return <View {...props} style={[styles.group, focused && styles.focused, style]} />;
}

export function InputGroupAddon({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.addon, style]} />;
}

export function InputGroupButton({ style, disabled, accessibilityState, ...props }: PressableProps) {
  return <Pressable {...props} disabled={disabled} accessibilityRole="button"
    accessibilityState={{ ...accessibilityState, disabled:!!disabled }}
    style={state => [styles.button, state.pressed && styles.pressed, disabled && styles.disabled,
      typeof style === 'function' ? style(state) : style]} />;
}

const styles = StyleSheet.create({
  group: {backgroundColor:Colors.card, borderWidth:1, borderColor:Colors.input, borderRadius:22, ...Shadow},
  focused: {borderColor:Colors.primary},
  addon: {flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:8, padding:8, paddingTop:0},
  button: {width:44, height:44, borderRadius:14, alignItems:'center', justifyContent:'center'},
  pressed: {backgroundColor:Colors.accent},
  disabled: {opacity:.6},
});

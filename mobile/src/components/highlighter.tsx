import type { TextProps } from 'react-native';
import { AppText } from './app-text';

/** Static native underline; the DOM annotation package stays in the web bundle. */
export function Highlighter({children,color='#3885AB',style}:{children:string;color?:string;style?:TextProps['style']}) {
  return <AppText variant="small" style={[style,{textDecorationLine:'underline',textDecorationColor:color}]}>{children}</AppText>;
}

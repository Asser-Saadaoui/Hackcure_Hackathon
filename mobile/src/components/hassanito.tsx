import { Image, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n';
import { mascotCopy, type MascotProps } from './hassanito-state';

/** Native uses the neutral frame; Page Mascot's DOM interaction lives in .web.tsx. */
export function Hassanito({ state = 'idle', compact = false }: MascotProps) {
  const { language } = useI18n();
  const size = compact ? 64 : 112;
  return <View style={styles.row}>
    <View style={{ width: size, height: size, overflow: 'hidden' }} accessible={false}>
      <Image source={require('../../assets/mascots/sahhanito-directions.webp')}
        style={{ width: size * 3, height: size * 3, position: 'absolute', left: -size, top: -size }} />
    </View>
    <AppText accessibilityLiveRegion={state === 'alert' ? 'assertive' : 'polite'} style={styles.copy}>
      {mascotCopy(language, state)}
    </AppText>
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, copy: { flex: 1, flexShrink: 1 } });

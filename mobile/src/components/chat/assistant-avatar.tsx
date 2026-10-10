import { Image, StyleSheet, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';

/** The assistant's face in the chat: Hassanito on a teal tile (same mark as the header brand). */
export function AssistantAvatar() {
  return (
    <View style={styles.tile}>
      <Image source={require('../../../assets/images/hassanito.png')} style={styles.image} accessibilityIgnoresInvertColors />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { width: 26, height: 26, borderRadius: Radius.sm, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: 26, height: 26 },
});

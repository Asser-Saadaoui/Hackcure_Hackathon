import { StyleSheet, View } from 'react-native';

import { Mascot, type MascotPose } from '@/components/mascot';
import { Colors, Radius } from '@/constants/theme';

/** The assistant's face in the chat: the Sahhanito mascot (same as the header brand). */
export function AssistantAvatar({ pose = 'front' }: { pose?: MascotPose }) {
  return (
    <View style={styles.tile}>
      <Mascot pose={pose} size={26} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { width: 30, height: 30, borderRadius: Radius.pill, backgroundColor: Colors.brandBg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

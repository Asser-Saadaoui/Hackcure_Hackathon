import { Activity } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';

/** Small teal tile with the pulse mark: identifies the assistant (same mark as the header brand). */
export function AssistantAvatar() {
  return (
    <View style={styles.tile}>
      <Activity size={14} color={Colors.primaryFg} strokeWidth={2.5} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { width: 26, height: 26, borderRadius: Radius.sm, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
});

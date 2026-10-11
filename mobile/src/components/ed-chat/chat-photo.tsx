import { Image, type ImageSource } from 'expo-image';
import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { authImageSource } from '@/lib/http-api';

/** A protected photo (path under /api/v1). Loaded with the session header; tap to see it full screen. */
export function ChatPhoto({ path }: { path: string }) {
  const { t } = useI18n();
  const [source, setSource] = useState<ImageSource | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { authImageSource(path).then(setSource).catch(() => {}); }, [path]);

  return (
    <>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel={t('photoLabel')} onPress={() => setOpen(true)} disabled={!source}>
        <View style={styles.thumb}>
          {source ? <Image source={source} style={styles.fill} contentFit="cover" transition={150} /> : <ActivityIndicator color={Colors.primaryFg} />}
        </View>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {source && <Image source={source} style={styles.fill} contentFit="contain" />}
          <View style={styles.close}><X size={22} color="#FFFFFF" strokeWidth={2.5} /></View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 200, height: 200, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center' },
  fill: { width: '100%', height: '100%' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', top: 48, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});

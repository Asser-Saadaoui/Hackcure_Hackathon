import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { WebCamera, webCameraSupported } from '@/components/ed-chat/web-camera';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';

/**
 * Photo capture shared by the triage chat and the hospital chat: a sheet (take a photo / choose one), the device
 * camera on phones, the browser camera on the web (file picker as fallback). `upload` receives base64 or a data: URL
 * and sends it (signed, see lib/photo-signing.ts). Photos are for the hospital team: never sent to the AI.
 */
export function usePhotoCapture(upload: (data: string) => Promise<void>, hint: string) {
  const { t } = useI18n();
  const [menu, setMenu] = useState(false);
  const [webCamera, setWebCamera] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (data: string) => {
    setSending(true);
    try {
      await upload(data);
    } catch {
      setError(t('photoFailed'));
    } finally {
      setSending(false);
    }
  };

  const pick = async (source: 'camera' | 'library') => {
    setMenu(false);
    setError(null);
    // Web: open the camera itself (a file input only offers "upload a file" on computers).
    if (source === 'camera' && Platform.OS === 'web' && webCameraSupported()) {
      setWebCamera(true);
      return;
    }
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError(t('photoPermission')); return; }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true, exif: false };
    const picked = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = picked.canceled ? null : picked.assets[0];
    const data = asset?.base64 ?? (asset?.uri.startsWith('data:') ? asset.uri : null);   // web gives a data: URL
    if (data) await send(data);
  };

  const onWebCameraError = () => {
    setWebCamera(false);
    setError(t('cameraUnavailable'));
    pick('library');   // no camera, or access refused: choose a file instead
  };

  const element = (
    <>
      <WebCamera visible={webCamera} onClose={() => setWebCamera(false)} onError={onWebCameraError}
        onCapture={(dataUrl) => { setWebCamera(false); send(dataUrl); }} />
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenu(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <AppText variant="subtitle">{t('attachPhoto')}</AppText>
            <AppText variant="small">{hint}</AppText>
            <Button label={t('takePhoto')} icon={Camera} onPress={() => pick('camera')} />
            <Button label={t('choosePhoto')} variant="outline" icon={ImageIcon} onPress={() => pick('library')} />
            <Button label={t('cancel')} variant="ghost" onPress={() => setMenu(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  return { open: () => setMenu(true), element, sending, error };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.md, padding: Spacing.xl,
    backgroundColor: Colors.card, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
  },
});

import { Camera, RefreshCw, X } from 'lucide-react-native';
import { createElement, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';

/**
 * Web: desktop browsers ignore the camera hint of a file input (expo-image-picker shows "upload a file").
 * This opens the camera itself (getUserMedia: back camera on phones, webcam on computers) and captures one frame.
 * Needs a secure origin (https or localhost); otherwise onError() and the caller falls back to the file picker.
 */
const MAX_SIDE = 1600;

export const webCameraSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && (typeof window === 'undefined' || window.isSecureContext);

type Props = { visible: boolean; onCapture: (dataUrl: string) => void; onClose: () => void; onError: () => void };

export function WebCamera({ visible, onCapture, onClose, onError }: Props) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setReady(false);
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((x) => x.stop()); return; }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().then(() => setReady(true)).catch(() => setReady(true));
        }
      })
      .catch(() => { if (!cancelled) onError(); });
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((x) => x.stop());   // the camera light goes off as soon as we leave
      stream.current = null;
    };
  }, [visible, facing, onError]);

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL('image/jpeg', 0.8));   // no EXIF / location in a canvas export
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {createElement('video', {
          ref: video, autoPlay: true, playsInline: true, muted: true,
          style: { width: '100%', height: '100%', objectFit: 'contain', transform: facing === 'user' ? 'scaleX(-1)' : undefined },
        })}
        <Pressable accessibilityRole="button" accessibilityLabel={t('cancel')} onPress={onClose} style={[styles.round, styles.close]}>
          <X size={22} color="#FFFFFF" strokeWidth={2.5} />
        </Pressable>
        <View style={styles.bar}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('switchCamera')} onPress={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
            style={styles.round}>
            <RefreshCw size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('capturePhoto')} onPress={capture} disabled={!ready}
            style={[styles.shutter, !ready && styles.disabled]}>
            <Camera size={26} color={Colors.primary} strokeWidth={2.5} />
          </Pressable>
          <View style={styles.spacer} />
        </View>
        {!ready && <AppText style={styles.hint}>{t('cameraStarting')}</AppText>}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', top: 24, right: 20 },
  bar: { position: 'absolute', bottom: 32, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  shutter: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)' },
  disabled: { opacity: 0.5 },
  spacer: { width: 48 },
  hint: { position: 'absolute', top: '45%', color: '#FFFFFF', fontFamily: Fonts.medium, paddingHorizontal: Spacing.lg, borderRadius: Radius.md },
});

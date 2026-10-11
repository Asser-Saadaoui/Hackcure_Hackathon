/** Native builds open the device camera through expo-image-picker: this web-only capture screen is not used. */
export const webCameraSupported = () => false;

export function WebCamera(_: { visible: boolean; onCapture: (dataUrl: string) => void; onClose: () => void; onError: () => void }) {
  return null;
}

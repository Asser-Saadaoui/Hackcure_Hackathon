import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { YOU_COLOR, type LocationMapProps } from '@/components/location/types';
import { leafletPage } from '@/components/map/leaflet-html';
import { Radius } from '@/constants/theme';

/** Native location picker: Leaflet + OpenStreetMap in a WebView. Drag the pin or tap the map to move it. */
export function LocationMap({ value, accuracyM, onChange, height = 320, youLabel }: LocationMapProps) {
  const ref = useRef<WebView>(null);
  const ready = useRef(false);
  const html = useMemo(() => leafletPage('pick'), []);
  const payload = JSON.stringify({ lat: value.lat, lng: value.lng, accuracy: accuracyM ?? null, color: YOU_COLOR, label: youLabel });
  const push = () => ref.current?.injectJavaScript(`window.sahUpdate && window.sahUpdate(${payload}); true;`);

  useEffect(() => { if (ready.current) push(); }, [payload]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.box, { height }]}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html }}
        style={StyleSheet.absoluteFill}
        javaScriptEnabled
        scrollEnabled={false}
        onMessage={(e) => {
          const msg = JSON.parse(e.nativeEvent.data);
          if (msg.ready) { ready.current = true; push(); return; }
          if (typeof msg.lat === 'number' && typeof msg.lng === 'number') onChange({ lat: msg.lat, lng: msg.lng });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Radius.xl, overflow: 'hidden', backgroundColor: '#E5E7EB' },
});

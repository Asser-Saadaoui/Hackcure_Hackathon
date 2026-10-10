import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { leafletPage } from '@/components/map/leaflet-html';
import { MAP_COLORS, type LiveMapProps } from '@/components/map/types';
import { Radius } from '@/constants/theme';

/** Native live map: Leaflet + OpenStreetMap in a WebView (same look as the web, no Google Maps key).
 *  Each ambulance position is pushed into the page; the page refits only when the route changes. */
export function LiveMap(props: LiveMapProps) {
  const { hospital, patient, ambulance, route, height = 380, labels } = props;
  const ref = useRef<WebView>(null);
  const ready = useRef(false);
  const html = useMemo(() => leafletPage('live'), []);
  const payload = JSON.stringify({
    hospital, patient, route, labels, colors: MAP_COLORS,
    ambulance: ambulance ? { lat: ambulance.position.lat, lng: ambulance.position.lng } : null,
  });
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
        onMessage={(e) => { if (JSON.parse(e.nativeEvent.data).ready) { ready.current = true; push(); } }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Radius.xl, overflow: 'hidden', backgroundColor: '#E5E7EB' },
});

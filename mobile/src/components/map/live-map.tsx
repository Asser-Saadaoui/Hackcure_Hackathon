import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Radius } from '@/constants/theme';
import { allPoints, MAP_COLORS, type LiveMapProps } from '@/components/map/types';

/** Native map (react-native-maps: Apple Maps on iOS, Google Maps on Android). */
export function LiveMap(props: LiveMapProps) {
  const { hospital, patient, ambulance, route, height = 380, labels } = props;
  const ref = useRef<MapView>(null);
  const toCoord = (p: { lat: number; lng: number }) => ({ latitude: p.lat, longitude: p.lng });

  const fit = () => {
    const coords = allPoints(props).map(toCoord);
    if (coords.length) ref.current?.fitToCoordinates(coords, { edgePadding: { top: 48, right: 48, bottom: 48, left: 48 }, animated: false });
  };

  // Refit when the patient position or route changes (not on every ambulance tick).
  useEffect(() => { fit(); }, [patient?.lat, patient?.lng, route.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.box, { height }]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        onMapReady={fit}
        initialRegion={{ latitude: hospital.lat, longitude: hospital.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 }}>
        {route.length > 1 && <Polyline coordinates={route.map(toCoord)} strokeColor={MAP_COLORS.route} strokeWidth={4} />}
        <Marker coordinate={toCoord(hospital)} title={hospital.name} pinColor={MAP_COLORS.hospital} />
        {patient && <Marker coordinate={toCoord(patient)} title={labels.you} pinColor={MAP_COLORS.patient} />}
        {ambulance && <Marker coordinate={toCoord(ambulance.position)} title={labels.ambulance} pinColor={MAP_COLORS.ambulance} />}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Radius.xl, overflow: 'hidden' },
});

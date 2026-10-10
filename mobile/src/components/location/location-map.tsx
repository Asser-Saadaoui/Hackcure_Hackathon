import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

import { YOU_COLOR, type LocationMapProps } from '@/components/location/types';
import { Radius } from '@/constants/theme';

/** Native location picker: draggable marker, tap to move, accuracy circle. */
export function LocationMap({ value, accuracyM, onChange, height = 320, youLabel }: LocationMapProps) {
  const ref = useRef<MapView>(null);
  const coord = { latitude: value.lat, longitude: value.lng };

  useEffect(() => {
    ref.current?.animateToRegion({ ...coord, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 400);
  }, [value.lat, value.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.box, { height }]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...coord, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
        onPress={(e) => onChange({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}>
        {accuracyM ? (
          <Circle center={coord} radius={accuracyM} strokeColor={YOU_COLOR} strokeWidth={1} fillColor="rgba(37,99,235,0.12)" />
        ) : null}
        <Marker
          coordinate={coord}
          title={youLabel}
          pinColor={YOU_COLOR}
          draggable
          onDragEnd={(e) => onChange({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Radius.xl, overflow: 'hidden' },
});

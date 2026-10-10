import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { StyleSheet, View } from 'react-native';

import { YOU_COLOR, type LocationMapProps } from '@/components/location/types';
import { Colors, Radius } from '@/constants/theme';

/** Web location picker: draggable "You" marker, tap to move, accuracy circle. */

function youIcon(label: string) {
  const size = 20;
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${YOU_COLOR};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:grab"><span style="position:absolute;left:${size + 4}px;top:50%;transform:translateY(-50%);white-space:nowrap;background:${YOU_COLOR};color:#fff;font:600 11px Inter,system-ui,sans-serif;padding:2px 6px;border-radius:999px;box-shadow:0 1px 2px rgba(0,0,0,.2)">${label}</span></div>`,
  });
}

/** Recenters when the value changes from outside (area chip, "use my location"). */
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map.getBounds().pad(-0.2).contains([lat, lng])) map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [lat, lng, map]);
  return null;
}

/** Leaflet measures its container on mount; re-measure once layout settles (and on resize), otherwise tiles render in a strip. */
function FixSize() {
  const map = useMap();
  useEffect(() => {
    const timers = [0, 150, 500].map((ms) => setTimeout(() => map.invalidateSize(), ms));
    const el = map.getContainer();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null;
    ro?.observe(el);
    return () => { timers.forEach(clearTimeout); ro?.disconnect(); };
  }, [map]);
  return null;
}

function ClickToMove({ onChange }: { onChange: LocationMapProps['onChange'] }) {
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export function LocationMap({ value, accuracyM, onChange, height = 320, youLabel }: LocationMapProps) {
  const icon = useMemo(() => youIcon(youLabel), [youLabel]);
  return (
    <View style={[styles.box, { height }]}>
      <MapContainer center={[value.lat, value.lng]} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <FixSize />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
        {accuracyM ? (
          <Circle center={[value.lat, value.lng]} radius={accuracyM}
            pathOptions={{ color: YOU_COLOR, weight: 1, fillColor: YOU_COLOR, fillOpacity: 0.12 }} />
        ) : null}
        <Marker
          position={[value.lat, value.lng]}
          icon={icon}
          draggable
          eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); onChange({ lat: p.lat, lng: p.lng }); } }}
        />
        <ClickToMove onChange={onChange} />
        <Recenter lat={value.lat} lng={value.lng} />
      </MapContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
});

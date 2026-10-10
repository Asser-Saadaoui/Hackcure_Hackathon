import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { allPoints, MAP_COLORS, type LiveMapProps } from '@/components/map/types';

/** Web map (Leaflet + OpenStreetMap). Uses divIcons, not Leaflet's default marker images. */

function dot(color: string, size: number, label?: string) {
  const badge = label
    ? `<span style="position:absolute;left:${size + 4}px;top:50%;transform:translateY(-50%);white-space:nowrap;max-width:170px;overflow:hidden;text-overflow:ellipsis;background:${color};color:#fff;font:600 11px Inter,system-ui,sans-serif;padding:2px 6px;border-radius:999px;box-shadow:0 1px 2px rgba(0,0,0,.2)">${label}</span>`
    : '';
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${badge}</div>`,
  });
}

/** Fits the map to all points when the patient position / route change. */
function FitBounds(props: LiveMapProps) {
  const map = useMap();
  const key = `${props.patient?.lat},${props.patient?.lng},${props.route.length}`;
  useEffect(() => {
    const pts = allPoints(props).map((p) => [p.lat, p.lng] as [number, number]);
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
    else if (pts.length === 1) map.setView(pts[0], 14);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Leaflet measures its container on mount; re-measure once layout settles (and on resize). */
function FixSize() {
  const map = useMap();
  useEffect(() => {
    const timers = [0, 150, 500].map((ms) => setTimeout(() => map.invalidateSize(), ms));
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null;
    ro?.observe(map.getContainer());
    return () => { timers.forEach(clearTimeout); ro?.disconnect(); };
  }, [map]);
  return null;
}

export function LiveMap(props: LiveMapProps) {
  const { hospital, patient, ambulance, route, height = 380, labels } = props;
  const icons = useMemo(() => ({
    hospital: dot(MAP_COLORS.hospital, 20, hospital.name),
    patient: dot(MAP_COLORS.patient, 18, labels.you),
    ambulance: dot(MAP_COLORS.ambulance, 20, labels.ambulance),
  }), [hospital.name, labels.you, labels.ambulance]);

  return (
    <View style={[styles.box, { height }]}>
      <MapContainer center={[hospital.lat, hospital.lng]} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <FixSize />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
        {route.length > 1 && (
          <Polyline positions={route.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: MAP_COLORS.route, weight: 4, opacity: 0.7 }} />
        )}
        <Marker position={[hospital.lat, hospital.lng]} icon={icons.hospital}>
          <Tooltip>{hospital.name}</Tooltip>
        </Marker>
        {patient && <Marker position={[patient.lat, patient.lng]} icon={icons.patient} />}
        {ambulance && <Marker position={[ambulance.position.lat, ambulance.position.lng]} icon={icons.ambulance} zIndexOffset={1000} />}
        <FitBounds {...props} />
      </MapContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: '#DAE0E7' },
});

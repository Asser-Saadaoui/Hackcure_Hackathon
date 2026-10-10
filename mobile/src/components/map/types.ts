import type { AmbulanceView, LatLng } from '@/lib/types';

export type LiveMapProps = {
  hospital: LatLng & { name: string };
  patient: LatLng | null;
  ambulance: AmbulanceView | null;
  route: LatLng[];
  height?: number;
  labels: { you: string; ambulance: string };
};

export const MAP_COLORS = { hospital: '#177082', patient: '#2563EB', ambulance: '#DC2626', route: '#177082' } as const;

/** All points that should be visible on the map. */
export function allPoints(p: LiveMapProps): LatLng[] {
  return [p.hospital, ...(p.patient ? [p.patient] : []), ...(p.ambulance ? [p.ambulance.position] : []), ...p.route];
}

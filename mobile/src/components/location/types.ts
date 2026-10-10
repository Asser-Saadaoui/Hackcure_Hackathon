import type { LatLng } from '@/lib/types';

export type LocationMapProps = {
  value: LatLng;
  accuracyM?: number;
  onChange: (p: LatLng) => void;
  height?: number;
  youLabel: string;
};

export const YOU_COLOR = '#2563EB';

/**
 * Areas of Grand Tunis for manual location (when GPS is refused or unavailable).
 * Approximate centers — good enough to rank hospitals, not to send an ambulance to a door.
 */
export const NEIGHBORHOODS = [
  { name: 'Tunis Centre', lat: 36.8008, lng: 10.1800 },
  { name: 'Bab Saadoun', lat: 36.8066, lng: 10.1600 },
  { name: 'Le Bardo', lat: 36.8092, lng: 10.1400 },
  { name: 'El Menzah', lat: 36.8400, lng: 10.1700 },
  { name: 'Ariana Ville', lat: 36.8625, lng: 10.1956 },
  { name: 'La Marsa', lat: 36.8782, lng: 10.3247 },
  { name: 'Ben Arous', lat: 36.7531, lng: 10.2189 },
  { name: 'La Manouba', lat: 36.8081, lng: 10.0972 },
] as const;

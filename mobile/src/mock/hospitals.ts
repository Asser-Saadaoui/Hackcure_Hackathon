import data from '@/mock/data/hospitals.grand-tunis.json';

/**
 * Grand Tunis hospital directory for the mock backend, from data/hospitals.grand-tunis.json
 * (OSM coordinates; departments/equipment ILLUSTRATIVE; edPhone null on purpose — never invent numbers).
 * The same JSON will seed the real backend (prisma/seed.ts).
 */
export interface MockHospital {
  id: string;
  name: string;
  nameAr: string;
  lat: number;
  lng: number;
  edPhone: string | null;
  hasGeneralEd: boolean;
  /** Specialty codes whose department takes emergencies (EMERG = general ED). */
  specialties: string[];
  /** Operational equipment (manual availability: a broken scanner is removed here). */
  equipment: string[];
  /** Manual availability (ED staff update it in the hospital dashboard). 0 → excluded from routing. */
  bedsAvailable: number;
  waitMinutes: number;
}

/**
 * Demo availability — what ED staff would enter by hand. Defaults below, plus two deliberate
 * situations so the routing rules can be tested:
 *  - CTGB has no free beds  → never assigned
 *  - Abderrahmen Mami's scanner is down → never assigned to a patient who needs a CT
 */
const DEMO_AVAILABILITY: Record<string, { bedsAvailable?: number; waitMinutes?: number; equipmentDown?: string[] }> = {
  'charles-nicolle': { bedsAvailable: 3, waitMinutes: 25 },
  'la-rabta': { bedsAvailable: 2, waitMinutes: 35 },
  'habib-thameur': { bedsAvailable: 4, waitMinutes: 20 },
  'aziza-othmana': { bedsAvailable: 2, waitMinutes: 30 },
  'mongi-slim': { bedsAvailable: 1, waitMinutes: 30 },
  hmpit: { bedsAvailable: 2, waitMinutes: 25 },
  ctgb: { bedsAvailable: 0, waitMinutes: 15 },
  'abderrahmen-mami': { bedsAvailable: 3, waitMinutes: 30, equipmentDown: ['CT'] },
};

export const HOSPITALS: MockHospital[] = data.facilities
  .filter((f) => f.isActive)
  .map((f) => {
    const a = DEMO_AVAILABILITY[f.key] ?? {};
    return {
      id: f.key,
      name: f.name,
      nameAr: f.nameAr,
      lat: f.lat,
      lng: f.lng,
      edPhone: f.edPhone,
      hasGeneralEd: f.hasGeneralEd,
      specialties: f.departments.filter((d) => d.hasEmergency).map((d) => d.specialtyCode),
      equipment: f.equipment.filter((e) => !(a.equipmentDown ?? []).includes(e)),
      bedsAvailable: a.bedsAvailable ?? 2,
      waitMinutes: a.waitMinutes ?? 30,
    };
  });

export const SPECIALTIES = data.specialties;
export const EQUIPMENT = data.equipment;

export { NEIGHBORHOODS } from '@/constants/neighborhoods';

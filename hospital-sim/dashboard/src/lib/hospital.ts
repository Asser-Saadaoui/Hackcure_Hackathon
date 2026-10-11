/** Sahhanito: which Grand Tunis hospital the dashboard shows (every /api/v1 call carries ?hospital=). */
const KEY = 'ohsim.hospital'

export function selectedHospital(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(KEY) } catch { return null }
}

export function selectHospital(key: string): void {
  try { localStorage.setItem(KEY, key) } catch { /* private mode */ }
  window.location.reload()
}

export function withHospital(path: string): string {
  const key = selectedHospital()
  if (!key) return path
  return `${path}${path.includes('?') ? '&' : '?'}hospital=${encodeURIComponent(key)}`
}

/** Set when a request failed and a page fell back to the bundled demo data (shown in the top bar). */
type Listener = (offline: boolean) => void
let offline = false
const listeners = new Set<Listener>()
export const connection = {
  get: () => offline,
  set: (value: boolean) => { if (value !== offline) { offline = value; listeners.forEach((l) => l(value)) } },
  subscribe: (l: Listener) => { listeners.add(l); return () => { listeners.delete(l) } },
}

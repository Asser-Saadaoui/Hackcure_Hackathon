/** App-wide connection state, fed by the HTTP client: a failed request marks it offline, the next success
 *  marks it back online. The banner in the root layout listens to it. */
type Listener = (online: boolean) => void;

let online = true;
const listeners = new Set<Listener>();

export const connection = {
  get online() { return online; },
  set(value: boolean) {
    if (value === online) return;
    online = value;
    listeners.forEach((l) => l(online));
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};

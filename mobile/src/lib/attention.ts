import { Platform, Vibration } from 'react-native';

/** Short sound (web) or vibration (phones) when the ED writes or the urgency changes. */
export function attention() {
  if (Platform.OS !== 'web') {
    Vibration.vibrate([0, 250, 150, 250]);
    return;
  }
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.22].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 740;
      g.gain.setValueAtTime(0.12, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.18);
    });
  } catch { /* audio blocked until the user has interacted with the page */ }
}

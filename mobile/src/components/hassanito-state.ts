export const MASCOT_STATES = ['idle', 'listening', 'thinking', 'alert', 'guiding', 'happy'] as const;
export type MascotState = typeof MASCOT_STATES[number];
export type MascotProps = { state?: MascotState; compact?: boolean };

export function resolveMascotState(state: MascotState, preview?: MascotState): MascotState {
  return state === 'alert' ? 'alert' : preview ?? state;
}

const EN = {
  idle: 'Hi, I’m Hassanito. Tell us what is happening.',
  listening: 'I’m listening. Describe your symptoms in your own words.',
  thinking: 'Your message is being processed.',
  alert: 'Focus on the emergency instructions. Call 190 if you need emergency help.',
  guiding: 'Please answer the question below.',
  happy: 'Your information is ready. Review the next steps.',
};
const FR = {
  idle: 'Bonjour, je suis Hassanito. Que se passe-t-il ?',
  listening: 'Je vous écoute. Décrivez vos symptômes avec vos mots.',
  thinking: 'Votre message est en cours de traitement.',
  alert: 'Suivez les consignes d’urgence. Appelez le 190 si vous avez besoin de secours.',
  guiding: 'Répondez à la question ci-dessous.',
  happy: 'Vos informations sont prêtes. Consultez les prochaines étapes.',
};
const AR = {
  idle: 'عسلامة، أنا Hassanito. احكيلنا شنوّة صاير.',
  listening: 'نسمع فيك. احكي على الأعراض بكلامك.',
  thinking: 'قاعدين نفهموا رسالتك.',
  alert: 'ركّز على تعليمات الاستعجالي. اتصل بـ190 إذا تستحق إسعاف.',
  guiding: 'جاوب على السؤال اللي لتحت.',
  happy: 'المعلومات حاضرة. شوف الخطوات الجاية.',
};
export function mascotCopy(language: string, state: MascotState): string {
  return (language === 'fr' ? FR : language === 'en' ? EN : AR)[state];
}

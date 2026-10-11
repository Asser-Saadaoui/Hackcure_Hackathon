import type { Language } from '@/lib/types';

const en = {
  mascotMessagesTitle: 'A word from Hassanito', mascotMessage1: 'One message at a time. I’m here to help you explain.', mascotMessage2: 'Use your own words, in the language you’re comfortable with.', mascotMessage3: 'Not sure how to answer? You can say that, too.',
  workspaceTagline: 'Your health, one step at a time', careTitle: 'From your words to your next step', careYou: 'You', careHospital: 'Hospital', careClinic: 'Clinic', careEmergency: 'Emergency', careDoctor: 'Doctor', careNote: 'Possible care routes, illustrated. This is not a live connection or a confirmed referral.',
  welcomeTitle: 'Labess? Let’s start together.', welcomeIntro: 'Describe what is happening, answer a few questions, and follow the suggested next steps. This prototype does not diagnose or replace emergency services.',
  howTitle: 'How it works', how1: 'Tell us your symptoms in your own words.', how2: 'Answer questions about timing, severity and your situation.', how3: 'Read the guidance; a clinician may need to review your case.',
  emergencyTitle: 'Do not wait for the app', emergencyBody: 'If you have chest pain, severe trouble breathing, heavy bleeding or loss of consciousness, call 190. If you think there is immediate danger, call directly.',
  prepareTitle: 'What to prepare', prepareBody: 'When symptoms started, current medicines and allergies, your age, and your location if hospital matching is needed. Do not delay an emergency call to collect these.',
  privacyTitle: 'Your information', privacyBody: 'No account is needed. Your answers are sent to the backend and may be shared with supervising clinicians and the receiving hospital. History on this device is not a private medical vault. Review the consent before continuing.',
  statusTitle: 'Hospital network status', statusLoading: 'Checking the connected services…', statusReady: 'Hospital simulator connected', statusOffline: 'Hospital simulator unavailable', statusError: 'Network status could not be checked.', statusCount: 'Hospitals configured', statusNote: 'A connection status, not a promise of available beds or hospital acceptance. Hospital capacity and ambulance tracking are simulated.', statusUpdated: 'Checked',
  explore: 'Explore the platform', sessionError: 'We could not start your session. Check your connection and try again. You can still call 190.',
  historySearch: 'Search by case code or hospital', noMatches: 'No matching cases.', historyError: 'Your history could not be loaded. Check your connection and retry.', clearSearch: 'Clear search', loadingHistory: 'Loading your history…',
};
type Copy = { [K in keyof typeof en]: string };
const fr: Copy = {
  mascotMessagesTitle: 'Un mot de Hassanito', mascotMessage1: 'Un message à la fois. Je vous aide à expliquer.', mascotMessage2: 'Utilisez vos mots, dans la langue qui vous convient.', mascotMessage3: 'Vous ne savez pas quoi répondre ? Vous pouvez le dire aussi.',
  workspaceTagline: 'Votre santé, une étape à la fois', careTitle: 'De vos mots à la prochaine étape', careYou: 'Vous', careHospital: 'Hôpital', careClinic: 'Clinique', careEmergency: 'Urgences', careDoctor: 'Médecin', careNote: 'Illustration des parcours possibles. Ce n’est pas une connexion en direct ni une orientation confirmée.',
  welcomeTitle: 'Labess ? Commençons ensemble.', welcomeIntro: 'Décrivez votre situation, répondez à quelques questions et suivez les prochaines étapes proposées. Ce prototype ne pose pas de diagnostic et ne remplace pas les secours.',
  howTitle: 'Comment ça marche', how1: 'Décrivez vos symptômes avec vos mots.', how2: 'Répondez aux questions sur le début, la gravité et votre situation.', how3: 'Lisez les conseils ; un clinicien peut devoir vérifier votre dossier.',
  emergencyTitle: 'N’attendez pas l’application', emergencyBody: 'Douleur thoracique, grande difficulté à respirer, saignement important ou perte de connaissance : appelez le 190. En cas de danger immédiat, appelez directement.',
  prepareTitle: 'À préparer', prepareBody: 'Le début des symptômes, vos médicaments et allergies, votre âge et votre position si un hôpital doit être recherché. Ne retardez pas un appel urgent pour réunir ces informations.',
  privacyTitle: 'Vos informations', privacyBody: 'Aucun compte nécessaire. Vos réponses sont envoyées au serveur et peuvent être partagées avec les cliniciens superviseurs et l’hôpital destinataire. L’historique de cet appareil n’est pas un coffre-fort médical privé. Lisez le consentement avant de continuer.',
  statusTitle: 'État du réseau hospitalier', statusLoading: 'Vérification des services connectés…', statusReady: 'Simulateur hospitalier connecté', statusOffline: 'Simulateur hospitalier indisponible', statusError: 'Impossible de vérifier le réseau.', statusCount: 'Hôpitaux configurés', statusNote: 'Un état de connexion, pas une garantie de lits libres ni d’acceptation. Capacités hospitalières et suivi ambulance simulés.', statusUpdated: 'Vérifié',
  explore: 'Découvrir la plateforme', sessionError: 'Impossible de démarrer la session. Vérifiez votre connexion et réessayez. Le 190 reste accessible.',
  historySearch: 'Rechercher un dossier ou un hôpital', noMatches: 'Aucun dossier correspondant.', historyError: 'Impossible de charger votre historique. Vérifiez la connexion et réessayez.', clearSearch: 'Effacer la recherche', loadingHistory: 'Chargement de votre historique…',
};
const ar: Copy = {
  mascotMessagesTitle: 'كلمة من حسنّيتو', mascotMessage1: 'رسالة واحدة كل مرة. أنا هنا لمساعدتك على الشرح.', mascotMessage2: 'عبّر بكلماتك وباللغة التي ترتاح لها.', mascotMessage3: 'لا تعرف كيف تجيب؟ يمكنك قول ذلك أيضًا.',
  workspaceTagline: 'صحتك، خطوة بخطوة', careTitle: 'من كلماتك إلى الخطوة التالية', careYou: 'أنت', careHospital: 'المستشفى', careClinic: 'العيادة', careEmergency: 'الطوارئ', careDoctor: 'الطبيب', careNote: 'رسم توضيحي لمسارات الرعاية الممكنة، وليس اتصالًا مباشرًا أو إحالة مؤكدة.',
  welcomeTitle: 'لنبدأ معًا.', welcomeIntro: 'صف ما يحدث، وأجب عن بعض الأسئلة، ثم اتبع الخطوات المقترحة. هذا النموذج التجريبي لا يشخّص الحالات ولا يعوّض خدمات الطوارئ.',
  howTitle: 'كيف تعمل المنصة', how1: 'صف أعراضك بكلماتك.', how2: 'أجب عن أسئلة حول بداية الأعراض وشدّتها وحالتك.', how3: 'اقرأ التوجيهات؛ قد تحتاج حالتك إلى مراجعة مختص.',
  emergencyTitle: 'لا تنتظر التطبيق', emergencyBody: 'عند ألم الصدر أو صعوبة شديدة في التنفس أو نزيف شديد أو فقدان الوعي، اتصل بالرقم 190. إذا اعتقدت أن هناك خطرًا فوريًا، اتصل مباشرة.',
  prepareTitle: 'ما الذي تجهّزه', prepareBody: 'وقت بداية الأعراض وأدويتك وحساسياتك وعمرك وموقعك إذا لزم البحث عن مستشفى. لا تؤخّر اتصال الطوارئ لجمع هذه المعلومات.',
  privacyTitle: 'معلوماتك', privacyBody: 'لا تحتاج إلى حساب. تُرسل إجاباتك إلى الخادم وقد تُشارك مع المختصين المشرفين والمستشفى المستقبِل. سجل هذا الجهاز ليس خزنة طبية خاصة. اقرأ الموافقة قبل المتابعة.',
  statusTitle: 'حالة شبكة المستشفيات', statusLoading: 'جارٍ التحقق من الخدمات…', statusReady: 'محاكي المستشفيات متصل', statusOffline: 'محاكي المستشفيات غير متاح', statusError: 'تعذّر التحقق من الشبكة.', statusCount: 'المستشفيات المهيأة', statusNote: 'حالة اتصال فقط، وليست ضمانًا لتوفر الأسرّة أو قبول المستشفى. سعة المستشفيات وتتبع الإسعاف محاكاة.', statusUpdated: 'آخر تحقق',
  explore: 'استكشف المنصة', sessionError: 'تعذّر بدء الجلسة. تحقق من الاتصال وحاول مجددًا. يمكنك دائمًا الاتصال بالرقم 190.',
  historySearch: 'ابحث برمز الحالة أو المستشفى', noMatches: 'لا توجد حالات مطابقة.', historyError: 'تعذّر تحميل السجل. تحقق من الاتصال وحاول مجددًا.', clearSearch: 'مسح البحث', loadingHistory: 'جارٍ تحميل السجل…',
};
const darija: Copy = {
  mascotMessagesTitle: 'كلمة من حسنّيتو', mascotMessage1: 'رسالة برسالة. أنا هنا باش نعاونك تفسّر.', mascotMessage2: 'احكي بكلامك وباللغة اللي ترتاحلها.', mascotMessage3: 'ما تعرفش كيفاش تجاوب؟ تنجم تقول هذا زادة.',
  workspaceTagline: 'صحتك، خطوة بخطوة', careTitle: 'من كلامك للخطوة الجاية', careYou: 'إنت', careHospital: 'السبيطار', careClinic: 'المصحّة', careEmergency: 'الاستعجالي', careDoctor: 'الطبيب', careNote: 'رسم يوضّح مسارات العناية الممكنة. موش اتصال مباشر ولا توجيه مؤكّد.',
  welcomeTitle: 'لاباس؟ نبدأو مع بعضنا.', welcomeIntro: 'احكيلنا شنوة صاير، جاوب على شوية أسئلة واتبع الخطوات المقترحة. النموذج التجريبي هذا ما يشخّصش وما يعوّضش الإسعاف.',
  howTitle: 'كيفاش تخدم', how1: 'احكيلنا على الأعراض بكلامك.', how2: 'جاوب على وقتاش بدات الأعراض، قوّتها وحالتك.', how3: 'اقرا التوجيهات؛ ينجم يلزم مختص يثبّت في حالتك.',
  emergencyTitle: 'ما تستناش التطبيق', emergencyBody: 'كان عندك وجيعة في الصدر، صعوبة كبيرة في التنفّس، نزيف كبير ولا فقدان وعي، عيّط للـ190. كان تحسّ فما خطر توا، عيّط مباشرة.',
  prepareTitle: 'شنوة تحضّر', prepareBody: 'وقتاش بدات الأعراض، دواياتك والحساسيات، عمرك وبلاصتك كان يلزم تلقى سبيطار. ما تعطّلش مكالمة استعجالية باش تلمّ المعلومات هاذي.',
  privacyTitle: 'معلوماتك', privacyBody: 'ما يلزمكش حساب. إجاباتك تتبعث للسيرفر وتنجم تتشارك مع المختصين المشرفين والسبيطار اللي باش يستقبلك. تاريخ الجهاز هذا موش خزنة طبّية خاصة. اقرا الموافقة قبل ما تكمّل.',
  statusTitle: 'حالة شبكة السبيطارات', statusLoading: 'نثبّتوا في الخدمات…', statusReady: 'محاكي السبيطارات متّصل', statusOffline: 'محاكي السبيطارات موش متاح', statusError: 'ما نجّمناش نثبّتوا في الشبكة.', statusCount: 'السبيطارات المهيّأة', statusNote: 'حالة اتصال برك، موش ضمان بلايص فارغة ولا قبول السبيطار. البلايص وتتبع الإسعاف محاكاة.', statusUpdated: 'آخر تثبّت',
  explore: 'اكتشف المنصّة', sessionError: 'ما نجّمناش نبداو الجلسة. ثبّت في الاتصال وعاود جرّب. ديما تنجم تعيّط للـ190.',
  historySearch: 'لوّج برمز الحالة ولا السبيطار', noMatches: 'ما فماش حالات توافق البحث.', historyError: 'ما نجّمناش نحمّلوا التاريخ. ثبّت في الاتصال وعاود جرّب.', clearSearch: 'امسح البحث', loadingHistory: 'نحمّلوا في التاريخ…',
};
export const EXPERIENCE: Record<Language, Copy> = { en, fr, ar, darija };

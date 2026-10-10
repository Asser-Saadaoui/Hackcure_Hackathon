"""Patient-facing labels (FR / EN / AR / Darija) for the elements of the NLP explanation (explain.py)."""

LABELS = {
    'chest': ('Douleur à la poitrine', 'Chest pain', 'ألم في الصدر', 'وجيعة في الصدر'),
    'breath': ('Difficulté à respirer', 'Breathing difficulty', 'صعوبة في التنفس', 'صعوبة في التنفس'),
    'breath_severe': ('Grande difficulté à respirer', 'Severe breathing difficulty', 'صعوبة شديدة في التنفس', 'صعوبة كبيرة في التنفس'),
    'fever': ('Fièvre', 'Fever', 'حمى', 'سخانة'),
    'headache': ('Mal de tête', 'Headache', 'صداع', 'وجيعة راس'),
    'severe_headache': ('Mal de tête intense', 'Severe headache', 'صداع شديد', 'وجيعة راس قوية'),
    'abdominal_pain': ('Douleur au ventre', 'Abdominal pain', 'ألم في البطن', 'وجيعة في الكرش'),
    'dizziness': ('Vertiges', 'Dizziness', 'دوخة', 'دوخة'),
    'confusion': ('Confusion', 'Confusion', 'تشوش', 'تخلويض'),
    'seizure': ('Convulsions', 'Seizure', 'تشنج', 'تشنج'),
    'syncope': ('Malaise / évanouissement', 'Fainting', 'إغماء', 'طيحة / دوخة قوية'),
    'vomiting': ('Vomissements', 'Vomiting', 'قيء', 'ترجيع'),
    'nausea': ('Nausées', 'Nausea', 'غثيان', 'قلبان قلب'),
    'cough': ('Toux', 'Cough', 'سعال', 'كحة'),
    'palpitations': ('Palpitations', 'Palpitations', 'خفقان', 'قلب يضرب بالزربة'),
    'diarrhea': ('Diarrhée', 'Diarrhoea', 'إسهال', 'إسهال'),
    'weakness': ('Faiblesse', 'Weakness', 'ضعف', 'ضعف'),
    'numbness': ('Engourdissement', 'Numbness', 'تنميل', 'تنميل'),
    'rash': ('Éruption sur la peau', 'Skin rash', 'طفح جلدي', 'حبوب في الجلد'),
    'bleeding': ('Saignement', 'Bleeding', 'نزيف', 'دم'),
    'bleeding_heavily': ('Saignement abondant', 'Heavy bleeding', 'نزيف قوي', 'دم برشة'),
    'neck_stiffness': ('Nuque raide', 'Stiff neck', 'تصلب الرقبة', 'رقبة يابسة'),
    'speech': ('Difficulté à parler', 'Difficulty speaking', 'صعوبة في الكلام', 'صعوبة في الكلام'),
    'vision_loss': ('Perte de vue', 'Vision loss', 'فقدان البصر', 'ما عادش يشوف'),
    'pregnancy': ('Grossesse', 'Pregnancy', 'حمل', 'حمل'),
    'other_symptom': ('Symptômes décrits', 'Symptoms described', 'الأعراض الموصوفة', 'الأعراض اللي حكيت عليها'),
    'age_missing': ('Âge non précisé', 'Age not given', 'العمر غير محدد', 'العمر ما تقالش'),
    'age_given': ('Votre âge', 'Your age', 'عمرك', 'عمرك'),
    'duration_given': ('Depuis quand', 'How long it has lasted', 'المدة', 'من وقتاش'),
    'duration_missing': ('Durée non précisée', 'Duration not given', 'المدة غير محددة', 'المدة ما تقالتش'),
    'sex_missing': ('Sexe non précisé', 'Sex not given', 'الجنس غير محدد', 'ما تقالش راجل ولا مرا'),
    'sex_given': ('Sexe', 'Sex', 'الجنس', 'راجل ولا مرا'),
    'severity_missing': ('Intensité non précisée', 'Intensity not given', 'الشدة غير محددة', 'قداش قوية ما تقالش'),
    'severity_given': ('Intensité décrite', 'Intensity described', 'الشدة الموصوفة', 'قداش قوية'),
    'vitals_missing': ('Pas de mesures (température, pouls…)', 'No measurements (temperature, pulse…)', 'لا توجد قياسات', 'ما فماش قياسات'),
    'third_person_report': ('Décrit par un proche', 'Described by someone else', 'وصفه شخص آخر', 'حكى عليه حد آخر'),
}
ABSENT = {'fr': 'Pas de : {x}', 'en': 'No {x}', 'ar': 'لا يوجد: {x}', 'darija': 'ما فماش: {x}'}
ORDER = ('fr', 'en', 'ar', 'darija')


def label(concept, status, language):
    i = ORDER.index(language) if language in ORDER else 0
    text = LABELS[concept][i] if concept in LABELS else concept.replace('_', ' ')
    if status == 'absent':
        text = ABSENT[ORDER[i]].format(x=text.lower() if ORDER[i] in ('fr', 'en') else text)
    return text

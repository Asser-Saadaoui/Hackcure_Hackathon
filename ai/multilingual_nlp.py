"""Auditable Tunisian/French clinical phrase normalization with exact alignment.

This is a finite, unreviewed dialect vocabulary, not general translation. Unknown
text is retained. Arabic orthographic folding never changes evidence offsets.
"""
import copy
import re
import unicodedata

VERSION = 'tn_clinical_phrases_1'
# Longest matching span wins; numbers inside Arabizi words are never transliterated.
PHRASES = [
    (r'وعندي', 'and I have'),
    (r'رقبتي\s*يابسة|ra9beti\s*yabsa', 'stiff neck'),
    (r'متخلط|met5[ae]l[ae]t|confus', 'confused'),
    (r'(?:وجيعة|وجع)\s*في\s*راسي|wji3a\s*fi\s*rasi', 'headache'),
    (r'بقلبي\s*يضرب\s*بالزربة|9albi\s*yodhrob\s*bel\s*zerba', 'palpitations'),
    (r'وجهي\s*مايل|wejhi\s*mayel', 'face drooping'),
    (r'تنميل|tn[ae]mil|engourdissement', 'numbness'),
    (r'ضعف|dh3of|faiblesse', 'weakness'),
    (r'طفح\s*جلدي|طفح|eruption\s*cutanee', 'rash'),
    (r'حك[ةه]|7akka|demangeaisons?', 'itching'),
    (r'ما\s*نجمش\s*نبلع|ma\s*najamch\s*n[ae]bl[ae]3', 'difficulty swallowing'),
    (r'ما\s*نجمش\s*نشوف|ma\s*najamch\s*nchouf', 'cannot see'),
    (r'ما\s*نجمش\s*نحكي|ma\s*najamch\s*n[ae]7ki', 'difficulty speaking'),
    (r'حلق[هي]\s*منفوخ|7al9i\s*manfou5', 'throat swelling'),
    (r'فمي\s*منفوخ|fommi\s*manfou5', 'mouth swelling'),
    (r'دم\s*في\s*البول|dam\s*fel\s*boul', 'blood in urine'),
    (r'جلطة|jalta|accident\s*vasculaire\s*cerebral', 'stroke'),
    (r'صرع|sar3|epilepsie', 'epilepsy'),
    (r'سرطان|sartan', 'cancer'),
    (r'حامل|7amel|enceinte', 'pregnant'),
    (r'قلق|9ala9|anxiete', 'anxiety'),
    (r'هلع|hala3|attaque\s*de\s*panique', 'panic attack'),
    (r'التهاب\s*السحايا|meningite', 'meningitis'),
    (r'التهاب\s*الرية|pneumonie', 'pneumonia'),
    (r'صداع\s*نصفي|ch9i9a', 'migraine'),
    (r'اسبرين|aspirine', 'aspirin'),
    (r'ايبوبروفين|ibuprofene', 'ibuprofen'),
    (r'اموكسيسيلين|amoxicilline', 'amoxicillin'),
    (r'ميتفورمين|metformine', 'metformin'),
    (r'اوميبرازول', 'omeprazole'),
    (r'فنتولين', 'Ventolin'),
    (r'اتورفاستاتين', 'atorvastatin'),
    (r'وارفارين', 'warfarin'),
    (r'ليفوثيروكسين', 'levothyroxine'),
    (r'نعرفش|ma\s*na3rafch|مانعرفش', 'not sure whether'),
    (r'ma\s*(?:y)?naj[ae]mch\s*(?:y|n)etnaff[ae]s|ما\s*[ين]جمش\s*[ين]تنفس', 'cannot breathe'),
    (r'(?:ma\s*)?n[ae]j[ae]mch\s*netnaff[ae]s', 'cannot breathe'),
    (r'(?:w[jg]a3|wji3a|douleur|وجيعة|وجع)\s*(?:fi|fel|في)\s*(?:sadr[iy]|صدري|الصدر)', 'chest pain'),
    (r'(?:sadr[iy]|صدري)\s*(?:you?j[a3]+ni|يوجعني)|douleur\s*(?:thoracique|a la poitrine)', 'chest pain'),
    (r'(?:rasi|راسي)\s*(?:you?j[a3]+ni|يوجعني)|w[jg]a3\s*(?:fi|fel)\s*rasi|mal\s*(?:a|à)\s*la\s*tete', 'headache'),
    (r'(?:s3ouba|sou3ouba|صعوبة)\s*(?:fi|fel|في)\s*(?:tanaff[ou]+s|التنفس)|difficulte\s*(?:a|à)\s*respirer', 'difficulty breathing'),
    (r'nefsi\s*(?:ma9tou3|m9at3)|نفسي\s*مقطوع|ضيق\s*(?:في\s*)?التنفس', 'difficulty breathing'),
    (r'وجه[هي]\s*مايل|wejhi\s*mayel', 'face drooping'),
    (r'يدي\s*اليسار\s*ضعيفة|yedi\s*lisar\s*d[h3]3ifa', 'left arm weakness'),
    (r'كلامي\s*متخلط|k[ae]l[ae]mi\s*met5[ae]l[ae]t|parole\s*pateuse', 'slurred speech'),
    (r'نزيف\s*قوي|nzif\s*9wi|saignement\s*abondant', 'heavy bleeding'),
    (r'فاقد\s*الوعي|f[ae]9[ae]d\s*el\s*wa3y|inconscient', 'unconscious'),
    (r'dou?kha|دوخة|etourdissements?', 'dizziness'),
    (r's[ou]k[ko]+r|سكري|السكري|diabete', 'diabetes'),
    (r'rbou|ربو|asthme', 'asthma'),
    (r'da8t|ضغط\s*الدم|hypertension\s*arterielle', 'hypertension'),
    (r's5ana|skhana|سخانة|حمى|fievre', 'fever'),
    (r'k[oou]+7a|كحة|toux', 'cough'),
    (r'nr[ao]jja3|nt9ayya|نتقيأ|vomissements?', 'vomiting'),
    (r'is[h7]al|اسهال|diarrhee', 'diarrhea'),
    (r'(?:wja3|وجع)\s*(?:fi|في)\s*(?:batni|بطني)|mal\s*au\s*ventre', 'abdominal pain'),
    (r'7asasiya\s*(?:men|l)|حساسية\s*(?:من|ل)|allergique\s*(?:a|à)', 'allergic to'),
    (r'na5ou|ناخو|je prends', 'I take'),
    (r'doliprane|بانادول|باراسيتامول', 'paracetamol'),
    (r'انسولين|insuline', 'insulin'),
    (r'بنسلين|penicilline', 'penicillin'),
    (r'ma\s*3andi?ch|ma3andi?ch|ماعنديش|معنديش|ما\s*عنديش|je n.ai pas(?: de)?', 'I have no'),
    (r'3and[iy]|عندي|j.ai', 'I have'),
    (r'3and[ou]+|عندو|il a', 'has'),
    (r'3andha|عندها|elle a', 'has'),
    (r'b[ou]+ya|بابا|بويا|mon pere', 'my father'),
    (r'ommi|[ou]mmi|امي|maman|ma mere', 'my mother'),
    (r'خويا|5ouya|mon frere', 'my brother'),
    (r'ختي|o5ti|ma soeur', 'my sister'),
    (r'mouch\s*met2[ae]ked|moch\s*met2[ae]ked|مش\s*متاكد|موش\s*متاكد|je ne suis pas sur', 'not sure whether'),
    (r'bal[ae]k|يمكن|peut.etre', 'maybe'),
    (r'ken\s*nwalli|اذا|if', 'if'),
    (r'3am\s*(?:elli\s*)?fet|العام\s*الفات|l.annee derniere', 'last year'),
    (r'9bal|قبل|auparavant', 'previously'),
    (r'taw[a]?|توا|الان|maintenant', 'now'),
    (r'faj2[ae]|فجاة|soudain(?:ement)?', 'suddenly'),
    (r'bchwaya\s*bchwaya|بشوية\s*بشوية|progressivement', 'gradually'),
    (r'b[ae]rch[ae]|برشة|forte?|intense', 'intense'),
    (r'chwaya|شوية|leger', 'mild'),
    (r'wfet|وفات|mchet|مشات|disparu', 'resolved'),
    (r'ama|لكن|اما|mais', 'but'),
    (r'men|من|depuis', 'for'),
    (r'sw[ae]y[ae]3|s[ae]3[ae]t?|ساعات|ساعة|heures?', 'hours'),
    (r'd9aye9|d9i9a|دقايق|دقيقة', 'minutes'),
    (r'ay[ae]m|nhar|ايام|يوم|jours?', 'days'),
    (r'j[ou]m3[ae]t?|اسابيع|اسبوع|semaines?', 'weeks'),
    (r'ch[h7]our|شهور|شهر|mois', 'months'),
    (r'3am|سنين|سنة|ans', 'years'),
    (r'3omri|عمري|j.ai l.age de', 'age'),
    (r'9addech\s*andek\s*mel\s*wji3a|قداش\s*عندك\s*ملي\s*بدا\s*وجع', 'how long have you had pain'),
    (r'saturation(?: en oxygene)?|نسبة\s*الاكسجين', 'SpO2'),
    (r'نبض|pouls', 'heart rate'),
    (r'tension', 'blood pressure'),
    (r'حرارة|temperature', 'temperature'),
    (r'سكر\s*الدم|glycemie', 'glucose'),
    (r'و', 'and'),
]
PATTERNS = [(re.compile(r'(?<!\w)(?:'+p+r')(?!\w)', re.I), value) for p,value in PHRASES]

def fold(text):
    chars=[];mapping=[]
    for i,ch in enumerate(text):
        if '\u064b'<=ch<='\u065f' or ch=='ـ':continue
        ch={'أ':'ا','إ':'ا','آ':'ا','ى':'ي','ؤ':'و','ئ':'ي','ة':'ة','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'}.get(ch,ch)
        for c in unicodedata.normalize('NFD',ch.lower()):
            if not unicodedata.combining(c):chars.append(c);mapping.append((i,i+1))
    return ''.join(chars),mapping

def language_hint(text):
    arabic=bool(re.search(r'[\u0600-\u06ff]',text));latin=bool(re.search(r'[a-zA-Z]',text))
    if arabic:return 'mixed' if latin else 'tn_arabic'
    folded,_=fold(text)
    return 'tn_arabizi' if re.search(r'\b(?:3andi|ma3andich|rasi|barcha|ey|s3ouba|taw)\b|[a-z]\d[a-z]',folded) else 'en_or_fr'

def align(text):
    """Return a clinical pivot and one original span for each pivot character."""
    normalized,index=fold(text);matches=[]
    for pattern,value in PATTERNS:
        for m in pattern.finditer(normalized):matches.append((m.start(),m.end(),value))
    matches.sort(key=lambda m:(m[0],-(m[1]-m[0])));selected=[];end=-1
    for m in matches:
        if m[0]>=end:selected.append(m);end=m[1]
    pivot=[];alignment=[];changes=[];cursor=0
    # Unchanged letters use original spelling, so English extraction stays exact.
    for a,b,value in selected:
        for j in range(cursor,a):pivot.append(text[index[j][0]:index[j][1]]);alignment.append(index[j])
        source=(index[a][0],index[b-1][1]);pivot.extend(value);alignment.extend([source]*len(value))
        changes.append(dict(start=source[0],end=source[1],text=text[source[0]:source[1]],normalized=value,provenance=VERSION))
        cursor=b
    for j in range(cursor,len(index)):pivot.append(text[index[j][0]:index[j][1]]);alignment.append(index[j])
    return ''.join(pivot),alignment,changes

def remap_span(obj,text,alignment):
    if 'start' not in obj or 'end' not in obj:return
    a,b=obj['start'],obj['end']
    if b>a and a<len(alignment):a,b=alignment[a][0],alignment[min(b,len(alignment))-1][1]
    else:a=b=alignment[min(a,len(alignment)-1)][0] if alignment else 0
    obj.update(start=a,end=b,text=text[a:b])

def remap_fact(f,text,alignment,language,changes):
    remap_span(f,text,alignment)
    if 'context_start' in f:
        obj={'start':f['context_start'],'end':f['context_end']};remap_span(obj,text,alignment)
        f.update(context_start=obj['start'],context_end=obj['end'])
    for key in ('severity','duration','onset','dose','resolution_time','event_time'):
        if f.get(key):remap_span(f[key],text,alignment)
    for ev in f.get('evidence',[]):remap_span(ev,text,alignment)
    f.update(language=language,script='arabic' if re.search(r'[\u0600-\u06ff]',f['text']) else 'latin',
             extraction_provenance=VERSION if changes else 'existing_english_context',normalized_concept=f['kind']+'.'+f['name'])
    # Translation dictionaries have not been reviewed by Tunisian clinicians.
    if changes:f['extraction_confidence']=min(.85,f['extraction_confidence']);f['confidence_basis']+='; unreviewed_dialect_phrase_alignment'

def extract(text,english_extractor,inherited='patient',turn_id=None):
    pivot,alignment,changes=align(text)
    info=english_extractor(pivot,inherited,turn_id);info=copy.deepcopy(info)
    lang=language_hint(text)
    visited=set()
    for key in ('facts','observations','extraction_history'):
        for f in info.get(key,[]):
            if id(f) not in visited:remap_fact(f,text,alignment,lang,changes);visited.add(id(f))
    from clinical_state import facts_to_info
    result=facts_to_info(info['facts'],info['patient_experiencer'])
    result.update(observations=info.get('observations',[]),extraction_history=info.get('extraction_history',[]),
                  original_text=text,language_hint=lang,normalization=changes,nlp_version=VERSION)
    # Unknown text is retained for clarification, never assigned a diagnosis.
    result['uninterpreted_input']={'text':text,'reason':'No recognized clinical fact'} if not info['facts'] else None
    result['normalization_scope']='Finite recognized clinical phrases; remaining text retained, not assumed understood.'
    return result

def answer_text(text):
    """Canonicalize finite short answers; keep original answer separately in state."""
    folded,_=fold(text.strip())
    if re.fullmatch(r'(?:ma na3rafch|مانعرفش|ما نعرفش|مش متاكد|موش متاكد|je ne sais pas)',folded):return 'Not sure'
    if re.fullmatch(r'(?:le|la|لا|non)',folded):return 'No'
    m=re.match(r'^(ey|اي|ايه|نعم|oui)(?=\W|$)',folded)
    if m:return 'Yes'+align(text[len(m.group()):])[0]
    return align(text)[0]

def answer_alignment(text):
    pivot,mapping,changes=align(text);canonical=answer_text(text)
    if canonical==pivot:return canonical,mapping,changes
    folded,_=fold(text.strip());m=re.match(r'^(ey|اي|ايه|نعم|oui)(?=\W|$)',folded)
    if m:
        offset=len(text)-len(text.lstrip());end=offset+len(m.group())
        _,tail_map,_=align(text[end:])
        return canonical,[(offset,end)]*3+[(a+end,b+end) for a,b in tail_map],changes
    return canonical,[(0,len(text))]*len(canonical),changes

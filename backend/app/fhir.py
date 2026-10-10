"""HL7 FHIR R4 export of a case: a Bundle of type "document" whose first entry is a Composition.

Resources: Composition (LOINC 34111-5 Emergency department Note), Patient (anonymous: only the case
code), Encounter (class EMER, priority), Observation per reported symptom (SNOMED CT, present or absent),
Condition per known illness, MedicationStatement per medicine, RiskAssessment (triage level + score),
Flag per warning sign, Organization (receiving hospital), ServiceRequest (the referral).

Only codes we are confident about are used; other concepts are exported as text (code.text) so nothing
is invented. Resource ids are deterministic (uuid5 of the case id) so re-exports stay stable.
"""
import uuid
from datetime import datetime, timezone

from app import hospitals

SNOMED = 'http://snomed.info/sct'
LOINC = 'http://loinc.org'
ACT_CODE = 'http://terminology.hl7.org/CodeSystem/v3-ActCode'
ACT_PRIORITY = 'http://terminology.hl7.org/CodeSystem/v3-ActPriority'
RISK_PROB = 'http://terminology.hl7.org/CodeSystem/risk-probability'
OBS_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category'
CASE_SYSTEM = 'urn:sahhanito:case'
NAMESPACE = uuid.UUID('6f1c2a52-3a4e-4e8c-9a7d-5a1e0c0d8f11')

# Extractor concept -> (SNOMED CT code, display). Symptoms / findings.
SNOMED_FINDINGS = {
    'chest': ('29857009', 'Chest pain'), 'breath': ('267036007', 'Dyspnea'), 'fever': ('386661006', 'Fever'),
    'headache': ('25064002', 'Headache'), 'abdominal_pain': ('21522001', 'Abdominal pain'),
    'dizziness': ('404640003', 'Dizziness'), 'confusion': ('286933003', 'Confusional state'),
    'seizure': ('91175000', 'Seizure'), 'syncope': ('271594007', 'Syncope'), 'vomiting': ('422400008', 'Vomiting'),
    'nausea': ('422587007', 'Nausea'), 'cough': ('49727002', 'Cough'), 'palpitations': ('80313002', 'Palpitations'),
    'diarrhea': ('62315008', 'Diarrhea'), 'weakness': ('13791008', 'Asthenia'), 'numbness': ('44077006', 'Numbness'),
    'rash': ('271807003', 'Eruption of skin'), 'wheeze': ('56018004', 'Wheezing'), 'fatigue': ('84229001', 'Fatigue'),
    'hemoptysis': ('66857006', 'Hemoptysis'), 'hematuria': ('34436003', 'Blood in urine'),
    'neck_stiffness': ('161882006', 'Stiff neck'), 'melena': ('2901004', 'Melena'), 'edema': ('267038008', 'Edema'),
    'speech': ('8011004', 'Dysarthria'), 'dysphagia': ('40739000', 'Dysphagia'), 'photophobia': ('409668002', 'Photophobia'),
}
# Known illnesses.
SNOMED_CONDITIONS = {
    'pregnancy': ('77386006', 'Pregnancy'), 'diabetes': ('73211009', 'Diabetes mellitus'),
    'hypertension': ('38341003', 'Hypertensive disorder'), 'asthma': ('195967001', 'Asthma'),
    'copd': ('13645005', 'Chronic obstructive lung disease'), 'epilepsy': ('84757009', 'Epilepsy'),
    'heart_failure': ('84114007', 'Heart failure'), 'atrial_fibrillation': ('49436004', 'Atrial fibrillation'),
    'stroke': ('230690007', 'Cerebrovascular accident'), 'heart_attack': ('22298006', 'Myocardial infarction'),
    'kidney_disease': ('709044004', 'Chronic kidney disease'), 'migraine': ('37796009', 'Migraine'),
    'anxiety': ('48694002', 'Anxiety'), 'cancer': ('363346000', 'Malignant neoplastic disease'),
}
# Rule id -> SNOMED for the warning sign, when the rule maps to one clear finding.
SNOMED_RULES = {
    'R-TRAUMA-02': ('125605004', 'Fracture of bone'), 'R-TRAUMA-03': ('125605004', 'Fracture of bone'),
    'R-NEURO-03': ('91175000', 'Seizure'), 'R-NEURO-05': ('271594007', 'Syncope'), 'R-CARD-02': ('29857009', 'Chest pain'),
    'R-RESP-02': ('267036007', 'Dyspnea'),
}
PRIORITY = {'EMERGENCY': ('EM', 'emergency'), 'HIGH': ('UR', 'urgent'), 'LOW': ('R', 'routine'), 'UNCERTAIN': ('UR', 'urgent')}
REQUEST_PRIORITY = {'EMERGENCY': 'stat', 'HIGH': 'urgent', 'LOW': 'routine', 'UNCERTAIN': 'urgent'}
RISK = {'EMERGENCY': 'high', 'HIGH': 'moderate', 'LOW': 'low', 'UNCERTAIN': 'moderate'}
LEVEL_FR = {'EMERGENCY': 'Urgence vitale', 'HIGH': 'Urgent', 'LOW': 'Peu urgent', 'UNCERTAIN': 'À vérifier'}


def _id(case_id, *parts):
    return str(uuid.uuid5(NAMESPACE, ':'.join([case_id, *parts])))


def _ref(resource_id):
    return f'urn:uuid:{resource_id}'


def _coding(system, code, display):
    return {'coding': [{'system': system, 'code': code, 'display': display}]}


def _concept(table, name, text):
    if name in table:
        code, display = table[name]
        return {'coding': [{'system': SNOMED, 'code': code, 'display': display}], 'text': text}
    return {'text': text}


def coded_label(table, name):
    """'(SNOMED CT 29857009)' for the PDF, or '' when no reliable code exists."""
    return f' (SNOMED CT {table[name][0]})' if name in table else ''


def build_bundle(case, report, referral, journey=None):
    """case: models.Case; report: services.structured_report(case); referral: models.Referral or None."""
    from app.services import concept_label, iso
    now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    cid = case.id
    level = case.level or 'UNCERTAIN'
    a = case.assessment or {}
    state = case.ai_state or {}
    target = state.get('patient_experiencer', 'patient')
    facts = [f for f in state.get('facts', []) if f.get('experiencer', 'patient') == target and f.get('temporality') == 'current']

    ids = dict(composition=_id(cid, 'composition'), patient=_id(cid, 'patient'), encounter=_id(cid, 'encounter'),
               risk=_id(cid, 'risk'), org=_id(cid, 'org', referral.facility_key) if referral else None,
               request=_id(cid, 'request', referral.id) if referral else None)
    subject, encounter = {'reference': _ref(ids['patient'])}, {'reference': _ref(ids['encounter'])}
    entries = []

    def add(resource):
        entries.append({'fullUrl': _ref(resource['id']), 'resource': resource})
        return {'reference': _ref(resource['id'])}

    patient = {'resourceType': 'Patient', 'id': ids['patient'],
               'identifier': [{'system': CASE_SYSTEM, 'value': case.reference_code}],
               'communication': [{'language': {'coding': [{'system': 'urn:ietf:bcp:47',
                                                           'code': {'fr': 'fr', 'en': 'en', 'ar': 'ar', 'darija': 'ar-TN'}[case.language]}]},
                                  'preferred': True}]}
    code, display = PRIORITY[level]
    enc = {'resourceType': 'Encounter', 'id': ids['encounter'], 'status': 'arrived' if referral and referral.status == 'ARRIVED' else 'triaged',
           'class': {'system': ACT_CODE, 'code': 'EMER', 'display': 'emergency'},
           'priority': _coding(ACT_PRIORITY, code, display), 'subject': subject,
           'period': {'start': iso(case.created_at)}, 'reasonCode': [{'text': report['chiefComplaint']}]}

    observations, conditions, meds, flags = [], [], [], []
    for f in facts:
        if f.get('kind') == 'symptom' and f.get('status') in ('confirmed', 'negated'):
            observations.append({
                'resourceType': 'Observation', 'id': _id(cid, 'obs', f['name']), 'status': 'preliminary',
                'category': [_coding(OBS_CATEGORY, 'survey', 'Survey')],
                'code': _concept(SNOMED_FINDINGS, f['name'], concept_label(f)),
                'subject': subject, 'encounter': encounter, 'valueBoolean': f['status'] == 'confirmed',
                'note': [{'text': f"Rapporté par le patient : « {f.get('text')} »"}] if f.get('text') else []})
        elif f.get('kind') == 'condition' and f.get('status') == 'confirmed':
            conditions.append({
                'resourceType': 'Condition', 'id': _id(cid, 'cond', f['name']),
                'clinicalStatus': _coding('http://terminology.hl7.org/CodeSystem/condition-clinical', 'active', 'Active'),
                'verificationStatus': _coding('http://terminology.hl7.org/CodeSystem/condition-ver-status', 'unconfirmed', 'Unconfirmed'),
                'code': _concept(SNOMED_CONDITIONS, f['name'], concept_label(f)), 'subject': subject, 'encounter': encounter})
    for m in report.get('medications', []):
        meds.append({'resourceType': 'MedicationStatement', 'id': _id(cid, 'med', m), 'status': 'active',
                     'medicationCodeableConcept': {'text': m}, 'subject': subject, 'informationSource': subject})
    for r in a.get('triggered_rules', []):
        text = (r.get('rationale') or {}).get('fr') or r['name']
        flags.append({'resourceType': 'Flag', 'id': _id(cid, 'flag', r['id']), 'status': 'active',
                      'category': [_coding('http://terminology.hl7.org/CodeSystem/flag-category', 'clinical', 'Clinical')],
                      'code': {**({'coding': [{'system': SNOMED, 'code': SNOMED_RULES[r['id']][0], 'display': SNOMED_RULES[r['id']][1]}]}
                                  if r['id'] in SNOMED_RULES else {}), 'text': f"{text} [{r['id']}, {r['severity']}]"},
                      'subject': subject, 'encounter': encounter})

    risk = {'resourceType': 'RiskAssessment', 'id': ids['risk'], 'status': 'preliminary', 'subject': subject, 'encounter': encounter,
            'occurrenceDateTime': now, 'method': {'text': 'Sahhanito: NLP model + rule engine, logistic fusion (not clinically calibrated)'},
            'code': _coding(LOINC, '11283-9', 'Acuity assessment at First encounter'),
            'prediction': [{'outcome': {'text': LEVEL_FR.get(level, level)},
                            'qualitativeRisk': _coding(RISK_PROB, RISK[level], RISK[level].capitalize()),
                            **({'probabilityDecimal': round(a['p_final'], 4)} if a.get('p_final') is not None else {})}],
            'note': [{'text': report['summary']}]}

    org = request = None
    if referral:
        f = hospitals.FACILITIES.get(referral.facility_key, {})
        org = {'resourceType': 'Organization', 'id': ids['org'], 'active': True, 'name': f.get('name', referral.facility_key),
               'identifier': [{'system': 'urn:sahhanito:facility', 'value': referral.facility_key}],
               'type': [_coding('http://terminology.hl7.org/CodeSystem/organization-type', 'prov', 'Healthcare Provider')],
               **({'address': [{'city': f.get('city'), 'country': 'TN'}]} if f.get('city') else {})}
        status = {'SENT': 'active', 'INFO_REQUESTED': 'active', 'ACCEPTED': 'active', 'ARRIVED': 'completed',
                  'COMPLETED': 'completed', 'REJECTED': 'revoked', 'TIMED_OUT': 'revoked', 'REROUTED': 'revoked', 'CANCELLED': 'revoked'}
        request = {'resourceType': 'ServiceRequest', 'id': ids['request'], 'status': status.get(referral.status, 'active'),
                   'intent': 'order', 'priority': REQUEST_PRIORITY[level],
                   'code': {'text': "Prise en charge aux urgences"}, 'subject': subject, 'encounter': encounter,
                   'authoredOn': iso(referral.created_at), 'performer': [{'reference': _ref(ids['org'])}],
                   'reasonCode': [{'text': report['chiefComplaint']}],
                   'note': [{'text': referral.match_reason}] + ([{'text': f'Motif : {referral.reason}'}] if referral.reason else [])}

    # Composition first (document bundle rule), then everything it references.
    def section(title, loinc, display, text, refs=None):
        s = {'title': title, 'code': _coding(LOINC, loinc, display),
             'text': {'status': 'generated', 'div': f'<div xmlns="http://www.w3.org/1999/xhtml">{_xhtml(text)}</div>'}}
        if refs:
            s['entry'] = refs
        return s

    composition = {
        'resourceType': 'Composition', 'id': ids['composition'], 'status': 'preliminary',
        'type': _coding(LOINC, '34111-5', 'Emergency department Note'),
        'subject': subject, 'encounter': encounter, 'date': now, 'author': [{'display': 'Sahhanito (triage assisté par IA)'}],
        'title': f'Rapport de triage {case.reference_code}', 'language': 'fr',
        'identifier': {'system': CASE_SYSTEM, 'value': case.reference_code},
        'section': [
            section('Motif de recours', '8661-1', 'Chief complaint - Reported', report['chiefComplaint']),
            section('Histoire de la maladie', '10164-2', 'History of Present illness Narrative',
                    '; '.join(report['positives'] + [f'absent : {x}' for x in report['negatives']] + report['history']) or '—',
                    [{'reference': _ref(o['id'])} for o in observations + conditions + meds]),
            section('Évaluation du triage', '11283-9', 'Acuity assessment at First encounter', report['summary'],
                    [{'reference': _ref(ids['risk'])}] + [{'reference': _ref(x['id'])} for x in flags]),
            section('Conduite à tenir', '18776-5', 'Plan of care note', '; '.join(report['recommendedActions']),
                    [{'reference': _ref(ids['request'])}] if request else None),
        ],
    }
    for resource in [composition, patient, enc, *observations, *conditions, *meds, risk, *flags, *([org, request] if referral else [])]:
        add(resource)

    return {'resourceType': 'Bundle', 'id': _id(cid, 'bundle'), 'type': 'document', 'timestamp': now,
            'identifier': {'system': CASE_SYSTEM, 'value': case.reference_code}, 'entry': entries}


def summary(bundle):
    """Short description of the bundle for the PDF: resource counts and every coded concept."""
    counts, codes = {}, []
    for e in bundle['entry']:
        r = e['resource']
        counts[r['resourceType']] = counts.get(r['resourceType'], 0) + 1
        for field in ('type', 'code', 'priority', 'class'):
            c = r.get(field)
            if isinstance(c, dict):
                for cd in c.get('coding', []):
                    codes.append((r['resourceType'], cd['system'].rsplit('/', 1)[-1], cd['code'], cd.get('display', '')))
                if field == 'class' and c.get('code'):
                    codes.append((r['resourceType'], 'v3-ActCode', c['code'], c.get('display', '')))
        for p in r.get('prediction', []):
            for cd in p.get('qualitativeRisk', {}).get('coding', []):
                codes.append(('RiskAssessment', 'risk-probability', cd['code'], cd.get('display', '')))
    names = {'sct': 'SNOMED CT', 'loinc.org': 'LOINC', 'v3-ActPriority': 'HL7 v3 ActPriority', 'v3-ActCode': 'HL7 v3 ActCode',
             'risk-probability': 'HL7 risk-probability'}
    codes = [(res, names.get(sys_, sys_), code, disp) for res, sys_, code, disp in codes]
    seen, unique = set(), []
    for c in codes:
        if c not in seen:
            seen.add(c)
            unique.append(c)
    return dict(id=bundle['id'], counts=counts, codes=unique)


def _xhtml(text):
    from xml.sax.saxutils import escape
    return escape(str(text))

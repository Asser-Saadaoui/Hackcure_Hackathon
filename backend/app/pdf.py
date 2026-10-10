"""French PDF medical report (ReportLab).

Two versions from the same stored data:
  patient: summary, warning signs, what was reported, assigned hospital, recommendations, QR to the case page
  staff:   + how the level was decided, the hospital journey, the full triage transcript and the ED chat

Patient words in Arabic script are shaped and reordered (arabic-reshaper + python-bidi) so they render
correctly with the embedded DejaVu font. Nothing is invented: every field comes from the case record.
"""
import io
import re
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app import hospitals

ASSETS = Path(__file__).resolve().parent / 'assets'
TZ = ZoneInfo('Africa/Tunis')
pdfmetrics.registerFont(TTFont('DejaVu', str(ASSETS / 'fonts' / 'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('DejaVu-Bold', str(ASSETS / 'fonts' / 'DejaVuSans-Bold.ttf')))

TEAL = colors.HexColor('#177082')
MUTED = colors.HexColor('#6B7280')
BORDER = colors.HexColor('#E5E7EB')
LEVELS = {'EMERGENCY': ('Urgence vitale', '#DC2626'), 'HIGH': ('Urgent', '#EA580C'), 'LOW': ('Peu urgent', '#16A34A'),
          'UNCERTAIN': ('À vérifier par un médecin', '#64748B')}
ARRIVAL = {'AMBULANCE': 'Ambulance (simulée)', 'SELF': 'Par ses propres moyens'}
ARABIC = re.compile(r'[؀-ۿ]')

base = ParagraphStyle('base', fontName='DejaVu', fontSize=9.5, leading=13.5, textColor=colors.HexColor('#111827'))
small = ParagraphStyle('small', parent=base, fontSize=8, leading=11, textColor=MUTED)
h1 = ParagraphStyle('h1', parent=base, fontName='DejaVu-Bold', fontSize=16, leading=20)
h2 = ParagraphStyle('h2', parent=base, fontName='DejaVu-Bold', fontSize=10.5, leading=14, textColor=TEAL, spaceBefore=10, spaceAfter=4)
label = ParagraphStyle('label', parent=small, fontName='DejaVu-Bold', textColor=MUTED)


def txt(value):
    """Escape for ReportLab markup; shape Arabic-script runs so they read right-to-left."""
    s = '' if value is None else str(value)
    if ARABIC.search(s):
        s = get_display(arabic_reshaper.reshape(s))
    return escape(s)


def local(iso):
    if not iso:
        return '—'
    dt = datetime.fromisoformat(iso.replace('Z', '+00:00'))
    return dt.astimezone(TZ).strftime('%d/%m/%Y %H:%M')


def bullets(items, empty='—'):
    items = [i for i in items if i]
    if not items:
        return [Paragraph(empty, small)]
    return [Paragraph(f'• {txt(i)}', base) for i in items]


def section(title, flowables):
    return KeepTogether([Paragraph(title, h2), *flowables])


def two_columns(left_title, left, right_title, right):
    t = Table([[Paragraph(left_title, label), Paragraph(right_title, label)], [left, right]], colWidths=[87 * mm, 87 * mm])
    t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]))
    return t


def qr(link, size=26 * mm):
    w = QrCodeWidget(link)
    x1, y1, x2, y2 = w.getBounds()
    d = Drawing(size, size, transform=[size / (x2 - x1), 0, 0, size / (y2 - y1), 0, 0])
    d.add(w)
    return d


def build(case, report, referral, audience='patient', staff_view=None):
    """report = services.report_view(case); referral = current referral or None; staff_view = services.staff_case_view."""
    buf = io.BytesIO()
    generated = datetime.now(timezone.utc).astimezone(TZ).strftime('%d/%m/%Y à %H:%M')
    r = report['report']
    level_label, level_color = LEVELS.get(r['risk']['level'], LEVELS['UNCERTAIN'])

    def frame(canvas, doc):
        canvas.saveState()
        canvas.setFont('DejaVu', 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, 10 * mm, f"Sahhanito · {report['referenceCode']} · généré le {generated} · "
                                            + ('version patient' if audience == 'patient' else 'version équipe soignante (confidentiel)'))
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f'Page {doc.page}')
        canvas.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                            title=f"Sahhanito {report['referenceCode']}", author='Sahhanito', subject='Rapport de triage')
    story = []

    # Header: logo, title, case code, QR to the case page
    head = Table([[
        Image(str(ASSETS / 'mascot.png'), width=16 * mm, height=16 * mm),
        [Paragraph('Rapport de triage', h1),
         Paragraph(f"Dossier <b>{txt(report['referenceCode'])}</b> · ouvert le {local(case['createdAt'])}", base),
         Paragraph('Version patient' if audience == 'patient' else 'Version équipe soignante · confidentiel', small)],
        qr(report['caseLink']),
    ]], colWidths=[20 * mm, 128 * mm, 28 * mm])
    head.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
    story += [head, Spacer(1, 4 * mm)]

    # Level banner
    banner = Table([[Paragraph(f'<font color="white"><b>{txt(level_label)}</b></font>', ParagraphStyle('b', parent=base, fontSize=12, leading=16)),
                     Paragraph(f'<font color="white">{txt(r["summary"])}</font>', base)]], colWidths=[40 * mm, 134 * mm])
    banner.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(level_color)), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                                ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6), ('LEFTPADDING', (0, 0), (-1, -1), 8)]))
    story.append(banner)

    story.append(section('Motif de recours', [Paragraph(f'« {txt(r["chiefComplaint"])} »', base)]))
    if r['redFlags']:
        story.append(section("Signes d'alerte", bullets(r['redFlags'])))
    story.append(Spacer(1, 2 * mm))
    story.append(two_columns('SYMPTÔMES SIGNALÉS', bullets(r['positives']), 'SYMPTÔMES ABSENTS', bullets(r['negatives'])))
    story.append(Spacer(1, 2 * mm))
    story.append(two_columns('ANTÉCÉDENTS · INFORMATIONS RECUEILLIES', bullets(r['history']), 'TRAITEMENTS', bullets(r['medications'])))

    # Orientation
    if referral:
        from app.services import JOURNEY_STATUS
        rows = [['Hôpital', referral['facilityName']], ['Statut', JOURNEY_STATUS.get(referral['status'], referral['status'])],
                ['Venue', ARRIVAL.get(referral['arrivalMode'] or '', 'En attente de la décision des urgences')],
                ['Distance · durée', f"{staff_view['referral']['distanceKm'] if staff_view else '?'} km · ~{referral['etaMinutes']} min"],
                ['Raison du choix', referral['matchReason']]]
        if referral.get('acceptNote'):
            rows.append(['Consigne', referral['acceptNote']])
        t = Table([[Paragraph(txt(a), label), Paragraph(txt(b), base)] for a, b in rows], colWidths=[38 * mm, 136 * mm])
        t.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -2), 0.3, BORDER), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
        story.append(section('Orientation', [t]))

    story.append(section('Conduite à tenir', bullets(r['recommendedActions'])))

    if audience == 'staff' and staff_view:
        a = staff_view['case']['assessment']
        pct = lambda x: '—' if x is None else f'{round(x * 100)} %'
        rules = [f"{x['id']} {x['name']} ({x['severity']})" + (f" — « {', '.join(x.get('evidence') or [])} »" if x.get('evidence') else '')
                 for x in a.get('triggeredRules') or []]
        decided = [Paragraph(f"Modèle NLP : {pct(a.get('pNlp'))}{'' if a.get('pNlp') is not None else ' (' + txt(a.get('nlpStatus')) + ')'} · "
                             f"règles : {pct(a.get('sRule'))} · score fusionné : {pct(a.get('pFinal'))} · incertitude : {txt(a.get('uncertainty'))}", base),
                   *bullets(rules, 'Aucune règle déclenchée.')]
        if a.get('uncertaintyReasons'):
            decided.append(Paragraph('Incertitude : ' + txt(' ; '.join(a['uncertaintyReasons'])), small))
        if staff_view['case'].get('review'):
            rv = staff_view['case']['review']
            decided.append(Paragraph(f"Vérifié par {txt(rv['by'])} : {txt(rv.get('note') or rv['level'])}", base))
        decided.append(Paragraph('Scores non calibrés cliniquement : aide à la décision, pas une probabilité.', small))
        story.append(section('Comment le niveau a été décidé', decided))

        if len(staff_view['journey']) > 1:
            story.append(section('Parcours du dossier', bullets(
                [f"{j['facilityName']} · {j['statusLabel']} · {local(j['sentAt'])}" + (f" · {j['decidedBy']}" if j['decidedBy'] else '')
                 + (f" — {j['reason']}" if j['reason'] else '') for j in staff_view['journey']])))

        transcript = [Paragraph(f"<font color='#6B7280'>{local(t['createdAt'])[-5:]}</font> <b>{'Patient' if t['role'] == 'PATIENT' else 'Assistant' if t['role'] == 'ASSISTANT' else 'Système'} :</b> {txt(t['text'])}", base)
                      for t in staff_view['transcript']]
        story.append(Paragraph('Conversation de triage', h2))
        story += transcript or [Paragraph('—', small)]

        chat = [m for m in staff_view['chat'] if m['sender'] != 'SYSTEM' or m['kind'] == 'RED_FLAG']
        if chat:
            story.append(Paragraph('Échanges avec les urgences', h2))
            who = {'PATIENT': 'Patient', 'STAFF': 'Urgences', 'SYSTEM': 'Alerte'}
            for m in chat:
                name = m.get('senderName') or who[m['sender']]
                story.append(Paragraph(f"<font color='#6B7280'>{local(m['createdAt'])[-5:]}</font> <b>{txt(name)} :</b> {txt(m['text'])}"
                                       + (f" <font color='#6B7280'>(choix : {txt(' / '.join(m['options']))})</font>" if m.get('options') else ''), base))

    story += [Spacer(1, 6 * mm), Paragraph(txt(r['disclaimer']), small),
              Paragraph(f"Dossier en ligne : {txt(report['caseLink'])}", small)]
    doc.build(story, onFirstPage=frame, onLaterPages=frame)
    return buf.getvalue()


def filename(report, audience):
    return f"sahhanito-{report['referenceCode']}-{'patient' if audience == 'patient' else 'equipe'}.pdf"


def facility_name(key):
    return hospitals.FACILITIES.get(key, {}).get('name', key)

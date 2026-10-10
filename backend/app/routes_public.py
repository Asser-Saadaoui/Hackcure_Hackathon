"""Public case page behind the QR code: read-only, unguessable token, no personal data stored."""
from html import escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import services
from app.db import get_db
from app.models import Case

router = APIRouter()
COLORS = {'EMERGENCY': '#DC2626', 'HIGH': '#EA580C', 'LOW': '#16A34A', 'UNCERTAIN': '#64748B'}


@router.get('/p/{token}.pdf')
def public_case_pdf(token: str, db: Session = Depends(get_db)):
    case = db.scalar(select(Case).where(Case.public_token == token))
    if not case:
        raise HTTPException(404, 'Not found')
    return services.report_pdf(db, case, 'patient')


@router.get('/p/{token}', response_class=HTMLResponse)
def public_case(token: str, db: Session = Depends(get_db)):
    case = db.scalar(select(Case).where(Case.public_token == token))
    if not case:
        raise HTTPException(404, 'Not found')
    rep = services.report_view(case)
    r = rep['report']

    def items(xs):
        return ''.join(f'<li>{escape(str(x))}</li>' for x in xs) or '<li>—</li>'

    level = r['risk']['level']
    return f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Sahhanito · {escape(rep['referenceCode'])}</title>
<style>body{{font-family:Inter,system-ui,sans-serif;background:#F9FAFB;color:#111827;margin:0;padding:16px}}main{{max-width:640px;margin:auto}}
.card{{background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:12px 0}}h1{{font-size:20px;margin:0}}
.badge{{display:inline-block;color:#fff;background:{COLORS.get(level, '#64748B')};border-radius:999px;padding:2px 10px;font-weight:600;font-size:13px}}
h2{{font-size:13px;text-transform:uppercase;color:#6B7280;margin:0 0 8px}}small{{color:#6B7280}}</style></head><body><main>
<h1>Sahhanito · {escape(rep['referenceCode'])}</h1><p><span class="badge">{escape(level)}</span> {escape(rep['facilityName'] or '')}</p>
<div class="card"><h2>Résumé</h2><p>{escape(r['summary'])}</p></div>
<div class="card"><h2>Signes d’alerte</h2><ul>{items(r['redFlags'])}</ul></div>
<div class="card"><h2>Symptômes signalés</h2><ul>{items(r['positives'])}</ul><h2>Absents</h2><ul>{items(r['negatives'])}</ul></div>
<div class="card"><h2>Antécédents · traitements</h2><ul>{items(r['history'] + r['medications'])}</ul></div>
<div class="card"><h2>Conduite à tenir</h2><ul>{items(r['recommendedActions'])}</ul></div>
<p><a href="/p/{escape(token)}.pdf" style="color:#177082;font-weight:600">Télécharger le rapport PDF</a></p>
<small>{escape(r['disclaimer'])}</small></main></body></html>"""

"""Exploratory weak-label fusion. Never changes runtime fusion or the frozen ensemble.

Run with --data train.csv --splits integration_v3/data_splits.csv --output DIR.
Only validation_selection cases are eligible. They were previously inspected:
cross-validation here is exploratory, not independent clinical/test validation.
"""
import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from scipy.special import expit, logit
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import GridSearchCV, StratifiedGroupKFold
from threadpoolctl import threadpool_limits

EPS = 1e-4
SEED = 42
GRID = [.01, .1, 1., 10., 100.]


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def score_rows(data, splits):
    from clinical_state import update_patient_state, facts_to_info
    from triage_pipeline import load_state_model, to_features, predict_from_state
    from rule_engine import evaluate
    bundle = load_state_model()
    rows, features, smoke = [], [], None
    for number, record in enumerate(splits.itertuples(), 1):
        question = data.iloc[record.source_record_index].question_en
        state = update_patient_state(None, question)
        target = state['patient_experiencer']
        understood = any(f['kind'] in {'symptom', 'condition', 'medication', 'vital'}
                         and f['experiencer'] == target and f['temporality'] == 'current'
                         and f['status'] in {'confirmed', 'negated'} for f in state['facts'])
        if not understood or state.get('nlp_requires_clarification', False):
            continue  # Preserve abstention: never impute a missing model score.
        rules = evaluate(state)
        facts = [f for f in state['facts'] if not f.get('semantic_candidate')]
        info = facts_to_info(facts, target)
        info['observations'] = state.get('observations', state['facts'])
        features.append(to_features(info))
        if smoke is None:
            smoke = predict_from_state(state, bundle)['model_score_emergency']
        rows.append(dict(source_record_index=record.source_record_index,
                         case_id=record.case_id, y=int(record.emergency_label),
                         s_rule=rules['s_rule'], critical=rules['critical']))
        if number % 250 == 0:
            print(f'Extracted {number}/{len(splits)} cases', flush=True)
    result = pd.DataFrame(rows)
    model = bundle['model']
    raw = (model.model if hasattr(model, 'model') else model).predict_proba(features)[:, 1]
    result['p_nlp'] = model.calibrator.transform(raw) if hasattr(model, 'calibrator') else raw
    assert np.isclose(result.p_nlp.iloc[0], smoke), 'Batch and runtime scores differ'
    return result


def fit(x, y, groups):
    cv = StratifiedGroupKFold(5, shuffle=True, random_state=SEED)
    search = GridSearchCV(LogisticRegression(max_iter=2000, class_weight=None),
                          {'C': GRID}, scoring='neg_brier_score', cv=cv, n_jobs=1)
    search.fit(x, y, groups=groups)
    return search.best_estimator_


def compare(frame):
    y, groups = frame.y.to_numpy(), frame.case_id.to_numpy()
    x = np.column_stack([logit(np.clip(frame.p_nlp, EPS, 1-EPS)), frame.s_rule])
    result = {}
    for name, columns in [('nlp_only', [0]), ('rules_only', [1]), ('fusion', [0, 1])]:
        xx = x[:, columns]
        oof, fold_coefs = np.zeros(len(y)), []
        for train, valid in StratifiedGroupKFold(5, shuffle=True, random_state=SEED).split(xx, y, groups):
            model = fit(xx[train], y[train], groups[train])
            oof[valid] = model.predict_proba(xx[valid])[:, 1]
            fold_coefs.append([float(model.intercept_[0]), *model.coef_[0].tolist()])
        model = fit(xx, y, groups)
        result[name] = dict(cv_brier=float(brier_score_loss(y, oof)),
                            cv_auc=float(roc_auc_score(y, oof)), C=float(model.C),
                            coefficients=[float(model.intercept_[0]), *model.coef_[0].tolist()],
                            fold_coefficients=fold_coefs)
        if name == 'fusion':
            rng = np.random.default_rng(SEED)
            samples = []
            # Cases were deduplicated and case IDs are unique: case bootstrap = row bootstrap.
            for _ in range(200):
                idx = rng.integers(0, len(y), len(y))
                bootstrap = LogisticRegression(C=model.C, max_iter=2000).fit(xx[idx], y[idx])
                samples.append([float(bootstrap.intercept_[0]), *bootstrap.coef_[0].tolist()])
            result[name]['bootstrap_95'] = np.quantile(samples, [.025, .975], axis=0).T.tolist()
            folds = np.array(fold_coefs)[:, 1:]
            unstable = (np.ptp(folds, axis=0) > 3) & (np.std(folds, axis=0) > .5 * np.maximum(abs(np.mean(folds, axis=0)), .1))
            result[name]['unstable_fold_weights'] = bool(unstable.any())
    result['raw_nlp'] = dict(brier=float(brier_score_loss(y, frame.p_nlp)),
                              auc=float(roc_auc_score(y, frame.p_nlp)))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', required=True, type=Path)
    parser.add_argument('--splits', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    data = pd.read_csv(args.data)
    manifest = json.loads((args.splits.parent / 'metrics.json').read_text())
    assert digest(args.data) == manifest['source_sha256'], 'Dataset differs from model provenance'
    splits = pd.read_csv(args.splits)
    eligible = splits[splits.split == 'validation_selection'].copy()
    assert eligible.case_id.is_unique, 'Expected one row per question group'
    forbidden = set(splits.loc[splits.split != 'validation_selection', 'case_id'])
    assert not set(eligible.case_id) & forbidden
    assert (data.iloc[eligible.source_record_index].urgency.eq('emergency').astype(int).to_numpy()
            == eligible.emergency_label.to_numpy()).all()
    with threadpool_limits(limits=2):
        frame = score_rows(data, eligible)
        frame.to_csv(args.output / 'fusion_inputs.csv', index=False)
        noncritical = frame[~frame.critical].copy()
        reports = {name: compare(part) for name, part in [('all', frame), ('noncritical', noncritical)]}
    report = dict(status='exploratory_weak_label_fit', independent_test=False,
                  limitations=['Rule-derived targets overlap safety rules',
                               'Validation-selection cases previously inspected',
                               'English question inputs only; not language/clinical validation'],
                  eligible=len(eligible), abstentions=len(eligible)-len(frame),
                  scored=len(frame), critical=int(frame.critical.sum()),
                  emergency=int(frame.y.sum()), correlation=float(frame[['p_nlp', 's_rule']].corr().iloc[0,1]),
                  rule_distribution=frame.groupby('s_rule').y.agg(['count', 'mean']).reset_index().to_dict('records'),
                  comparisons=reports)
    (args.output / 'fusion_report.json').write_text(json.dumps(report, indent=2))
    if any(r['fusion']['unstable_fold_weights'] for r in reports.values()):
        print('STOP: fold weights swing substantially. Read fusion_report.json; no coefficients exported.')
        return
    chosen = reports['noncritical']['fusion']
    b0, b1, b2 = chosen['coefficients']
    prevalence = float(noncritical.y.mean())
    coefs = dict(b0=b0, b1=b1, b2=b2, eps=EPS, prevalence=prevalence, C=chosen['C'],
                 n_train=len(noncritical), cv_brier=chosen['cv_brier'], test_brier=None, test_auc=None,
                 date=datetime.now(ZoneInfo('Africa/Tunis')).date().isoformat(),
                 centered_bias=b0+b1*logit(prevalence), bootstrap_95=chosen['bootstrap_95'],
                 fit_population='noncritical, scored validation_selection cases',
                 clinical_validation=False, deployment_approved=False,
                 source_sha256=digest(args.data), model_sha256=digest(Path(__file__).parent/'candidate_model.joblib'))
    (args.output / 'fusion_coefs.json').write_text(json.dumps(coefs, indent=2))
    print(json.dumps(coefs, indent=2))


if __name__ == '__main__':
    main()

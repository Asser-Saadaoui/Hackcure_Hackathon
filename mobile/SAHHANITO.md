# Sahhanito — صحة نيتو / Hassanito integration

Existing Expo SDK 57 / React Native / Expo Router app, npm. No stack rewrite.

## Run the working local prototype

In `ai/`, use the existing Python environment with `requirements.txt` installed:

```sh
python serve.py
```

In another terminal, in `mobile/`:

```sh
npm ci
npm run web
```

Open `http://localhost:8081/welcome?lang=en` (or `lang=darija` / `lang=ar`).
The default API mode is `ai`, using `http://127.0.0.1:8000`. The bridge binds only
to loopback, permits local Expo origins, retains state in caller memory and logs no
patient text. This is a development bridge, not a deployed/authenticated backend.
Refreshing loses real-AI cases. French UI remains available, but French clinical
extraction explicitly requests a supported language instead of using mock scores.

For the original simulated hospital demo, set `EXPO_PUBLIC_API_MODE=mock` before
starting Expo. Every relevant screen identifies the simulation. `EXPO_PUBLIC_AI_URL`
can configure an approved backend later; do not put keys in public Expo variables.
No hospital reports, acceptance, emergency dispatch, or clinician review are connected
in real AI mode. A non-critical finished turn is a prototype assessment requiring a
future decision policy, not a claim of medical safety or active clinician review.

## Mascot

- `src/components/hassanito-state.ts`: six app states and localized accessible copy.
- `hassanito.web.tsx`: actual `page-mascot` component, using only supported props;
  development selector, adjacent status bubble, reduced-motion CSS.
- `hassanito.tsx`: static neutral native fallback using the same atlas and state text.
- `assets/mascots/`: two transparent, aligned 3×3 WebP atlases, about 530 KiB total.

Cursor tracking/click reactions are web-only. Critical state bypasses Page Mascot
entirely: neutral still frame, readable warning and existing call button. No walking,
flying, dragging, or claim that Hassanito is a doctor. App states use text/CSS rather
than a fictional emotion API. Hospital matching/waiting states are simulated only.

Generated from the supplied owl identity and validated with the official
[Page Mascot skill](https://github.com/nilbuild/page-mascot/tree/main/skills/page-mascot).
Source directions passed alpha/edge screening and 0.8% shoulder variation. Built pair:
0.00 rendered px click shift, 80.6% palette match, 5.9% width difference. Left/right
gaze and compositing on a white background were manually checked. Source PNGs and
reference photos remain local outside runtime delivery.

## AI contract and validation

`src/lib/ai-api.ts` sends state plus the exact pending question ID to `process_turn()`.
Rich evidence, facts, independent rules, ML scores and calibration metadata remain in
`CaseDetail.pipeline`. Critical rule flags route immediately to emergency instructions;
ML scores are never turned into `pFinal` or a clinically validated probability.
The ensemble, threshold 0.15, extraction, feature projection and model hashes are unchanged.
Previous ML feature regression remains unresolved. No clinical validation is claimed.

```sh
npx expo lint
npx tsc --noEmit
npx expo export --platform web
node --test tests/integration.test.cjs
# With python serve.py running:
TEST_LIVE_AI=1 node --test tests/integration.test.cjs
# PowerShell: $env:TEST_LIVE_AI='1'; node --test tests/integration.test.cjs
```

The existing AI tests remain in `ai/test_integration.py` (`python -m unittest`).
Validation: 104 root AI tests, 29 portable AI tests and 7 frontend/bridge tests passed.
Lint, TypeScript checking and web export passed. Browser testing verified an unknown
reply repeats the linked question, and a Tunisian breathing complaint interrupts to
readable emergency instructions with a still mascot. Seven-turn AI conversations in
English, Arabizi and Arabic-script Darija passed the portable tests.

Native Android/iOS runtime builds require separate device testing. Existing Leaflet
CSS asset warnings appeared during initial exports. npm reported 30 dependency audit
findings (11 moderate, 19 high); no automatic major upgrades were made. Reduced motion
is implemented in CSS and the package, but not tested under an OS preference change.

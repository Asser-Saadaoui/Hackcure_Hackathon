# Sahhanito patient experience and Hassanito

This integration continues `feat/sahhanito-platform`, based on main's merged platform and UX branches (`81686c3`). It includes `feat/decision-fusion`, `feat/patient-app`, and the latest AI finalization. Existing backend contracts, review, referral, report, chat, and tracking workflows are preserved. The separate `feat/app-integration` branch has unrelated Git history and removes current services; it was reviewed but not merged wholesale.

## Run

Use the service commands in the root README. In `mobile/`, run `npm ci`, set `EXPO_PUBLIC_API_URL` to your backend origin in an ignored `.env.local`, and run `npm run web` or `npm start`. A phone needs your computer's LAN address, not `localhost`. The patient app uses the HTTP backend only; offline mock and developer routes were removed upstream. Configure the API URL as described in the mobile README.

`npm run web:build` exports for same-origin deployment on Windows or Unix. An explicitly set API URL takes precedence. `npm run android:apk` uses EAS; account credentials and signing are required. Native bundle exports are not installable APKs and do not demonstrate device compatibility.

## Files and behavior

- `src/components/platform-shell.tsx`: PCDent-inspired patient workspace with collapsible desktop navigation, mobile bottom navigation, RTL layout, and existing Expo Router routes. Consent is checked before opening symptom intake from navigation.
- `src/app/home.tsx`: responsive patient dashboard, actual device-scoped case counts and recent activity from `api.listCases()`, explicit loading/error/empty states, and emergency-contact action. No invented clinical metrics, appointments, or hospital capacity. First use still presents consent; subsequent launches open the dashboard.
- `history.tsx`: search by case code or hospital. Emergency history entries still open the emergency screen.
- Intake keeps its companion and new-conversation action outside the scrolling message list. The complete visual identity uses deep blue, ice blue, and coral from `sahhanito_mascot_starter.zip`, with a bilingual Sahha/nito wordmark and a small SVG heartbeat signature. Shared tokens restyle the screens and staff portal. The design retains PCDent's navigation and dashboard structure without copying its medical workflows or adding dependencies.
- Dashboard summaries are memoized, calculated from one case response, and protected against stale or unfocused requests. Retained screens pause their mascot animations and unmount the pointer-tracking component while unfocused. There is no new polling loop or animation library.

- `src/components/hassanito-state.ts`: six app states, translated companion messages, native atlas cells, emergency precedence over development previews.
- `hassanito.web.tsx`: the real `page-mascot` component using only `directions`, `reactions`, `size`, `label`, and `className`. Normal idle/listening states track the cursor and react to clicks. App-owned thinking/guiding/happy states select explicit atlas frames, with gentle thinking tilt and a short completion bounce. A larger hero presentation follows the starter demo's prominent owl/speech bubble. Emergency and reduced-motion settings render a still frame. Patient-facing developer controls were removed upstream and remain absent.
- `hassanito.tsx`: explicit native atlas states, hero/inline presentation, gentle 3-pixel floating motion, thinking opacity animation, and system reduced-motion support. Alert states remain still. Web uses CSS transforms and Page Mascot's pointer reactions.
- `assets/mascots/`: the two transparent 3×3 atlases; about 544 KB combined. The official Page Mascot validator measures 0.00 px body shift at 140 px, 92.5% minimum overlap, 80.6% palette match, and 5.9% shoulder-width difference.
- `prototype-notice.tsx`: keeps clinical-validation and simulated hospital/ambulance limitations visible.
- Existing screens map intake/typing to listening, sending to thinking, follow-ups and care to guiding, routine completion to happy, and emergency to alert. Waiting for hospital response uses explicit text. GPS is requested after the patient taps the location action.
- Staff dashboard uses the same still portrait and bilingual brand. Its authenticated workflow is retained.

The mascot is a companion, not a doctor. It does not determine triage, change ML features, or replace emergency instructions. No walking, flying, or dragging has been added. The preview selector exists only in development.

## Verify

From `mobile/`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run web:build`. Export native bundles with `npx expo export --platform android --platform ios --output-dir dist-native`.

From `ai/`: `python -m pytest -q` (or the documented unittest commands).

From `backend/`: `python -m pytest -q`. The live tests are opt-in: set `LIVE_API_URL` to a disposable local backend with actual AI and simulator running, then run `python -m pytest tests/test_live_pipeline.py -q`. These create synthetic cases, not real patient data. They verify emergency interruption in three languages, hospital referral, and clarification of unfamiliar input. Existing backend tests use controlled AI/simulator doubles to cover staff acceptance, rerouting, review, tracking, reports, and authorization.

## Validation and limits

On the merged platform/UX base: 57 AI tests plus 54 subtests, 5 controlled backend tests, 4 actual-service contracts, and 2 mascot contract tests passed. Patient lint/typechecking, web export, dashboard build, and Android/iOS bundle exports passed. Desktop navigation, English clarification and emergency interruption, and Arabic phone-width dashboard were inspected in the browser. These are engineering checks with synthetic cases, not clinical validation or native-device testing.

No model was retrained or retuned. The original ensemble, 0.15 experimental threshold, abstention, feature compatibility, and calibration metadata are retained. Earlier ML context-feature regression remains unresolved; scores are not medically validated probabilities. Vocabulary and context coverage remain finite.

Hospital capacity and ambulance movement are simulated. Staff acceptance is an application event, not proof that a real hospital has received or accepted a patient. No emergency dispatch occurs. Optional existing LLM phrasing was disabled during local actual-service tests; no API key is needed for template mode. No deployment, signed APK, real-device test, or clinical validation is claimed.

Known tooling warnings: Expo reports unused Leaflet CSS image URLs (the maps use div icons), and the existing dependency tree has npm audit findings. No breaking dependency upgrade was applied. Browser map tiles require an internet connection.

## PR #9 compatibility merge

Merged main through 931b674, preserving ambulance tracking, staff triage feedback, explanation support, native Leaflet maps, and Android local-network HTTP configuration. Retained the redesigned shell and home route, focus-aware mascot, prototype limitations, and critical case resume handling. Removed obsolete dev/hub registrations, mock references, and the patient mascot preview to respect the upstream cleanup.

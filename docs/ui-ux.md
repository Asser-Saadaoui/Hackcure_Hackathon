# Patient and urgences UX pass

Local changes only; AI extraction, rules, fusion weights, thresholds and backend decisions are unchanged. No dependencies were added.

## Patient
- Welcome explains the three steps, when to call 190, preparation and information sharing, with four synchronized translations.
- The emergency action stays outside the Welcome scroll area. A persistent emergency action also covers small-screen patient routes; desktop retains the existing sidebar action.
- Hospital status reads `/api/v1/health` on focus, refreshes every minute, times out, and supports retry. It reports configured hospitals and simulator connectivity, never promised capacity or acceptance.
- History distinguishes loading, request failure, no history and no search matches. Stale responses are ignored. Buttons support Arabic typography and wrapping; language radios expose checked state.

## Staff
- A persisted French/Arabic/Darija/English picker works before and after login. Arabic and Darija use RTL, logical spacing and localized relative dates.
- Patient queue filters expose selection and support case-code/complaint search and reset.
- Resource-specific loading, refresh, last-updated and stale-data errors replace silent failures. Old responses cannot replace newer requests; logout/expired sessions clear displayed case data. Availability edits remain protected from polling.
- Requests time out after 15 seconds. Clinical review buttons are disabled during submission; rerouting cannot submit before alternatives load.
- Keyboard focus, skip link, larger touch targets, labelled inputs and reduced-motion support were added.
- Clinical reports, manually written messages, server details and saved department replies stay in their original language. Preset questions are sent in the patient language, independently from the staff interface. Backend enums and recorded reason values are preserved.

## Verification
`mobile/`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run web:build`.
`dashboard/`: `npm test`, `npm run build` (includes TypeScript; no separate lint script configured).
Browser checks: Welcome in all four languages; phone-size RTL; fixed emergency action after scrolling; staff login and queue, availability and live network with a synthetic local account. No consent accepted, clinical decision submitted, notification permission granted or emergency call made.

Native export is a bundling check, not a physical-device test. Translation copy still needs native-speaker review. Existing consent wording was retained and does not establish verified anonymization or a privacy guarantee. Leaflet export reports its pre-existing CSS asset warnings; maps depend on external OpenStreetMap tiles. No clinical validation is claimed.

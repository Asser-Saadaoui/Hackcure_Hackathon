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

## Floating desktop companion
Hassanito uses the existing screen-owned state and sprite sheets as a free-floating character at the page edge at web widths of 1400px and above (ordinary text scale). There is no panel, background or extra sidebar. React's existing DOM portal escapes scrolling and route transforms; inactive screens do not render an extra companion. The character remains above the emergency-call bar. Arabic/Darija mirror the placement. His status text remains accessible to screen readers; smaller screens retain the inline mascot and speech bubble. Emergency screens retain their calm inline presentation; reduced-motion behavior is preserved. Only React DOM type declarations were added as a development dependency, with no new runtime package.
### Patient care network

The home screen illustrates patient → Sahhanito → hospital, clinic, emergency, and doctor routes. It is explanatory, not a live connection or confirmed referral. Copy lives in the four-language `mobile/src/i18n/experience.ts` catalog.

`care-network.web.tsx` uses a lightweight adaptation of the supplied Magic UI Animated Beam (MIT), retaining ref-based endpoint measurement and curved SVG paths without adding Motion. Reduced-motion preference disables the animated gradient; RTL reverses the layout and beam direction. `care-network.tsx` provides a static native SVG companion. Neither changes triage, referrals, or hospital availability.
### Particle welcome hero

The existing Welcome entry uses a navy hero with blue Floating 3D Particles adapted from the supplied Magic UI component (MIT). The decoration stays behind the introduction; consent, emergency contact, information cards, and entry routing are preserved. It appears only on Welcome.

The canvas caps rendering at 30fps, caps DPR at 2, reduces particle count on phone widths, and stops scheduling frames when hidden, off-screen, or reduced motion is enabled. Native screens use static SVG decoration. No dependency was added.

# Sahhanito — صحة نيتو

HackCure's Tunisian triage prototype combines the existing Expo patient app in `mobile/` with the existing NLP, patient state and ML ensemble in `ai/`. Hassanito is the owl companion.

Start `python serve.py` in `ai/` using its documented Python environment, then `npm ci` and `npm run web` in `mobile/`. See [integration instructions](mobile/SAHHANITO.md) for commands, validation, mascot assets and limitations. Existing architecture and product documentation remain in `docs/`.

Default mode uses the local AI pipeline. Hospital acceptance, clinician review, dispatch and reports are not connected. The original hospital simulation is available explicitly through `EXPO_PUBLIC_API_MODE=mock`. This prototype has no clinical validation; ML scores are not medical probabilities.

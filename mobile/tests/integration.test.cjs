const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const path = require('node:path');

function loadTS(relative) {
  const filename = path.resolve(__dirname, relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = new Module(filename);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(path.dirname(filename));
  module._compile(source, filename);
  return module.exports;
}
const { resolveMascotState, MASCOT_STATES, mascotCopy } = loadTS('../src/components/hassanito-state.ts');
const { mapPipelineTurn, aiApi } = loadTS('../src/lib/ai-api.ts');
const sample = (critical, score, next = null) => ({ patient_state: {}, rules: { critical_flags_detected: critical },
  ml: { status: 'ok', emergency_score: score }, next_question: next });

test('critical mascot state cannot be overridden by the development selector', () => {
  for (const preview of MASCOT_STATES) assert.equal(resolveMascotState('alert', preview), 'alert');
});
test('every app state has English, French and Tunisian copy', () => {
  for (const language of ['en', 'fr', 'ar', 'darija']) for (const state of MASCOT_STATES) assert.ok(mascotCopy(language, state));
});
test('critical flag interrupts a pending question even if ML score is low or unavailable', () => {
  for (const score of [null, 0, 1]) {
    const result = sample(true, score, { id: 'q', text: 'Question' });
    result.ml.status = 'unavailable';
    assert.equal(mapPipelineTurn(result, 'c').kind, 'emergency');
  }
});
test('ML score alone never manufactures a clinical LOW or EMERGENCY decision', () => {
  for (const score of [0, 0.15, 1]) {
    const result = mapPipelineTurn(sample(false, score), 'c');
    assert.equal(result.kind, 'under_review');
    assert.equal(result.decision.pFinal, null);
  }
});
test('clarification question preserves its linked question id', () => {
  const result = mapPipelineTurn(sample(false, null, { id: 'patient:q2', text: 'Please clarify' }), 'c');
  assert.equal(result.kind, 'question');
  assert.equal(result.turn.id, 'patient:q2');
});
test('real AI mode never simulates hospital acceptance or reports', async () => {
  await assert.rejects(aiApi.setLocation('c', {}), /not connected/);
  await assert.rejects(aiApi.getReport('c'), /not connected/);
});

test('live bridge preserves multi-turn state, abstains on unknown input and interrupts on critical Tunisian breathing',
  { skip: !process.env.TEST_LIVE_AI }, async () => {
    let result = await aiApi.createCase('I have mild headaches', 'en');
    assert.equal(result.kind, 'question');
    result = await aiApi.sendMessage(result.caseId, 'flibber blorp', 'en');
    assert.equal(result.kind, 'question');
    let detail = await aiApi.getCase(result.caseId);
    assert.equal(detail.pipeline.ml.status, 'insufficient_input');
    result = await aiApi.sendMessage(result.caseId, 'ma najamch netnaffes', 'darija');
    assert.equal(result.kind, 'emergency');
    detail = await aiApi.getCase(result.caseId);
    assert.equal(detail.pipeline.questioning_interrupted, true);
    assert.equal(detail.pipeline.ml.status, 'deferred_critical_fast_path');
    assert.equal(detail.referral, null);
  });

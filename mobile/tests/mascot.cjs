const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/components/hassanito-state.ts'), 'utf8');
const scope = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope);
const { MASCOT_STATES, resolveMascotState, mascotFrame, mascotCopy } = scope.exports;

test('development previews cannot override an emergency', () => {
  for (const preview of MASCOT_STATES) assert.equal(resolveMascotState('alert', preview), 'alert');
  assert.equal(mascotFrame('alert').sheet, 'directions');
  assert.equal(mascotFrame('alert').index, 4);
});
test('all states render valid native atlas cells and translated copy', () => {
  for (const state of MASCOT_STATES) {
    const frame = mascotFrame(state);
    assert.ok(frame.index >= 0 && frame.index <= 8);
    for (const language of ['en', 'fr', 'ar', 'darija']) assert.ok(mascotCopy(language, state).length > 10);
  }
  assert.match(mascotCopy('en', 'alert'), /190/);
  assert.match(mascotCopy('ar', 'alert'), /190/);
});

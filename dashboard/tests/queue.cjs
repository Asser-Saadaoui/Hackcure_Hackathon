const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {}, require: name => name.startsWith('@/') ? {} : require(name) };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/IncomingView.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
}).outputText, context);
const filter = context.exports.filterReferrals;
const rows = [
  { id:'a', referenceCode:'CASE-A', chiefComplaint:'ألم', level:'EMERGENCY', status:'ACCEPTED', unread:2 },
  { id:'b', referenceCode:'CASE-B', chiefComplaint:'Headache', level:'LOW', status:'INFO_REQUESTED', unread:0 },
  { id:'c', referenceCode:'CASE-C', chiefComplaint:'ألم', level:null, status:'SENT', unread:1 },
];
const ids = result => Array.from(result, row => row.id);
test('unread shortcut includes accepted cases and cases with no AI level', () => {
  assert.deepEqual(ids(filter(rows,'','ALL','ALL',true)), ['a','c']);
});
test('combined filters preserve Arabic text and existing urgency', () => {
  assert.deepEqual(ids(filter(rows,' ألم ','ALL','DECIDE',true)), ['c']);
  assert.deepEqual(ids(filter(rows,'case-a','EMERGENCY','ALL',true)), ['a']);
  assert.equal(rows[0].level,'EMERGENCY');
});
test('clearing filters restores all cases in their original order', () => {
  assert.deepEqual(ids(filter(rows,'','ALL','ALL',false)), ['a','b','c']);
  assert.deepEqual(ids(filter(rows,'unknown','ALL','ALL',false)), []);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('src/i18n.tsx', 'utf8');
const document = { documentElement: {} };
const saved = new Map();
const context = { exports: {}, require, document, localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) } };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
const i18n = context.exports;
test('all languages preserve message placeholders and have non-empty copy', () => {
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(x => x[1]).sort();
  for (const [key, translations] of Object.entries(i18n.TRANSLATIONS)) {
    for (const language of ['fr', 'en', 'ar', 'darija']) {
      assert.ok(translations[language]?.trim(), `${key}: ${language}`);
      assert.deepEqual(placeholders(translations[language]), placeholders(key), `${key}: ${language}`);
    }
  }
});
test('language switching persists and updates RTL without changing patient text', () => {
  for (const [language, dir] of [['ar', 'rtl'], ['darija', 'rtl'], ['en', 'ltr'], ['fr', 'ltr']]) {
    i18n.setLanguage(language);
    assert.equal(document.documentElement.dir, dir);
    assert.equal(saved.get('sahhanito.staff.language'), language);
    assert.equal(i18n.t('untranslated patient statement'), 'untranslated patient statement');
  }
});
test('preset questions can use patient language independently of staff language', () => {
  i18n.setLanguage('en');
  assert.equal(i18n.t('Êtes-vous seul(e) en ce moment ?', {}, 'darija'), 'إنت وحدك توا؟');
  assert.equal(i18n.getLanguage(), 'en');
  assert.equal(i18n.t('Réorienter vers {name}', { name: 'Hospital A' }), 'Reroute to Hospital A');
});

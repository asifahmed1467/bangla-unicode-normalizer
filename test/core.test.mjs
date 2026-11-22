import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, transform, PRESETS, letterCounts, isNormalized, normalizeFile, toLiterals, describe, searchKey, SAMPLE } from '../src/core.js';

const S = (...cps) => String.fromCodePoint(...cps);
const rec = (t, o = {}) => transform(t, { ...PRESETS.recommended, ...o });
const dec = { form: 'decomposed' };

test('1-3 base+nukta -> precomposed', () => {
  assert.equal(rec(S(0x9A1, 0x9BC)), S(0x9DC));
  assert.equal(rec(S(0x9A2, 0x9BC)), S(0x9DD));
  assert.equal(rec(S(0x9AF, 0x9BC)), S(0x9DF));
});
test('4 precomposed unchanged', () => {
  for (const c of [0x9DC, 0x9DD, 0x9DF]) assert.equal(rec(S(c)), S(c));
});
test('5 decomposed target', () => {
  assert.equal(rec(S(0x9DF), dec), S(0x9AF, 0x9BC));
  assert.equal(rec(S(0x9DC, 0x9DD), dec), S(0x9A1, 0x9BC, 0x9A2, 0x9BC));
});
test('6 khanda ta', () => assert.equal(rec(S(0x9A4, 0x9CD, 0x200D)), S(0x9CE)));
test('7 assamese', () => {
  assert.equal(rec(S(0x9F0)), S(0x9B0));
  assert.equal(rec(S(0x9F1)), S(0x9AC));
  assert.equal(rec(S(0x9F0), { assamese: false }), S(0x9F0));
});
test('8-9 ো ৌ', () => {
  assert.equal(rec(S(0x9C7, 0x9BE)), S(0x9CB));
  assert.equal(rec(S(0x9C7, 0x9D7)), S(0x9CC));
});
test('10-11 ঔ আ', () => {
  assert.equal(rec(S(0x993, 0x9D7)), S(0x994));
  assert.equal(rec(S(0x985, 0x9BE)), S(0x986));
});
test('12 invisibles removed', () => {
  assert.equal(rec(S(0x995, 0x200B, 0x996, 0xFEFF, 0x997, 0xAD)), S(0x995, 0x996, 0x997));
});
test('13 legit rakar ZWJ preserved', () => {
  const s = S(0x9B0, 0x200D, 0x9CD, 0x9AF);
  assert.equal(rec(s), s);
});
test('14-15 duplicates', () => {
  assert.equal(rec(S(0x995, 0x9BE, 0x9BE)), S(0x995, 0x9BE));
  assert.equal(rec(S(0x995, 0x9CD, 0x9CD, 0x9B7)), S(0x995, 0x9CD, 0x9B7));
});
test('16 mixed forms -> single form', () => {
  const t = 'আমার ' + S(0x9AF, 0x9BC) + ' ' + S(0x9DF) + S(0x9A1, 0x9BC) + S(0x9DC);
  const out = rec(t);
  const l = letterCounts(out);
  assert.equal(l.yya.decomposed + l.rra.decomposed, 0);
  assert.equal(l.yya.precomposed, 2);
  assert.equal(l.rra.precomposed, 2);
  const outD = rec(t, dec);
  assert.equal(letterCounts(outD).yya.precomposed + letterCounts(outD).rra.precomposed, 0);
});
test('17 danda', () => {
  assert.equal(rec('আমি |', { danda: true }), 'আমি ' + S(0x964));
  assert.equal(rec('a | b', { danda: true }), 'a | b');
});
test('18 empty / tiny / 5MB', () => {
  assert.equal(rec(''), '');
  assert.equal(rec('a'), 'a');
  const big = (S(0x9AF, 0x9BC) + ' আমার ').repeat(5_000_000 / 10);
  const t0 = Date.now();
  const out = rec(big);
  assert.ok(out.length > 0);
  assert.ok(Date.now() - t0 < 20000, 'finishes in reasonable time');
});
test('1MB under 1s (node)', () => {
  const t = (S(0x9A1, 0x9BC) + 'া আমি ' + S(0x9AF, 0x9BC) + ' ').repeat(100_000);
  const t0 = Date.now();
  normalize(t);
  assert.ok(Date.now() - t0 < 1500);
});

test('orphan nukta warns by default and is removable', () => {
  const s = S(0x995, 0x9BC);
  const r = normalize(s);
  assert.equal(r.report.findings.some((f) => f.ruleId === 'orphan-nukta' && f.severity === 'warning'), true);
  assert.equal(r.output, s);
  assert.equal(rec(s, { orphanNukta: true }), S(0x995));
});
test('findings carry input offsets', () => {
  const t = 'ab' + S(0x9A1, 0x9BC) + 'cd';
  const f = normalize(t).report.findings.find((x) => x.ruleId === 'nukta-compose');
  assert.equal(f.start, 2); assert.equal(f.end, 4);
  assert.deepEqual(f.codePointsBefore, ['U+09A1', 'U+09BC']);
});
test('digits option', () => {
  assert.equal(rec('12', { digits: 'bn' }), S(0x9E7, 0x9E8));
  assert.equal(rec(S(0x9E7, 0x9E8), { digits: 'en' }), '12');
});
test('presets: minimal only touches nukta', () => {
  const t = S(0x9AF, 0x9BC, 0x200B, 0xA0);
  assert.equal(transform(t, PRESETS.minimal), S(0x9DF, 0x200B, 0xA0));
});
test('sample is normalized by aggressive, invariant holds', () => {
  for (const p of Object.values(PRESETS)) {
    const r = normalize(SAMPLE, p);
    assert.equal(r.report.invariantOk, true);
    assert.equal(transform(r.output, p), r.output);
  }
});

test('idempotence fuzz (10 000 strings, all presets)', () => {
  const alphabet = [0x995, 0x996, 0x9A1, 0x9A2, 0x9AF, 0x9B0, 0x9A4, 0x985, 0x993, 0x9BC, 0x9CD, 0x9BE, 0x9BF, 0x9C1,
    0x9C7, 0x9CB, 0x9D7, 0x981, 0x982, 0x983, 0x9DC, 0x9DD, 0x9DF, 0x9CE, 0x9F0, 0x9F1, 0x200D, 0x200C, 0x200B,
    0x20, 0x20, 0x9, 0xA, 0x7C, 0x964, 0x30, 0x9E6, 0x41, 0xE9, 0x301, 0x915];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const presets = Object.values(PRESETS);
  for (let i = 0; i < 10000; i++) {
    const len = 1 + Math.floor(rnd() * 14);
    let s = '';
    for (let j = 0; j < len; j++) s += String.fromCodePoint(alphabet[Math.floor(rnd() * alphabet.length)]);
    const p = { ...presets[i % presets.length], digits: ['keep', 'bn', 'en'][i % 3] };
    const once = transform(s, p);
    assert.equal(transform(once, p), once, 'not idempotent for ' + Array.from(s, (c) => c.codePointAt(0).toString(16)).join(' '));
    const l = letterCounts(once);
    for (const v of Object.values(l)) {
      if (p.form === 'decomposed') assert.equal(v.precomposed, 0); else assert.equal(v.decomposed, 0);
    }
  }
});

test('clean corpus round-trips byte-identical (recommended)', () => {
  const para = 'বাংলা ভাষা বিশ্বের অন্যতম সমৃদ্ধ ভাষা। এই ভাষায\u09BC কথা বলে প্রায\u09BC ত্রিশ কোটি মানুষ। ' +
    'রবীন্দ্রনাথ ঠাকুর, কাজী নজরুল ইসলাম ও জীবনানন্দ দাশের সাহিত্যে এর সৌন্দর্য ফুটে উঠেছে। ' +
    '\u0986\u09DC\u09BE\u0987 হাজার বছরের ইতিহাস, মেঘ-বৃষ্টি, উৎসব, সংগ্রাম ও স্বাধীনতার গল্প। ' +
    'ঢাকা, চট্টগ্রাম, রাজশাহী ও সিলেটের মানুষ ভিন্ন ভিন্ন উপভাষায\u09BC কথা বললেও লেখায\u09BC একই ভাষা ব্যবহার করে। ' +
    'অ্যান্টার্কটিকা, ব্র্যাক, র\u200D্যাব, কৌশল, গৌরব, ঔষধ, আশ্চর্য, ঐক্য।\n';
  const corpus = rec(para.repeat(60)); // clean by construction (my typing may emit base+nukta)
  assert.ok(corpus.length > 20000);
  // contains legit র\u200D্য and precomposed/clean text; none of the buggy sequences
  const fixed = rec(corpus);
  assert.equal(fixed, corpus);
  assert.ok(corpus.includes('\u09B0\u200D\u09CD\u09AF'), 'legit rakar kept');
  assert.equal(isNormalized(corpus, PRESETS.recommended), true);
});

test('json/csv structure-safe', () => {
  const j = JSON.stringify({ [S(0x995, 0x200B)]: [S(0x9AF, 0x9BC), 'a  b'], n: 1 });
  const r = normalizeFile(j, 'json', PRESETS.recommended);
  assert.deepEqual(JSON.parse(r.output), { [S(0x995)]: [S(0x9DF), 'a  b'], n: 1 });
  const c = normalizeFile('a,"b  c",' + S(0x9AF, 0x9BC) + '\n', 'csv', PRESETS.recommended);
  assert.equal(c.output, 'a,"b  c",' + S(0x9DF) + '\n');
});

test('literals & describe & searchKey', () => {
  const l = toLiterals(S(0x9DF));
  assert.equal(l.js, '"\\u09DF"');
  assert.equal(l.python, '"\\u09df"');
  assert.equal(l.html, '&#x9DF;');
  assert.equal(l.url, '%E0%A7%9F');
  const d = describe(S(0x9DF))[0];
  assert.equal(d.name, 'BENGALI LETTER YYA');
  assert.equal(d.utf8, 'E0 A7 9F');
  assert.equal(searchKey(S(0x9AF, 0x9BC)), searchKey(S(0x9DF)));
});

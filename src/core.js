// BanglaNorm core — pure JS, zero dependencies, no DOM access.
// All Bengali code points are written as \u escapes on purpose: editors and
// clipboards may silently re-normalize the literal characters ড় ঢ় য়.
import { NAMES } from './unicode-names.js';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */
export const NUKTA = '\u09BC';
export const HASANTA = '\u09CD';

/** The three letters that have two valid encodings. */
export const LETTERS = {
  rra: { pre: '\u09DC', base: '\u09A1', name: 'RRA' },
  rha: { pre: '\u09DD', base: '\u09A2', name: 'RHA' },
  yya: { pre: '\u09DF', base: '\u09AF', name: 'YYA' },
};
const DEC_TO_PRE = { '\u09A1\u09BC': '\u09DC', '\u09A2\u09BC': '\u09DD', '\u09AF\u09BC': '\u09DF' };
const PRE_TO_DEC = { '\u09DC': '\u09A1\u09BC', '\u09DD': '\u09A2\u09BC', '\u09DF': '\u09AF\u09BC' };

// regex class fragments (strings, used inside RegExp / literals)
const VS = '\\u09BE-\\u09C4\\u09C7\\u09C8\\u09CB\\u09CC\\u09D7'; // vowel signs
const MK = '\\u0981\\u0982\\u0983'; // chandrabindu, anusvara, visarga

/* ------------------------------------------------------------------ *
 * Options & presets
 * ------------------------------------------------------------------ */
const BASE_OFF = {
  form: 'precomposed',
  khandaTa: false, invisibles: false, bidi: false, spaces: false, assamese: false,
  dupMarks: false, markOrder: false, composeVowelSigns: false, composeLetters: false,
  nfcOther: false, orphanNukta: false, trailingHasanta: false,
  danda: false, digits: 'keep', quotes: false,
  collapseSpaces: false, trimLines: false, collapseBlank: false, warnings: true,
};
export const PRESETS = {
  recommended: {
    ...BASE_OFF, khandaTa: true, invisibles: true, bidi: true, spaces: true, assamese: true,
    dupMarks: true, markOrder: true, composeVowelSigns: true, composeLetters: true,
    nfcOther: true, collapseSpaces: true, trimLines: true,
  },
  strict: {
    ...BASE_OFF, form: 'decomposed', invisibles: true, bidi: true, composeVowelSigns: true, nfcOther: true,
  },
  minimal: { ...BASE_OFF },
  aggressive: {
    ...BASE_OFF, khandaTa: true, invisibles: true, bidi: true, spaces: true, assamese: true,
    dupMarks: true, markOrder: true, composeVowelSigns: true, composeLetters: true, nfcOther: true,
    orphanNukta: true, trailingHasanta: true, danda: true, quotes: true,
    collapseSpaces: true, trimLines: true, collapseBlank: true,
  },
};
export const DEFAULTS = PRESETS.recommended;

export const GROUPS = [
  { id: 'letters', en: 'Letters & composition', bn: 'অক্ষর ও গঠন' },
  { id: 'invisible', en: 'Invisible characters', bn: 'অদৃশ্য ক্যারেক্টার' },
  { id: 'structure', en: 'Structure', bn: 'কাঠামো' },
  { id: 'punct', en: 'Punctuation & digits', bn: 'যতিচিহ্ন ও সংখ্যা' },
  { id: 'space', en: 'Whitespace', bn: 'হোয়াইটস্পেস' },
];

/** Metadata that drives the options drawer. */
export const OPTION_META = [
  { key: 'khandaTa', group: 'letters', en: 'Khanda Ta: ত + ্ + ZWJ → ৎ', bn: 'খণ্ড ত: ত + ্ + ZWJ → ৎ' },
  { key: 'assamese', group: 'letters', en: 'Assamese ৰ ৱ → Bangla র ব', bn: 'অসমীয়া ৰ ৱ → বাংলা র ব',
    hintEn: 'Turn off for genuine Assamese text.', hintBn: 'আসল অসমীয়া লেখায় বন্ধ রাখুন।' },
  { key: 'composeVowelSigns', group: 'letters', en: 'Compose ে+া → ো and ে+ৗ → ৌ', bn: 'ে+া → ো এবং ে+ৗ → ৌ' },
  { key: 'composeLetters', group: 'letters', en: 'Compose অ+া → আ and ও+ৗ → ঔ', bn: 'অ+া → আ এবং ও+ৗ → ঔ' },
  { key: 'nfcOther', group: 'letters', en: 'NFC for non-Bengali text', bn: 'বাংলা ছাড়া অংশে NFC' },
  { key: 'invisibles', group: 'invisible', en: 'Remove ZWSP, ZWNJ, BOM, soft hyphen, stray ZWJ', bn: 'ZWSP, ZWNJ, BOM, soft hyphen, বাড়তি ZWJ মুছুন',
    hintEn: 'Keeps the legitimate র‍্য (ra + ZWJ + ্ + য).', hintBn: 'বৈধ র‍্য (র + ZWJ + ্ + য) অক্ষত থাকে।' },
  { key: 'bidi', group: 'invisible', en: 'Remove bidi control marks (LRM, RLM, …)', bn: 'বাইডি কন্ট্রোল মার্ক মুছুন (LRM, RLM…)' },
  { key: 'spaces', group: 'invisible', en: 'Odd spaces (NBSP, thin, …) → normal space', bn: 'অদ্ভুত স্পেস (NBSP ইত্যাদি) → সাধারণ স্পেস' },
  { key: 'dupMarks', group: 'structure', en: 'Collapse duplicate vowel signs, hasanta & nukta', bn: 'দ্বিরুক্ত কার, হসন্ত ও নুকতা এক করুন' },
  { key: 'markOrder', group: 'structure', en: 'Order: vowel sign before ঁ ং ঃ', bn: 'ক্রম: কার, তারপর ঁ ং ঃ' },
  { key: 'orphanNukta', group: 'structure', en: 'Remove orphan nukta (not after ড ঢ য)', bn: 'এতিম নুকতা মুছুন (ড ঢ য ছাড়া)',
    hintEn: 'Off = only warn.', hintBn: 'বন্ধ = শুধু সতর্কতা।' },
  { key: 'trailingHasanta', group: 'structure', en: 'Remove hasanta at word end', bn: 'শব্দের শেষের হসন্ত মুছুন',
    hintEn: 'Off = only warn.', hintBn: 'বন্ধ = শুধু সতর্কতা।' },
  { key: 'warnings', group: 'structure', en: 'Show structural warnings (orphan signs, script mixing…)', bn: 'কাঠামোগত সতর্কতা দেখান' },
  { key: 'danda', group: 'punct', en: 'ASCII | → । and ॥ → ।।', bn: 'ASCII | → । এবং ॥ → ।।' },
  { key: 'digits', group: 'punct', type: 'select', choices: ['keep', 'bn', 'en'],
    en: 'Digits', bn: 'সংখ্যা',
    choiceEn: { keep: 'Leave as is', bn: 'All → ০১২৩', en: 'All → 0123' },
    choiceBn: { keep: 'যেমন আছে', bn: 'সব → ০১২৩', en: 'সব → 0123' } },
  { key: 'quotes', group: 'punct', en: 'Smart quotes → plain quotes', bn: 'স্মার্ট কোট → সাধারণ কোট' },
  { key: 'collapseSpaces', group: 'space', en: 'Collapse repeated spaces/tabs', bn: 'পরপর স্পেস/ট্যাব এক করুন' },
  { key: 'trimLines', group: 'space', en: 'Trim spaces at line start & end', bn: 'লাইনের শুরু ও শেষের স্পেস ছাঁটুন' },
  { key: 'collapseBlank', group: 'space', en: 'Collapse 3+ blank lines', bn: '৩+ ফাঁকা লাইন এক করুন' },
];

/* ------------------------------------------------------------------ *
 * Rules  (order matters: this is the pipeline order)
 * find(text, opts) -> [{start,end,after}]  after: string = replace,
 *                                           null = warn only
 * ------------------------------------------------------------------ */
function rx(re, fn) {
  const src = re.source, flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  return (text, o) => {
    const r = new RegExp(src, flags), out = [];
    let m;
    while ((m = r.exec(text))) {
      if (m[0] === '') { r.lastIndex++; continue; }
      const after = fn(m, o, text);
      if (after !== undefined) out.push({ start: m.index, end: m.index + m[0].length, after });
    }
    return out;
  };
}
const DIGIT_BN = (cp) => String.fromCharCode(0x09e6 + (cp >= 0x0966 ? cp - 0x0966 : cp - 0x30));
const DIGIT_EN = (cp) => String.fromCharCode(0x30 + (cp >= 0x09e6 ? cp - 0x09e6 : cp - 0x0966));

export const RULES = [
  { id: 'khanda-ta', group: 'letters', opt: 'khandaTa',
    en: 'ত + ্ + ZWJ → ৎ (Khanda Ta)', bn: 'ত + ্ + ZWJ → ৎ (খণ্ড ত)',
    find: rx(/\u09A4\u09CD\u200D/, () => '\u09CE') },
  { id: 'zwj', group: 'invisible', opt: 'invisibles',
    en: 'Stray zero-width joiner removed', bn: 'বাড়তি ZWJ মোছা হয়েছে',
    find: rx(/\u200D/, (m, o, t) => {
      const i = m.index;
      return t[i - 1] === '\u09B0' && t[i + 1] === HASANTA && t[i + 2] === '\u09AF' ? undefined : '';
    }) },
  { id: 'invisible', group: 'invisible', opt: 'invisibles',
    en: 'Invisible character removed (ZWSP/ZWNJ/BOM/WJ/soft hyphen)', bn: 'অদৃশ্য ক্যারেক্টার মোছা হয়েছে',
    find: rx(/[\u200B\u200C\uFEFF\u2060\u00AD]/, () => '') },
  { id: 'bidi', group: 'invisible', opt: 'bidi',
    en: 'Bidi control mark removed', bn: 'বাইডি কন্ট্রোল মার্ক মোছা হয়েছে',
    find: rx(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/, () => '') },
  { id: 'odd-space', group: 'invisible', opt: 'spaces',
    en: 'Odd space → normal space', bn: 'অদ্ভুত স্পেস → সাধারণ স্পেস',
    find: rx(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/, () => ' ') },
  { id: 'assamese', group: 'letters', opt: 'assamese',
    en: 'Assamese ৰ/ৱ → Bangla র/ব', bn: 'অসমীয়া ৰ/ৱ → বাংলা র/ব',
    find: rx(/[\u09F0\u09F1]/, (m) => (m[0] === '\u09F0' ? '\u09B0' : '\u09AC')) },
  { id: 'dup-marks', group: 'structure', opt: 'dupMarks',
    en: 'Duplicate vowel sign / mark collapsed', bn: 'দ্বিরুক্ত কার/চিহ্ন এক করা হয়েছে',
    find: rx(new RegExp(`([${VS}${MK}\\u09BC])\\1+`), (m) => m[1]) },
  { id: 'dup-hasanta', group: 'structure', opt: 'dupMarks',
    en: 'Duplicate hasanta collapsed', bn: 'দ্বিরুক্ত হসন্ত এক করা হয়েছে',
    find: rx(/\u09CD{2,}/, () => HASANTA) },
  { id: 'mark-order', group: 'structure', opt: 'markOrder',
    en: 'ঁ ং ঃ moved after the vowel sign', bn: 'ঁ ং ঃ কারের পরে আনা হয়েছে',
    find: rx(new RegExp(`([${MK}])([${VS}])`), (m) => m[2] + m[1]) },
  { id: 'compose-o', group: 'letters', opt: 'composeVowelSigns',
    en: 'ে+া → ো, ে+ৗ → ৌ', bn: 'ে+া → ো, ে+ৗ → ৌ',
    find: rx(/\u09C7(\u09BE|\u09D7)/, (m) => (m[1] === '\u09BE' ? '\u09CB' : '\u09CC')) },
  { id: 'compose-letters', group: 'letters', opt: 'composeLetters',
    en: 'অ+া → আ, ও+ৗ → ঔ', bn: 'অ+া → আ, ও+ৗ → ঔ',
    find: rx(/\u0993\u09D7|\u0985\u09BE/, (m) => (m[0] === '\u0993\u09D7' ? '\u0994' : '\u0986')) },
  { id: 'nukta-compose', group: 'letters',
    en: 'Base + nukta → single code point (ড় ঢ় য়)', bn: 'বেস + নুকতা → একক কোড পয়েন্ট (ড় ঢ় য়)',
    on: (o) => o.form !== 'decomposed',
    find: rx(/[\u09A1\u09A2\u09AF]\u09BC/, (m) => DEC_TO_PRE[m[0]]) },
  { id: 'nukta-decompose', group: 'letters',
    en: 'Single code point → base + nukta (ড় ঢ় য়)', bn: 'একক কোড পয়েন্ট → বেস + নুকতা (ড় ঢ় য়)',
    on: (o) => o.form === 'decomposed',
    find: rx(/[\u09DC\u09DD\u09DF]/, (m) => PRE_TO_DEC[m[0]]) },
  { id: 'orphan-nukta', group: 'structure', opt: 'warnings', fixOpt: 'orphanNukta',
    en: 'Orphan nukta (not after ড ঢ য)', bn: 'এতিম নুকতা (ড ঢ য-এর পরে নয়)',
    find: rx(/(?<![\u09A1\u09A2\u09AF])\u09BC/, (m, o) => (o.orphanNukta ? '' : null)) },
  { id: 'stacked-signs', group: 'structure', opt: 'warnings', warnOnly: true,
    en: 'Two vowel signs on one letter', bn: 'এক অক্ষরে দুটি কার',
    find: rx(new RegExp(`[${VS}][${VS}]`), (m, o) =>
      m[0][0] === '\u09C7' && (m[0][1] === '\u09BE' || m[0][1] === '\u09D7') ? undefined : null) },
  { id: 'orphan-sign', group: 'structure', opt: 'warnings', warnOnly: true,
    en: 'Vowel sign without a base letter', bn: 'কার আছে কিন্তু বর্ণ নেই',
    find: rx(new RegExp(`(?<![\\u0995-\\u09B9\\u09BC\\u09BE-\\u09D7\\u09DC-\\u09DF\\u09F0\\u09F1])[${VS}]`), () => null) },
  { id: 'trailing-hasanta', group: 'structure', opt: 'warnings', fixOpt: 'trailingHasanta',
    en: 'Hasanta at word end', bn: 'শব্দের শেষে হসন্ত',
    find: rx(/\u09CD(?=[\s\u0964\u0965.,;:!?)\]}"'\u201D\u2019]|$)/, (m, o) => (o.trailingHasanta ? '' : null)) },
  { id: 'script-mix', group: 'structure', opt: 'warnings', warnOnly: true,
    en: 'Devanagari letter mixed into Bangla word', bn: 'বাংলা শব্দে দেবনাগরী অক্ষর মিশে আছে',
    find: rx(/(?<=[\u0980-\u09FF])[\u0904-\u0963]|[\u0904-\u0963](?=[\u0980-\u09FF])/, () => null) },
  { id: 'danda-pipe', group: 'punct', opt: 'danda',
    en: 'ASCII | → । (danda)', bn: 'ASCII | → ।',
    find: rx(/(?<=[\u0980-\u09FF] ?)\|/, () => '\u0964') },
  { id: 'danda-double', group: 'punct', opt: 'danda',
    en: '॥ → ।।', bn: '॥ → ।।',
    find: rx(/\u0965/, () => '\u0964\u0964') },
  { id: 'digits-bn', group: 'punct', on: (o) => o.digits === 'bn',
    en: 'Digit → Bangla digit', bn: 'অঙ্ক → বাংলা অঙ্ক',
    find: rx(/[0-9\u0966-\u096F]/, (m) => DIGIT_BN(m[0].charCodeAt(0))) },
  { id: 'digits-en', group: 'punct', on: (o) => o.digits === 'en',
    en: 'Bangla/Devanagari digit → ASCII digit', bn: 'বাংলা/দেবনাগরী অঙ্ক → ASCII অঙ্ক',
    find: rx(/[\u09E6-\u09EF\u0966-\u096F]/, (m) => DIGIT_EN(m[0].charCodeAt(0))) },
  { id: 'quotes', group: 'punct', opt: 'quotes',
    en: 'Smart quote → plain quote', bn: 'স্মার্ট কোট → সাধারণ কোট',
    find: rx(/[\u201C\u201D\u201E\u2018\u2019\u201A]/, (m) => ('\u201C\u201D\u201E'.includes(m[0]) ? '"' : "'")) },
  { id: 'nfc-other', group: 'letters', opt: 'nfcOther',
    en: 'Non-Bengali text normalized to NFC', bn: 'বাংলা ছাড়া অংশ NFC-তে আনা হয়েছে',
    find: rx(/[^\u0980-\u09FF]+/, (m) => { const n = m[0].normalize('NFC'); return n === m[0] ? undefined : n; }) },
  { id: 'collapse-spaces', group: 'space', opt: 'collapseSpaces',
    en: 'Repeated spaces/tabs collapsed', bn: 'পরপর স্পেস এক করা হয়েছে',
    find: rx(/[ \t]{2,}/, () => ' ') },
  { id: 'trim-lines', group: 'space', opt: 'trimLines',
    en: 'Line edge spaces trimmed', bn: 'লাইনের কিনারার স্পেস ছাঁটা হয়েছে',
    find: rx(/^[ \t]+|[ \t]+(?=\r?$)/m, () => '') },
  { id: 'collapse-blank', group: 'space', opt: 'collapseBlank',
    en: 'Extra blank lines collapsed', bn: 'বাড়তি ফাঁকা লাইন এক করা হয়েছে',
    find: rx(/(?:\r?\n){3,}/, () => '\n\n') },
];
const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));
export const ruleLabel = (id, lang = 'en') => (RULE_BY_ID[id] ? RULE_BY_ID[id][lang] || RULE_BY_ID[id].en : id);
export const ruleGroup = (id) => (RULE_BY_ID[id] ? RULE_BY_ID[id].group : 'other');

const isOn = (r, o) => (r.on ? r.on(o) : r.opt ? !!o[r.opt] : true);

function splice(text, ms) {
  let out = '', last = 0;
  for (const m of ms) {
    if (m.after === null || m.start < last) continue;
    out += text.slice(last, m.start) + m.after;
    last = m.end;
  }
  return out + text.slice(last);
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
export const cpHex = (cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
export const cpsOf = (s) => Array.from(s, (c) => cpHex(c.codePointAt(0)));
const countSub = (t, sub) => (t ? t.split(sub).length - 1 : 0);

export function letterCounts(text) {
  const r = {};
  for (const [k, v] of Object.entries(LETTERS)) {
    r[k] = { precomposed: countSub(text, v.pre), decomposed: countSub(text, v.base + NUKTA) };
  }
  return r;
}

export function countGraphemes(text) {
  if (text.length > 400000) return null;
  try {
    const seg = new Intl.Segmenter('bn', { granularity: 'grapheme' });
    let n = 0;
    for (const _ of seg.segment(text)) n++; // eslint-disable-line no-unused-vars
    return n;
  } catch { return Array.from(text).length; }
}

function textStats(t) {
  return {
    chars: t.length,
    codePoints: Array.from(t).length,
    graphemes: countGraphemes(t),
    words: (t.match(/\S+/g) || []).length,
    lines: t ? t.split(/\r?\n/).length : 0,
  };
}

/** Rough guess whether text is legacy Bijoy/ANSI "Bangla" typed with Latin glyphs. */
export function detectLegacy(text) {
  const sample = text.slice(0, 20000);
  const bn = (sample.match(/[\u0980-\u09FF]/g) || []).length;
  const odd = (sample.match(/[\u00A1-\u00FF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2018-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u2122]/g) || []).length;
  const nonSpace = (sample.match(/\S/g) || []).length;
  const hint = /Avwg|Avgvi|\u2020|\u2021|wb|Zv|mv|\u2021K/.test(sample);
  const suspect = nonSpace > 15 && bn < nonSpace * 0.05 && (odd / nonSpace > 0.03 || hint) && (odd >= 4);
  return { suspect, score: nonSpace ? odd / nonSpace : 0 };
}

/* ------------------------------------------------------------------ *
 * normalize
 * ------------------------------------------------------------------ */
export function detect(text, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const findings = [];
  for (const r of RULES) {
    if (!isOn(r, o)) continue;
    for (const m of r.find(text, o)) {
      const before = text.slice(m.start, m.end);
      findings.push({
        ruleId: r.id, group: r.group,
        severity: m.after === null ? 'warning' : 'fixed',
        start: m.start, end: m.end, before, after: m.after,
        codePointsBefore: cpsOf(before),
        codePointsAfter: m.after === null ? null : cpsOf(m.after),
      });
    }
  }
  findings.sort((a, b) => a.start - b.start || a.end - b.end);
  return findings;
}

export function transform(text, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  let cur = text;
  for (let i = 0; i < 6; i++) { // fixed point => idempotent output
    let next = cur;
    for (const r of RULES) {
      if (!isOn(r, o)) continue;
      const ms = r.find(next, o);
      if (ms.length) next = splice(next, ms);
    }
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

export function normalize(text, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const findings = detect(text, o);
  const output = transform(text, o);
  const lettersIn = letterCounts(text), lettersOut = letterCounts(output);
  const invariantOk = Object.values(lettersOut).every((l) =>
    o.form === 'decomposed' ? l.precomposed === 0 : l.decomposed === 0);
  const fixed = findings.filter((f) => f.severity === 'fixed').length;
  return {
    output,
    report: {
      stats: { in: textStats(text), out: textStats(output), changes: fixed, warnings: findings.length - fixed },
      letters: { in: lettersIn, out: lettersOut },
      findings, invariantOk,
      legacy: detectLegacy(text),
      changed: output !== text,
      ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
    },
  };
}

export const isNormalized = (text, opts) => transform(text, opts) === text;

/** Structure-safe processing for .json / .csv files. */
export function normalizeFile(text, ext, opts = {}) {
  const e = (ext || '').toLowerCase().replace('.', '');
  const safe = { ...DEFAULTS, ...opts };
  if (e === 'csv' || e === 'json') Object.assign(safe, { collapseSpaces: false, trimLines: false, collapseBlank: false, quotes: false });
  if (e === 'json') {
    try {
      const data = JSON.parse(text);
      const walk = (v) => {
        if (typeof v === 'string') return transform(v, safe);
        if (Array.isArray(v)) return v.map(walk);
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [transform(k, safe), walk(x)]));
        return v;
      };
      const output = JSON.stringify(walk(data), null, /\n\s+"/.test(text) ? 2 : 0);
      const r = normalize(text, safe);
      return { output, report: r.report };
    } catch { /* fall through to plain text mode */ }
  }
  return normalize(text, safe);
}

/** Canonical key for DB / search indexing. */
export function searchKey(text) {
  return transform(text, { ...PRESETS.aggressive, form: 'precomposed', digits: 'en' })
    .normalize('NFKC').toLowerCase()
    .replace(/[\s\u0964\u0965.,;:!?"'()\[\]{}\-\u2013\u2014_/\\|]+/g, ' ').trim();
}

/* ------------------------------------------------------------------ *
 * Character inspection
 * ------------------------------------------------------------------ */
export const INVISIBLE = {
  0x200B: 'ZWSP', 0x200C: 'ZWNJ', 0x200D: 'ZWJ', 0xFEFF: 'BOM', 0x2060: 'WJ', 0x00AD: 'SHY',
  0x200E: 'LRM', 0x200F: 'RLM', 0x00A0: 'NBSP', 0x2007: 'FIGSP', 0x2009: 'THINSP', 0x202F: 'NNBSP',
  0x0009: 'TAB', 0x000A: 'LF', 0x000D: 'CR', 0x3000: 'IDSP',
};
export const isInvisible = (cp) =>
  cp in INVISIBLE || (cp >= 0x2000 && cp <= 0x200A) || (cp >= 0x202A && cp <= 0x202E) || (cp >= 0x2066 && cp <= 0x2069);

export function categorize(cp) {
  if (cp === 0x20) return 'space';
  if (isInvisible(cp)) return 'invisible';
  if (cp === 0x9BC) return 'nukta';
  if (cp === 0x9CD) return 'hasanta';
  if (cp === 0x9CE || (cp >= 0x995 && cp <= 0x9B9) || (cp >= 0x9DC && cp <= 0x9DF) || cp === 0x9F0 || cp === 0x9F1) return 'consonant';
  if (cp >= 0x985 && cp <= 0x994) return 'vowel';
  if ((cp >= 0x9BE && cp <= 0x9CC) || cp === 0x9D7) return 'vowel-sign';
  if (cp >= 0x981 && cp <= 0x983) return 'mark';
  if (cp >= 0x9E6 && cp <= 0x9EF) return 'digit-bn';
  if (cp >= 0x30 && cp <= 0x39) return 'digit';
  if (cp === 0x964 || cp === 0x965) return 'punct';
  if (cp >= 0x900 && cp <= 0x97F) return 'devanagari';
  if (cp >= 0x980 && cp <= 0x9FF) return 'bengali-other';
  if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A)) return 'latin';
  if (cp < 0x80 || (cp >= 0x2000 && cp <= 0x206F)) return 'punct';
  return 'other';
}

export function charName(cp) {
  return NAMES[cp.toString(16).toUpperCase()] || (cp >= 0x4E00 ? 'CJK / other' : 'UNASSIGNED / NOT IN TABLE');
}

export function describe(str) {
  const enc = new TextEncoder();
  return Array.from(str, (ch) => {
    const cp = ch.codePointAt(0);
    const utf16 = [];
    for (let i = 0; i < ch.length; i++) utf16.push(ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'));
    let note = null;
    for (const [k, v] of Object.entries(LETTERS)) {
      if (ch === v.pre) note = { letter: k, form: 'precomposed' };
    }
    return {
      ch, cp, hex: cpHex(cp), name: charName(cp), category: categorize(cp),
      utf8: Array.from(enc.encode(ch), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
      utf16: utf16.join(' '), entity: `&#x${cp.toString(16).toUpperCase()};`, note,
    };
  });
}

export function inventory(text) {
  const map = new Map();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    map.set(cp, (map.get(cp) || 0) + 1);
  }
  return Array.from(map, ([cp, count]) => ({
    cp, ch: String.fromCodePoint(cp), hex: cpHex(cp), name: charName(cp),
    category: categorize(cp), count, invisible: isInvisible(cp),
  }));
}

/** Escape a string as a code literal in several languages. */
export function toLiterals(s) {
  const cps = Array.from(s, (c) => c.codePointAt(0));
  const u4 = (cp) => (cp > 0xFFFF
    ? '\\u{' + cp.toString(16).toUpperCase() + '}'
    : '\\u' + cp.toString(16).toUpperCase().padStart(4, '0'));
  const js = cps.map((cp) => (cp < 0x80 && cp >= 0x20 && cp !== 0x22 && cp !== 0x5C ? String.fromCharCode(cp) : u4(cp))).join('');
  const py = cps.map((cp) => (cp < 0x80 && cp >= 0x20 && cp !== 0x22 && cp !== 0x5C ? String.fromCharCode(cp)
    : cp > 0xFFFF ? '\\U' + cp.toString(16).padStart(8, '0') : '\\u' + cp.toString(16).padStart(4, '0'))).join('');
  const json = JSON.stringify(s).replace(/[^\x20-\x7E]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  return {
    js: `"${js}"`, python: `"${py}"`, json,
    html: cps.map((cp) => `&#x${cp.toString(16).toUpperCase()};`).join(''),
    url: encodeURIComponent(s),
    codepoints: cps.map(cpHex).join(' '),
  };
}

export const SAMPLE = [
  'এটি একটি নমুনা লেখা — প্রতিটি সমস্যা এখানে আছে।',
  '',
  'একক রূপ: \u09DC \u09DD \u09DF',
  'ভাঙা রূপ: \u09A1\u09BC \u09A2\u09BC \u09AF\u09BC → আমা\u09AF\u09BC, বা\u09A1\u09BC\u09BF, গা\u09A2\u09BC',
  'অসমী\u09DFা লিপি: \u09F0\u09BE\u09B7\u09CD\u099F\u09CD\u09B0, \u09F1\u09BE\u09B0\u09BF\u09A7\u09BF',
  'খণ্ড ত: উৎস, সম্ভব\u09A4\u09CD\u200D, হঠা\u09A4\u09CD\u200D',
  'কার ভাঙা: ক\u09C7\u09BEন, ক\u09C7\u09D7শল',
  'আ/ঔ ভাঙা: \u0985\u09BEমার, \u0993\u09D7ষধ',
  'অদৃশ্য: বা\u200Bং\u200Cলা\u00ADদেশ\u200E, \uFEFFমাথা\u2060',
  'বৈধ র\u200D্য (রাখা হবে): \u09B0\u200D\u09CD\u09AFাব',
  'দ্বিরুক্ত: ক\u09BE\u09BE, ক\u09BF\u09BF, ক\u09CD\u09CD\u09B7',
  'ক্রম: ক\u0982\u09BF, ক\u09C1\u09C2',
  'এতিম নুকতা: ক\u09BC, খ\u09BC; কার ব্যতীত: \u09BEক; শেষে হসন্ত: বা\u09B8\u09CD ।',
  'স্পেস: NBSP\u00A0এবং\u2009পাতলা\u202Fস্পেস;   পরপর    স্পেস',
  'বিরাম: আমি ভালো আছি | তুমি কেমন আছো\u0965',
  'সংখ্যা: 2026, ২০২৬, \u0968\u0966\u0968\u096C',
  '\u201Cস্মার্ট কোট\u201D এবং \u2018একক\u2019',
  'মিশ্র লিপি: ক\u0915',
].join('\n');

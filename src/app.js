import {
  normalize, normalizeFile, transform, PRESETS, DEFAULTS, OPTION_META, GROUPS, LETTERS,
  ruleLabel, ruleGroup, describe, inventory, toLiterals, searchKey, cpHex, INVISIBLE, SAMPLE, charName,
} from './core.js';
import { diffText } from './diff.js';
import { STR } from './i18n.js';

/* ============================== helpers ============================== */
const $ = (id) => document.getElementById(id);
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
  return e;
};
const store = {
  get(k, d) { try { const v = localStorage.getItem('bn.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('bn.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_LIVE = 500000, WORKER_MIN = 150000, HL_MAX = 120000, MARK_MAX = 2500;
const SEV_ICON = { fixed: '✓', warning: '!' };
const GROUP_COLOR = { letters: 'var(--accent)', invisible: 'var(--amber)', structure: 'var(--info)', punct: 'var(--danger)', space: 'var(--ink-3)', other: 'var(--line-2)' };
const INV_RE = /[\u00AD\u00A0\u1680\u2000-\u200F\u2028-\u202F\u205F-\u2064\u2066-\u2069\u3000\uFEFF]/g;

const S = {
  lang: store.get('lang', (navigator.language || '').startsWith('bn') ? 'bn' : 'en'),
  theme: store.get('theme', 'system'),
  font: store.get('font', 'sans'),
  opts: { ...DEFAULTS, ...store.get('opts', {}) },
  live: store.get('live', true),
  text: '', result: null, fileExt: null, fileName: 'normalized',
  undo: [], redo: [], dirty: {}, pausedBig: false,
  mainTab: 'findings', sev: 'all', group: null, findQ: '', shown: 60, active: -1,
  inspect: '', invSource: 'in', invSort: 'count', invAsc: false, codeSrc: 'output', sel: '', token: 0,
};
const t = (k, ...a) => {
  const v = STR[S.lang][k] ?? STR.en[k] ?? k;
  return typeof v === 'function' ? v(...a) : v;
};
const fmt = (n) => (n == null ? '—' : n.toLocaleString(S.lang === 'bn' ? 'bn-BD' : 'en-US'));
const gname = (g) => t('group')[g] || g;

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function visInto(parent, str) {
  let last = 0, m;
  const re = new RegExp(INV_RE.source, 'g');
  while ((m = re.exec(str))) {
    if (m.index > last) parent.append(str.slice(last, m.index));
    const cp = m[0].codePointAt(0);
    parent.append(h('span', { class: 'chip', title: `${cpHex(cp)} ${charName(cp)}` }, INVISIBLE[cp] || cpHex(cp).slice(2)));
    last = m.index + m[0].length;
  }
  if (last < str.length) parent.append(str.slice(last));
  return parent;
}
function countUp(el, to) {
  if (reduceMotion || to < 3) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 450);
    el.textContent = fmt(Math.round(to * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

/* ============================== theme / i18n ============================== */
const mq = matchMedia('(prefers-color-scheme: dark)');
const THEME_ICONS = {
  light: '<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  dark: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" fill="currentColor"/>',
  system: '<rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};
function applyTheme() {
  const r = S.theme === 'system' ? (mq.matches ? 'dark' : 'light') : S.theme;
  document.documentElement.dataset.resolved = r;
  document.documentElement.dataset.theme = S.theme;
  document.documentElement.dataset.font = S.font;
  $('themeIcon').innerHTML = THEME_ICONS[S.theme];
  $('themeBtn').setAttribute('aria-label', `${t('theme')}: ${t(S.theme === 'system' ? 'themeSystem' : S.theme === 'dark' ? 'themeDark' : 'themeLight')}`);
  $('themeBtn').title = $('themeBtn').getAttribute('aria-label');
  document.querySelector('meta[name=theme-color]').content = r === 'dark' ? '#0b110f' : '#0a7e6e';
}
mq.addEventListener?.('change', applyTheme);

function applyI18n() {
  document.documentElement.lang = S.lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $('input').placeholder = t('placeholder');
  $('langLabel').textContent = S.lang === 'bn' ? 'EN' : 'বাং';
  $('langBtn').setAttribute('aria-label', t('lang'));
  document.title = S.lang === 'bn' ? 'বাংলানর্ম — বাংলা ইউনিকোড নরমালাইজার' : 'BanglaNorm — Bangla Unicode normalizer (ড\u09BC ঢ\u09BC য\u09BC fixer)';
  buildDrawer(); buildChips(); applyTheme();
  if (S.result) renderAll();
  renderInspector(); renderCompare();
}

/* ============================== compute (worker aware) ============================== */
let worker, reqId = 0;
const pending = new Map();
function getWorker() {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); p(e.data.res); } };
    worker.onerror = () => { worker = null; for (const p of pending.values()) p(null); pending.clear(); };
  } catch { worker = null; }
  return worker;
}
const syncRun = (text) => (S.fileExt ? normalizeFile(text, S.fileExt, S.opts) : normalize(text, S.opts));
async function compute(text) {
  if (text.length > WORKER_MIN && getWorker()) {
    const res = await new Promise((resolve) => {
      const id = ++reqId; pending.set(id, resolve);
      worker.postMessage({ id, text, opts: S.opts, ext: S.fileExt });
    });
    if (res) return res;
  }
  return syncRun(text);
}

async function run() {
  const text = $('input').value;
  const token = ++S.token;
  S.text = text;
  const res = text ? await compute(text) : syncRun('');
  if (token !== S.token) return;
  S.result = { ...res, text };
  renderAll();
}
let liveTimer;
function schedule() {
  clearTimeout(liveTimer);
  const len = $('input').value.length;
  if (len > MAX_LIVE) {
    if (!S.pausedBig) { S.pausedBig = true; toast(t('liveOff')); }
    renderEmpty(); renderStatus(); return;
  }
  S.pausedBig = false;
  if (S.live) liveTimer = setTimeout(run, 150); else { renderEmpty(); renderStatus(); }
}

/* ============================== input actions ============================== */
function setInput(text, { record = true, file, dl = null } = {}) {
  const cur = $('input').value;
  if (record && cur !== text) { S.undo.push(cur); if (S.undo.length > 20) S.undo.shift(); S.redo = []; }
  $('input').value = text;
  if (file !== undefined) { S.fileExt = file; S.fileDl = dl; if (!dl) S.fileName = 'normalized'; }
  syncHist();
  run();
}
function syncHist() { $('undoBtn').disabled = !S.undo.length; $('redoBtn').disabled = !S.redo.length; }
function undo() { if (!S.undo.length) return; S.redo.push($('input').value); $('input').value = S.undo.pop(); syncHist(); run(); }
function redo() { if (!S.redo.length) return; S.undo.push($('input').value); $('input').value = S.redo.pop(); syncHist(); run(); }

async function copyText(text, okMsg = t('copied')) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); return; } catch { /* fall through */ }
  try {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text; document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    toast(ok ? okMsg : t('copyFail'));
  } catch { toast(t('copyFail')); }
}
async function handleFile(file) {
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['txt', 'md', 'csv', 'json', 'srt'].includes(ext) && !file.type.startsWith('text/')) { toast(t('fileBad')); return; }
  if (file.size > 5e6) toast(t('fileBig'));
  const text = (await file.text()).replace(/^\uFEFF/, '');
  S.fileName = file.name.replace(/\.[^.]+$/, '') + '.normalized';
  setInput(text, { file: ext === 'csv' || ext === 'json' ? ext : null, dl: ext });
  if (ext === 'csv' || ext === 'json') toast(t('fileSafe'));
}

/* ============================== render: stats / status ============================== */
function renderEmpty() {
  $('emptyIn').hidden = $('input').value !== '';
  $('emptyOut').hidden = !!($('output').value);
}
function statsRow(el, st, ref) {
  el.replaceChildren(...[['chars', 'chars'], ['codePoints', 'codePoints'], ['graphemes', 'graphemes'], ['words', 'words'], ['lines', 'lines']].map(([k, label]) => {
    const sp = h('span', {}, t(label) + ' ', h('b', {}, fmt(st[k])));
    if (ref && st[k] != null && ref[k] != null && st[k] !== ref[k]) {
      const d = st[k] - ref[k];
      sp.append(h('span', { class: 'arrow' }, ` (${d > 0 ? '+' : '−'}${fmt(Math.abs(d))})`));
    }
    return sp;
  }));
}
function renderStats() {
  const r = S.result.report;
  statsRow($('statsIn'), r.stats.in);
  statsRow($('statsOut'), r.stats.out, r.stats.in);
}
function renderStatus() {
  const el = $('statusStrip');
  el.replaceChildren();
  const res = S.result;
  if (!res || !res.text) return;
  const r = res.report, { changes, warnings } = r.stats;
  const stale = res.text !== $('input').value;
  if (!changes && !warnings) el.append(h('span', { class: 'stat-pill clean' }, h('i', { class: 'dot' }), t('noIssues')));
  if (changes) { const n = h('b'); el.append(h('span', { class: 'stat-pill fixed' }, h('i', { class: 'dot' }), n, ' ' + t('fixedSfx'))); countUp(n, changes); }
  if (warnings) el.append(h('span', { class: 'stat-pill warn' }, h('i', { class: 'dot' }), t('warnN', warnings)));
  if (stale) el.append(h('span', { class: 'stat-pill' }, h('i', { class: 'dot' }), t('wasEdited')));
  el.append(h('span', { class: 'time' }, `${r.ms < 1 ? '<1' : Math.round(r.ms)} ${t('ms')}`));
  if (r.legacy.suspect) el.append(h('div', { class: 'banner' }, h('span', {}, '⚠'), t('legacy')));
  if (!r.invariantOk) el.append(h('div', { class: 'banner bad' }, t('invariantBad')));
  if (S.fileExt) el.append(h('div', { class: 'banner info' }, h('span', {}, 'ℹ'), t('fileSafe') + ` (.${S.fileExt})`));
}

/* ============================== letters dashboard ============================== */
const LREF = {};
function buildLetters() {
  const root = $('letters');
  root.replaceChildren();
  for (const [key, L] of Object.entries(LETTERS)) {
    const ref = {
      glyph: h('div', { class: 'lglyph', lang: 'bn', 'aria-hidden': 'true' }, L.pre),
      badge: h('span', { class: 'badge b-none' }),
      pre: h('i', { class: 's-pre' }), dec: h('i', { class: 's-dec' }),
      preIn: h('b'), decIn: h('b'), preOut: h('span', { class: 'after' }), decOut: h('span', { class: 'after' }),
      btn: h('button', { class: 'btn sm lfix', type: 'button', onclick: () => { clearTimeout(liveTimer); run().then(() => toast('✓')); } }),
    };
    ref.card = h('article', { class: 'card lcard rise st-none', 'aria-label': `U+${L.pre.codePointAt(0).toString(16).toUpperCase()}` },
      h('div', { class: 'lhead' }, ref.glyph,
        h('div', { class: 'lmeta' },
          h('div', { class: 'lname' }, `BENGALI LETTER ${L.name}`),
          h('div', { class: 'lcodes' }, `${cpHex(L.pre.codePointAt(0))} = ${cpHex(L.base.codePointAt(0))} + U+09BC`),
          ref.badge)),
      h('div', { class: 'split', role: 'img' }, ref.pre, ref.dec),
      h('div', { class: 'lrows' },
        h('div', { class: 'lrow' }, h('i', { class: 'sw' }), h('span', { 'data-k': 'oneCP' }), ref.preIn, ref.preOut),
        h('div', { class: 'lrow' }, h('i', { class: 'sw dec' }), h('span', { 'data-k': 'twoCP' }), ref.decIn, ref.decOut)),
      ref.btn);
    LREF[key] = ref;
    root.append(ref.card);
  }
}
function letterStatus(a, target) {
  const total = a.precomposed + a.decomposed;
  if (!total) return { st: 'none', label: t('badgeNone') };
  if (a.precomposed && a.decomposed) return { st: 'mixed', label: t('badgeMixed') };
  if ((target === 'precomposed') === !!a.precomposed) return { st: 'consistent', label: t('badgeConsistent') };
  return { st: 'split', label: a.decomposed ? t('badgeSplit') : t('badgeSingle') };
}
function renderSummary() {
  const box = $('summary');
  box.replaceChildren(h('h2', { class: 'sum-title' }, t('summary')));
  const res = S.result;
  if (!res || !res.text) { box.append(h('p', { class: 'muted small' }, t('emptyBody'))); return; }
  const r = res.report, { changes, warnings } = r.stats, target = S.opts.form;
  box.append(h('div', { class: 'sum-tiles' },
    h('div', { class: 'sum-tile fixed' }, h('b', {}, fmt(changes)), h('span', {}, t('sevFixed'))),
    h('div', { class: 'sum-tile warn' }, h('b', {}, fmt(warnings)), h('span', {}, t('sevWarning')))));
  const ls = h('div', {}, h('div', { class: 'sum-h' }, h('span', {}, t('lettersTitle')), h('span', {}, t('singleSplit'))));
  for (const [key, L] of Object.entries(LETTERS)) {
    const a = r.letters.in[key], { st, label } = letterStatus(a, target);
    ls.append(h('div', { class: 'sum-letter' }, h('span', { class: 'sg', lang: 'bn', 'aria-hidden': 'true' }, L.pre),
      h('span', { class: `badge b-${st}` }, label), h('span', { class: 'sn' }, `${fmt(a.precomposed)} / ${fmt(a.decomposed)}`)));
  }
  box.append(ls);
  const all = r.findings, byG = {};
  for (const f of all) byG[f.group] = (byG[f.group] || 0) + 1;
  if (all.length) {
    const cat = h('div', {}, h('div', { class: 'sum-h' }, h('span', {}, t('byGroup'))));
    const max = Math.max(...Object.values(byG));
    for (const g of GROUPS) {
      if (!byG[g.id]) continue;
      const bar = h('i'); bar.style.background = GROUP_COLOR[g.id]; bar.style.width = `${Math.max(6, (byG[g.id] / max) * 100)}%`;
      cat.append(h('div', { class: 'sum-cat' }, h('span', {}, gname(g.id)), h('b', {}, fmt(byG[g.id])), bar));
    }
    box.append(cat);
    const top = h('div', {}, h('div', { class: 'sum-h' }, h('span', {}, t('topFindings'))));
    const groups = new Map();
    all.forEach((f, i) => { const g = groups.get(f.ruleId) || { f, i, n: 0 }; g.n++; groups.set(f.ruleId, g); });
    [...groups.values()].sort((x, y) => (x.f.severity === 'warning') - (y.f.severity === 'warning') || y.n - x.n).slice(0, 6).forEach(({ f, i, n }) => {
      top.append(h('button', { class: 'sum-item', type: 'button', onclick: () => jumpTo(i) },
        h('span', { class: 'fsev ' + f.severity }, SEV_ICON[f.severity]),
        h('span', {}, ruleLabel(f.ruleId, S.lang), n > 1 ? h('b', { style: 'margin-left:6px;color:var(--ink-2)' }, `×${fmt(n)}`) : null)));
    });
    box.append(top, h('button', { class: 'btn sm sum-all', type: 'button', onclick: () => { switchTab('findings'); $('p-findings').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); } }, t('viewAll', all.length)));
  } else box.append(h('p', { class: 'muted small' }, t('noIssues')));
}
function renderLetters() {
  const r = S.result.report, target = S.opts.form;
  for (const key of Object.keys(LETTERS)) {
    const ref = LREF[key], a = r.letters.in[key], b = r.letters.out[key];
    const total = a.precomposed + a.decomposed;
    const { st, label } = letterStatus(a, target);
    ref.card.className = `card lcard st-${st === 'none' ? 'none' : st}`;
    ref.badge.className = `badge b-${st}`; ref.badge.textContent = label;
    ref.pre.style.setProperty('flex-grow', total ? a.precomposed : 0);
    ref.dec.style.setProperty('flex-grow', total ? a.decomposed : 0);
    ref.card.querySelector('.split').setAttribute('aria-label', `${t('oneCP')}: ${a.precomposed}, ${t('twoCP')}: ${a.decomposed}`);
    ref.preIn.textContent = fmt(a.precomposed); ref.decIn.textContent = fmt(a.decomposed);
    ref.preOut.textContent = `→ ${fmt(b.precomposed)}`; ref.decOut.textContent = `→ ${fmt(b.decomposed)}`;
    ref.btn.textContent = `${t('fixTo')} ${target === 'precomposed' ? t('toPre') : t('toDec')}`;
    ref.btn.disabled = !S.text;
  }
  document.querySelectorAll('.lrow [data-k]').forEach((el) => { el.textContent = t(el.dataset.k); });
}

/* ============================== findings ============================== */
function buildChips() {
  const sev = $('sevChips'); sev.replaceChildren();
  for (const k of ['all', 'fixed', 'warning']) {
    sev.append(h('button', { class: 'chipbtn', type: 'button', 'data-k': k, 'aria-pressed': S.sev === k, onclick: () => { S.sev = k; S.shown = 60; renderFindings(); } }));
  }
  const src = $('invSource'); src.replaceChildren();
  for (const k of ['in', 'out']) src.append(h('button', { class: 'chipbtn', type: 'button', 'data-k': k, 'aria-pressed': S.invSource === k, onclick: () => { S.invSource = k; S.dirty.inv = 1; buildChips(); renderInventory(); } }, t(k === 'in' ? 'ofInput' : 'ofOutput')));
  const cs = $('codeSrc'); cs.replaceChildren();
  for (const k of ['output', 'selection']) cs.append(h('button', { class: 'chipbtn', type: 'button', 'aria-pressed': S.codeSrc === k, onclick: () => { S.codeSrc = k; buildChips(); renderCode(); } }, t(k === 'output' ? 'codeOutput' : 'codeSelection')));
}
function filteredFindings() {
  const f = S.result.report.findings;
  const q = S.findQ.trim().toLowerCase();
  const out = [];
  f.forEach((x, i) => {
    if (S.sev !== 'all' && x.severity !== S.sev) return;
    if (S.group && x.group !== S.group) return;
    if (q && !(ruleLabel(x.ruleId, S.lang).toLowerCase().includes(q) || x.codePointsBefore.join(' ').toLowerCase().includes(q) || x.ruleId.includes(q))) return;
    out.push([x, i]);
  });
  return out;
}
function renderFindings() {
  const r = S.result.report, all = r.findings;
  const nFixed = all.filter((f) => f.severity === 'fixed').length;
  $('findingsCount').textContent = fmt(all.length);
  $('findingsCount').classList.toggle('zero', !all.length);
  const counts = { all: all.length, fixed: nFixed, warning: all.length - nFixed };
  $('sevChips').querySelectorAll('button').forEach((b) => {
    const k = b.dataset.k;
    b.textContent = `${t(k === 'all' ? 'all' : k === 'fixed' ? 'fixed' : 'warning')} ${fmt(counts[k])}`;
    b.setAttribute('aria-pressed', S.sev === k);
  });
  // donut + legend
  const byG = {};
  for (const f of all) byG[f.group] = (byG[f.group] || 0) + 1;
  const C = 2 * Math.PI * 78;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 200 200'); svg.setAttribute('aria-hidden', 'true');
  const ring = document.createElementNS(svg.namespaceURI, 'circle');
  ring.setAttribute('cx', 100); ring.setAttribute('cy', 100); ring.setAttribute('r', 78);
  ring.style.stroke = 'var(--bg-2)'; svg.append(ring);
  let acc = 0;
  const total = all.length || 1;
  const legend = $('legend'); legend.replaceChildren();
  for (const g of GROUPS) {
    const n = byG[g.id] || 0;
    if (!n) continue;
    const c = document.createElementNS(svg.namespaceURI, 'circle');
    c.setAttribute('cx', 100); c.setAttribute('cy', 100); c.setAttribute('r', 78);
    const len = (n / total) * C;
    c.style.stroke = GROUP_COLOR[g.id];
    c.style.strokeDasharray = `${Math.max(len - 2, 0.5)} ${C}`;
    c.style.strokeDashoffset = -acc; acc += len;
    svg.append(c);
    legend.append(h('li', {}, h('button', { class: 'chipbtn', type: 'button', style: 'display:flex;width:100%;gap:8px;align-items:center;border-radius:8px;padding:5px 8px', 'aria-pressed': S.group === g.id, onclick: () => { S.group = S.group === g.id ? null : g.id; S.shown = 60; renderFindings(); } },
      Object.assign(h('i', { style: 'width:11px;height:11px;border-radius:3px;display:block' }), {}), h('span', { style: 'flex:1;text-align:left' }, gname(g.id)), h('b', {}, fmt(n)))));
    legend.lastChild.querySelector('i').style.background = GROUP_COLOR[g.id];
  }
  const mid = h('div', { class: 'mid' }, h('b', {}, fmt(all.length)), h('span', {}, t('findings')));
  $('donut').replaceChildren(svg, mid);
  // list
  const list = filteredFindings();
  const ul = $('findingsList'); ul.replaceChildren();
  if (!list.length) ul.append(h('li', { class: 'muted' }, S.text ? t('noFindings') : t('emptyBody')));
  for (const [f, i] of list.slice(0, S.shown)) {
    const codes = f.codePointsBefore.join(' + ') + (f.after != null ? ' → ' + (f.codePointsAfter.length ? f.codePointsAfter.join(' + ') : '∅') : '');
    const gl = (s, rm) => { const el = h('span', { class: 'fglyph' + (rm ? ' rm' : ''), lang: 'bn' }); visInto(el, s); return el; };
    const item = h('button', { class: 'fitem', type: 'button', onclick: () => jumpTo(i) },
      h('span', { class: 'fsev ' + f.severity, 'aria-label': t(f.severity === 'fixed' ? 'sevFixed' : 'sevWarning') }, SEV_ICON[f.severity]),
      h('span', { class: 'fmsg' }, ruleLabel(f.ruleId, S.lang)),
      h('span', { class: 'fjump' }, t('jump') + ' ↗'),
      h('span', { class: 'fcodes' }, gl(f.before, f.after === ''), f.after ? [h('span', { class: 'arrow' }, '→'), gl(f.after)] : null, h('span', {}, codes)));
    ul.append(h('li', {}, item));
  }
  $('moreBtn').hidden = list.length <= S.shown;
}

/* ============================== highlight / diff ============================== */
function tipFor(f) {
  return `${ruleLabel(f.ruleId, S.lang)}\n${f.codePointsBefore.join(' + ')}${f.after != null ? ' → ' + (f.codePointsAfter.join(' + ') || '∅') : ''}`;
}
function renderHighlight() {
  S.dirty.hl = 0;
  const view = $('hlView'), res = S.result;
  view.replaceChildren();
  if (!res || !res.text) return;
  const text = res.text.length > HL_MAX ? res.text.slice(0, HL_MAX) : res.text;
  const frag = document.createDocumentFragment();
  let pos = 0, marks = 0;
  res.report.findings.forEach((f, i) => {
    if (f.start < pos || f.end > text.length || marks >= MARK_MAX) return;
    visInto(frag, text.slice(pos, f.start));
    const m = h('mark', { class: f.severity, tabindex: 0, 'data-i': i, 'data-tip': tipFor(f), role: 'button' });
    visInto(m, f.before);
    frag.append(m); pos = f.end; marks++;
  });
  visInto(frag, text.slice(pos));
  if (res.text.length > HL_MAX) frag.append(h('span', { class: 'chip' }, '…'));
  view.append(frag);
}
function onMarkActivate(m) {
  const f = S.result.report.findings[+m.dataset.i];
  S.inspect = f.before; S.active = +m.dataset.i;
  $('inspectIn').value = f.before; renderInspector();
  view_markActive(m);
}
function view_markActive(m) {
  document.querySelectorAll('.hl mark.active').forEach((x) => x.classList.remove('active'));
  m?.classList.add('active');
}
function jumpTo(i) {
  if (!S.result) return;
  setInTab('hl');
  if (S.dirty.hl) renderHighlight();
  const m = $('hlView').querySelector(`mark[data-i="${i}"]`);
  if (m) {
    m.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    view_markActive(m); m.focus({ preventScroll: true });
    $('paneIn').scrollIntoView({ block: 'nearest' });
  } else {
    const f = S.result.report.findings[i];
    setInTab('edit'); $('input').focus(); $('input').setSelectionRange(f.start, f.end);
  }
}
function renderDiff() {
  S.dirty.diff = 0;
  const view = $('diffView'), res = S.result;
  view.replaceChildren();
  if (!res || !res.text) return;
  const ops = diffText(res.text, res.output);
  if (ops.tooLarge) { view.append(h('p', { class: 'muted' }, t('diffLarge'))); return; }
  let ins = 0, del = 0;
  const body = h('div', { class: 'area bn hl', style: 'max-height:none;height:auto;min-height:0;resize:none' });
  for (const op of ops) {
    if (op.t === 'eq') visInto(body, op.s);
    else { const sp = h('span', { class: op.t }); visInto(sp, op.s); body.append(sp); if (op.t === 'ins') ins += [...op.s].length; else del += [...op.s].length; }
  }
  if (!ins && !del) body.replaceChildren(h('p', { class: 'muted' }, t('diffSame')));
  view.append(h('div', { class: 'diff-note' }, h('span', { class: 'del' }, `− ${fmt(del)}`), h('span', { class: 'ins' }, `+ ${fmt(ins)}`)), body);
}
function setInTab(which) {
  const hl = which === 'hl';
  $('input').hidden = hl; $('hlView').hidden = !hl;
  $('tabEdit').setAttribute('aria-selected', !hl); $('tabHl').setAttribute('aria-selected', hl);
  if (hl) { if (S.result && S.result.text !== $('input').value) { clearTimeout(liveTimer); run().then(renderHighlight); } else if (S.dirty.hl) renderHighlight(); }
}
function setOutTab(which) {
  const d = which === 'diff';
  $('output').hidden = d; $('diffView').hidden = !d;
  $('tabOutText').setAttribute('aria-selected', !d); $('tabOutDiff').setAttribute('aria-selected', d);
  if (d && S.dirty.diff) renderDiff();
}

/* ============================== inspector / inventory / compare / code ============================== */
function renderInspector() {
  const out = $('inspectOut');
  out.replaceChildren();
  const s = Array.from(S.inspect || '').slice(0, 24).join('');
  if (!s) return;
  // pair hint: base + nukta
  const cps = Array.from(s);
  for (const d of describe(s)) {
    const inv = d.category === 'invisible' || d.category === 'space';
    const gl = h('div', { class: 'iglyph' + (inv ? ' inv' : ''), lang: 'bn' });
    if (inv) gl.textContent = INVISIBLE[d.cp] || d.hex; else gl.textContent = d.ch;
    const kv = h('dl', { class: 'kv' },
      h('dt', {}, t('codePoint')), h('dd', {}, d.hex),
      h('dt', {}, t('name')), h('dd', {}, d.name),
      h('dt', {}, t('category')), h('dd', {}, t('cat')[d.category] || d.category),
      h('dt', {}, t('utf8')), h('dd', {}, d.utf8),
      h('dt', {}, t('utf16')), h('dd', {}, d.utf16),
      h('dt', {}, t('entity')), h('dd', {}, d.entity));
    if (d.note) kv.append(h('dt', {}, t('status')), h('dd', {}, h('span', { class: 'tag ok' }, t('statusPre') + ' = ' + cpHex(LETTERS[d.note.letter].base.codePointAt(0)) + ' + U+09BC')));
    out.append(h('div', { class: 'icard' }, gl, kv));
  }
  for (let i = 0; i < cps.length - 1; i++) {
    for (const [k, L] of Object.entries(LETTERS)) {
      if (cps[i] === L.base && cps[i + 1] === '\u09BC') out.prepend(h('div', { class: 'banner info' }, `${cpHex(L.base.codePointAt(0))} + U+09BC  →  ${cpHex(L.pre.codePointAt(0))}  (${k.toUpperCase()}) — ${t('twoCP')} → ${t('oneCP')}`));
    }
  }
}
function renderInventory() {
  S.dirty.inv = 0;
  const tbl = $('invTable');
  tbl.replaceChildren();
  if (!S.result) return;
  const src = S.invSource === 'in' ? S.result.text : S.result.output;
  let rows = inventory(src || '');
  const q = $('invFilter').value.trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.hex.toLowerCase().includes(q) || r.ch === q || (t('cat')[r.category] || '').toLowerCase().includes(q));
  if ($('invInvisible').checked) rows = rows.filter((r) => r.invisible);
  rows.sort((a, b) => (S.invSort === 'count' ? b.count - a.count || a.cp - b.cp : a.cp - b.cp) * (S.invAsc ? -1 : 1));
  const max = Math.max(1, ...rows.map((r) => r.count));
  const th = (label, key) => h('th', { scope: 'col', 'aria-sort': S.invSort === key ? (S.invAsc ? 'ascending' : 'descending') : 'none', onclick: () => { if (key) { S.invAsc = S.invSort === key ? !S.invAsc : false; S.invSort = key; renderInventory(); } } }, label + (S.invSort === key ? (S.invAsc ? ' ▲' : ' ▼') : ''));
  tbl.append(h('thead', {}, h('tr', {}, h('th', {}, t('glyph')), th(t('sortCode'), 'cp'), h('th', {}, t('name')), h('th', {}, t('category')), th(t('count'), 'count'))));
  const tb = h('tbody');
  for (const r of rows.slice(0, 500)) {
    const g = h('td', { class: 'g', lang: 'bn' });
    if (r.invisible || r.cp < 0x20 || r.cp === 0x20) g.append(h('span', { class: 'chip' }, INVISIBLE[r.cp] || (r.cp === 0x20 ? 'SPACE' : r.hex.slice(2)))); else g.textContent = r.ch;
    tb.append(h('tr', { tabindex: 0, onclick: () => { S.inspect = r.ch; $('inspectIn').value = r.ch; renderInspector(); switchTab('inspector'); } },
      g, h('td', { class: 'c' }, r.hex), h('td', {}, r.name), h('td', {}, t('cat')[r.category] || r.category),
      h('td', { class: 'n' }, fmt(r.count), (() => { const b = h('i', { class: 'bar' }); b.style.width = `${Math.max(4, (r.count / max) * 80)}px`; b.style.marginLeft = 'auto'; return b; })())));
  }
  tbl.append(tb);
}
function renderCompare() {
  const a = $('cmpA').value, b = $('cmpB').value, out = $('cmpOut');
  out.replaceChildren();
  if (!a && !b) return;
  const A = Array.from(a), B = Array.from(b);
  let i = 0;
  while (i < A.length && i < B.length && A[i] === B[i]) i++;
  if (a === b) { out.append(h('div', { class: 'banner info' }, '✓ ' + t('cmpSame'))); return; }
  const same = transform(a, S.opts) === transform(b, S.opts);
  const ca = A[i] ? `${cpHex(A[i].codePointAt(0))} ${charName(A[i].codePointAt(0))}` : '∅';
  const cb = B[i] ? `${cpHex(B[i].codePointAt(0))} ${charName(B[i].codePointAt(0))}` : '∅';
  out.append(
    h('div', { class: 'banner' + (same ? '' : ' bad') }, (same ? '≈ ' : '≠ ') + t(same ? 'cmpVisual' : 'cmpDiff')),
    h('p', { style: 'margin-top:10px;font:13px var(--mono)' }, t('cmpFirst', i + 1, ca, cb)));
}
function codeSource() {
  if (S.codeSrc === 'selection') return S.sel || '';
  return Array.from(S.result?.output || '').slice(0, 200).join('');
}
function renderCode() {
  S.dirty.code = 0;
  const box = $('codeOut');
  box.replaceChildren();
  const src = codeSource();
  if (!src) { box.append(h('p', { class: 'muted' }, S.codeSrc === 'selection' ? t('inspectorHint') : t('noFindings'))); return; }
  const L = toLiterals(src);
  const rows = [['JavaScript', L.js], ['Python', L.python], ['JSON', L.json], ['HTML', L.html], ['URL', L.url], ['Code points', L.codepoints], [t('searchKey'), searchKey(src)]];
  for (const [label, val] of rows) box.append(h('div', { class: 'code-row' }, h('span', { class: 'lbl' }, label), h('code', {}, val), h('button', { class: 'btn sm', type: 'button', onclick: () => copyText(val) }, t('copy'))));
}

/* ============================== tabs ============================== */
function switchTab(name) {
  S.mainTab = name;
  for (const k of ['findings', 'inspector', 'inventory', 'compare', 'code']) {
    $('t-' + k).setAttribute('aria-selected', k === name);
    $('p-' + k).hidden = k !== name;
  }
  if (name === 'inventory') renderInventory();
  if (name === 'code') renderCode();
  if (name === 'inspector') renderInspector();
}
function tabKeys(listEl, buttons, onSel) {
  listEl.addEventListener('keydown', (e) => {
    const i = buttons.findIndex((b) => b === document.activeElement);
    if (i < 0 || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[n].focus(); onSel(n);
  });
}

/* ============================== options drawer ============================== */
function detectPreset(o) {
  for (const [n, p] of Object.entries(PRESETS)) {
    if (Object.keys(p).every((k) => (k === 'form' ? (n === 'strict' ? o.form === p.form : true) : o[k] === p[k]))) return n;
  }
  return 'custom';
}
function syncControls() {
  document.querySelectorAll('#formSeg input').forEach((r) => { r.checked = r.value === S.opts.form; });
  const p = detectPreset(S.opts);
  const sel = $('preset');
  sel.querySelector('[value=custom]').hidden = p !== 'custom';
  sel.value = p;
  $('liveToggle').checked = S.live;
  document.querySelectorAll('#optionList [data-opt]').forEach((el) => {
    if (el.type === 'checkbox') el.checked = !!S.opts[el.dataset.opt]; else el.value = S.opts[el.dataset.opt];
  });
}
function optionsChanged() {
  store.set('opts', S.opts); syncControls();
  clearTimeout(liveTimer);
  if (S.live || $('input').value.length < MAX_LIVE) run();
}
function buildDrawer() {
  const body = $('optionList');
  body.replaceChildren();
  const fontSel = h('select', { class: 'select', id: 'fontSel', 'aria-label': 'Font', onchange: (e) => { S.font = e.target.value; store.set('font', S.font); applyTheme(); } },
    h('option', { value: 'sans' }, 'Noto Sans Bengali'), h('option', { value: 'serif' }, 'Noto Serif Bengali'), h('option', { value: 'hind' }, 'Hind Siliguri'));
  fontSel.value = S.font;
  body.append(h('div', { class: 'ogroup' }, h('h3', {}, 'Font'), fontSel));
  for (const g of GROUPS) {
    const sec = h('div', { class: 'ogroup' }, h('h3', {}, gname(g.id)));
    for (const o of OPTION_META.filter((x) => x.group === g.id)) {
      const label = S.lang === 'bn' ? o.bn : o.en, hint = S.lang === 'bn' ? o.hintBn : o.hintEn;
      if (o.type === 'select') {
        const sel = h('select', { class: 'select', 'data-opt': o.key, onchange: (e) => { S.opts[o.key] = e.target.value; optionsChanged(); } },
          ...o.choices.map((c) => h('option', { value: c }, (S.lang === 'bn' ? o.choiceBn : o.choiceEn)[c])));
        sec.append(h('label', { class: 'opt sel' }, h('span', { class: 't' }, label), sel));
      } else {
        sec.append(h('label', { class: 'opt' },
          h('input', { type: 'checkbox', 'data-opt': o.key, onchange: (e) => { S.opts[o.key] = e.target.checked; optionsChanged(); } }),
          h('span', { class: 't' }, label, hint ? h('span', { class: 'h' }, hint) : null)));
      }
    }
    body.append(sec);
  }
  syncControls();
}
let lastFocus;
function openDrawer(open) {
  const d = $('drawer');
  d.classList.toggle('open', open); d.setAttribute('aria-hidden', !open);
  $('backdrop').hidden = !open;
  if (open) { lastFocus = document.activeElement; setTimeout(() => $('drawerClose').focus(), 30); } else lastFocus?.focus?.();
}
function currentHash(withText) {
  const p = new URLSearchParams();
  p.set('o', b64(JSON.stringify(S.opts))); p.set('l', S.lang);
  if (withText && S.text.length <= 2000 && S.text) p.set('t', b64(S.text));
  return '#' + p.toString();
}

/* ============================== render all ============================== */
function renderAll() {
  const r = S.result;
  $('output').value = r.output;
  renderEmpty(); renderStats(); renderStatus(); renderLetters(); renderFindings(); renderSummary();
  S.dirty = { hl: 1, diff: 1, inv: 1, code: 1 };
  if (!$('hlView').hidden) renderHighlight();
  if (!$('diffView').hidden) renderDiff();
  if (S.mainTab === 'inventory') renderInventory();
  if (S.mainTab === 'code') renderCode();
}

/* ============================== wiring ============================== */
function init() {
  // restore from permalink
  try {
    const hp = new URLSearchParams(location.hash.slice(1));
    if (hp.get('o')) S.opts = { ...DEFAULTS, ...JSON.parse(unb64(hp.get('o'))) };
    if (hp.get('l') === 'bn' || hp.get('l') === 'en') S.lang = hp.get('l');
    if (hp.get('t')) $('input').value = unb64(hp.get('t'));
  } catch { /* ignore bad hash */ }

  buildLetters();
  applyI18n();
  setInTab('edit'); setOutTab('text'); switchTab('findings');

  $('input').addEventListener('input', schedule);
  $('normalizeBtn').onclick = () => { clearTimeout(liveTimer); run(); };
  $('liveToggle').onchange = (e) => { S.live = e.target.checked; store.set('live', S.live); if (S.live) run(); };
  document.querySelectorAll('#formSeg input').forEach((r) => r.addEventListener('change', () => { S.opts.form = r.value; optionsChanged(); }));
  $('preset').onchange = (e) => {
    const p = PRESETS[e.target.value]; if (!p) return;
    const keep = S.opts.form;
    S.opts = { ...p, form: e.target.value === 'strict' ? p.form : keep };
    optionsChanged();
  };
  $('optionsBtn').onclick = () => openDrawer(true);
  $('drawerClose').onclick = () => openDrawer(false);
  $('backdrop').onclick = () => openDrawer(false);
  $('resetBtn').onclick = () => { S.opts = { ...PRESETS.recommended }; optionsChanged(); };
  $('shareText').onchange = (e) => { $('shareWarn').hidden = !e.target.checked; };
  $('copyLinkBtn').onclick = () => {
    const url = location.href.split('#')[0] + currentHash($('shareText').checked);
    history.replaceState(null, '', url); copyText(url);
  };

  $('sampleBtn').onclick = () => setInput(SAMPLE, { file: null });
  $('emptySample').onclick = () => setInput(SAMPLE, { file: null });
  $('langBtn').onclick = () => { S.lang = S.lang === 'bn' ? 'en' : 'bn'; store.set('lang', S.lang); applyI18n(); };
  $('themeBtn').onclick = () => { S.theme = { system: 'light', light: 'dark', dark: 'system' }[S.theme]; store.set('theme', S.theme); applyTheme(); toast($('themeBtn').getAttribute('aria-label')); };
  $('helpBtn').onclick = () => $('helpDlg').showModal();

  $('undoBtn').onclick = undo; $('redoBtn').onclick = redo;
  $('clearBtn').onclick = () => { setInput('', { file: null }); $('input').focus(); };
  $('pasteBtn').onclick = async () => {
    try { setInput(await navigator.clipboard.readText(), { file: null }); } catch { toast(t('pasteFail')); $('input').focus(); }
  };
  $('uploadBtn').onclick = () => $('fileIn').click();
  $('fileIn').onchange = (e) => { handleFile(e.target.files[0]); e.target.value = ''; };
  $('copyBtn').onclick = () => { if (S.result?.output) copyText(S.result.output); };
  $('swapBtn').onclick = () => { if (S.result) setInput(S.result.output); };
  $('downloadBtn').onclick = () => {
    if (!S.result) return;
    const ext = S.fileDl && ['md', 'csv', 'json', 'srt'].includes(S.fileDl) ? S.fileDl : 'txt';
    const url = URL.createObjectURL(new Blob([S.result.output], { type: 'text/plain;charset=utf-8' }));
    const a = h('a', { href: url, download: `${S.fileName}.${ext}` }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // drag & drop
  const dz = $('dropZone');
  let dragDepth = 0;
  dz.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; $('paneIn').classList.add('dragging'); } });
  dz.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  dz.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('paneIn').classList.remove('dragging'); } });
  dz.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); dragDepth = 0; $('paneIn').classList.remove('dragging'); handleFile(e.dataTransfer.files[0]); } });

  // tabs
  $('tabEdit').onclick = () => setInTab('edit'); $('tabHl').onclick = () => setInTab('hl');
  $('tabOutText').onclick = () => setOutTab('text'); $('tabOutDiff').onclick = () => setOutTab('diff');
  const mainBtns = ['findings', 'inspector', 'inventory', 'compare', 'code'].map((k) => $('t-' + k));
  mainBtns.forEach((b, i) => { b.onclick = () => switchTab(['findings', 'inspector', 'inventory', 'compare', 'code'][i]); });
  tabKeys($('mainTabs'), mainBtns, (n) => switchTab(['findings', 'inspector', 'inventory', 'compare', 'code'][n]));
  $('moreBtn').onclick = () => { S.shown += 120; renderFindings(); };
  $('findSearch').oninput = (e) => { S.findQ = e.target.value; S.shown = 60; renderFindings(); };
  $('invFilter').oninput = renderInventory; $('invInvisible').onchange = renderInventory;
  $('inspectIn').oninput = (e) => { S.inspect = e.target.value; renderInspector(); };
  $('cmpA').oninput = renderCompare; $('cmpB').oninput = renderCompare;

  // highlight marks + selection tracking
  $('hlView').addEventListener('click', (e) => { const m = e.target.closest('mark'); if (m) onMarkActivate(m); });
  $('hlView').addEventListener('keydown', (e) => { const m = e.target.closest?.('mark'); if (m && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onMarkActivate(m); } });
  const trackSel = (ta) => () => {
    const s = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (!s) return;
    S.sel = s.slice(0, 400); S.inspect = s; $('inspectIn').value = Array.from(s).slice(0, 24).join('');
    if (S.mainTab === 'inspector') renderInspector();
    if (S.mainTab === 'code' && S.codeSrc === 'selection') renderCode();
  };
  for (const id of ['input', 'output']) { const ta = $(id); ['select', 'mouseup', 'keyup'].forEach((ev) => ta.addEventListener(ev, trackSel(ta))); }
  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed) return;
    const node = sel.anchorNode?.parentElement;
    if (node && (node.closest('#hlView') || node.closest('#diffView'))) {
      const s = sel.toString();
      if (s) { S.sel = s.slice(0, 400); S.inspect = s; $('inspectIn').value = Array.from(s).slice(0, 24).join(''); if (S.mainTab === 'inspector') renderInspector(); }
    }
  });

  // keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'Enter') { e.preventDefault(); clearTimeout(liveTimer); run(); }
    else if (mod && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); if (S.result) copyText(S.result.output); }
    else if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); switchTab('findings'); $('findSearch').focus(); }
    else if (e.key === 'Escape' && $('drawer').classList.contains('open')) openDrawer(false);
    else if (e.key === '?' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) { e.preventDefault(); $('helpDlg').showModal(); }
  });

  // PWA
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').then(() => { navigator.serviceWorker.ready.then(() => { $('offlinePill').hidden = false; }); }).catch(() => {});
  }
  syncControls(); syncHist();
  S.result = { ...syncRun(''), text: '' };
  renderAll();
  if ($('input').value) run();
}
init();

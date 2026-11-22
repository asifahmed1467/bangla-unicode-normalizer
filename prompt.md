# PROMPT: Build "BanglaNorm" — a Bangla Unicode Normalizer & Cleaner (Web App)

> Paste this whole file into your AI coding assistant (Claude Code, Cursor, etc.) or hand it to a developer. It is a complete spec: problem, character research, features, architecture, UI, tests, deployment.

---

## 0. Role & Quality Bar

You are a **senior frontend engineer** with strong typographic and i18n skills. Build a production-grade, accessible, fast, privacy-first web tool used internally by all developers at our company and also released publicly for free.

Non-negotiables:
- **100% client-side.** No text is ever sent to a server. Say so in the UI.
- **Zero backend, zero paid service.** Static site, hostable on a free platform.
- **Correctness over cleverness.** Every normalization rule is documented, individually toggleable, and covered by tests.
- **Bangla text must render correctly everywhere** (bundle a Bengali font; never rely on the system font).

---

## 1. The Problem

Bangla text copied from Word, PDFs, websites, Facebook, Avro/Bijoy/Google keyboards, OCR, and databases often looks identical on screen but is encoded differently. This breaks search, sorting, deduplication, string comparison, ML datasets, URLs, and database lookups.

The classic example is the letters **ড় ঢ় য়**, which have **two valid encodings**:

| Letter | Form A: Precomposed (single code point) | Form B: Decomposed (base + nukta) |
|---|---|---|
| ড় | `U+09DC` BENGALI LETTER RRA | `U+09A1` ড + `U+09BC` ় (nukta) |
| ঢ় | `U+09DD` BENGALI LETTER RHA | `U+09A2` ঢ + `U+09BC` ় (nukta) |
| য় | `U+09DF` BENGALI LETTER YYA | `U+09AF` য + `U+09BC` ় (nukta) |

**Critical technical fact (verified):** U+09DC, U+09DD and U+09DF are *composition exclusions* in Unicode. That means **standard `String.prototype.normalize('NFC')` DECOMPOSES them** into base + nukta, and `NFC` will never recompose them. So you **cannot** just call `normalize('NFC')` and be done. The tool must implement its own recomposition step after NFC/NFD.

---

## 2. Research Result: Every Problem Character/Sequence to Handle

### 2.1 Core: the nukta letters (the three dual-form letters)
Detect both forms, count each, and normalize to the user-selected target form.
- Default target: **Precomposed** (U+09DC, U+09DD, U+09DF). Reason: it is what Avro, most Bangla keyboards, Bangla Wikipedia and most fonts/datasets use, and it is one visible character = one code point.
- Alternate target: **Decomposed** (base + U+09BC), useful for Unicode-strict pipelines.
- Also detect and fix an **orphan nukta** (`U+09BC` after any consonant other than ড ঢ য, or with no base). Report as a warning; option to remove.

### 2.2 Assamese look-alikes (wrongly mixed into Bangla text)
| Char | Code | Bangla replacement |
|---|---|---|
| ৰ | `U+09F0` RA WITH MIDDLE DIAGONAL | র `U+09B0` |
| ৱ | `U+09F1` RA WITH LOWER DIAGONAL (Assamese wa) | ব `U+09AC` |
Toggle: "Replace Assamese ৰ ৱ with Bangla র ব" (default ON, since they commonly appear by font/keyboard mix-up; mark clearly as a choice because genuine Assamese text uses them).

### 2.3 Khanda Ta (ৎ): two encodings
- Correct atomic: `U+09CE` ৎ
- Legacy/wrong: `U+09A4` ত + `U+09CD` ্ + `U+200D` ZWJ  → normalize to `U+09CE`.
- Also catch ত + ্ with nothing following at word end (visible as ত্) and flag as a warning.

### 2.4 Vowel sign / vowel letter dual encodings
- ো `U+09CB` = ে `U+09C7` + া `U+09BE` — NFC already composes; keep composed.
- ৌ `U+09CC` = ে `U+09C7` + ৗ `U+09D7` — NFC composes; keep composed.
- **ঔ `U+0994` vs ও `U+0993` + ৗ `U+09D7`** — NOT canonically equivalent (NFC leaves it split); custom-compose to `U+0994`.
- **আ `U+0986` vs অ `U+0985` + া `U+09BE`** — NOT canonically equivalent; custom-compose to `U+0986`.

### 2.5 Zero-width and invisible characters
| Code | Name | Action |
|---|---|---|
| U+200B | ZERO WIDTH SPACE | remove |
| U+200C | ZWNJ | remove (except where intentionally configured, see below) |
| U+200D | ZWJ | remove, **except** the legit rakar sequence র + ZWJ + ্ + য (র‍্য, e.g. র‍্যাব, ব্র্যান্ড-style forms) and the Khanda-Ta rule above |
| U+FEFF | BOM / ZWNBSP | remove |
| U+2060 | WORD JOINER | remove |
| U+00AD | SOFT HYPHEN | remove |
| U+200E / U+200F / U+202A–202E / U+2066–2069 | bidi control marks | remove (option) |
| U+00A0, U+2007, U+202F, U+2009 etc. | non-breaking/odd spaces | replace with normal space U+0020 |

### 2.6 Structurally invalid / "unnecessary" sequences
Detect, highlight, and (toggle) fix:
- Duplicate vowel signs: `াা`, `িি`, `েে`, etc. → collapse to one.
- Duplicate hasanta: `্্` → one `্`.
- Hasanta (`U+09CD`) at end of a word or before whitespace/punctuation (except the ত্ → ৎ case) → warn / option remove.
- Vowel sign with no base consonant (start of text, after space, after another vowel letter) → warn.
- Two different vowel signs stacked on one consonant (e.g., `কিু`) → warn.
- Diacritic order inside a cluster: normalize to canonical order **base → hasanta-conjunct → vowel sign → chandrabindu/anusvara/visarga** (`ঁ ং ঃ` after vowel sign).
- Multiple spaces/tabs → single space; trim lines; collapse 3+ blank lines (each as option).

### 2.7 Punctuation and digit look-alikes
- Danda: `|` (U+007C), `।` (U+0964 Devanagari danda, which is actually the correct Bangla danda), `/`-confusions; map ASCII `|` between Bangla words to `।` (option). Double danda `॥` U+0965 ↔ `।।`.
- Digits: Bangla `০১২৩৪৫৬৭৮৯` (U+09E6–09EF) ↔ ASCII `0–9` ↔ Devanagari `०–९`. Option: "Convert all digits to Bangla / to ASCII / leave".
- Taka sign ৳ `U+09F3`; warn if `Tk`/`৳` mixed (info only).
- Smart quotes/dashes → plain (option).

### 2.8 Legacy-encoding detection (detect only, do NOT auto-convert)
If the text has high density of Latin gibberish typical of Bijoy/SutonnyMJ (e.g. `Avgvi mvaviY`), show a banner: "This looks like Bijoy (ANSI) legacy text, not Unicode. Convert it with a Bijoy→Unicode converter first." Keep this heuristic simple and clearly labelled as a guess.

### 2.9 Other scripts mixed in
Detect Devanagari/Assamese/Latin-lookalike letters inside a Bangla word (script-mixing), list them, never silently delete.

> Keep all rules in one data file (`rules.js`/`rules.json`) so they can be audited and extended without touching UI code.

---

## 3. Normalization Pipeline (Exact Order Matters)

Implement as a pure function `normalize(text, options) -> { output, report }` in a framework-free module `core/normalize.js` with **no DOM access** (so it is reusable as an npm package and CLI).

1. Unicode `NFC` first (composes ো ৌ, unifies canonical equivalents).
2. Remove/replace invisible chars (2.5), preserving legit ZWJ cases.
3. Replace look-alikes (Assamese, spaces, digits, danda, quotes) per options.
4. Khanda-Ta fix (2.3).
5. Custom compositions: ঔ, আ (2.4).
6. **Nukta pass:** first force everything to a canonical intermediate (decompose U+09DC/DD/DF → base+nukta), then compose or leave based on target form (2.1). One code path, no duplicate logic.
7. Structural cleanup (2.6): duplicates, ordering, orphans.
8. Whitespace cleanup.
9. Final `NFC`-safe check: assert output contains no precomposed/decomposed mix for the three nukta letters (internal invariant; throw in dev, warn in prod).

The function must be **idempotent**: `normalize(normalize(x)) === normalize(x)`. Add a property test for this.

### Report object (drives the whole UI)
```ts
interface Report {
  stats: { charsIn: number; charsOut: number; codePointsIn: number; codePointsOut: number;
           graphemesIn: number; graphemesOut: number; words: number; lines: number; changes: number };
  letters: {                      // detection of the dual-form letters
    'ড়': { precomposed: number; decomposed: number };
    'ঢ়': { precomposed: number; decomposed: number };
    'য়': { precomposed: number; decomposed: number };
  };
  findings: Array<{
    ruleId: string;               // e.g. 'nukta-decomposed'
    severity: 'fixed' | 'warning' | 'info';
    start: number; end: number;   // offsets in INPUT string (UTF-16)
    before: string; after: string | null;
    codePointsBefore: string[];   // ['U+09A1','U+09BC']
    message: string;              // human readable, bilingual
  }>;
  charInventory: Array<{ char: string; codePoint: string; name: string; count: number; category: string }>;
}
```
Use `Intl.Segmenter('bn', {granularity:'grapheme'})` for grapheme counts, with a graceful fallback.

---

## 4. Mandatory Features

**A. Core**
1. Large input textarea + output textarea (side by side desktop, stacked mobile).
2. **Live mode** (debounced 150 ms) and a manual "Normalize" button; auto-switch to manual above 500 KB input.
3. **Target-form switch for ড় ঢ় য়:** Precomposed / Decomposed (segmented control).
4. **Per-rule toggles** grouped in collapsible sections, with presets: *Recommended*, *Strict Unicode*, *Minimal (nukta only)*, *Aggressive cleanup*. Persist choice in `localStorage`.
5. **Copy output** (one click, toast confirmation), **Download .txt** (UTF-8, no BOM), **Paste from clipboard**, **Clear**, **Swap output→input**, **Undo/Redo** of last normalization.
6. **File upload / drag-and-drop** of `.txt`, `.csv`, `.md`, `.json`, `.srt`; process and download same format. Warn that for `.json`/`.csv` only string content should change (parse, map values, re-serialize; do not corrupt structure).

**B. Detection & Visualization (key requirement)**
7. **"Detected letters" dashboard cards** for ড়, ঢ়, য়: show counts of Form A vs Form B as a two-part bar, plus a green "consistent" / amber "mixed" / red "decomposed-only" badge.
8. **Highlighted input view:** overlay that marks each finding in the text with colors by severity; hover/focus a finding for a tooltip showing code points (e.g., `U+09AF + U+09BC → U+09DF`) and rule name.
9. **Findings panel:** filterable list (by rule, severity), click an item to scroll/select it in the input; shows count per rule.
10. **Diff view:** toggle between Output and Diff (inline word/char diff, removed in red, added in green). Implement a small diff yourself or use `diff-match-patch` (tree-shaken).
11. **Character Inspector:** click/select any character → panel with glyph, code point(s), Unicode name, category, UTF-8/UTF-16 bytes, HTML entity, and "is this normalized?" status.
12. **Character inventory table:** every distinct character in the text, sortable, with counts; invisible chars shown as labelled chips (e.g. `‹ZWJ›`, `‹NBSP›`). Option "Show invisibles" in both text areas.
13. **Stats bar:** chars/code points/graphemes/words/lines before vs after, and "N issues fixed, M warnings".
14. Small **chart** (bar or donut) of issue types. No heavy chart library: hand-rolled SVG or CSS.

**C. Developer utilities (company-wide use)**
15. **Compare mode:** paste two strings → tell if they are *visually identical but byte-different*, and show the first differing code point.
16. **Equality/search helper:** "Search key" output that gives a normalized form for DB/search indexing.
17. **Copy as code literal:** JS `"য়"`, Python `"য়"`, JSON, HTML entities `&#x9DF;`, and URL-encoded UTF-8.
18. **Permalink sharing:** encode options in the URL hash (never the text by default; optional "include text" checkbox for short inputs, with a size limit and privacy warning).
19. **Keyboard shortcuts:** `Ctrl/Cmd+Enter` normalize, `Ctrl/Cmd+Shift+C` copy output, `Ctrl/Cmd+K` focus search in findings, `?` shortcut sheet.
20. **Reusable library + CLI:** publish `core/` as `banglanorm` (ESM + CJS + types). CLI: `npx banglanorm in.txt -o out.txt --form precomposed --preset recommended`, plus `--check` mode (exit code 1 if file is not normalized) so teams can add it to **pre-commit hooks / CI**.
21. **Test-sample loader:** "Load sample" button with a tricky example that contains every issue category, great for demos and docs.

**D. UX/Product**
22. **Bilingual UI** (বাংলা / English) with a language switch; all strings in `i18n/bn.json` and `i18n/en.json`.
23. **Light / Dark / System theme.**
24. **Responsive** (360 px → 4K), **mobile-first**, no horizontal scroll.
25. **PWA / offline:** manifest + service worker so it works with no network after first load; installable.
26. **Accessibility (WCAG 2.2 AA):** full keyboard use, visible focus rings, ARIA roles/live regions for toasts and results, contrast ≥ 4.5:1, `prefers-reduced-motion`, screen-reader labels in the correct language (`lang="bn"` on Bangla text).
27. **Performance:** 1 MB Bangla text normalizes in < 300 ms on a mid laptop; run heavy work in a **Web Worker**; virtualize long findings/inventory lists.
28. **Privacy statement + no analytics by default.** (If analytics is wanted later, use cookieless privacy-friendly only, opt-in.)

---

## 5. UI / Design Spec (Senior-Level Polish)

- Clean, calm, tool-like. Think Linear/Vercel/Raycast quality, not a student project.
- **Layout (desktop):** top bar (logo, language, theme, GitHub link, shortcuts) → hero strip with one-line value prop + privacy badge → **two-pane editor** (Input | Output) → below, tabbed area: *Findings · Letters · Diff · Inspector · Inventory · Code*. Options live in a right-side collapsible drawer on desktop, bottom sheet on mobile.
- **Letters dashboard** is the hero of the results area: three large cards (ড় ঢ় য়) with big glyph (Noto Sans Bengali, 48 px+), counts, split bar, status badge, and a one-click "Fix to precomposed".
- Design tokens via CSS variables: spacing scale (4 px base), radius, shadow, 1 neutral + 1 accent color, semantic colors (success/warn/danger/info) for severities. Both themes designed, not auto-inverted.
- Typography: UI in `Inter`; Bangla in **Noto Sans Bengali** (also offer Hind Siliguri, Noto Serif Bengali, Kalpurush as a font switcher). **Self-host fonts** (subset woff2, `font-display: swap`) so it works offline; don't call Google Fonts at runtime.
- Micro-interactions: subtle transitions (≤150 ms), skeleton states, toast on copy, animated count-up on stats (respect reduced motion), empty-state illustrations with a "Try a sample" CTA.
- Make invisibles visible: tiny labelled chips with dotted underline in the highlighted view.
- Error/edge UX: huge file warning, unsupported file type, clipboard permission denied fallback (select-and-copy), no-input state.
- Footer: version, license, "Report a bug", "Unicode references", privacy note.

---

## 6. Tech Stack & Architecture

- **Vite + TypeScript**. UI: **Svelte 5** *or* **React 18**; pick one and keep bundle small (target **< 150 KB gzipped JS** excluding fonts). Prefer Svelte for size. No UI mega-frameworks. Tailwind optional; plain CSS modules/variables also fine.
- State: a tiny store (Svelte stores / Zustand). No Redux.
- Structure:
```
banglanorm/
├─ packages/
│  ├─ core/            # pure TS, zero deps: normalize(), rules, report, diff helpers
│  │   ├─ src/{normalize.ts, rules.ts, nukta.ts, inspect.ts, presets.ts}
│  │   └─ test/        # vitest, incl. property tests (fast-check)
│  └─ cli/             # `banglanorm` CLI
├─ apps/web/
│  ├─ src/{components,lib,i18n,workers,styles}
│  ├─ public/{manifest.webmanifest,icons,fonts}
│  └─ index.html
├─ .github/workflows/{ci.yml,deploy.yml}
├─ README.md  LICENSE  CONTRIBUTING.md  CHANGELOG.md
└─ pnpm-workspace.yaml
```
- Tooling: pnpm, ESLint, Prettier, Vitest, Playwright (smoke + a11y with axe), Husky + lint-staged.
- Use `String.raw`/`\u` escapes for code points inside source and tests: **never** put ambiguous Bangla literals for the nukta letters in source files, since editors may silently re-normalize them.

---

## 7. Test Requirements (must pass in CI)

Use explicit code points. Minimum vectors:

| # | Input (code points) | Expected (Precomposed target) |
|---|---|---|
| 1 | `09A1 09BC` | `09DC` |
| 2 | `09A2 09BC` | `09DD` |
| 3 | `09AF 09BC` | `09DF` |
| 4 | `09DC` / `09DD` / `09DF` | unchanged |
| 5 | `09DF` with target=Decomposed | `09AF 09BC` |
| 6 | `09A4 09CD 200D` | `09CE` |
| 7 | `09F0` / `09F1` | `09B0` / `09AC` (when option on) |
| 8 | `09C7 09BE` | `09CB` |
| 9 | `09C7 09D7` | `09CC` |
| 10 | `0993 09D7` | `0994` |
| 11 | `0985 09BE` | `0986` |
| 12 | `200B`,`FEFF`,`00AD` inside a word | removed |
| 13 | `09B0 200D 09CD 09AF` | preserved (legit rakar) |
| 14 | `09BE 09BE` | `09BE` |
| 15 | `09CD 09CD` | `09CD` |
| 16 | word `আমার য়` mixed forms | single consistent form |
| 17 | ASCII `|` after Bangla word | `0964` (option on) |
| 18 | empty string, 1-char, 5 MB string | no crash, no hang |

Plus:
- **Idempotence:** `f(f(x)) === f(x)` for 10 000 random Bangla-ish strings (fast-check).
- **No unintended change:** already-clean Bangla corpus sample (≥ 20 KB, include a real paragraph) must round-trip byte-identical under *Recommended* preset.
- **Invariant:** after normalize, text contains only one form of ড় ঢ় য়.
- **UI:** Playwright test: paste mixed text → counts match → copy button puts normalized text in clipboard. axe-core: 0 serious violations.

---

## 8. Hosting & Release (Free Platforms Only)

Primary: **GitHub Pages** (static, free, custom domain optional). Alternatives documented in README: **Cloudflare Pages**, **Netlify**, **Vercel** (free tiers).
- `deploy.yml`: on push to `main` → install → test → build `apps/web` → deploy to Pages. Set Vite `base` correctly for project-page URLs.
- Add `404.html` fallback, `robots.txt`, `sitemap.xml`, Open Graph/Twitter meta tags with a preview image, favicon set.
- Strong security headers where the host allows (CSP: `default-src 'self'`; no inline scripts; no third-party requests). Add a `_headers` file for Cloudflare/Netlify.
- Publish `core` + `cli` to **npm** (free) with semantic versioning; GitHub Releases with changelog.
- License: **MIT**. Add `CONTRIBUTING.md` and issue templates (bug report: "paste the code points").
- Lighthouse targets: Performance ≥ 95, Accessibility 100, Best Practices 100, SEO ≥ 95.

---

## 9. Deliverables Checklist

- [ ] `packages/core` with every rule in §2, documented per rule (id, description, example before/after, default on/off).
- [ ] `apps/web` with all features in §4 (A–D) and the design in §5.
- [ ] `packages/cli` with `--check`, stdin/stdout, glob support.
- [ ] Tests in §7, all green, coverage ≥ 90% on `core`.
- [ ] `README.md`: what/why, the ড় ঢ় য় explanation table, screenshots/GIF, usage (web, library, CLI, pre-commit snippet), rules reference, browser support, privacy statement, contribution guide.
- [ ] Live deployed URL on a free platform + CI badge.
- [ ] `docs/RULES.md` auto-generated from `rules.ts`.

## 10. Working Method for the AI Assistant

1. Start by writing `core` + tests (red → green) **before** any UI.
2. Show me the rules table and ask nothing unless a rule is genuinely ambiguous; otherwise choose the documented default.
3. Then scaffold the web app, wire the Web Worker, then build UI in this order: editor → options → letters dashboard → findings/highlight → diff → inspector → inventory → code-copy → i18n/theme → PWA.
4. After each milestone run tests, lint, type-check, and build; fix before moving on.
5. At the end give me: file tree, how to run locally, how to deploy to GitHub Pages step-by-step, and a list of any rules you were unsure about.

---

### Reference Facts (use in docs & tests)
- Unicode Bengali block: `U+0980–U+09FF`.
- Nukta: `U+09BC` · Hasanta/virama: `U+09CD` · Khanda Ta: `U+09CE` · Au length mark: `U+09D7`.
- Composition-excluded: `U+09DC`, `U+09DD`, `U+09DF` → NFC/NFD both yield base + nukta.
- Bangla danda is the Devanagari-block `U+0964` `।` (the Bengali block has no separate danda).

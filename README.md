# BanglaNorm — Bangla Unicode normalizer

Detects and fixes inconsistent Bangla Unicode. **100% client-side** (no server, no analytics), free to host, works offline.

## The ড় ঢ় য় problem

| Letter | One code point | Base + nukta |
|---|---|---|
| ড় | `U+09DC` | `U+09A1` + `U+09BC` |
| ঢ় | `U+09DD` | `U+09A2` + `U+09BC` |
| য় | `U+09DF` | `U+09AF` + `U+09BC` |

These three code points are *composition exclusions*: `String.normalize('NFC')` **splits** them and never recombines them, so NFC alone cannot give consistent text. BanglaNorm does its own recomposition (default: one code point, the form Avro and most keyboards produce) and lets you pick base + nukta instead.

Also handled (each rule toggleable): Assamese ৰ ৱ, Khanda Ta (ত্‍ → ৎ), ে+া → ো, অ+া → আ, ও+ৗ → ঔ, zero-width / bidi / odd spaces (legit র‍্য is kept), duplicate vowel signs / hasanta / nukta, mark order, orphan nukta & vowel signs (warn), danda `|` → `।`, digits, smart quotes, whitespace, Bijoy-text detection (guess only).

## Run

No build step. Any static server works:

```bash
npm run serve        # or: python3 -m http.server 5173
npm test             # 23 tests incl. 10 000-string idempotence fuzz
```

## Use as a library / CLI / CI check

```js
import { normalize } from './src/core.js';
const { output, report } = normalize(text, { form: 'precomposed' });
```
```bash
node bin/banglanorm.mjs in.txt -o out.txt --form precomposed --preset recommended
node bin/banglanorm.mjs --check "docs/*.md"      # exit 1 if not normalized (pre-commit / CI)
```

## Deploy free

* **GitHub Pages:** push to `main`, then Settings → Pages → Source: *GitHub Actions*. `.github/workflows/deploy.yml` tests and publishes.
* **Cloudflare Pages / Netlify / Vercel:** import the repo, no build command, output directory `/` (the `_headers` file adds CSP).
* **One file:** `npm i -D esbuild && npm run build:single` → `dist/banglanorm.html` (fonts inlined) for intranet / email.

## Notes

* Source files write Bengali code points as `\uXXXX` on purpose; keep it that way (editors may re-normalize literal ড় ঢ় য়).
* Fonts (self-hosted woff2): Noto Sans/Serif Bengali, Hind Siliguri, Inter (SIL OFL).
* Replace the GitHub link in `index.html` (`#bugLink`) with your repo URL.
* MIT licensed.

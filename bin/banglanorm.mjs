#!/usr/bin/env node
// banglanorm CLI:  banglanorm in.txt -o out.txt --form precomposed --preset recommended
//                  banglanorm --check docs/**/*.md     (exit 1 if any file is not normalized)
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { PRESETS, normalizeFile, isNormalized } from '../src/core.js';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const bool = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };

if (bool('--help') || bool('-h')) {
  console.log(`banglanorm <files...> [options]
  -o <file>        output file (single input only; default: stdout)
  --in-place       overwrite input files
  --check          exit 1 if any file would change (for CI / pre-commit)
  --form <f>       precomposed (default) | decomposed
  --preset <p>     recommended (default) | strict | minimal | aggressive
  stdin is used when no file is given.`);
  process.exit(0);
}
const out = flag('-o');
const form = flag('--form');
const presetName = flag('--preset') || 'recommended';
const check = bool('--check');
const inPlace = bool('--in-place');
if (!PRESETS[presetName]) { console.error('Unknown preset: ' + presetName); process.exit(2); }
const opts = { ...PRESETS[presetName], ...(form ? { form } : {}) };

const files = args;
const read = (f) => readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
let bad = 0;

if (!files.length) {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  if (check) process.exit(isNormalized(text, opts) ? 0 : 1);
  process.stdout.write(normalizeFile(text, '', opts).output);
} else {
  for (const f of files) {
    const text = read(f);
    const { output } = normalizeFile(text, extname(f), opts);
    if (check) {
      if (output !== text) { bad++; console.error('✗ not normalized: ' + f); } else console.log('✓ ' + f);
    } else if (out && files.length === 1) writeFileSync(out, output);
    else if (inPlace) { writeFileSync(f, output); console.error('normalized ' + f); }
    else process.stdout.write(output);
  }
  if (check) process.exit(bad ? 1 : 0);
}

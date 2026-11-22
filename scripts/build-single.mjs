// Builds dist/banglanorm.html: ONE self-contained file (JS, CSS and fonts inlined).
// Handy for emailing, intranet drops, or hosts that only take one file.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const js = (await build({
  entryPoints: [root + 'src/app.js'], bundle: true, minify: true, format: 'iife', write: false,
  define: { 'import.meta.url': '"about:blank"' }, logLevel: 'error',
})).outputFiles[0].text;
let css = readFileSync(root + 'styles.css', 'utf8');
css = css.replace(/url\(fonts\/([\w.-]+\.woff2)\)/g, (_, f) => `url(data:font/woff2;base64,${readFileSync(root + 'fonts/' + f).toString('base64')})`);
let html = readFileSync(root + 'index.html', 'utf8')
  .replace(/<link rel="(manifest|preload|apple-touch-icon)"[^>]*>\n?/g, '')
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="data:image/svg+xml;base64,${readFileSync(root + 'icon.svg').toString('base64')}">`)
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="src/app.js"></script>', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
mkdirSync(root + 'dist', { recursive: true });
writeFileSync(root + 'dist/banglanorm.html', html);
console.log('dist/banglanorm.html', (html.length / 1024).toFixed(0) + ' KB');

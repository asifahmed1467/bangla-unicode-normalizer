import { normalize, normalizeFile } from './core.js';
self.onmessage = (e) => {
  const { id, text, opts, ext } = e.data;
  const res = ext ? normalizeFile(text, ext, opts) : normalize(text, opts);
  self.postMessage({ id, res });
};

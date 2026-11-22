// Tiny code-point diff (prefix/suffix trim + LCS on the middle).
// Returns [{t:'eq'|'del'|'ins', s:string}] or {tooLarge:true}.
export function diffText(a, b, maxCells = 6_000_000) {
  if (a === b) return a ? [{ t: 'eq', s: a }] : [];
  const A = Array.from(a), B = Array.from(b);
  let p = 0;
  while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let sa = A.length, sb = B.length;
  while (sa > p && sb > p && A[sa - 1] === B[sb - 1]) { sa--; sb--; }
  const ma = A.slice(p, sa), mb = B.slice(p, sb);
  const ops = [];
  const push = (t, s) => {
    if (!s) return;
    const last = ops[ops.length - 1];
    if (last && last.t === t) last.s += s; else ops.push({ t, s });
  };
  push('eq', A.slice(0, p).join(''));
  const n = ma.length, m = mb.length;
  if (n * m > maxCells) {
    if (n + m > 4000 && n * m > maxCells) return { tooLarge: true };
  }
  if (!n) push('ins', mb.join(''));
  else if (!m) push('del', ma.join(''));
  else {
    const w = m + 1;
    const dp = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] = ma[i] === mb[j] ? dp[(i + 1) * w + j + 1] + 1
          : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (ma[i] === mb[j]) { push('eq', ma[i]); i++; j++; }
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { push('del', ma[i]); i++; }
      else { push('ins', mb[j]); j++; }
    }
    while (i < n) push('del', ma[i++]);
    while (j < m) push('ins', mb[j++]);
  }
  push('eq', A.slice(sa).join(''));
  return ops;
}

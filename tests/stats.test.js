// Compares the statistics engine in src/app.html with reference values computed by SciPy
// (tests/reference.json). Run: node tests/stats.test.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.html'), 'utf8');
const m = src.match(/const ST=\{[\s\S]*?\n\};/);
if (!m) { console.error('ST engine not found in src/app.html'); process.exit(1); }
const ST = new Function(m[0] + '\nreturn ST;')();
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'reference.json'), 'utf8'));
const { a, b, c, x, y, tab, M } = ref.data;
let fail = 0, n = 0;
const close = (name, got, want, tol = 1e-6) => {
  n++;
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want)) || (want < 1e-12 && got < 1e-9);
  if (!ok) { fail++; console.error(`FAIL ${name}: got ${got}, want ${want}`); }
};
const w = ST.welch(a, b); close('welch t', w.t, ref.welch[0]); close('welch df', w.df, ref.welch[1]); close('welch p', w.p, ref.welch[2]);
const f = ST.anova([a, b, c]); close('anova F', f.F, ref.anova[0]); close('anova p', f.p, ref.anova[1]);
const k = ST.kw([a, b, c]); close('kw H', k.H, ref.kw[0]); close('kw p', k.p, ref.kw[1]);
const ch = ST.chi2(tab); close('chi2', ch.x, ref.chi[0]); close('chi2 p', ch.p, ref.chi[1]); close('chi2 df', ch.df, ref.chi[2]);
const pe = ST.pearson(x, y); close('pearson r', pe.r, ref.pearson[0]); close('pearson p', pe.p, ref.pearson[1]);
const sp = ST.spearman(a.slice(0, 10), b); close('spearman rho', sp.r, ref.spearman[0]); close('spearman p', sp.p, ref.spearman[1]);
close('alpha', ST.alpha(M), ref.alpha);
for (const d in ref.tcrit) close('tCrit ' + d, ST.tCrit(+d), ref.tcrit[d], 1e-5);
for (const [t, d, p] of ref.pT) close(`pT(${t},${d})`, ST.pT(t, d), p);
for (const [F, d1, d2, p] of ref.pF) close(`pF(${F},${d1},${d2})`, ST.pF(F, d1, d2), p);
for (const [v, d, p] of ref.pChi) close(`pChi(${v},${d})`, ST.pChi(v, d), p);
ST.bh(ref.bh.p).forEach((v, i) => close('bh ' + i, v, ref.bh.adj[i]));
console.log(fail ? `${fail} of ${n} checks failed` : `all ${n} checks passed`);
process.exit(fail ? 1 : 0);

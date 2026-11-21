// Loads the statistics engine and stubs the registry so module files can be require()d under Node.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.html'), 'utf8');
const m = src.match(/const ST=\{[\s\S]*?\n\};/);
if (!m) throw new Error('ST engine not found in src/app.html');
global.ST = new Function(m[0] + '\nreturn ST;')();
global.addModule = () => {};
let fail = 0, n = 0;
exports.close = (name, got, want, tol = 1e-6) => {
  n++;
  const ok = Number.isFinite(got) && (Math.abs(got - want) <= tol * Math.max(1, Math.abs(want)) || (Math.abs(want) < 1e-12 && Math.abs(got) < 1e-9));
  if (!ok) { fail++; console.error(`FAIL ${name}: got ${got}, want ${want}`); }
};
exports.ok = (name, cond) => { n++; if (!cond) { fail++; console.error(`FAIL ${name}`); } };
exports.done = () => { console.log(fail ? `${fail} of ${n} checks failed` : `all ${n} checks passed`); process.exit(fail ? 1 : 0); };

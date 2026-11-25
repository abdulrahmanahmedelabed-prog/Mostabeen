// Checks src/modules/20-regression.js (OLS) against NumPy/SciPy reference values in tests/regression.reference.json.
// Run: node tests/regression.test.js
const fs = require('fs'), path = require('path');
const { close, ok, done } = require('./helpers');
const { inv, ols } = require('../src/modules/20-regression.js');
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'regression.reference.json'), 'utf8'));

const r = ols(ref.X, ref.y); ok('fit returned', !!r); ok('df', r.df === ref.df);
ref.beta.forEach((v, j) => { close('beta ' + j, r.beta[j], v); close('se ' + j, r.se[j], ref.se[j]); close('t ' + j, r.t[j], ref.t[j]);
  close('p ' + j, r.p[j], ref.p[j]); close('ci lo ' + j, r.lo[j], ref.lo[j], 1e-5); close('ci hi ' + j, r.hi[j], ref.hi[j], 1e-5); });
close('r2', r.r2, ref.r2); close('adj r2', r.adj, ref.adj); close('F', r.F, ref.F); close('F p', r.pF, ref.pF);
ref.vif.forEach((v, j) => close('vif ' + j, r.vif[j], v));

ok('singular design -> null', ols([[1, 1, 2], [1, 2, 4], [1, 3, 6], [1, 4, 8]], [1, 2, 3, 5]) === null);
ok('too few rows -> null', ols([[1, 1], [1, 2]], [1, 2]) === null);
ok('inv(singular) -> null', inv([[1, 2], [2, 4]]) === null);
done();

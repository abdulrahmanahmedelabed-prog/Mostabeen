// Checks src/modules/30-logistic.js against SciPy/NumPy reference values (tests/logistic.reference.json).
// Run: node tests/logistic.test.js
const fs = require('fs'), path = require('path');
const { close, ok, done } = require('./helpers');
require('../src/modules/20-regression.js');          // provides the shared matrix inverse
const { logit } = require('../src/modules/30-logistic.js');
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'logistic.reference.json'), 'utf8'));
const sep = JSON.parse(fs.readFileSync(path.join(__dirname, 'logistic.separation.json'), 'utf8'));

const r = logit(ref.X, ref.y); ok('fit returned', !r.error);
ref.beta.forEach((v, j) => { close('beta ' + j, r.beta[j], v, 1e-6); close('se ' + j, r.se[j], ref.se[j], 1e-6); close('z ' + j, r.z[j], ref.z[j], 1e-6);
  close('p ' + j, r.p[j], ref.p[j], 1e-5); close('OR ' + j, r.OR[j], ref.OR[j], 1e-6); close('OR lo ' + j, r.orLo[j], ref.orlo[j], 1e-5); close('OR hi ' + j, r.orHi[j], ref.orhi[j], 1e-5); });
close('loglik', r.ll, ref.ll); close('null loglik', r.ll0, ref.ll0); close('LR', r.LR, ref.LR, 1e-5); close('LR p', r.pLR, ref.pLR, 1e-5);
close('McFadden', r.mcf, ref.mcf, 1e-6); close('Nagelkerke', r.nag, ref.nag, 1e-6); close('accuracy', r.acc, ref.acc); ok('n1', r.n1 === ref.n1);

ok('complete separation detected', logit(sep.X, sep.y).error === 'separation');
ok('all-zero outcome rejected', logit(ref.X, ref.y.map(() => 0)).error === 'degenerate');
done();

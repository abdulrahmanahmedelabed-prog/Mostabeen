// Checks src/modules/10-posthoc.js against SciPy (Levene, Welch) and an independent NumPy/SciPy implementation of Dunn + Holm.
// Reference values: tests/posthoc.reference.json. Run: node tests/posthoc.test.js
const fs = require('fs'), path = require('path');
const { close, ok, done } = require('./helpers');
const { holm, levene, pairwiseWelch, dunn, pNorm2 } = require('../src/modules/10-posthoc.js');
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'posthoc.reference.json'), 'utf8'));

holm(ref.holm_in).forEach((v, i) => close('holm ' + i, v, ref.holm_out[i]));

const l = levene(ref.gs); close('levene W', l.W, ref.levene[0]); close('levene p', l.p, ref.levene[1]);
const lo = levene(ref.ord); close('levene(ord) W', lo.W, ref.levene_ord[0]); close('levene(ord) p', lo.p, ref.levene_ord[1]);

const w = pairwiseWelch(ref.gs); ok('welch pair count', w.length === ref.welch.length);
ref.welch.forEach(([i, j, t, df, p, adj], k) => {
  ok(`welch pair order ${k}`, w[k].i === i && w[k].j === j);
  close(`welch t ${i}-${j}`, w[k].stat, t); close(`welch df ${i}-${j}`, w[k].df, df); close(`welch p ${i}-${j}`, w[k].p, p); close(`welch holm ${i}-${j}`, w[k].padj, adj);
});

const d = dunn(ref.ord); ok('dunn pair count', d.length === ref.dunn.length);
ref.dunn.forEach(([i, j, z, p, adj], k) => {
  ok(`dunn pair order ${k}`, d[k].i === i && d[k].j === j);
  close(`dunn z ${i}-${j}`, d[k].stat, z); close(`dunn p ${i}-${j}`, d[k].p, p); close(`dunn holm ${i}-${j}`, d[k].padj, adj);
});

close('pNorm2(1.96)', pNorm2(1.959963984540054), .05, 1e-6); close('pNorm2(0)', pNorm2(0), 1);
done();

(function(){
  const sh = () => globalThis.__mostabeen || {};
  const pNorm2 = z => 1 - ST.gammp(.5, z * z / 2);
  const sig = v => 1 / (1 + Math.exp(-v));
  const Z975 = 1.959963984540054;

  // Logistic regression by Newton–Raphson (IRLS). X: rows with a leading column of ones, y: 0/1.
  // Returns {error:'separation'|'singular'|'degenerate'} when the maximum-likelihood estimate does not exist or is unstable.
  function logit(X, y){
    const n = X.length, k = X[0].length, n1 = y.reduce((a, b) => a + b, 0), n0 = n - n1;
    if (n1 === 0 || n0 === 0) return { error: 'degenerate' };
    let b = new Array(k).fill(0), C = null, ll = -Infinity, ok = false;
    for (let it = 0; it < 60; it++){
      const g = new Array(k).fill(0), H = Array.from({ length: k }, () => new Array(k).fill(0));
      for (let i = 0; i < n; i++){ let e = 0; for (let a = 0; a < k; a++) e += X[i][a] * b[a]; const p = sig(e), w = p * (1 - p), r = y[i] - p;
        for (let a = 0; a < k; a++){ g[a] += X[i][a] * r; for (let c = a; c < k; c++) H[a][c] += w * X[i][a] * X[i][c]; } }
      for (let a = 0; a < k; a++) for (let c = 0; c < a; c++) H[a][c] = H[c][a];
      C = sh().inv(H); if (!C) return { error: 'singular' };
      const step = C.map(r => r.reduce((s, v, j) => s + v * g[j], 0)); let mx = 0;
      for (let a = 0; a < k; a++){ b[a] += step[a]; mx = Math.max(mx, Math.abs(step[a])); }
      if (b.some(v => Math.abs(v) > 25)) return { error: 'separation' };
      if (mx < 1e-9){ ok = true; break; }
    }
    if (!ok) return { error: 'separation' };
    let H2 = Array.from({ length: k }, () => new Array(k).fill(0)); ll = 0; let hit = 0;
    for (let i = 0; i < n; i++){ let e = 0; for (let a = 0; a < k; a++) e += X[i][a] * b[a]; const p = sig(e), w = p * (1 - p); ll += y[i] ? Math.log(p) : Math.log(1 - p); if ((p >= .5) === (y[i] === 1)) hit++;
      for (let a = 0; a < k; a++) for (let c = a; c < k; c++) H2[a][c] += w * X[i][a] * X[i][c]; }
    for (let a = 0; a < k; a++) for (let c = 0; c < a; c++) H2[a][c] = H2[c][a];
    C = sh().inv(H2); if (!C) return { error: 'singular' };
    const se = b.map((_, j) => Math.sqrt(C[j][j])), z = b.map((v, j) => v / se[j]), ll0 = n1 * Math.log(n1 / n) + n0 * Math.log(n0 / n), LR = 2 * (ll - ll0), df = k - 1;
    return { n, k, n1, n0, beta: b, se, z, p: z.map(pNorm2), OR: b.map(Math.exp), orLo: b.map((v, j) => Math.exp(v - Z975 * se[j])), orHi: b.map((v, j) => Math.exp(v + Z975 * se[j])),
      ll, ll0, LR, df, pLR: df > 0 ? ST.pChi(LR, df) : NaN, mcf: 1 - ll / ll0, nag: (1 - Math.exp(-LR / n)) / (1 - Math.exp(2 * ll0 / n)), acc: hit / n };
  }

  /* ---------- module UI ---------- */
  const MAXP = 10;
  let selY = '', selEv = '', selX = new Set(), out = '';
  const idx = c => String(S.cols.indexOf(c));
  const levelsOf = c => c.type === 'categorical' ? [...new Set(c.raw.filter(v => v !== ''))] : (c.num ? [...new Set(c.num.filter(v => v != null))].sort((a, b) => a - b) : []);
  const binary = () => S.cols.filter(c => ['categorical', 'numeric', 'scale', 'nps'].includes(c.type) && levelsOf(c).length === 2);
  const preds = () => S.cols.filter(c => (c.num && ['numeric', 'scale', 'nps'].includes(c.type)) || c.type === 'categorical');
  const evVal = (c, v) => c.type === 'categorical' ? v : String(v);

  function run(){
    const yc = S.cols[+selY], pcs = [...selX].map(i => S.cols[+i]).filter(c => c && c !== yc);
    if (!yc) return '<p class="muted">اختر المتغير التابع.</p>'; if (!pcs.length) return '<p class="muted">اختر متغيراً مستقلاً واحداً على الأقل.</p>';
    if (pcs.length > MAXP) return `<p class="muted">اخترت ${pcs.length} متغيراً مستقلاً، والحد ${MAXP}.</p>`;
    const lv = levelsOf(yc), ev = lv.find(v => evVal(yc, v) === selEv) ?? lv[1], ref = lv.find(v => v !== ev);
    const num = new Array(S.n).fill(null); for (let i = 0; i < S.n; i++){ const v = yc.type === 'categorical' ? (yc.raw[i] === '' ? null : yc.raw[i]) : yc.num[i]; if (v != null) num[i] = +(v === ev); }
    const dz = sh().design({ num, name: yc.name, type: 'numeric' }, pcs); if (dz.error) return `<p class="muted">${esc(dz.error)}</p>`;
    if (!dz.X.length || dz.X[0].length < 2) return '<p class="muted">لم يبقَ أي متغير مستقل صالح.</p>';
    const r = logit(dz.X, dz.y);
    if (r.error === 'degenerate') return '<p class="muted">النتيجة لا تتغير بعد حذف الصفوف الناقصة: لا حدث أو كلها حدث.</p>';
    if (r.error === 'separation') return '<p class="muted">لم يتقارب التقدير. هذا يحدث عادة عندما يفصل متغير مستقل بين الحدث وعدمه فصلاً تاماً (separation) أو تكون بعض الفئات نادرة جداً. ادمج الفئات أو احذف المتغير المسبب.</p>';
    if (r.error) return '<p class="muted">تعذّر التقدير: بعض المتغيرات المستقلة مرتبطة ببعضها ارتباطاً تاماً أو عدد الصفوف قليل.</p>';
    const epv = Math.min(r.n1, r.n0) / (r.k - 1), warn = [];
    if (epv < 10) warn.push(`عدد الحالات في الفئة الأقل شيوعاً ${Math.min(r.n1, r.n0)} لكل ${r.k - 1} متغيرات، أي ${f(epv, 1)} لكل متغير. الأفضل 10 على الأقل، وإلا فالنسب غير مستقرة.`);
    if (yc.type !== 'categorical') warn.push(`المتغير التابع رقمي بقيمتين (${lv.join(' و ')})، والحدث هو «${ev}».`);
    const rows = r.beta.map((b, j) => `<tr><td>${esc(dz.names[j])}</td><td class="n">${f(b, 3)}</td><td class="n">${f(r.se[j], 3)}</td><td class="n">${f(r.z[j])}</td><td class="n">${pf(r.p[j])}</td><td class="n">${j ? f(r.OR[j], 2) : '—'}</td><td class="n">${j ? `${f(r.orLo[j], 2)} إلى ${f(r.orHi[j], 2)}` : '—'}</td></tr>`).join('');
    return `<p><b>انحدار لوجستي ثنائي</b> · الحدث: «${esc(yc.name)}» = «${esc(ev)}» مقابل «${esc(ref)}» · n = ${r.n}${dz.dropped ? ` (حُذف ${dz.dropped} صفاً ناقص القيم)` : ''}</p>
      <p><span class="stat">χ²(${r.df}) = ${f(r.LR)}, ${pstr(r.pLR)}, McFadden R² = ${f(r.mcf, 3)}, Nagelkerke R² = ${f(r.nag, 3)}</span></p>
      <p class="small muted">التصنيف الصحيح عند عتبة 0.5: ${pc(r.acc, 0)} (نسبة الحدث في العينة ${pc(r.n1 / r.n, 0)}). هذه الدقة تُحسب على نفس البيانات، فهي متفائلة.</p>
      <div class="scroll"><table><thead><tr><th>الحد</th><th class="n">B (لوغاريتم الأرجحية)</th><th class="n">الخطأ المعياري</th><th class="n">z</th><th class="n">p</th><th class="n">نسبة الأرجحية</th><th class="n">فترة الثقة 95%</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${dz.notes.length ? `<p class="small muted">${dz.notes.map(esc).join(' ')}</p>` : ''}
      ${warn.map(w => `<p class="small"><span class="pill warn">تنبيه</span> ${w}</p>`).join('')}
      <p class="small muted">نسبة أرجحية أكبر من 1 تعني ارتفاع أرجحية الحدث مع زيادة المتغير. قيم p (اختبار والد) غير مصحّحة للمقارنات المتعددة، ولم نفحص ملاءمة النموذج (Hosmer–Lemeshow) ولا القيم المؤثرة. النموذج يصف ارتباطاً، لا سببية.</p>`;
  }

  const reset = () => { out = ''; const el = document.getElementById('logistic-out'); if (el) el.innerHTML = ''; const rp = document.getElementById('p-rep'); if (rp) rp.dataset.stale = '1'; };
  const rerender = () => { const p = document.getElementById('p-logistic'); if (p) p.dataset.stale = '1'; const t = document.getElementById('tab-logistic'); if (t) t.click(); };

  addModule({
    id: 'logistic', label: 'الانحدار اللوجستي', after: 'regression',
    onAnalyze(){ out = ''; if (!S.cols[+selY] || !binary().includes(S.cols[+selY])) selY = ''; selX = new Set([...selX].filter(i => preds().includes(S.cols[+i]))); },
    render(){
      const bc = binary(), pcs = preds();
      if (!bc.length || pcs.length < 2) return '<div class="sheet"><h2>الانحدار اللوجستي</h2><p class="muted">نحتاج متغيراً تابعاً بقيمتين فقط (مثل نعم/لا)، ومتغيرين آخرين على الأقل للمستقلة.</p></div>';
      if (!bc.some(c => idx(c) === selY)) { selY = idx(bc[0]); selEv = ''; }
      const yc = S.cols[+selY], lv = levelsOf(yc); if (!lv.some(v => evVal(yc, v) === selEv)) selEv = evVal(yc, lv[1]);
      return `<div class="sheet"><h2>ما الذي يرفع احتمال حدوث نتيجة معينة؟</h2>
        <p class="muted small">للنتيجة ذات الفئتين (نعم/لا، راضٍ/غير راضٍ). يقدّر نسبة الأرجحية لكل متغير مستقل مع تثبيت الباقي. المتغيرات الفئوية تتحول إلى متغيرات وهمية مقابل الفئة الأكثر تكراراً.</p>
        <div class="row"><label>المتغير التابع <select id="logistic-y" aria-label="المتغير التابع">${bc.map(c => `<option value="${idx(c)}"${idx(c) === selY ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label>الحدث (القيمة التي نتنبأ بها) <select id="logistic-ev" aria-label="الحدث">${lv.map(v => `<option value="${esc(evVal(yc, v))}"${evVal(yc, v) === selEv ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label></div>
        <fieldset style="border:0;padding:0;margin:.6rem 0"><legend class="small muted">المتغيرات المستقلة (حتى ${MAXP})</legend>${pcs.filter(c => idx(c) !== selY).map(c => `<label style="display:inline-block;margin:.2rem .8rem .2rem 0"><input type="checkbox" data-logistic="${idx(c)}"${selX.has(idx(c)) ? ' checked' : ''}> ${esc(c.name)}</label>`).join('')}</fieldset>
        <button id="logistic-run" class="btn">قدّر النموذج</button>
        <div id="logistic-out">${out}</div></div>`;
    },
    report(){ return out ? `<section><h2>الانحدار اللوجستي</h2>${out}</section>` : ''; },
    click(t){ if (t.id !== 'logistic-run') return false; out = run(); const el = document.getElementById('logistic-out'); if (el) el.innerHTML = out; const rp = document.getElementById('p-rep'); if (rp) rp.dataset.stale = '1'; return true; },
    change(t){
      if (t.id === 'logistic-y'){ selY = t.value; selEv = ''; selX.delete(t.value); reset(); rerender(); return true; }
      if (t.id === 'logistic-ev'){ selEv = t.value; reset(); return true; }
      if (t.dataset && t.dataset.logistic != null){ t.checked ? selX.add(t.dataset.logistic) : selX.delete(t.dataset.logistic); reset(); return true; }
      return false; },
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = { logit };
})();

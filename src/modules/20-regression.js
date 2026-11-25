(function(){
  /* ---------- pure functions (tested against NumPy/SciPy in tests/regression.test.js) ---------- */
  // Gauss–Jordan inverse with partial pivoting. Returns null when the matrix is (nearly) singular.
  function inv(M){
    const n = M.length, A = M.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => +(i === j))));
    for (let c = 0; c < n; c++){
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-10) return null;
      [A[c], A[p]] = [A[p], A[c]]; const d = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c){ const k = A[r][c]; if (k) for (let j = 0; j < 2 * n; j++) A[r][j] -= k * A[c][j]; }
    }
    return A.map(r => r.slice(n));
  }

  // Ordinary least squares. X: rows, first column all ones. Returns null for a singular design or a perfect fit.
  function ols(X, y){
    const n = X.length, k = X[0].length, df = n - k; if (df < 1) return null;
    const XtX = Array.from({ length: k }, () => new Array(k).fill(0)), Xty = new Array(k).fill(0);
    for (let i = 0; i < n; i++) for (let a = 0; a < k; a++){ Xty[a] += X[i][a] * y[i]; for (let b = a; b < k; b++) XtX[a][b] += X[i][a] * X[i][b]; }
    for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
    const C = inv(XtX); if (!C) return null;
    const beta = C.map(r => r.reduce((s, v, j) => s + v * Xty[j], 0));
    let sse = 0, my = 0; for (const v of y) my += v; my /= n; let sst = 0;
    for (let i = 0; i < n; i++){ let e = y[i]; for (let a = 0; a < k; a++) e -= X[i][a] * beta[a]; sse += e * e; sst += (y[i] - my) ** 2; }
    if (!(sst > 0) || sse < 1e-12 * sst) return null;
    const s2 = sse / df, tc = ST.tCrit(df), se = beta.map((_, j) => Math.sqrt(s2 * C[j][j])), t = beta.map((b, j) => b / se[j]);
    const r2 = 1 - sse / sst, F = k > 1 ? ((sst - sse) / (k - 1)) / s2 : NaN;
    return { n, k, df, beta, se, t, p: t.map(v => ST.pT(v, df)), lo: beta.map((b, j) => b - tc * se[j]), hi: beta.map((b, j) => b + tc * se[j]),
      r2, adj: 1 - (1 - r2) * (n - 1) / df, F, pF: k > 1 ? ST.pF(F, k - 1, df) : NaN, rmse: Math.sqrt(s2), vif: vifs(X) };
  }

  // Variance inflation factors from the inverse correlation matrix of the non-constant columns.
  function vifs(X){
    const n = X.length, k = X[0].length - 1; if (k < 2) return new Array(Math.max(k, 0)).fill(1);
    const cols = Array.from({ length: k }, (_, j) => X.map(r => r[j + 1])), m = cols.map(c => ST.mean(c)), sd = cols.map(c => ST.sd(c));
    if (sd.some(s => !(s > 0))) return new Array(k).fill(NaN);
    const R = cols.map((a, i) => cols.map((b, j) => { let s = 0; for (let r = 0; r < n; r++) s += (a[r] - m[i]) * (b[r] - m[j]); return s / ((n - 1) * sd[i] * sd[j]); }));
    const Ri = inv(R); return Ri ? Ri.map((r, i) => r[i]) : new Array(k).fill(Infinity);
  }

  /* ---------- module UI ---------- */
  const MAXP = 10, MAXLV = 8;
  let selY = '', selX = new Set(), out = '';
  const outs = () => S.cols.filter(c => c.num && ['numeric', 'scale', 'nps'].includes(c.type));
  const preds = () => S.cols.filter(c => (c.num && ['numeric', 'scale', 'nps'].includes(c.type)) || c.type === 'categorical');
  const idx = c => String(S.cols.indexOf(c));

  // Listwise deletion; categorical predictors become dummies against their most frequent level.
  function design(yc, pcs){
    const rows = []; for (let i = 0; i < S.n; i++){ if (yc.num[i] == null) continue; if (pcs.every(c => c.type === 'categorical' ? c.raw[i] !== '' : c.num[i] != null)) rows.push(i); }
    const names = ['(الثابت)'], kinds = ['const'], srcs = [null], cols = [rows.map(() => 1)], notes = [];
    for (const c of pcs){
      if (c.type !== 'categorical'){ names.push(c.name); kinds.push('num'); srcs.push(c); cols.push(rows.map(i => c.num[i])); continue; }
      const cnt = new Map(); rows.forEach(i => cnt.set(c.raw[i], (cnt.get(c.raw[i]) || 0) + 1));
      const lv = [...cnt].sort((a, b) => b[1] - a[1]); if (lv.length < 2){ notes.push(`«${c.name}» له فئة واحدة بعد حذف الصفوف الناقصة فاستُبعد.`); continue; }
      if (lv.length > MAXLV) return { error: `«${c.name}» فيه ${lv.length} فئة، وأقصى عدد مسموح ${MAXLV}. ادمج الفئات الصغيرة أولاً.` };
      notes.push(`«${c.name}»: الفئة المرجعية «${lv[0][0]}».`);
      lv.slice(1).forEach(([l]) => { names.push(`${c.name}: ${l}`); kinds.push('dummy'); srcs.push(c); cols.push(rows.map(i => +(c.raw[i] === l))); });
    }
    return { X: rows.map((_, r) => cols.map(c => c[r])), y: rows.map(i => yc.num[i]), names, kinds, srcs, notes, dropped: S.n - rows.length };
  }

  function run(){
    const yc = S.cols[+selY], pcs = [...selX].map(i => S.cols[+i]).filter(c => c && c !== yc);
    if (!yc) return '<p class="muted">اختر المتغير التابع.</p>';
    if (!pcs.length) return '<p class="muted">اختر متغيراً مستقلاً واحداً على الأقل.</p>';
    if (pcs.length > MAXP) return `<p class="muted">اخترت ${pcs.length} متغيراً مستقلاً، والحد ${MAXP}.</p>`;
    const dz = design(yc, pcs); if (dz.error) return `<p class="muted">${esc(dz.error)}</p>`;
    if (dz.X.length && dz.X[0].length < 2) return '<p class="muted">لم يبقَ أي متغير مستقل صالح.</p>';
    const r = ols(dz.X, dz.y);
    if (!r) return '<p class="muted">تعذّر التقدير: عدد الصفوف لا يكفي، أو أن بعض المتغيرات المستقلة مرتبطة ببعضها ارتباطاً تاماً، أو أن المتغير التابع ثابت.</p>';
    const sy = ST.sd(dz.y), vmax = Math.max(...r.vif.filter(Number.isFinite), 0), ratio = r.n / (r.k - 1);
    const rows = r.beta.map((b, j) => { const std = dz.kinds[j] === 'num' ? b * ST.sd(dz.X.map(x => x[j])) / sy : null;
      return `<tr><td>${esc(dz.names[j])}</td><td class="n">${f(b, 3)}</td><td class="n">${f(r.se[j], 3)}</td><td class="n">${f(r.t[j])}</td><td class="n">${pf(r.p[j])}</td><td class="n">${f(r.lo[j], 3)} إلى ${f(r.hi[j], 3)}</td><td class="n">${std == null ? '—' : f(std, 2)}</td><td class="n">${j ? f(r.vif[j - 1], 2) : '—'}</td></tr>`; }).join('');
    const warn = [];
    if (ratio < 10) warn.push(`عدد الصفوف لكل متغير مستقل ${f(ratio, 1)} فقط. الأفضل 10 على الأقل، وإلا فالمعاملات غير مستقرة.`);
    if (vmax > 5) warn.push(`أعلى معامل تضخّم التباين ${f(vmax, 1)}. تداخل كبير بين متغيرات مستقلة يجعل معاملاتها غير موثوقة.`);
    if (yc.type !== 'numeric') warn.push('المتغير التابع مقياس ترتيبي ويُعامل هنا كأنه رقمي متساوي المسافات. استعمل النتائج استكشافياً.');
    return `<p><b>انحدار خطي متعدد</b> · التابع: «${esc(yc.name)}» · n = ${r.n}${dz.dropped ? ` (حُذف ${dz.dropped} صفاً ناقص القيم)` : ''}</p>
      <p><span class="stat">R² = ${f(r.r2, 3)}, R² المعدّل = ${f(r.adj, 3)}, F(${r.k - 1}, ${r.df}) = ${f(r.F)}, ${pstr(r.pF)}, RMSE = ${f(r.rmse, 3)}</span></p>
      <div class="scroll"><table><thead><tr><th>الحد</th><th class="n">B</th><th class="n">الخطأ المعياري</th><th class="n">t</th><th class="n">p</th><th class="n">فترة الثقة 95%</th><th class="n">β معياري</th><th class="n">VIF</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${dz.notes.length ? `<p class="small muted">${dz.notes.map(esc).join(' ')}</p>` : ''}
      ${warn.map(w => `<p class="small"><span class="pill warn">تنبيه</span> ${w}</p>`).join('')}
      <p class="small muted">قيم p هنا غير مصحّحة للمقارنات المتعددة، ولم نفحص افتراضات البواقي (التوزيع الطبيعي وتجانس التباين والاستقلال). الانحدار يصف ارتباطاً، لا سببية.</p>`;
  }

  addModule({
    id: 'regression', label: 'الانحدار', after: 'posthoc',
    onAnalyze(){ out = ''; if (!S.cols[+selY] || !S.cols[+selY].num) selY = ''; selX = new Set([...selX].filter(i => preds().includes(S.cols[+i]))); },
    render(){
      const oc = outs(), pc_ = preds();
      if (!oc.length || pc_.length < 2) return '<div class="sheet"><h2>الانحدار الخطي</h2><p class="muted">نحتاج عموداً رقمياً أو مقياساً للتابع، ومتغيرين آخرين على الأقل للمستقلة.</p></div>';
      if (!oc.some(c => idx(c) === selY)) selY = idx(oc[0]);
      return `<div class="sheet"><h2>ما الذي يفسّر هذا المتغير؟</h2>
        <p class="muted small">يقدّر انحداراً خطياً متعدداً: تأثير كل متغير مستقل مع تثبيت الباقي. المتغيرات الفئوية تتحول إلى متغيرات وهمية مقابل الفئة الأكثر تكراراً.</p>
        <div class="row"><label>المتغير التابع <select id="regression-y" aria-label="المتغير التابع">${oc.map(c => `<option value="${idx(c)}"${idx(c) === selY ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
        <fieldset style="border:0;padding:0;margin:.6rem 0"><legend class="small muted">المتغيرات المستقلة (حتى ${MAXP})</legend>${pc_.filter(c => idx(c) !== selY).map(c => `<label style="display:inline-block;margin:.2rem .8rem .2rem 0"><input type="checkbox" data-regression="${idx(c)}"${selX.has(idx(c)) ? ' checked' : ''}> ${esc(c.name)}</label>`).join('')}</fieldset>
        <button id="regression-run" class="btn">قدّر النموذج</button>
        <div id="regression-out">${out}</div></div>`;
    },
    report(){ return out ? `<section><h2>الانحدار الخطي</h2>${out}</section>` : ''; },
    click(t){ if (t.id !== 'regression-run') return false; out = run(); const el = document.getElementById('regression-out'); if (el) el.innerHTML = out; const rp = document.getElementById('p-rep'); if (rp) rp.dataset.stale = '1'; return true; },
    change(t){
      const clear = () => { out = ''; const el = document.getElementById('regression-out'); if (el) el.innerHTML = ''; const rp = document.getElementById('p-rep'); if (rp) rp.dataset.stale = '1'; };
      if (t.id === 'regression-y'){ selY = t.value; selX.delete(t.value); clear(); const p = document.getElementById('p-regression'); if (p) p.dataset.stale = '1'; document.getElementById('tab-regression') && document.getElementById('tab-regression').click(); return true; }
      if (t.dataset && t.dataset.regression != null){ t.checked ? selX.add(t.dataset.regression) : selX.delete(t.dataset.regression); clear(); return true; }
      return false; },
  });
  (globalThis.__mostabeen = globalThis.__mostabeen || {}).inv = inv; globalThis.__mostabeen.design = design;   // shared with 30-logistic.js
  if (typeof module !== 'undefined' && module.exports) module.exports = { inv, ols, vifs };
})();

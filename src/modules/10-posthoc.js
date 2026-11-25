(function(){
  /* ---------- pure functions (tested against SciPy in tests/posthoc.test.js) ---------- */
  const med = a => { const s = [...a].sort((x, y) => x - y), n = s.length, h = n >> 1; return n % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

  // Two-sided p-value of a standard normal statistic, through the regularised incomplete gamma already in ST.
  const pNorm2 = z => 1 - ST.gammp(.5, z * z / 2);

  // Holm step-down adjustment (controls the family-wise error rate).
  function holm(ps){
    const m = ps.length, idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), adj = new Array(m); let run = 0;
    idx.forEach(([p, i], k) => { run = Math.max(run, (m - k) * p); adj[i] = Math.min(1, run); });
    return adj;
  }

  // Brown–Forsythe form of Levene's test (deviations from the group median); same as scipy.stats.levene(center='median').
  function levene(gs){
    const dev = gs.map(g => { const m = med(g); return g.map(x => Math.abs(x - m)); });
    const r = ST.anova(dev); return { W: r.F, df1: r.df1, df2: r.df2, p: r.p };
  }

  // Every pair of groups with Welch's t test (no equal-variance assumption), Holm-adjusted.
  function pairwiseWelch(gs){
    const out = [];
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++){
      const w = ST.welch(gs[i], gs[j]); out.push({ i, j, diff: ST.mean(gs[i]) - ST.mean(gs[j]), stat: w.t, df: w.df, p: w.p, d: w.d });
    }
    const a = holm(out.map(o => o.p)); out.forEach((o, k) => o.padj = a[k]); return out;
  }

  // Dunn's test after Kruskal–Wallis: mean-rank differences with the tie correction, Holm-adjusted.
  function dunn(gs){
    const all = gs.flat(), N = all.length, { r, ties } = ST.rank(all); let T = 0; for (const t of ties) T += t ** 3 - t;
    const mr = [], ns = []; let o = 0; for (const g of gs){ let s = 0; for (let i = 0; i < g.length; i++) s += r[o + i]; o += g.length; mr.push(s / g.length); ns.push(g.length); }
    const v = N * (N + 1) / 12 - T / (12 * (N - 1)), out = [];
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++){
      const z = (mr[i] - mr[j]) / Math.sqrt(v * (1 / ns[i] + 1 / ns[j])); out.push({ i, j, diff: mr[i] - mr[j], stat: z, p: pNorm2(z) });
    }
    const a = holm(out.map(o => o.p)); out.forEach((o, k) => o.padj = a[k]); return out;
  }

  /* ---------- module UI ---------- */
  let selG = '', selO = '', out = '';
  const MAXG = 12;
  const cats = () => byType('categorical');
  const outs = () => S.cols.filter(c => c.num && ['numeric', 'scale', 'nps'].includes(c.type));
  const opts = (cols, cur) => cols.map(c => `<option value="${S.cols.indexOf(c)}"${String(S.cols.indexOf(c)) === cur ? ' selected' : ''}>${esc(c.name)}</option>`).join('');

  function run(){
    const g = S.cols[+selG], o = S.cols[+selO];
    if (!g || !o) return '<p class="muted">اختر متغير التجميع والمتغير المقاس.</p>';
    const gp = groups(g, o, 2);
    if (gp.length < 3) return '<p class="muted">المقارنات البعدية تحتاج ثلاث مجموعات على الأقل، في كل منها مشاهدتان. للمجموعتين استعمل اختبار «العلاقات».</p>';
    if (gp.length > MAXG) return `<p class="muted">عدد المجموعات ${gp.length} أكبر من ${MAXG}. ادمج الفئات الصغيرة أولاً حتى لا تتضخم المقارنات.</p>`;
    const names = gp.map(x => x[0]), arr = gp.map(x => x[1]), ord = o.type !== 'numeric';
    if (arr.some(a => ST.vari(a) === 0) && !ord) return '<p class="muted">إحدى المجموعات بلا تباين، فلا يصلح اختبار ت لويلش.</p>';
    const lv = levene(arr), res = ord ? dunn(arr) : pairwiseWelch(arr), small = arr.some(a => a.length < 5);
    const desc = `<div class="scroll"><table><thead><tr><th>المجموعة</th><th class="n">n</th><th class="n">${ord ? 'متوسط الرتب' : 'المتوسط'}</th><th class="n">الوسيط</th><th class="n">الانحراف</th></tr></thead><tbody>${arr.map((a, i) => {
      let mr = ''; if (ord){ const all = arr.flat(), rk = ST.rank(all).r; let off = 0; for (let k = 0; k < i; k++) off += arr[k].length; let s = 0; for (let k = 0; k < a.length; k++) s += rk[off + k]; mr = s / a.length; }
      return `<tr><td>${esc(names[i])}</td><td class="n">${a.length}</td><td class="n">${f(ord ? mr : ST.mean(a))}</td><td class="n">${f(med(a))}</td><td class="n">${f(ST.sd(a))}</td></tr>`; }).join('')}</tbody></table></div>`;
    const rows = res.map(r => `<tr><td>${esc(names[r.i])} ← ${esc(names[r.j])}</td><td class="n">${f(r.diff)}</td><td class="n">${f(r.stat)}</td><td class="n">${pf(r.p)}</td><td class="n">${pf(r.padj)}</td>${ord ? '' : `<td class="n">${f(r.d)}</td>`}<td>${r.padj < .05 ? '<span class="pill ok">دال</span>' : '<span class="pill">غير دال</span>'}</td></tr>`).join('');
    const nsig = res.filter(r => r.padj < .05).length;
    return `<p><b>${ord ? 'اختبار دن (Dunn) بعد كروسكال–واليس' : 'مقارنات ثنائية بـ t لويلش'}</b> · ${res.length} مقارنة، بتصحيح هولم</p>
      <p class="small"><span class="stat">اختبار ليفين (براون–فورسايث): W(${lv.df1}, ${lv.df2}) = ${f(lv.W)}, ${pstr(lv.p)}</span> — ${lv.p < .05 ? 'التباينات غير متجانسة بين المجموعات' + (ord ? '، وقد يعني ذلك اختلاف شكل التوزيعات فيتأثر تفسير دن' : '، وهذا سبب استعمال t لويلش لأنه لا يفترض تساوي التباين') : 'لا دليل على اختلاف التباين بين المجموعات'}.</p>
      ${desc}
      <div class="scroll"><table><thead><tr><th>المقارنة</th><th class="n">${ord ? 'فرق متوسط الرتب' : 'فرق المتوسطين'}</th><th class="n">${ord ? 'z' : 't'}</th><th class="n">p</th><th class="n">p بعد هولم</th>${ord ? '' : '<th class="n">d</th>'}<th>الحكم</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p>${nsig ? `بقيت <b class="num">${nsig}</b> من ${res.length} مقارنة دالة عند 5% بعد التصحيح.` : `لم تبقَ أي مقارنة دالة عند 5% بعد التصحيح.`}</p>
      ${small ? '<p class="small"><span class="pill warn">تنبيه</span> إحدى المجموعات أقل من 5 مشاهدات، فالنتائج غير موثوقة عند هذا الحجم.</p>' : ''}
      <p class="small muted">هذه مقارنات استكشافية بعد اختبار شامل. هولم يضبط الخطأ من النوع الأول داخل هذه العائلة من المقارنات فقط، لا عبر كل التحليلات في التطبيق.</p>`;
  }

  addModule({
    id: 'posthoc', label: 'المقارنات البعدية', after: 'rel',
    onAnalyze(){ out = ''; if (!S.cols[+selG] || S.cols[+selG].type !== 'categorical') selG = ''; if (!S.cols[+selO] || !S.cols[+selO].num) selO = ''; },
    render(){
      const gc = cats(), oc = outs();
      if (!gc.length || !oc.length) return '<div class="sheet"><h2>المقارنات البعدية</h2><p class="muted">نحتاج عموداً فئوياً وعموداً رقمياً أو مقياساً على الأقل.</p></div>';
      if (!gc.some(c => String(S.cols.indexOf(c)) === selG)) selG = String(S.cols.indexOf(gc[0]));
      if (!oc.some(c => String(S.cols.indexOf(c)) === selO)) selO = String(S.cols.indexOf(oc[0]));
      return `<div class="sheet"><h2>أي المجموعات تختلف عن غيرها؟</h2>
        <p class="muted small">عندما يكون للمتغير الفئوي ثلاث مجموعات أو أكثر، يخبرك الاختبار الشامل بوجود فرق فقط. هنا نقارن كل زوج على حدة مع تصحيح هولم: t لويلش للمتغير الرقمي، ودن للمقياس الترتيبي، مع اختبار ليفين لتجانس التباين.</p>
        <div class="row"><select id="posthoc-g" aria-label="متغير التجميع">${opts(gc, selG)}</select><span>→</span><select id="posthoc-o" aria-label="المتغير المقاس">${opts(oc, selO)}</select><button id="posthoc-run" class="btn">قارن</button></div>
        <div id="posthoc-out">${out}</div></div>`;
    },
    click(t){ if (t.id !== 'posthoc-run') return false; out = run(); const el = document.getElementById('posthoc-out'); if (el) el.innerHTML = out; return true; },
    change(t){ if (t.id === 'posthoc-g'){ selG = t.value; out = ''; const el = document.getElementById('posthoc-out'); if (el) el.innerHTML = ''; return true; }
      if (t.id === 'posthoc-o'){ selO = t.value; out = ''; const el = document.getElementById('posthoc-out'); if (el) el.innerHTML = ''; return true; } return false; },
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = { holm, levene, pairwiseWelch, dunn, pNorm2 };
})();

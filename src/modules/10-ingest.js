// تهيئة الملف: cleans the raw rows before the core types them.
// (1) multi-row headers (Qualtrics 3 rows, SurveyMonkey 2 rows) -> one header row
// (2) multi-select answers -> one نعم/لا column per option (delimited cells, or SurveyMonkey's one-column-per-option form)
// Every rule is conservative: when the pattern is not clear the rows are returned untouched.
(function(){
  const YES = 'نعم', NO = 'لا';
  const cell = v => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim();
  const flat = s => s.replace(/\s+/g, ' ').trim();
  const numLike = s => /^[\s\d٠-٩.,٬٫%+\-−:\/]+$/.test(s) && /[\d٠-٩]/.test(s);
  const widthOf = rows => rows.slice(0, 50).reduce((w, r) => Math.max(w, r ? r.length : 0), 0);
  const uniq = (base, seen) => { let s = base, k = 1; while (seen.has(s)) s = base + ' (' + (++k) + ')'; seen.add(s); return s; };

  /* ---------- (1a) Qualtrics ---------- */
  const QX_META = ['startdate', 'enddate', 'status', 'ipaddress', 'progress', 'duration (in seconds)', 'finished', 'recordeddate', 'responseid',
    'recipientlastname', 'recipientfirstname', 'recipientemail', 'externalreference', 'locationlatitude', 'locationlongitude', 'distributionchannel', 'userlanguage'];
  const QX_CODE = /^(Q\d+|QID\d+)([_.#\-][\w.#\-]+)*$/i;
  // Returns {rows, step} or null. Row 3 of a Qualtrics export is {"ImportId":"QID1"} in every cell; some exports omit it.
  function fixQualtrics(rows){
    if (rows.length < 4) return null;
    const r0 = rows[0].map(cell), r1 = (rows[1] || []).map(cell), r2 = (rows[2] || []).map(cell);
    const filled = r2.filter(Boolean), ids = filled.filter(v => /^\{\s*"?ImportId"?\s*:/i.test(v));
    let drop = 0;
    if (filled.length >= 2 && ids.length >= .8 * filled.length) drop = 2;
    else {
      // two-row variant: codes in row 1, the same metadata spelled out in row 2 ("StartDate" / "Start Date")
      const codes = r0.filter(Boolean), meta = [];
      r0.forEach((v, j) => { if (QX_META.includes(v.toLowerCase())) meta.push(j); });
      const allCodes = codes.length >= 4 && codes.every(v => QX_META.includes(v.toLowerCase()) || QX_CODE.test(v));
      const echoed = meta.filter(j => r1[j] && r1[j].replace(/\s+/g, '').toLowerCase() === r0[j].replace(/\s+/g, '').toLowerCase()).length;
      if (allCodes && meta.length >= 3 && echoed >= 3 && echoed >= .8 * meta.length && rows.length >= 4) drop = 1;
    }
    if (!drop) return null;
    const w = widthOf(rows), cnt = new Map(), seen = new Set(), head = [];
    let fromText = 0;
    for (let j = 0; j < w; j++) { const t = flat(r1[j] || ''); if (t) cnt.set(t, (cnt.get(t) || 0) + 1); }
    for (let j = 0; j < w; j++) {
      const code = flat(r0[j] || ''), t = flat(r1[j] || '');
      let h = t || code;
      if (t && code && cnt.get(t) > 1) h = t + ' [' + code + ']';   // same wording on several columns: keep the code to tell them apart
      if (t && t !== code) fromText++;
      head.push(h ? uniq(h, seen) : '');
    }
    return { rows: [head].concat(rows.slice(drop + 1)), step: { kind: 'qualtrics', dropped: drop, renamed: fromText } };
  }

  /* ---------- (1b) SurveyMonkey-style two header rows ---------- */
  const RESP = new Set(['response', 'responses', 'open-ended response', 'الرد', 'الإجابة', 'إجابة', 'الاستجابة', 'رد مفتوح', 'إجابة مفتوحة']);
  const isResp = s => RESP.has(s.toLowerCase());
  function fixTwoRow(rows){
    if (rows.length < 4) return null;
    const w = widthOf(rows), r0 = [], r1 = [];
    for (let j = 0; j < w; j++) { r0.push(flat(cell(rows[0][j]))); r1.push(flat(cell((rows[1] || [])[j]))); }
    if (r1.some(numLike)) return null;                     // a data row, not a header
    // owner[j] = column of the question a blank row-1 cell belongs to (merged cell)
    const owner = [], size = {};
    let last = -1;
    for (let j = 0; j < w; j++) { if (r0[j]) last = j; owner.push(last); if (last >= 0) size[last] = (size[last] || 0) + 1; }
    const blanks = []; for (let j = 0; j < w; j++) if (!r0[j] && owner[j] >= 0) blanks.push(j);
    if (!blanks.length || blanks.some(j => !r1[j])) return null;   // every merged column must carry its option
    const grouped = j => owner[j] >= 0 && size[owner[j]] > 1;
    const body = rows.slice(2), hasToken = r1.some(isResp);
    for (let j = 0; j < w; j++) {
      if (!grouped(j)) { if (r1[j] && !hasToken) return null; continue; }
      if (!r1[j]) return null;
      // inside a group the option names must differ, and must not look like one more answer of that column
      for (let k = owner[j]; k < j; k++) if (r1[k] === r1[j]) return null;
      if (isResp(r1[j])) continue;
      const vs = new Set(body.map(r => flat(cell(r && r[j]))).filter(Boolean));
      if (vs.has(r1[j]) && vs.size > 1) return null;
    }
    const seen = new Set(), head = [], groups = new Set();
    for (let j = 0; j < w; j++) {
      const q = owner[j] >= 0 ? r0[owner[j]] : '', o = r1[j];
      const h = !q ? o : (!o || isResp(o)) ? q : q + ' — ' + o;
      if (grouped(j)) groups.add(owner[j]);
      head.push(h ? uniq(h, seen) : '');
    }
    return { rows: [head].concat(body), step: { kind: 'tworow', dropped: 1, groups: groups.size, merged: blanks.length + groups.size } };
  }

  /* ---------- (2a) already-split multi-select: one column per option, the only value is the option label ---------- */
  const SEPS = [' — ', ' – ', ' - ', ': ', ' : ', ' | '];
  function splitHead(h){ let best = null; for (const s of SEPS) { const i = h.lastIndexOf(s); if (i > 0 && i + s.length < h.length && (!best || i > best.i)) best = { i, q: h.slice(0, i).trim(), o: h.slice(i + s.length).trim() }; } return best; }
  function fixSplit(rows){
    const head = rows[0].map(v => flat(cell(v))), body = rows.slice(1), w = head.length, byQ = new Map();
    head.forEach((h, j) => { const p = splitHead(h); if (p) { if (!byQ.has(p.q)) byQ.set(p.q, []); byQ.get(p.q).push({ j, o: p.o }); } });
    const groups = [];
    for (const [q, members] of byQ) {
      if (members.length < 2) continue;
      const hit = members.filter(m => { const vs = new Set(); let n = 0; for (const r of body) { const v = flat(cell(r && r[m.j])); if (v) { vs.add(v); n++; } } return n > 0 && vs.size === 1 && vs.has(m.o); });
      if (hit.length < 2) continue;
      groups.push({ q, all: members.map(m => m.j), hit });
    }
    if (!groups.length) return null;
    const out = rows.map(r => { const c = (r || []).slice(); while (c.length < w) c.push(''); return c; });
    const step = { kind: 'split', questions: [] };
    for (const g of groups) {
      for (const m of g.hit) out[0][m.j] = g.q + ': ' + m.o;
      let answered = 0;
      for (let i = 1; i < out.length; i++) {
        const src = rows[i] || [], any = g.all.some(j => cell(src[j]) !== '');   // answered if any column of the question is filled
        if (any) answered++;
        for (const m of g.hit) out[i][m.j] = !any ? '' : cell(src[m.j]) !== '' ? YES : NO;
      }
      step.questions.push({ q: g.q, options: g.hit.length, answered });
    }
    return { rows: out, step };
  }

  /* ---------- (2b) multi-select packed in one cell ---------- */
  const DELIMS = [
    { name: 'سطر جديد', has: s => s.includes('\n'), split: s => s.split(/\n+/) },
    { name: '؛ أو ;', has: s => /[;؛]/.test(s), split: s => s.split(/[;؛]/) },
    { name: '|', has: s => s.includes('|'), split: s => s.split('|') },
    { name: '،', has: s => s.includes('،'), split: s => s.split('،') },
    { name: ',', has: s => /,(?!\d{3}(?!\d))/.test(s), split: s => s.split(/,(?!\d{3}(?!\d))/) },
  ];
  // Returns {delim, options:[label…]} when the values look like a multi-select question, else null.
  function detectMulti(values){
    const cells = values.map(cell).filter(Boolean), n = cells.length;
    if (n < 6) return null;
    if (cells.filter(numLike).length > .2 * n) return null;
    for (const d of DELIMS) {
      const withD = cells.filter(d.has).length;
      if (withD < 3 || withD < .2 * n) continue;
      const freq = new Map(), combos = new Map(), sizes = new Set();
      let dupCells = 0, tokens = 0, bad = false;
      for (const c of cells) {
        const parts = d.split(c).map(flat).filter(Boolean), set = new Set(parts);
        if (!parts.length) { bad = true; break; }
        if (set.size < parts.length) dupCells++;
        sizes.add(set.size);
        const key = [...set].sort().join('\u0001');
        for (const p of set) { freq.set(p, (freq.get(p) || 0) + 1); tokens++; if (!combos.has(p)) combos.set(p, new Set()); combos.get(p).add(key); }
      }
      if (bad) continue;
      const opts = [...freq.keys()], K = opts.length;
      if (K < 2 || K > 15 || K > n / 2) continue;                              // small vocabulary
      if (sizes.size < 2) continue;                                            // "city, country": always the same number of parts
      if (dupCells > .02 * n) continue;                                        // an option is never ticked twice
      if (opts.some(o => o.length > 60 || o.split(' ').length > 8)) continue;  // sentences, not options
      if (opts.every(numLike)) continue;
      const recur = opts.reduce((s, o) => s + (freq.get(o) >= 2 ? freq.get(o) : 0), 0);
      if (recur < .9 * tokens) continue;                                       // options recur across rows
      if (opts.filter(o => combos.get(o).size >= 2).length < .5 * K) continue; // options combine freely ("نعم، دائماً" does not)
      opts.sort((a, b) => freq.get(b) - freq.get(a));
      return { delim: d, options: opts, counts: opts.map(o => freq.get(o)), answered: n };
    }
    return null;
  }
  function expandMulti(rows){
    const head = rows[0], body = rows.slice(1), w = widthOf(rows), plan = [];
    for (let j = 0; j < w; j++) { const h = flat(cell(head[j])); if (!h) continue; const m = detectMulti(body.map(r => r && r[j])); if (m) plan[j] = m; }
    if (!plan.some(Boolean)) return null;
    const step = { kind: 'expand', questions: [] };
    const out = rows.map((r, i) => {
      const o = [];
      for (let j = 0; j < w; j++) {
        const m = plan[j], v = r ? r[j] : '';
        if (!m) { o.push(v == null ? '' : v); continue; }
        if (i === 0) { const h = flat(cell(v)); m.options.forEach(op => o.push(h + ': ' + op)); continue; }
        const c = cell(v), set = c ? new Set(m.delim.split(c).map(flat)) : null;
        m.options.forEach(op => o.push(!set ? '' : set.has(op) ? YES : NO));
      }
      return o;
    });
    plan.forEach((m, j) => { if (m) step.questions.push({ q: flat(cell(head[j])), delim: m.delim.name, options: m.options.length, answered: m.answered, labels: m.options, counts: m.counts }); });
    return { rows: out, step };
  }

  /* ---------- pipeline ---------- */
  function clean(rows){
    const log = { before: { rows: rows.length, cols: widthOf(rows) }, steps: [] };
    let cur = rows;
    if (Array.isArray(rows) && rows.length >= 3 && rows.every(Array.isArray)) {
      const hdr = fixQualtrics(cur) || fixTwoRow(cur);
      if (hdr) { cur = hdr.rows; log.steps.push(hdr.step); }
      for (const fn of [fixSplit, expandMulti]) { const r = fn(cur); if (r) { cur = r.rows; log.steps.push(r.step); } }
    }
    log.after = { rows: cur.length, cols: widthOf(cur) };
    return { rows: cur, log };
  }

  /* ---------- UI ---------- */
  let last = null, raw = null, rawName = '', auto = true;
  const num = x => `<span class="num">${x}</span>`;
  function summary(log){
    const parts = [];
    for (const s of log.steps) {
      if (s.kind === 'qualtrics' || s.kind === 'tworow') parts.push('دُمجت صفوف العناوين');
      else parts.push(`فُصل ${s.questions.length} من أسئلة الاختيار المتعدد`);
    }
    return parts.join('، ');
  }
  function stepHTML(s){
    if (s.kind === 'qualtrics') return `<div class="check"><span class="pill ok">عناوين</span><div><b>تصدير Qualtrics بعدة صفوف عناوين</b><small>اعتُمد نص السؤال عنواناً لـ ${num(s.renamed)} عموداً (والرمز حيث لا نص)، وحُذف ${num(s.dropped)} من صفوف العناوين الزائدة حتى لا تُحسب استجابات.</small></div></div>`;
    if (s.kind === 'tworow') return `<div class="check"><span class="pill ok">عناوين</span><div><b>صفّا عناوين (نمط SurveyMonkey)</b><small>دُمج الصفان في عنوان واحد بصيغة «السؤال — الخيار» لـ ${num(s.merged)} عموداً ضمن ${num(s.groups)} سؤالاً، وحُذف صف العناوين الثاني.</small></div></div>`;
    const rows = s.questions.map(q => `<tr><td>${esc(q.q)}</td><td>${q.delim ? esc(q.delim) : 'عمود لكل خيار'}</td><td class="n">${q.options}</td><td class="n">${q.answered}</td><td class="small">${q.labels ? q.labels.map((l, i) => esc(l) + ' ' + num('(' + q.counts[i] + ')')).join(' · ') : '<span class="muted">كما في الملف</span>'}</td></tr>`).join('');
    const title = s.kind === 'expand' ? 'اختيار متعدد في خلية واحدة' : 'اختيار متعدد موزَّع على أعمدة';
    const what = s.kind === 'expand' ? 'فُصل كل سؤال إلى عمود «نعم/لا» لكل خيار وحُذف العمود الأصلي. الخلية الفارغة تبقى فارغة.' : 'وُحّدت القيم إلى «نعم/لا». من ترك أعمدة السؤال كلها فارغة يبقى فارغاً.';
    return `<div class="check"><span class="pill ok">اختيار متعدد</span><div><b>${title}</b><small>${what}</small></div></div>
      <div class="scroll"><table><thead><tr><th>السؤال</th><th>الفاصل</th><th class="n">الخيارات</th><th class="n">المجيبون</th><th>الخيارات (عدد من اختارها)</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function render(){
    const toggle = `<label class="row small" for="ingest-auto"><input type="checkbox" id="ingest-auto" ${auto ? 'checked' : ''}> تهيئة الملف تلقائياً عند التحميل</label>`;
    const note = `<p class="muted small">الكشف يعتمد على نمط واضح فقط: صف معرّفات Qualtrics، أو خلايا عناوين مدموجة فوق صف خيارات، أو خيارات قليلة تتكرر بفاصل ثابت. الأنماط الملتبسة تُترك كما هي، ولا نميّز في الأعمدة الموزَّعة بين من لم يختر شيئاً ومن تخطّى السؤال. إن بدا التغيير خاطئاً فأوقف التهيئة من المربع أعلاه.</p>`;
    if (!last) return `<div class="sheet"><header><h2>تهيئة الملف</h2>${toggle}</header><p class="muted">لم يُحمَّل ملف بعد.</p>${note}</div>`;
    const L = last, changed = L.steps.length > 0;
    const hdr = L.steps.reduce((s, x) => s + (x.dropped || 0), 0), qs = L.steps.reduce((s, x) => s + (x.questions ? x.questions.length : 0), 0);
    const body = !auto ? '<p class="muted">التهيئة التلقائية متوقفة: قُرئ الملف كما هو، بصف عناوين واحد ودون فصل الاختيار المتعدد.</p>'
      : changed ? L.steps.map(stepHTML).join('')
      : '<p><b>لم يتغير شيء.</b> <span class="muted">الملف بصف عناوين واحد ولم نجد فيه أسئلة اختيار متعدد تحتاج فصلاً.</span></p>';
    return `<div class="sheet"><header><h2>تهيئة الملف</h2>${toggle}</header>
      <p class="muted small">ما أُجري على «${esc(L.name)}» قبل تحليله.</p>
      <div class="tiles">
        <div class="tile"><span class="k">الأعمدة</span><span class="v">${L.after.cols}</span><span class="s">${changed ? 'كانت ' + L.before.cols : 'دون تغيير'}</span></div>
        <div class="tile"><span class="k">صفوف العناوين المحذوفة</span><span class="v">${hdr}</span><span class="s">الصفوف ${L.before.rows} ← ${L.after.rows}</span></div>
        <div class="tile"><span class="k">أسئلة اختيار متعدد عولجت</span><span class="v">${qs}</span><span class="s">${qs ? 'عمود «نعم/لا» لكل خيار' : 'لا يوجد'}</span></div>
      </div>
      ${body}${note}</div>`;
  }

  addModule({
    id: 'ingest', label: 'تهيئة الملف', mode: 'table', after: 'data',
    preprocess(rows, name){
      raw = rows; rawName = name;
      const r = auto ? clean(rows) : { rows, log: { before: { rows: rows.length, cols: widthOf(rows) }, after: { rows: rows.length, cols: widthOf(rows) }, steps: [] } };
      last = r.log; last.name = name || '';
      if (last.steps.length && typeof toast === 'function') setTimeout(() => toast('هُيّئ الملف: ' + summary(last) + '. التفاصيل في تبويب «تهيئة الملف»'), 50);
      return r.rows;
    },
    render,
    change(t){
      if (!t || t.id !== 'ingest-auto') return false;
      auto = t.checked;
      if (raw) loadTable(raw, rawName, S.sample, !!S.book); else render();
      return true;
    },
    report(){
      if (!last || !last.steps.length) return '';
      return `<section><h3>تهيئة الملف</h3><p>${esc(summary(last))}. <span class="stat">الأعمدة ${last.before.cols} ← ${last.after.cols}</span></p></section>`;
    },
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = { fixQualtrics, fixTwoRow, fixSplit, detectMulti, expandMulti, clean, splitHead };
})();

# Modules

Every `*.js` file here is inlined into the app by `build.js`, in file-name order, just before the app boots.
A module registers itself with `addModule({...})` and must not touch the DOM while loading.

```js
(function(){
  addModule({
    id: 'models',            // unique; also the tab id (#tab-models, #p-models)
    label: 'النماذج',         // tab label; omit for a module without a tab
    mode: 'table',           // 'table' (default) or 'doc'
    after: 'rel',            // id of the tab this one follows
    render(){ return '<div class="sheet">…</div>'; },   // HTML string, called on every re-render
    click(t, e){ … return true; },    // t = closest button; return true when handled
    change(t, e){ … return true; },   // t = event target
    preprocess(rows, name){ return rows; },   // table mode: reshape raw rows (first row = headers) before typing
    onAnalyze(){ },          // after the core analysis ran (table mode)
    report(){ return ''; },  // optional HTML section for the report
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = { /* pure functions, for tests */ };
})();
```

Core globals a module may read: `S` (state: `S.cols`, `S.n`, `S.mode`), `A` (analysis results), `D`/`DA` (document and its analysis),
`ST` (statistics engine), `vals(col)`, `byType(...types)`, `esc`, `f`, `pf`, `pstr`, `pc`, `barList`, `pill`, `toast`, `saveFile(name, data, mime)`,
`loadTable(rows, name)`, `loadDoc(doc)`, `analyze()`, `analyzeDoc()`, `render()`, `loadLib`-style lazy script loading from cdn.jsdelivr.net.

Rules: prefix every element id and data attribute with the module id; keep state inside the closure;
escape every file-derived string with `esc`; re-rendering replaces the DOM, so keep UI state in variables;
no network calls with user data; say plainly in the UI what a method cannot do.

Tests live in `tests/<module>.test.js`, run under Node with `require('./helpers')` and compare against reference values
computed with SciPy / statsmodels / numpy and stored in the test file.

// Builds the pages from src/. Modules in src/modules/*.js are inlined into the app, in file-name order.
// Outputs: app.html, index.html (open anywhere, GitHub Pages) and build/app.fragment.html (body-only, for embedding).
// Usage: node build.js
const fs = require('fs'), path = require('path');
const shell = (body) => '<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style></head><body>\n' + body + '</body></html>\n';
// Optional: `--only <name>` builds with a single module, `--out <dir>` writes app.html there instead of the repo root.
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const only = arg('--only'), out = arg('--out');
const dir = path.join('src', 'modules');
const mods = (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort() : []).filter(f => !only || f.includes(only));
const code = mods.map(f => `/* ---- module: ${f} ---- */\n` + fs.readFileSync(path.join(dir, f), 'utf8').replace(/<\/script/gi, '<\\/script')).join('\n');
const app = fs.readFileSync('src/app.html', 'utf8').replace('/*__MODULES__*/', () => code);
if (out) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'app.html'), shell(app)); console.log(`built ${out}/app.html (${mods.length} modules)`); process.exit(0); }
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/app.fragment.html', app);
fs.writeFileSync('app.html', shell(app));
fs.writeFileSync('index.html', shell(fs.readFileSync('src/landing.html', 'utf8').replace(/__APP_URL__/g, 'app.html')));
console.log(`built index.html, app.html (${mods.length} modules)`);

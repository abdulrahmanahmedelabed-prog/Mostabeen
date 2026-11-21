// Wraps the page sources in a document shell so they open anywhere (GitHub Pages, local file).
// Usage: node build.js
const fs = require('fs');
const shell = (body) => '<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style></head><body>\n' + body + '</body></html>\n';
fs.writeFileSync('app.html', shell(fs.readFileSync('src/app.html', 'utf8')));
fs.writeFileSync('index.html', shell(fs.readFileSync('src/landing.html', 'utf8').replace(/__APP_URL__/g, 'app.html')));
console.log('built index.html, app.html');

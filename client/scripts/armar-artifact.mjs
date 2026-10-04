// Arma la página única que se publica en claude.ai a partir del build `--mode artifact`.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const assets = readdirSync('dist/assets');
const leer = (ext) => assets.filter((f) => f.endsWith(ext)).map((f) => readFileSync(`dist/assets/${f}`, 'utf8')).join('\n');
const css = leer('.css');
const js = leer('.js').replace(/<\/script/gi, '<\\/script');

const html = `<title>Deenex Cobranza</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;

mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/cobranza.html', html);
console.log(`dist-artifact/cobranza.html (${(html.length / 1024).toFixed(0)} KB)`);

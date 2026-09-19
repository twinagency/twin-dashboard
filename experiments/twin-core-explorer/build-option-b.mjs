import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, 'dist-option-b');
const revision = 'option-b-native-6';
const files = {};
function replaceOnce(text, from, to, name) {
  if (text.split(from).length !== 2) throw new Error(`Expected one matching source segment in ${name}`);
  return text.replace(from, to);
}
async function source(path) {
  const name = path.split('?')[0];
  if (basename(name) !== name) throw new Error('Only local release entry files are permitted');
  let text = await readFile(join(root, name), 'utf8');
  if (name === 'mobile-panel.js') {
    text = replaceOnce(text, "const media = matchMedia('(max-width:720px)');", "const media = matchMedia('(min-width:0px)');", name);
  }
  if (name === 'mobile-panel.css') {
    text = replaceOnce(text, '@media (max-width: 720px) {', '@media (min-width: 0px) {', name);
  }
  files[name] = createHash('sha256').update(text).digest('hex');
  return text;
}
let html = await readFile(join(root, 'index.html'), 'utf8');
// Inline the complete approved build so a manual upload cannot omit Option B assets.
for (const match of [...html.matchAll(/<link rel="stylesheet" href="([^\"]+)"\s*>/g)]) {
  if (/^https?:/.test(match[1])) continue;
  html = html.replace(match[0], `<style data-source="${match[1]}">\n${await source(match[1])}\n</style>`);
}
for (const match of [...html.matchAll(/<script src="([^\"]+)"><\/script>/g)]) {
  if (/^https?:/.test(match[1])) throw new Error('Unexpected external executable dependency');
  const script = (await source(match[1])).replace(/<\/script/gi, '<\\/script');
  html = html.replace(match[0], `<script data-source="${match[1]}">\n${script}\n</script>`);
}
const stableCss = `
/* Option B at every viewport. Only actual capability totals are visible. */
.ring, .ring::before, .ring::after, .node-code { display: none !important; }
body.mobile-panel-ui .stage .orb {
  left: 50% !important; top: 50% !important;
  transform: translate(-50%, -50%) !important;
  translate: none !important; rotate: none !important; scale: 1 !important;
  animation: none !important; transition: none !important;
  filter: none !important; backdrop-filter: none !important;
  box-shadow: none !important; opacity: 1 !important;
}
body.mobile-panel-ui .orb canvas {
  display: block; width: 100%; height: 100%;
  transform: none !important; scale: 1 !important; animation: none !important;
  filter: none !important; image-rendering: auto;
}
body.mobile-panel-ui .workspace, body.mobile-panel-ui .core-side,
body.mobile-panel-ui .stage { filter: none !important; transition: none !important; }
@media (min-width: 721px) {
  body.mobile-panel-ui .title { max-width: 720px; margin-top: 24px; }
  body.mobile-panel-ui .title h1 { font-size: 46px; }
  body.mobile-panel-ui .title .subtitle { max-width: 620px; font-size: 17px; }
  body.mobile-panel-ui .stage { max-width: 720px; height: 280px !important; margin-top: 10px; }
  body.mobile-panel-ui .stage .orb { width: 330px; height: 330px; }
  body.mobile-panel-ui .command-area, body.mobile-panel-ui .capability-panel { width: calc(100% - 64px); max-width: 640px; }
  body.mobile-panel-ui .system-button { min-height: 105px; }
  body.mobile-panel-ui .system-name { font-size: 16px; }
  body.mobile-panel-ui .system-count { font-size: 12px; }
}
`;
html = html.replace('</head>', `<meta name="twin-release" content="${revision}"><style>${stableCss}</style>\n</head>`);
if (/<script\s+src=/.test(html)) throw new Error('Unresolved executable dependency');
if (!html.includes("orbRuntimeRevision = 'native-resolution-continuous-6'")) throw new Error('Native-resolution runtime is missing');
await mkdir(out, { recursive: true });
await writeFile(join(out, 'index.html'), html);
await writeFile(join(out, '_headers'), '/*\n  Cache-Control: public, max-age=0, must-revalidate\n');
await writeFile(join(out, 'release.json'), JSON.stringify({ revision, builtAt: new Date().toISOString(), files }, null, 2));
console.log(`Prepared ${revision}: ${Object.keys(files).length} sources in one complete index.html`);
console.log(resolve(out));

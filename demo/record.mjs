// Enregistre la démonstration de l'extension : build Chrome chargé dans un
// Chromium piloté par Playwright, offre fictive servie en local, réponses du
// modèle simulées (aucun appel réseau, aucune clé réelle).
//
// Ce script n'est pas une dépendance du projet. Il charge Playwright et
// ffmpeg-static depuis un dossier d'outils installé hors du dépôt :
//
//   A4M_TOOLS=/chemin/outils    dossier contenant node_modules/playwright et node_modules/ffmpeg-static
//   A4M_EXT=/chemin/dist        build Chrome embarquant demo/profil-fictif.json
//   A4M_OUT=/chemin/sortie      dossier de sortie (demo.mp4, demo.gif), docs/media par défaut
//   PLAYWRIGHT_BROWSERS_PATH    dossier du Chromium de Playwright, hors du cache par défaut
//
// Le build de démonstration se fait avec :
//   TARGET_BROWSER=chrome A4M_SEED=demo/profil-fictif.json npx vite build
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = process.env.A4M_TOOLS;
const EXT = process.env.A4M_EXT;
const OUT = process.env.A4M_OUT ?? path.join(HERE, '..', 'docs', 'media');
if (!TOOLS || !EXT) throw new Error("A4M_TOOLS et A4M_EXT sont obligatoires, voir l'en-tête du script.");

const req = createRequire(path.join(TOOLS, 'noop.js'));
const { chromium } = req('playwright');
const FFMPEG = req('ffmpeg-static');
const { answerFor } = await import('./mock-llm.mjs');

const W = 1280;
const H = 720;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'a4m-demo-'));
fs.mkdirSync(OUT, { recursive: true });

// Offre fictive servie en local, rien d'autre n'est joignable.
const offerHtml = fs.readFileSync(path.join(HERE, 'offre-fictive.html'));
const server = http.createServer((_, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(offerHtml);
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const port = server.address().port;
const offerUrl = `http://127.0.0.1:${port}/offre.html`;

const ctx = await chromium.launchPersistentContext(path.join(work, 'profile'), {
  channel: 'chromium', headless: true, viewport: { width: W, height: H },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

const blocked = [];
let llmCalls = 0;
await ctx.route('**/*', async route => {
  const url = route.request().url();
  if (url.startsWith(`http://127.0.0.1:${port}/`) || /^(chrome-extension|data|blob):/.test(url)) return route.continue();
  if (url.startsWith('https://api.anthropic.com/v1/messages')) {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = JSON.parse(route.request().postData() ?? '{}');
    llmCalls++;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(answerFor(body.messages?.[0]?.content ?? '')) });
  }
  blocked.push(url);
  return route.abort();
});

// Identifiant de l'extension chargée.
const mgr = await ctx.newPage();
await mgr.goto('chrome://extensions');
const ID = await mgr.evaluate(() => {
  const list = document.querySelector('extensions-manager').shadowRoot.querySelector('extensions-item-list');
  return [...list.shadowRoot.querySelectorAll('extensions-item')].map(i => i.id)[0];
});
await mgr.close();

const offer = await ctx.newPage();
await offer.goto(offerUrl);

// Clé fictive : le modèle est simulé, elle n'est jamais envoyée nulle part.
const setup = await ctx.newPage();
await setup.goto(`chrome-extension://${ID}/extension/options/options.html`);
await setup.evaluate(() => chrome.storage.local.set({ apiKey: 'cle-de-demonstration-fictive', provider: 'anthropic', model: 'claude-sonnet-5-5' }));
// L'ouverture de la page de réglages charge le profil fictif embarqué : on attend qu'il soit en place.
await setup.waitForFunction(async () => !!(await chrome.storage.local.get('factBase')).factBase && !!(await chrome.storage.local.get('profile')).profile, null, { timeout: 15000 });
await setup.close();

const clips = [];
async function record(page, name, fn) {
  const file = path.join(work, `${name}.webm`);
  await page.screencast.start({ path: file, size: { width: W, height: H } });
  const stop = () => page.screencast.stop().catch(() => {});
  try { await fn(stop); } finally { await stop(); }
  clips.push({ name, file });
}
const sleep = (page, ms) => page.waitForTimeout(ms);

// 1. L'offre
await offer.bringToFront();
await record(offer, 'offre', async () => {
  await sleep(offer, 1500);
  for (let y = 0; y <= 430; y += 10) { await offer.evaluate(v => window.scrollTo(0, v), y); await sleep(offer, 25); }
  await sleep(offer, 2200);
  for (let y = 430; y >= 0; y -= 15) { await offer.evaluate(v => window.scrollTo(0, v), y); await sleep(offer, 20); }
  await sleep(offer, 600);
});

// 2. Le popup lit l'offre et rend un verdict. Ouvert dans un onglet : on lui
// désigne l'onglet de l'offre, qu'il lit réellement via le content script.
const popup = await ctx.newPage();
await popup.addInitScript(pattern => {
  // Le vrai popup se ferme seul après le clic ; ici on le laisse ouvert le temps de filmer la fin.
  window.close = () => {};
  const q = chrome.tabs.query.bind(chrome.tabs);
  chrome.tabs.query = info => q(info && info.active ? { url: pattern } : info);
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = 'html{background:#d9d4cc;min-height:100vh}body{margin:24px auto 0!important;box-shadow:0 8px 30px rgba(0,0,0,.25)}';
    document.head.appendChild(s);
  });
}, `http://127.0.0.1:${port}/*`);
let ws;
await record(popup, 'verdict', async () => {
  await popup.goto(`chrome-extension://${ID}/extension/popup/popup.html`);
  await popup.getByText('Préparer ma candidature').waitFor({ timeout: 15000 }).catch(async e => { console.log('POPUP TEXT:', await popup.innerText('body')); throw e; });
  await sleep(popup, 3200);
  await popup.getByText('Docker', { exact: true }).click();
  await sleep(popup, 2200);
  const wsPromise = ctx.waitForEvent('page');
  await popup.getByText('Préparer ma candidature').click();
  ws = await wsPromise;
  await sleep(popup, 1200);
});
await popup.close();

// 3. L'espace candidature : CV, lettre, révision.
await ws.setViewportSize({ width: W, height: H });
await record(ws, 'candidature', async () => {
  await sleep(ws, 800);
  await ws.getByText("Insérer dans l'offre").waitFor({ timeout: 60000 });
  await ws.waitForFunction(() => document.body.innerText.includes('COMPÉTENCES') && [...document.querySelectorAll('textarea')].some(t => t.value.length > 200), null, { timeout: 60000 });
  await sleep(ws, 3500);
  await ws.getByText('Entretien', { exact: true }).click();
  await sleep(ws, 3500);
  await ws.getByText('Lettre', { exact: true }).last().click();
  await sleep(ws, 2000);
  await ws.getByText("Insérer dans l'offre").click();
  await sleep(ws, 1800);
});

// 4. La lettre est dans le formulaire de l'offre.
await offer.bringToFront();
await record(offer, 'insertion', async () => {
  await offer.evaluate(() => document.querySelector('textarea').scrollIntoView({ block: 'center' }));
  await sleep(offer, 3500);
});

await ctx.close();
server.close();
console.log(`appels au modèle simulé : ${llmCalls}, requêtes bloquées hors local : ${blocked.length}`);
if (blocked.length) console.log(blocked.join('\n'));

// Montage : légende discrète en bas de chaque étape, MP4 puis GIF.
const ff = (args, opts = {}) => {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd: work, ...opts });
  if (r.status !== 0) throw new Error(`ffmpeg : ${r.stderr?.toString()}`);
};
const durationOf = file => {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  const t = [...r.stderr.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
  return t ? Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]) : 0;
};
const captions = {
  offre: "1. Une offre d'emploi fictive",
  verdict: '2. Verdict et compétences à ajouter',
  candidature: '3. CV adapté, lettre et révision',
  insertion: "4. Lettre insérée dans le formulaire",
};
const font = 'C\\:/Windows/Fonts/segoeuib.ttf';
let t0 = 0;
const draws = [];
clips.forEach((c, i) => {
  const d = durationOf(c.file);
  fs.writeFileSync(path.join(work, `cap${i}.txt`), captions[c.name]);
  draws.push(`drawtext=fontfile='${font}':textfile=cap${i}.txt:fontcolor=white@0.95:fontsize=20:box=1:boxcolor=black@0.55:boxborderw=10:x=(w-tw)/2:y=h-46:enable='between(t,${t0.toFixed(2)},${(t0 + d).toFixed(2)})'`);
  t0 += d;
});
const inputs = clips.flatMap(c => ['-i', c.file]);
const chain = clips.map((_, i) => `[${i}:v]fps=25,scale=${W}:${H},setsar=1[v${i}]`).join(';')
  + `;${clips.map((_, i) => `[v${i}]`).join('')}concat=n=${clips.length}:v=1:a=0[cat]`
  + `;[cat]${draws.join(',')},format=yuv420p[out]`;
ff([...inputs, '-filter_complex', chain, '-map', '[out]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-movflags', '+faststart', path.join(OUT, 'demo.mp4')]);
ff(['-i', path.join(OUT, 'demo.mp4'), '-vf', 'fps=8,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', path.join(OUT, 'demo.gif')]);
console.log('durée', t0.toFixed(1), 's', fs.statSync(path.join(OUT, 'demo.mp4')).size, 'octets mp4', fs.statSync(path.join(OUT, 'demo.gif')).size, 'octets gif');

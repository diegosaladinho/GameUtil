'use strict';
const {
  app, BrowserWindow, ipcMain, dialog, Menu, shell, protocol, net, Tray, nativeImage, nativeTheme, safeStorage
} = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');

const { scanSystem } = require('./src/scanner');
const { demoItems } = require('./src/demo');
const { TOOL_CATEGORIES, GAME_GENRES, isValidCategory } = require('./src/categorizer');
const { enrich, SCHEMA } = require('./src/online');
const { toCsv, toJson } = require('./src/exporter');
const { Store } = require('./src/store');
const { norm } = require('./src/util');
const { runPowerShell } = require('./src/ps');
const { findSteamRoot, readSteamPlaytime } = require('./src/steam');
const { buildEntries } = require('./src/library');
const { Tracker } = require('./src/playtime');
const { resolveArt, artRevs, KINDS } = require('./src/art');
const { downloadImage, importImage, fileId } = require('./src/images');
const { findArt: findSgdbArt } = require('./src/steamgriddb');
const { planLaunch, validateArgs, findMainExe, uninstallCommand, validUninstallKey } = require('./src/launch');
const { dominantColor } = require('./src/colors');
const { makeIconPng } = require('./src/appicon');
const { findPage } = require('./src/wiki');
const { findGog } = require('./src/gog');
const { findRawg } = require('./src/rawg');
const { EXTS } = require('./src/images');
const { needsAutofill } = require('./src/autofill');
const { migrateUserData } = require('./src/migrate');
const backup = require('./src/backup');

// El icono se dibuja por código (~115 ms para 256 px). Se genera una vez y se guarda; los arranques siguientes solo lo leen.
function cachedIcon(size) {
  const file = path.join(app.getPath('userData'), `icon-${size}.png`);
  try { const b = fs.readFileSync(file); if (b.length > 100) return nativeImage.createFromBuffer(b); } catch { /* aún no existe */ }
  const png = makeIconPng(size);
  try { fs.writeFileSync(file, png); } catch { /* sin caché: se genera cada vez */ }
  return nativeImage.createFromBuffer(png);
}
const { dataDir } = require('./src/paths');

// El esquema "lib://" sirve las imágenes locales a la interfaz sin abrirle el disco.
protocol.registerSchemesAsPrivileged([{ scheme: 'lib', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// Identidad de la app: nombre, carpeta de datos y grupo de la barra de tareas.
const APP_NAME = 'GameUtil';
app.setName(APP_NAME);
const APP_DATA = app.getPath('appData');
const OLD_DATA_DIR = path.join(APP_DATA, 'inventario-software');   // nombre de las versiones anteriores
app.setPath('userData', dataDir({ appData: APP_DATA, name: APP_NAME }).dir);
if (process.platform === 'win32') app.setAppUserModelId('com.gameutil.app');

const IS_WIN = process.platform === 'win32';
const DAY = 24 * 60 * 60 * 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const THEMES = ['auto', 'light', 'dark'];

let win = null;
let tray = null;
let store = null;
let tracker = null;
let quitting = false;
let bootData = null;
let busy = false;
let cancelFlag = false;

let entries = [];
let byKey = new Map();
let rawByKey = new Map();
let artCache = new Map();
let exeCache = new Map();
let accentCache = new Map();
let steamRoot = null;
let steamMap = new Map();
let lastRunning = new Set();

// ------------------------------------------------------------------ envío ----

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// ------------------------------------------------------------------ Steam ----

// Lee las horas que Steam ya tiene guardadas y las conserva también en nuestro archivo.
async function refreshSteam() {
  try {
    if (steamRoot === null) steamRoot = (await findSteamRoot()) || '';
    const live = readSteamPlaytime(steamRoot || null);
    const kept = store.playtime.data.steam || (store.playtime.data.steam = {});
    let dirty = false;
    for (const [id, rec] of live.map) {
      const old = kept[id];
      if (!old || rec.minutes >= old.minutes) {
        if (!old || old.minutes !== rec.minutes || old.lastPlayed !== rec.lastPlayed) { kept[id] = rec; dirty = true; }
      }
    }
    if (dirty) store.playtime.saveSoon();
    steamMap = new Map(Object.entries(kept));
  } catch { /* sin Steam: se sigue con las horas propias */ }
}

// -------------------------------------------------------------- ejecutables ----

function resolveExe(e) {
  if (exeCache.has(e.key)) return exeCache.get(e.key);
  let exe = null;
  try {
    if (e.exe && fs.existsSync(e.exe)) exe = e.exe;
    else if (e.location) exe = findMainExe(e.location, e.title);
  } catch { /* carpeta ilegible */ }
  exeCache.set(e.key, exe);
  return exe;
}

// ------------------------------------------------------------- biblioteca ----

function ctx() {
  return {
    custom: store.custom.data.items,
    online: store.online.data.entries,
    wiki: store.online.data.wiki || {},
    playtime: store.playtime.data,
    steamMap,
    running: tracker ? tracker.running : new Set()
  };
}

function attach(e) {
  const art = resolveArt(e, {
    customDir: store.customDir, cacheDir: store.cacheDir, iconsDir: store.iconsDir,
    steamRoot: steamRoot || null, custom: store.custom.data.items[e.key]
  });
  artCache.set(e.key, art);
  e.art = artRevs(art);
  e.canLaunch = (e.source === 'steam' && !!e.appId) || e.source === 'epic' || !!resolveExe(e);
  return e;
}

function rebuild() {
  const raws = store.library.data.items || [];
  rawByKey = new Map();
  for (const r of raws) { const k = norm(r.name); if (k && !rawByKey.has(k)) rawByKey.set(k, r); }
  artCache = new Map();
  entries = buildEntries(raws, ctx()).map(attach);
  byKey = new Map(entries.map(e => [e.key, e]));
}

// Reconstruye una sola ficha (más barato que rehacer todo).
function refreshEntry(key) {
  const raw = rawByKey.get(key);
  if (!raw) return null;
  const e = buildEntries([raw], ctx())[0];
  if (!e) return null;
  attach(e);
  const i = entries.findIndex(x => x.key === key);
  if (i >= 0) entries[i] = e; else entries.push(e);
  byKey.set(key, e);
  return e;
}

const VIEW_FIELDS = [
  'key', 'type', 'category', 'platform', 'source', 'title', 'autoTitle', 'developer', 'editor', 'description',
  'descSource', 'genres', 'version', 'sizeBytes', 'installDate', 'location', 'args', 'hours', 'running', 'custom', 'art',
  'canLaunch', 'canUninstall', 'confidence', 'reason', 'overridden'
];

function view(e) {
  const v = {};
  for (const f of VIEW_FIELDS) v[f] = e[f];
  return v;
}

// Arranque con Windows. Solo en la versión instalada o portable (en desarrollo apuntaría a Electron).
// En la portable, el ejecutable real es el .exe que se lanzó, no el que se descomprime en una carpeta temporal.
function loginOpts() {
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  return { path: exe, args: ['--autostart'] };
}
function loginEnabled() {
  try { return IS_WIN && app.isPackaged && app.getLoginItemSettings(loginOpts()).openAtLogin; } catch { return false; }
}

function publicSettings() {
  const s = store.settings.data;
  return {
    theme: THEMES.includes(s.theme) ? s.theme : 'auto',
    transitions: s.transitions !== false,
    background: s.background !== false,
    autoFill: s.autoFill !== false,
    tutorialDone: !!s.tutorialDone,
    splash: s.splash !== false,
    autoStart: loginEnabled(),
    closeAction: closeAction(),
    canAutoStart: app.isPackaged && IS_WIN,
    hasSgdbKey: !!s.sgdbKeyEnc,
    hasRawgKey: !!s.rawgKeyEnc,
    canEncrypt: safeStorage.isEncryptionAvailable(),
    view: s.view
  };
}

function statePayload(extra = {}) {
  return {
    entries: entries.map(view),
    scannedAt: store.library.data.at,
    demo: !!store.library.data.demo,
    isWindows: IS_WIN,
    settings: publicSettings(),
    meta: { toolCategories: TOOL_CATEGORIES, gameGenres: GAME_GENRES },
    ...extra
  };
}

function get(key) {
  const e = typeof key === 'string' ? byKey.get(key) : null;
  if (!e) throw new Error('No se encontró ese elemento. Vuelve a escanear el sistema.');
  return e;
}

function need(cond, msg) { if (!cond) throw new Error(msg); }
const windowsOnly = () => need(IS_WIN, 'Esta acción solo está disponible en Windows.');

function guardBusy() {
  if (busy) throw new Error('Hay otra operación en curso. Espera a que termine.');
  busy = true;
}

// ------------------------------------------------------------------ escaneo ----

async function doScan() {
  const res = IS_WIN ? await scanSystem() : { items: demoItems(), warnings: [], demo: true };
  store.library.data = { at: new Date().toISOString(), demo: !!res.demo, items: res.items };
  store.library.save();
  exeCache = new Map();
  await refreshSteam();
  rebuild();
  ensureIcons();
  return res;
}

// Extrae el icono del ejecutable para los elementos que no tienen imagen propia.
let iconsRunning = false;
async function ensureIcons() {
  if (!IS_WIN || iconsRunning) return;
  iconsRunning = true;
  let n = 0;
  try {
    for (const e of [...entries]) {
      if (e.art.icon) continue;
      const exe = resolveExe(e);
      if (!exe) continue;
      try {
        const img = await app.getFileIcon(exe, { size: 'large' });
        if (img.isEmpty()) continue;
        fs.writeFileSync(path.join(store.iconsDir, fileId(e.key) + '.png'), img.toPNG());
        n++;
      } catch { /* sin icono */ }
    }
  } finally {
    iconsRunning = false;
  }
  if (n) { rebuild(); send('library:changed'); }
}

// -------------------------------------------------------------- seguimiento ----

async function listProcessPaths() {
  const out = await runPowerShell(
    'Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path } | ForEach-Object { $_.Path } | Sort-Object -Unique', 20000);
  return out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function startTracker() {
  tracker = new Tracker({
    file: store.playtime,
    getTargets: () => entries.filter(e => e.type === 'game' && e.location).map(e => ({ key: e.key, location: e.location })),
    listPaths: listProcessPaths,
    onChange: (running, changed) => {
      const keys = new Set([...running, ...lastRunning]);
      const stopped = [...lastRunning].filter(k => !running.has(k));
      lastRunning = new Set(running);
      const updated = [];
      for (const k of keys) { const e = refreshEntry(k); if (e) updated.push(view(e)); }
      if (updated.length) send('library:update', updated);
      if (changed && stopped.length) {
        // Steam guarda las horas unos segundos después de cerrar el juego.
        setTimeout(async () => {
          await refreshSteam();
          const again = stopped.map(k => refreshEntry(k)).filter(Boolean).map(view);
          if (again.length) send('library:update', again);
        }, 8000);
      }
    }
  });
  tracker.start();
}

// ----------------------------------------------------- clave de SteamGridDB ----

function getRawgKey() {
  const enc = store.settings.data.rawgKeyEnc;
  if (!enc || !safeStorage.isEncryptionAvailable()) return null;
  try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return null; }
}

function getSgdbKey() {
  const enc = store.settings.data.sgdbKeyEnc;
  if (!enc || !safeStorage.isEncryptionAvailable()) return null;
  try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return null; }
}

// ----------------------------------------------------------- personalización ----

function customRec(key) {
  const items = store.custom.data.items;
  if (!items[key] || typeof items[key] !== 'object') items[key] = {};
  return items[key];
}

function dropCustomFile(name) {
  if (name && typeof name === 'string' && path.basename(name) === name) {
    try { fs.unlinkSync(path.join(store.customDir, name)); } catch { /* ya no estaba */ }
  }
}

function cleanRec(key) {
  const rec = store.custom.data.items[key];
  if (rec && !Object.keys(rec).length) delete store.custom.data.items[key];
}

function commitCustom(key) {
  cleanRec(key);
  store.custom.save();
  accentCache.delete(key);
  return view(refreshEntry(key) || get(key));
}

// ------------------------------------------------------------------ lanzar ----

function startDetached(file, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

const psq = s => "'" + String(s).replace(/'/g, "''") + "'";

async function launchElevated(plan) {
  const argList = plan.args.length ? ` -ArgumentList @(${plan.args.map(psq).join(',')})` : '';
  await runPowerShell(`Start-Process -FilePath ${psq(plan.file)}${argList} -WorkingDirectory ${psq(plan.cwd)} -Verb RunAs`, 30000);
}

async function launchEntry(e) {
  windowsOnly();
  const plan = planLaunch(e, resolveExe(e), e.args);
  need(plan, `No se encontró cómo iniciar «${e.title}». Si es un programa portable, abre «Archivos locales» y comprueba la carpeta.`);
  if (plan.kind === 'url') {
    await shell.openExternal(plan.url);
  } else {
    try {
      await startDetached(plan.file, plan.args, plan.cwd);
    } catch (err) {
      // Algunos programas exigen permisos de administrador (error 740): se reintenta pidiéndolos.
      if (err && (err.code === 'UNKNOWN' || err.errno === 740 || err.code === 'EACCES')) await launchElevated(plan);
      else throw new Error(`No se pudo iniciar «${e.title}»: ${err.message}`);
    }
  }
  if (e.type === 'game' && tracker) tracker.touch(e.key);
  const fresh = refreshEntry(e.key) || e;
  return view(fresh);
}

// ------------------------------------------------------------- desinstalar ----

async function uninstallEntry(e) {
  windowsOnly();
  need(e.canUninstall, e.source === 'epic'
    ? 'Los juegos de Epic Games se desinstalan desde Epic Games Launcher.'
    : 'Este elemento no tiene desinstalador registrado en Windows.');
  const box = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['Desinstalar', 'Cancelar'], defaultId: 1, cancelId: 1, noLink: true,
    title: 'Desinstalar', message: `¿Desinstalar «${e.title}»?`,
    detail: e.source === 'steam'
      ? 'Se abrirá Steam para confirmar la desinstalación.'
      : 'Se ejecutará el desinstalador que este programa registró en Windows. Podrás cancelarlo desde él.'
  });
  if (box.response !== 0) return { started: false };

  if (e.source === 'steam') {
    await shell.openExternal(`steam://uninstall/${Number(e.appId)}`);
    return { started: true };
  }
  const raw = rawByKey.get(e.key);
  need(raw && validUninstallKey(raw.regKey), 'La entrada del registro de este programa no es válida. Vuelve a escanear.');
  const out = await runPowerShell(
    `$ErrorActionPreference='Stop'; Get-ItemProperty -LiteralPath ${psq(raw.regKey)} | Select-Object UninstallString, QuietUninstallString | ConvertTo-Json -Compress`, 20000);
  const cmd = uninstallCommand(JSON.parse(out.replace(/^﻿/, '').trim() || '{}'));
  need(cmd, 'Windows no tiene un desinstalador guardado para este programa.');
  const child = spawn('cmd.exe', ['/d', '/s', '/c', `"${cmd}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
  child.once('error', () => { /* se informa al reescanear */ });
  child.once('exit', () => {
    // Al terminar el desinstalador se actualiza la lista sola.
    setTimeout(async () => {
      if (busy) return;
      busy = true;
      try { await doScan(); send('library:changed'); } catch { /* se queda la lista anterior */ } finally { busy = false; }
    }, 4000);
  });
  child.unref();
  return { started: true };
}

// ----------------------------------------------------------- búsqueda online ----

const STEAM_CDN = 'https://cdn.akamai.steamstatic.com/steam/apps';

function metaStale(cached) {
  if (!cached) return true;
  if (cached.found && cached.v !== SCHEMA) return true;
  const age = Date.now() - Date.parse(cached.checkedAt || 0);
  return age > (cached.found ? 30 * DAY : 7 * DAY);
}

async function fetchArtFor(e, appId, sgdbKey) {
  const id = fileId(e.key);
  const have = { banner: !!e.art.banner, logo: !!e.art.logo };
  let got = 0;
  const grab = async (url, base) => {
    const f = await downloadImage(url, store.cacheDir, base);
    if (f) got++;
    return f;
  };
  if (appId) {
    if (!have.banner) have.banner = !!((await grab(`${STEAM_CDN}/${appId}/library_hero.jpg`, `${id}-banner`)) ||
                                      (await grab(`${STEAM_CDN}/${appId}/header.jpg`, `${id}-banner`)));
    if (!have.logo) have.logo = !!(await grab(`${STEAM_CDN}/${appId}/logo.png`, `${id}-logo`));
  }
  if (sgdbKey && (!have.banner || !have.logo)) {
    const art = await findSgdbArt({ name: e.autoTitle, source: e.source, appId: e.appId }, sgdbKey);
    if (!have.banner && art.hero) await grab(art.hero, `${id}-banner`);
    if (!have.logo && art.logo) await grab(art.logo, `${id}-logo`);
  }
  return got;
}

async function runOnline(event) {
  const sgdbKey = getSgdbKey();
  const jobs = [];
  for (const e of entries) {
    const eligible = e.type === 'game' || (e.type === 'tool' && e.category === 'Sin clasificar' && !e.overridden);
    if (!eligible) continue;
    const needMeta = metaStale(store.online.data.entries[e.key]);
    const needArt = (!e.art.banner || !e.art.logo) && (e.type === 'game');
    if (needMeta || needArt) jobs.push({ e, needMeta, needArt });
  }
  if (!jobs.length) return statePayload({ stats: { checked: 0, found: 0, images: 0, stopped: null, upToDate: true } });

  const answer = await dialog.showMessageBox(win, {
    type: 'question', buttons: ['Continuar', 'Cancelar'], defaultId: 1, cancelId: 1, noLink: true,
    title: 'Búsqueda online', message: `Se consultarán ${jobs.length} elementos.`,
    detail: 'Se enviará únicamente el nombre del programa (o su identificador de Steam) a store.steampowered.com ' +
      'para obtener descripción, desarrollador, editor, género y, si faltan, banner y logo desde la CDN de Steam.' +
      (sgdbKey ? ' Los que sigan sin imagen se buscarán en SteamGridDB con tu clave.' : '') +
      ' No se envía ningún otro dato de tu equipo. Puedes cancelar en cualquier momento.'
  });
  if (answer.response !== 0) return statePayload({ declined: true });

  guardBusy();
  cancelFlag = false;
  let checked = 0, found = 0, images = 0, failures = 0, stopped = null;
  try {
    for (let i = 0; i < jobs.length; i++) {
      if (cancelFlag) { stopped = 'cancelled'; break; }
      const { e, needMeta, needArt } = jobs[i];
      send('online:progress', { done: i, total: jobs.length, name: e.title });
      try {
        let appId = e.appId || (e.artAppId || null);
        if (needMeta) {
          const info = await enrich(e, { fuzzy: e.type === 'game' });
          store.online.data.entries[e.key] = info;
          store.online.saveSoon(2000);
          checked++;
          if (info.found) { found++; if (!appId && info.exact) appId = info.appId; }
        }
        if (needArt && (appId || sgdbKey)) images += await fetchArtFor(e, appId, sgdbKey);
        failures = 0;
      } catch (err) {
        if (err.code === 'RATE_LIMIT' || err.code === 'BAD_KEY') { stopped = err.message; break; }
        if (++failures >= 5) { stopped = 'Demasiados errores seguidos. Revisa tu conexión a internet.'; break; }
      }
      await sleep(350);
    }
  } finally {
    busy = false;
    store.online.flush();
    store.online.save();
    rebuild();
  }
  return statePayload({ stats: { checked, found, images, stopped } });
}

// -------------------------------------------------- relleno automático ----
// Para lo que no tiene banner, logo ni descripción: busca en Steam (mismo origen de imágenes que SteamDB)
// y, si no hay nada, en Wikipedia. Solo acepta coincidencias exactas de nombre. Se ejecuta en segundo plano.

let autoRunning = false;
let cancelAuto = false;

async function stopAuto() {
  if (!autoRunning) return;
  cancelAuto = true;
  while (autoRunning) await sleep(100);
}

async function saveCover(e, url) {
  const f = await downloadImage(url, store.cacheDir, `${fileId(e.key)}-cover`);
  return !!f;
}

const cachedArt = (e, kind) => EXTS.some(x => fs.existsSync(path.join(store.cacheDir, `${fileId(e.key)}-${kind}${x}`)));

// Fuentes extra para juegos que Steam no resolvió: GOG (sin clave) y RAWG (con clave del usuario).
// Cada una solo se acepta si el título es el mismo juego (ver src/match.js).
async function extraSources(e, rawgKey, found) {
  const wikiMap = store.online.data.wiki || (store.online.data.wiki = {});
  const wantText = () => !(store.online.data.entries[e.key] || {}).description && !(wikiMap[e.key] && wikiMap[e.key].description);
  const wantBanner = () => !e.art.banner && !cachedArt(e, 'banner');
  const take = async (r, source) => {
    if (!r.found) return;
    const rec = wikiMap[e.key] && wikiMap[e.key].found ? wikiMap[e.key] : { found: true };
    if (r.description && !rec.description) { rec.description = r.description; rec.source = source; found.description = true; }
    if (r.developers && r.developers.length && !rec.developers) rec.developers = r.developers;
    if (r.publishers && r.publishers.length && !rec.publishers) rec.publishers = r.publishers;
    if (rec.description || rec.developers || rec.publishers) wikiMap[e.key] = rec;
    if (r.imageUrl && wantBanner()) {
      try { if (await downloadImage(r.imageUrl, store.cacheDir, `${fileId(e.key)}-banner`)) found.images++; } catch (err) { if (err.code === 'RATE_LIMIT') throw err; }
    }
  };
  if (e.type !== 'game') return;
  if (wantBanner()) {
    try { await take(await findGog(e.autoTitle), 'GOG'); } catch (err) { if (err.code === 'RATE_LIMIT') throw err; }
  }
  if (rawgKey && (wantBanner() || wantText())) await take(await findRawg(e.autoTitle, rawgKey), 'RAWG');
}

async function autoFillOne(e, sgdbKey, rawgKey) {
  const found = { description: false, images: 0 };
  let appId = e.appId || e.artAppId || null;

  if (e.type === 'game') {
    // 1) Steam: descripción, estudio y, con su identificador, banner y logo de la CDN
    const cached = store.online.data.entries[e.key];
    let info = cached && cached.found && cached.v === SCHEMA ? cached : null;
    if (!info) {
      info = await enrich(e, { fuzzy: false });
      store.online.data.entries[e.key] = info;
    }
    if (info.found) {
      found.description = !!info.description;
      if (!appId && info.exact) appId = info.appId;
    }
    if (appId || sgdbKey) found.images += await fetchArtFor(e, appId, sgdbKey);
  }

  // 2) GOG y RAWG: banner, descripción, estudio
  await extraSources(e, rawgKey, found);

  // 3) Wikipedia: descripción y carátula/logo si todavía falta algo
  const hasWikiText = () => { const w = (store.online.data.wiki || {})[e.key]; return !!(w && w.description); };
  const stillNoText = !(store.online.data.entries[e.key] || {}).description && !hasWikiText();
  const stillNoArt = !found.images && !e.art.banner && !cachedArt(e, 'banner');
  if (stillNoText || stillNoArt) {
    const wk = await findPage(e.autoTitle, e.type);
    if (wk.found) {
      const prev = (store.online.data.wiki || (store.online.data.wiki = {}))[e.key];
      store.online.data.wiki[e.key] = prev && prev.found && prev.description ? { ...wk, description: prev.description, source: prev.source, developers: prev.developers, publishers: prev.publishers } : wk;
      if (stillNoText && wk.description) found.description = true;
      if (stillNoArt && wk.imageUrl) {
        try { if (await saveCover(e, wk.imageUrl)) found.images++; } catch (err) { if (err.code === 'RATE_LIMIT') throw err; }
      }
    }
  }
  return found;
}

async function autoFill() {
  if (autoRunning || busy || !IS_WIN && !store.library.data.demo) return;
  if (store.settings.data.autoFill === false) return;
  autoRunning = true;
  cancelAuto = false;
  const auto = store.online.data.auto || (store.online.data.auto = {});
  const sgdbKey = getSgdbKey();
  const rawgKey = getRawgKey();
  const jobs = entries.filter(e => needsAutofill(e, auto));
  let done = 0, filled = 0, failures = 0;
  try {
    for (const e of jobs) {
      if (cancelAuto || busy || !win) break;
      send('auto:status', { done, total: jobs.length, name: e.title });
      try {
        const r = await autoFillOne(e, sgdbKey, rawgKey);
        auto[e.key] = { checkedAt: new Date().toISOString(), found: !!(r.description || r.images) };
        failures = 0;
        if (r.description || r.images) {
          filled++;
          const v = refreshEntry(e.key);
          if (v) send('library:update', [view(v)]);
        }
      } catch (err) {
        if (err.code === 'RATE_LIMIT' || err.code === 'BAD_KEY') break;
        if (++failures >= 5) break;       // sin conexión: se reintenta en el próximo arranque
      }
      done++;
      store.online.saveSoon(3000);
      await sleep(600);
    }
  } finally {
    autoRunning = false;
    store.online.flush();
    send('auto:status', null);
    if (filled) send('auto:done', { filled, total: jobs.length });
  }
}

// ----------------------------------------------------------------- acentos ----

function accentFor(key) {
  const arts = artCache.get(key) || {};
  const ref = arts.banner || arts.cover;
  if (!ref) return null;
  const tag = `${ref.file}|${ref.rev}`;
  const hit = accentCache.get(key);
  if (hit && hit.tag === tag) return hit.color;
  let color = null;
  try {
    const img = nativeImage.createFromPath(ref.file);
    if (!img.isEmpty()) color = dominantColor(img.resize({ width: 32, height: 18, quality: 'good' }).toBitmap(), 'bgra');
  } catch { /* sin acento */ }
  accentCache.set(key, { tag, color });
  return color;
}

// ---------------------------------------------------------------------- IPC ----

function registerIpc() {
  const h = (name, fn) => ipcMain.handle(name, async (_e, ...a) => fn(...a));

  // La primera petición usa lo que ya preparó el arranque; las siguientes releen Steam y reconstruyen.
  h('app:state', async () => {
    if (bootData) { const p = bootData; bootData = null; await p; return statePayload(); }
    await refreshSteam(); rebuild(); return statePayload();
  });

  h('app:scan', async () => {
    await stopAuto();
    guardBusy();
    try {
      const res = await doScan();
      return statePayload({ warnings: res.warnings || [] });
    } finally { busy = false; setTimeout(() => autoFill(), 1500); }
  });

  ipcMain.handle('online:run', async event => { await stopAuto(); return runOnline(event); });
  h('online:cancel', () => { cancelFlag = true; return true; });

  h('item:launch', key => launchEntry(get(key)));
  h('item:accent', key => accentFor(get(key).key));

  h('item:openFolder', async key => {
    windowsOnly();
    const e = get(key);
    if (e.location && fs.existsSync(e.location)) {
      const err = await shell.openPath(e.location);
      need(!err, 'No se pudo abrir la carpeta: ' + err);
    } else {
      const exe = resolveExe(e);
      need(exe, 'No se conoce la carpeta de este elemento.');
      shell.showItemInFolder(exe);
    }
    return true;
  });

  h('item:uninstall', key => uninstallEntry(get(key)));

  h('item:update', (key, patch) => {
    const e = get(key);
    need(patch && typeof patch === 'object', 'Datos no válidos.');
    const rec = customRec(e.key);
    if ('title' in patch) {
      const t = String(patch.title == null ? '' : patch.title).trim().slice(0, 120);
      if (t) rec.title = t; else delete rec.title;
    }
    if ('description' in patch) {
      if (patch.description === null) delete rec.description;
      else rec.description = String(patch.description).slice(0, 4000);
    }
    if ('args' in patch) {
      const a = validateArgs(patch.args);
      if (a) rec.args = a; else delete rec.args;
    }
    if ('classification' in patch) {
      const c = patch.classification;
      if (c === null) { delete rec.type; delete rec.category; }
      else {
        need(c && isValidCategory(c.type, c.category), 'Categoría no válida.');
        rec.type = c.type; rec.category = c.category;
      }
    }
    return commitCustom(e.key);
  });

  h('item:pickImage', async (key, kind) => {
    const e = get(key);
    need(kind === 'banner' || kind === 'logo', 'Tipo de imagen no válido.');
    const res = await dialog.showOpenDialog(win, {
      title: kind === 'banner' ? 'Elegir banner' : 'Elegir logo', properties: ['openFile'],
      filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const rec = customRec(e.key);
    const name = importImage(res.filePaths[0], store.customDir, `${fileId(e.key)}-${kind}-${Date.now().toString(36)}`);
    dropCustomFile(rec[kind]);
    rec[kind] = name;
    return commitCustom(e.key);
  });

  h('item:clearImage', (key, kind) => {
    const e = get(key);
    need(kind === 'banner' || kind === 'logo', 'Tipo de imagen no válido.');
    const rec = customRec(e.key);
    dropCustomFile(rec[kind]);
    delete rec[kind];
    return commitCustom(e.key);
  });

  // Quita título, descripción, banner y logo personalizados (no toca argumentos ni clasificación).
  h('item:resetAppearance', key => {
    const e = get(key);
    const rec = customRec(e.key);
    dropCustomFile(rec.banner); dropCustomFile(rec.logo);
    for (const f of ['title', 'description', 'banner', 'logo']) delete rec[f];
    return commitCustom(e.key);
  });

  h('settings:set', patch => {
    need(patch && typeof patch === 'object', 'Datos no válidos.');
    const s = store.settings.data;
    if ('theme' in patch) { need(THEMES.includes(patch.theme), 'Tema no válido.'); s.theme = patch.theme; }
    if ('transitions' in patch) s.transitions = !!patch.transitions;
    if ('background' in patch) s.background = !!patch.background;
    if ('autoStart' in patch) {
      need(IS_WIN && app.isPackaged, 'El arranque con Windows solo está disponible en la versión instalada o portable (no con npm start).');
      app.setLoginItemSettings({ openAtLogin: !!patch.autoStart, ...loginOpts() });
    }
    if ('closeAction' in patch) { need(CLOSE_ACTIONS.includes(patch.closeAction), 'Opción no válida.'); s.closeAction = patch.closeAction; }
    if ('splash' in patch) s.splash = !!patch.splash;
    if ('tutorialDone' in patch) s.tutorialDone = !!patch.tutorialDone;
    if ('autoFill' in patch) { s.autoFill = !!patch.autoFill; if (s.autoFill) setTimeout(() => autoFill(), 500); else cancelAuto = true; }
    if ('view' in patch && patch.view && typeof patch.view === 'object') {
      const v = patch.view;
      s.view = {
        type: v.type === 'tool' ? 'tool' : 'game',
        key: typeof v.key === 'string' ? v.key.slice(0, 200) : null,
        sort: ['name', 'hours', 'recent'].includes(v.sort) ? v.sort : 'name'
      };
    }
    nativeTheme.themeSource = s.theme === 'auto' ? 'system' : s.theme;
    store.settings.saveSoon(300);
    return publicSettings();
  });

  // Lectura síncrona antes del primer pintado: evita que la pantalla de carga parpadee si está desactivada.
  ipcMain.on('boot:get', e => {
    const s = store.settings.data;
    e.returnValue = { splash: s.splash !== false, transitions: s.transitions !== false };
  });

  // ------------------------------------------------- importar / exportar todo ----
  const backupHelpers = { validateArgs, isValidCategory };
  let pendingImport = null;

  h('data:export', async () => {
    store.flushAll();
    const { buffer, summary } = backup.exportBundle({
      playtime: store.playtime.data, custom: store.custom.data, online: store.online.data, settings: store.settings.data
    }, { customDir: store.customDir, appVersion: app.getVersion(), ...backupHelpers });
    const stamp = new Date().toISOString().slice(0, 10);
    const res = await dialog.showSaveDialog(win, {
      title: 'Exportar datos de GameUtil',
      defaultPath: path.join(app.getPath('documents'), `GameUtil-datos-${stamp}.${backup.EXT}`),
      filters: [{ name: 'Datos de GameUtil', extensions: [backup.EXT] }]
    });
    if (res.canceled || !res.filePath) return { saved: false };
    fs.writeFileSync(res.filePath, buffer);
    return { saved: true, path: res.filePath, size: buffer.length, summary };
  });

  // Paso 1: elegir y leer el archivo (sin tocar nada). Devuelve un resumen para confirmar.
  h('data:importPick', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Importar datos de GameUtil', properties: ['openFile'],
      filters: [{ name: 'Datos de GameUtil', extensions: [backup.EXT] }]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const file = res.filePaths[0];
    const st = fs.statSync(file);
    need(st.isFile(), 'No es un archivo.');
    need(st.size <= 300 * 1024 * 1024, 'El archivo es demasiado grande.');
    const bundle = backup.readBundle(fs.readFileSync(file), backupHelpers);
    pendingImport = { bundle, at: Date.now() };
    return { name: path.basename(file), ...bundle.info, hasSettings: Object.keys(bundle.payload.settings).length > 0 };
  });

  // Paso 2: aplicar lo leído en el paso 1, con copia de seguridad previa.
  h('data:importApply', async opts => {
    need(pendingImport && Date.now() - pendingImport.at < 30 * 60 * 1000, 'Primero elige un archivo para importar.');
    need(opts && ['merge', 'replace'].includes(opts.mode), 'Modo de importación no válido.');
    await stopAuto();
    guardBusy();
    try {
      store.flushAll();
      const snapshot = backup.snapshotBefore(store);
      const stats = backup.applyBundle(store, pendingImport.bundle, { mode: opts.mode, settings: !!opts.settings });
      pendingImport = null;
      accentCache.clear();
      store.playtime.save(); store.custom.save(); store.online.save(); store.settings.save();
      const s = store.settings.data;
      nativeTheme.themeSource = s.theme === 'auto' ? 'system' : s.theme;
      rebuild();
      return { stats, snapshot: path.basename(snapshot), ...statePayload() };
    } finally { busy = false; setTimeout(() => autoFill(), 1500); }
  });

  h('settings:rawgKey', key => {
    const s = store.settings.data;
    if (key == null || key === '') { delete s.rawgKeyEnc; }
    else {
      need(typeof key === 'string' && /^[A-Za-z0-9]{16,64}$/.test(key.trim()), 'La clave de RAWG no parece válida (son letras y números, unos 32 caracteres).');
      need(safeStorage.isEncryptionAvailable(), 'Windows no permite cifrar la clave en este equipo.');
      s.rawgKeyEnc = safeStorage.encryptString(key.trim()).toString('base64');
    }
    store.settings.saveSoon(300);
    return publicSettings();
  });

  // «Buscar de nuevo» en un elemento: ignora el plazo de espera y rellena solo lo que falte.
  h('item:refind', async key => {
    const e = get(key);
    await stopAuto();
    guardBusy();
    try {
      const auto = store.online.data.auto || (store.online.data.auto = {});
      const before = { text: !!e.description, banner: !!e.art.banner, logo: !!e.art.logo };
      const r = await autoFillOne(e, getSgdbKey(), getRawgKey());
      auto[e.key] = { checkedAt: new Date().toISOString(), found: !!(r.description || r.images) };
      store.online.save();
      const v = refreshEntry(e.key) || get(e.key);
      return { entry: view(v), found: { description: r.description, images: r.images }, before };
    } finally { busy = false; }
  });

  h('settings:sgdbKey', key => {
    const s = store.settings.data;
    if (!key) { s.sgdbKeyEnc = null; }
    else {
      const k = String(key).trim();
      need(/^[A-Za-z0-9]{16,64}$/.test(k), 'La clave de SteamGridDB no tiene un formato válido.');
      need(safeStorage.isEncryptionAvailable(), 'Windows no permite cifrar la clave en este equipo.');
      s.sgdbKeyEnc = safeStorage.encryptString(k).toString('base64');
    }
    store.settings.save();
    return publicSettings();
  });

  h('files:list', () => { store.saveAll(); return store.files(); });
  h('files:reveal', id => {
    const f = store.files().find(x => x.id === id);
    need(f, 'Archivo desconocido.');
    store.saveAll();
    if (fs.existsSync(f.path) && fs.statSync(f.path).isDirectory()) return shell.openPath(f.path).then(err => { need(!err, err); return true; });
    shell.showItemInFolder(f.path);
    return true;
  });

  h('list:export', async opts => {
    need(opts && ['game', 'tool'].includes(opts.type) && ['csv', 'json'].includes(opts.format) && Array.isArray(opts.keys), 'Exportación no válida.');
    const list = opts.keys.map(k => byKey.get(k)).filter(e => e && e.type === opts.type).map(e => ({ ...e, name: e.title }));
    need(list.length, 'No hay nada que exportar.');
    const content = opts.format === 'csv' ? toCsv(opts.type, list) : toJson(opts.type, list);
    const stamp = new Date().toISOString().slice(0, 10);
    const res = await dialog.showSaveDialog(win, {
      title: 'Exportar lista',
      defaultPath: path.join(app.getPath('documents'), `${opts.type === 'game' ? 'juegos' : 'software'}-${stamp}.${opts.format}`),
      filters: [opts.format === 'csv' ? { name: 'CSV (Excel)', extensions: ['csv'] } : { name: 'JSON', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePath) return { saved: false };
    fs.writeFileSync(res.filePath, content, 'utf8');
    return { saved: true, path: res.filePath, count: list.length };
  });

  h('win:minimize', () => win && win.minimize());
  h('win:toggleMaximize', () => { if (win) { if (win.isMaximized()) win.unmaximize(); else win.maximize(); } });
  h('win:close', () => win && win.close());
  // Respuesta del desplegable de cierre. `remember` guarda la elección para no volver a preguntar.
  h('win:closeChoice', (choice, remember) => {
    need(choice === 'tray' || choice === 'quit', 'Opción no válida.');
    if (remember) { store.settings.data.closeAction = choice; store.settings.saveSoon(300); }
    if (choice === 'tray' && tray) hideToTray();
    else { quitting = true; app.quit(); }
    return publicSettings();
  });
}

// ---------------------------------------------------------------- protocolo ----

function registerProtocol() {
  protocol.handle('lib', req => {
    try {
      const u = new URL(req.url);
      if (u.hostname !== 'art') return new Response(null, { status: 404 });
      const parts = u.pathname.split('/').filter(Boolean);
      const key = decodeURIComponent(parts[0] || '');
      const kind = parts[1];
      const ref = KINDS.includes(kind) ? (artCache.get(key) || {})[kind] : null;
      if (!ref) return new Response(null, { status: 404 });
      return net.fetch(pathToFileURL(ref.file).toString());
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

// ------------------------------------------------------------------ ventana ----

function createWindow() {
  const icon = cachedIcon(256);
  win = new BrowserWindow({
    width: 1320, height: 820, minWidth: 1000, minHeight: 640,
    frame: false, show: false, title: APP_NAME, icon,
    backgroundColor: store.settings.data.splash !== false ? '#07080c' : (nativeTheme.shouldUseDarkColors ? '#0b0d12' : '#eef0f5'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  // Al arrancar con Windows se queda en la bandeja si el segundo plano está activo (así empieza a contar horas sin molestar).
  const silent = process.argv.includes('--autostart') && store.settings.data.background !== false && !!tray;
  win.once('ready-to-show', () => { if (!silent) win.show(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('maximize', () => send('win:maximized', true));
  win.on('unmaximize', () => send('win:maximized', false));
  // Al cerrar (X, Alt+F4…): según el ajuste, pregunta, minimiza a la bandeja o cierra del todo.
  win.on('close', e => {
    if (quitting) return;
    if (!tray) return;                                   // sin bandeja no hay dónde esconderla: se cierra
    const action = closeAction();
    e.preventDefault();
    if (action === 'ask') { showWindow(); send('win:askClose'); }
    else if (action === 'tray') hideToTray();
    else { quitting = true; app.quit(); }
  });
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

const CLOSE_ACTIONS = ['ask', 'tray', 'quit'];
function closeAction() {
  const a = store.settings.data.closeAction;
  return CLOSE_ACTIONS.includes(a) ? a : 'ask';
}

function hideToTray() {
  if (!win) return;
  win.hide();
  const s = store.settings.data;
  if (!s.trayNoticeShown) {
    s.trayNoticeShown = true;
    store.settings.saveSoon(300);
    if (tray && tray.displayBalloon) {
      tray.displayBalloon({ title: 'GameUtil sigue en segundo plano', content: 'Así se siguen contando las horas de juego. Ciérrala del todo desde el icono de la bandeja.' });
    }
  }
}

function showWindow() {
  if (!win) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  try {
    tray = new Tray(cachedIcon(32));
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir', click: showWindow },
      { type: 'separator' },
      { label: 'Salir', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', showWindow);
  } catch { tray = null; }
}

// ------------------------------------------------------------------- inicio ----

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => {
    quitting = true;
    if (tracker) tracker.stop();
    if (store) { store.flushAll(); store.saveAll(); }
  });
  app.on('window-all-closed', () => { if (quitting || !tray) app.quit(); });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const userData = app.getPath('userData');
    migrateUserData(OLD_DATA_DIR, userData);   // conserva horas y personalización de versiones anteriores
    const dataDir = path.join(userData, 'data');
    const legacy = path.join(userData, 'inventario.json');
    try { // la versión anterior guardaba todo en un único archivo
      fs.mkdirSync(dataDir, { recursive: true });
      if (fs.existsSync(legacy) && !fs.existsSync(path.join(dataDir, 'library.json')) && !fs.existsSync(path.join(dataDir, 'inventario.json'))) {
        fs.copyFileSync(legacy, path.join(dataDir, 'inventario.json'));
      }
    } catch { /* se empieza de cero */ }

    store = new Store(dataDir);
    const th = store.settings.data.theme;
    nativeTheme.themeSource = th === 'light' || th === 'dark' ? th : 'system';
    registerProtocol();
    registerIpc();
    // La ventana (y su pantalla de carga) aparece cuanto antes. Leer Steam y montar la biblioteca
    // ocurre en paralelo y la interfaz lo espera en «app:state».
    createTray();
    createWindow();
    bootData = (async () => { await refreshSteam(); rebuild(); })();
    bootData.then(() => {
      // Lo que no hace falta para pintar la primera pantalla espera a que la app esté abierta:
      // PowerShell (seguimiento de procesos) y la extracción de iconos compiten por CPU y disco con el arranque.
      if (IS_WIN) setTimeout(() => { startTracker(); ensureIcons(); }, 3500);
      setTimeout(() => autoFill(), 7000);
    });
  });
}

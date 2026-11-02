'use strict';
const fs = require('fs');
const path = require('path');
const { execFileP } = require('./ps');
const { parseVdf, vget } = require('./vdf');

const ID64_BASE = 76561197960265728n;

async function findSteamRoot() {
  try {
    const out = await execFileP('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']);
    const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(out);
    if (m) {
      const p = m[1].trim().replace(/\//g, '\\');
      if (fs.existsSync(p)) return p;
    }
  } catch { /* Steam no instalado o sin clave */ }
  for (const base of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]) {
    if (!base) continue;
    const c = path.join(base, 'Steam');
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// Cuenta de Steam activa (la marcada como MostRecent en loginusers.vdf), como id de carpeta userdata.
function activeAccountId(root) {
  try {
    const cfg = parseVdf(fs.readFileSync(path.join(root, 'config', 'loginusers.vdf'), 'utf8'));
    const users = cfg.users || cfg.Users || cfg;
    for (const [id64, u] of Object.entries(users)) {
      if (u && typeof u === 'object' && String(u.MostRecent || u.mostrecent) === '1' && /^\d{17}$/.test(id64)) {
        return String(BigInt(id64) - ID64_BASE);
      }
    }
  } catch { /* sin loginusers.vdf */ }
  return null;
}

function pickLocalConfig(root) {
  const ud = path.join(root, 'userdata');
  let dirs = [];
  try { dirs = fs.readdirSync(ud).filter(d => /^\d+$/.test(d) && d !== '0'); } catch { return null; }
  const found = dirs
    .map(d => ({ id: d, file: path.join(ud, d, 'config', 'localconfig.vdf') }))
    .filter(x => fs.existsSync(x.file))
    .map(x => ({ ...x, mtime: fs.statSync(x.file).mtimeMs }));
  if (!found.length) return null;
  const active = activeAccountId(root);
  return found.find(x => x.id === active) || found.sort((a, b) => b.mtime - a.mtime)[0];
}

// Extrae { appId: { minutes, lastPlayed(seg) } } del texto de localconfig.vdf
function parsePlaytime(text) {
  const cfg = parseVdf(text);
  const apps = vget(cfg, 'UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps')
    || vget(cfg, 'UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'Apps');
  const map = new Map();
  if (!apps || typeof apps !== 'object') return map;
  for (const [id, e] of Object.entries(apps)) {
    if (!/^\d+$/.test(id) || !e || typeof e !== 'object') continue;
    const minutes = Number(vget(e, 'Playtime'));
    const last = Number(vget(e, 'LastPlayed'));
    if ((Number.isFinite(minutes) && minutes > 0) || (Number.isFinite(last) && last > 0)) {
      map.set(id, { minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 0, lastPlayed: Number.isFinite(last) && last > 0 ? last : null });
    }
  }
  return map;
}

let playtimeCache = { file: null, mtime: 0, map: new Map() };

// Devuelve { map, changed }. Solo vuelve a leer el archivo si ha cambiado.
function readSteamPlaytime(root) {
  if (!root) return { map: new Map(), changed: false, file: null };
  const cfg = pickLocalConfig(root);
  if (!cfg) return { map: new Map(), changed: false, file: null };
  if (playtimeCache.file === cfg.file && playtimeCache.mtime === cfg.mtime) {
    return { map: playtimeCache.map, changed: false, file: cfg.file };
  }
  let map = new Map();
  try { map = parsePlaytime(fs.readFileSync(cfg.file, 'utf8')); } catch { /* archivo en uso o ilegible */ }
  playtimeCache = { file: cfg.file, mtime: cfg.mtime, map };
  return { map, changed: true, file: cfg.file };
}

// ----------------------------------------------------------- arte local ----

const HERO = /^library_hero\.(jpg|png)$/i;
const LOGO = /^(library_logo|logo)\.(png|jpg)$/i;
const HEADER = /^(library_header|header)\.(jpg|png)$/i;

function findSteamArt(root, appId) {
  const out = {};
  if (!root || !/^\d+$/.test(String(appId))) return out;
  const base = path.join(root, 'appcache', 'librarycache');
  const flat = [['hero', '_library_hero'], ['logo', '_logo'], ['header', '_header'], ['icon', '_icon']];
  for (const [kind, suffix] of flat) {
    for (const ext of ['.jpg', '.png']) {
      const f = path.join(base, `${appId}${suffix}${ext}`);
      if (!out[kind] && fs.existsSync(f)) out[kind] = f;
    }
  }
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < 2) walk(full, depth + 1); continue; }
      if (!out.hero && HERO.test(e.name)) out.hero = full;
      else if (!out.logo && LOGO.test(e.name)) out.logo = full;
      else if (!out.header && HEADER.test(e.name)) out.header = full;
    }
  };
  walk(path.join(base, String(appId)), 0);
  return out;
}

module.exports = { findSteamRoot, readSteamPlaytime, parsePlaytime, findSteamArt, activeAccountId };

'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { sniffExt } = require('./images');

// Copia de todos los datos propios de GameUtil en un único archivo `.gameutil`.
//
// Formato: JSON comprimido con gzip.
//   { app, format, createdAt, appVersion, sha256, payload: { playtime, custom, online, settings }, images: { nombre: base64 } }
// `sha256` es la suma de comprobación de `payload` + `images`; si no coincide, el archivo se rechaza.
//
// Qué NO se incluye, a propósito:
//  - La clave de SteamGridDB: está cifrada con la cuenta de Windows y no serviría en otro equipo.
//  - La lista detectada (library.json): se vuelve a generar escaneando.
//  - Las imágenes descargadas automáticamente: se vuelven a buscar solas.
//  - Rutas del equipo (carpetas de instalación): no viajan, para no filtrar nombres de usuario.
//
// Todo lo que se lee de un archivo importado se trata como no fiable y se sanea.

const FORMAT = 1;
const APP = 'GameUtil';
const EXT = 'gameutil';
const MAX_COMPRESSED = 300 * 1024 * 1024;
const MAX_RAW = 400 * 1024 * 1024;
const MAX_IMAGE = 15 * 1024 * 1024;
const MAX_KEYS = 20000;

const SAFE_SETTINGS = ['theme', 'transitions', 'background', 'splash', 'autoFill'];
const THEMES = ['auto', 'light', 'dark'];

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const goodKey = k => typeof k === 'string' && k.length > 0 && k.length <= 200 && k !== '__proto__' && k !== 'constructor' && k !== 'prototype';
const num = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : 0);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// Los nombres de imagen propios son «archivo.ext» sin carpetas.
const imageName = n => typeof n === 'string' && /^[A-Za-z0-9._-]{1,120}\.(png|jpg|webp|gif)$/.test(n) && !n.includes('..');

// ------------------------------------------------------------- saneado ----

function sanitizePlaytime(src) {
  const out = {};
  const games = isObj(src) && isObj(src.games) ? src.games : {};
  let n = 0;
  for (const [k, v] of Object.entries(games)) {
    if (!goodKey(k) || !isObj(v) || ++n > MAX_KEYS) continue;
    const seconds = Math.floor(num(v.seconds, 3.15e9)); // ~100 años
    const lastPlayed = Math.floor(num(v.lastPlayed, 8.64e15));
    const sessions = Math.floor(num(v.sessions, 1e7));
    if (!seconds && !lastPlayed && !sessions) continue;
    out[k] = { seconds, lastPlayed, sessions };
  }
  return out;
}

function sanitizeCustom(src, { validateArgs, isValidCategory }) {
  const out = {};
  const items = isObj(src) && isObj(src.items) ? src.items : {};
  let n = 0;
  for (const [k, v] of Object.entries(items)) {
    if (!goodKey(k) || !isObj(v) || ++n > MAX_KEYS) continue;
    const r = {};
    if (typeof v.title === 'string' && v.title.trim()) r.title = v.title.trim().slice(0, 120);
    if (typeof v.description === 'string') r.description = v.description.slice(0, 4000);
    if (typeof v.args === 'string') { try { const a = validateArgs(v.args); if (a) r.args = a; } catch { /* argumentos no válidos: se ignoran */ } }
    if (isObj(v) && typeof v.type === 'string' && typeof v.category === 'string' && isValidCategory(v.type, v.category)) { r.type = v.type; r.category = v.category; }
    if (imageName(v.banner)) r.banner = v.banner;
    if (imageName(v.logo)) r.logo = v.logo;
    if (Object.keys(r).length) out[k] = r;
  }
  return out;
}

// Valores simples y listas de valores simples, con límites. Sirve para los datos online,
// cuya forma puede cambiar entre versiones.
function sanitizeValue(v, depth = 0) {
  if (typeof v === 'string') return v.slice(0, 4000);
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v) && depth < 2) return v.slice(0, 50).map(x => sanitizeValue(x, depth + 1)).filter(x => x !== undefined && x !== null && typeof x !== 'object');
  if (isObj(v) && depth < 2) {
    const o = {};
    for (const [k, x] of Object.entries(v).slice(0, 60)) {
      if (!goodKey(k)) continue;
      const c = sanitizeValue(x, depth + 1);
      if (c !== undefined) o[k] = c;
    }
    return o;
  }
  return undefined;
}

function sanitizeMap(src, max = MAX_KEYS) {
  const out = {};
  if (!isObj(src)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(src)) {
    if (!goodKey(k) || !isObj(v) || ++n > max) continue;
    const c = sanitizeValue(v);
    if (isObj(c) && Object.keys(c).length) out[k] = c;
  }
  return out;
}

function sanitizeOnline(src) {
  const s = isObj(src) ? src : {};
  return { entries: sanitizeMap(s.entries), wiki: sanitizeMap(s.wiki) };
}

function sanitizeSettings(src) {
  const out = {};
  if (!isObj(src)) return out;
  if (THEMES.includes(src.theme)) out.theme = src.theme;
  for (const k of ['transitions', 'background', 'splash', 'autoFill']) if (typeof src[k] === 'boolean') out[k] = src[k];
  return out;
}

// ------------------------------------------------------------ exportar ----

// Lee los archivos que de verdad usa la personalización y los devuelve en base64.
function collectImages(custom, customDir) {
  const images = {};
  let total = 0;
  for (const rec of Object.values(custom)) {
    for (const k of ['banner', 'logo']) {
      const name = rec[k];
      if (!name || images[name]) continue;
      try {
        const buf = fs.readFileSync(path.join(customDir, name));
        if (buf.length > MAX_IMAGE || !sniffExt(buf)) continue;
        total += buf.length;
        if (total > MAX_RAW / 2) return images;
        images[name] = buf.toString('base64');
      } catch { /* imagen que ya no existe: se omite */ }
    }
  }
  return images;
}

function buildPayload({ playtime, custom, online, settings }, helpers) {
  const cu = sanitizeCustom(custom, helpers);
  const ss = sanitizeSettings(settings);
  return { playtime: { games: sanitizePlaytime(playtime) }, custom: { items: cu }, online: sanitizeOnline(online), settings: ss };
}

function exportBundle(data, { customDir, appVersion, now = Date.now(), validateArgs, isValidCategory }) {
  const payload = buildPayload(data, { validateArgs, isValidCategory });
  const images = collectImages(payload.custom.items, customDir);
  // Si una imagen no se pudo leer, la referencia se quita para que el archivo sea coherente.
  for (const rec of Object.values(payload.custom.items)) {
    for (const k of ['banner', 'logo']) if (rec[k] && !images[rec[k]]) delete rec[k];
  }
  const body = JSON.stringify({ payload, images });
  // El cuerpo va como texto ya serializado para que la suma de comprobación sea exacta.
  const doc = { app: APP, format: FORMAT, createdAt: new Date(now).toISOString(), appVersion: appVersion || null, sha256: sha(body), body };
  const buf = zlib.gzipSync(Buffer.from(JSON.stringify(doc), 'utf8'), { level: 9 });
  return { buffer: buf, summary: summarize(payload, images) };
}

function summarize(payload, images) {
  const games = Object.values(payload.playtime.games);
  return {
    games: games.length,
    hours: Math.round(games.reduce((a, g) => a + g.seconds, 0) / 3600 * 10) / 10,
    customized: Object.keys(payload.custom.items).length,
    online: Object.keys(payload.online.entries).length + Object.keys(payload.online.wiki).length,
    images: Object.keys(images || {}).length
  };
}

// ------------------------------------------------------------ importar ----

function readBundle(buffer, helpers) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) throw new Error('El archivo está vacío o no es una copia de GameUtil.');
  if (buffer.length > MAX_COMPRESSED) throw new Error('El archivo es demasiado grande.');
  let raw;
  try { raw = zlib.gunzipSync(buffer, { maxOutputLength: MAX_RAW }).toString('utf8'); }
  catch (e) { throw new Error(/maxOutputLength|larger/i.test(String(e && e.message)) ? 'El archivo es demasiado grande al descomprimirlo.' : 'El archivo no es una copia de GameUtil válida o está dañado.'); }
  let doc;
  try { doc = JSON.parse(raw); } catch { throw new Error('El archivo está dañado: no se puede leer.'); }
  if (!isObj(doc) || doc.app !== APP) throw new Error('Este archivo no es una copia de GameUtil.');
  if (doc.format !== FORMAT) throw new Error(`Formato ${doc.format} no compatible con esta versión de GameUtil (se esperaba ${FORMAT}). Actualiza la aplicación.`);
  if (typeof doc.body !== 'string' || typeof doc.sha256 !== 'string') throw new Error('El archivo está incompleto.');
  if (sha(doc.body) !== doc.sha256) throw new Error('El archivo está dañado: la suma de comprobación no coincide.');
  let inner;
  try { inner = JSON.parse(doc.body); } catch { throw new Error('El contenido del archivo está dañado.'); }
  if (!isObj(inner) || !isObj(inner.payload)) throw new Error('El archivo no contiene datos.');

  const p = inner.payload;
  const payload = {
    playtime: { games: sanitizePlaytime(p.playtime) },
    custom: { items: sanitizeCustom(p.custom, helpers) },
    online: sanitizeOnline(p.online),
    settings: sanitizeSettings(p.settings)
  };

  // Solo se aceptan imágenes cuyo contenido real es una imagen y que alguna ficha usa.
  const wanted = new Set();
  for (const r of Object.values(payload.custom.items)) { if (r.banner) wanted.add(r.banner); if (r.logo) wanted.add(r.logo); }
  const images = {};
  const src = isObj(inner.images) ? inner.images : {};
  for (const name of wanted) {
    if (!imageName(name) || typeof src[name] !== 'string') continue;
    const buf = Buffer.from(src[name], 'base64');
    if (!buf.length || buf.length > MAX_IMAGE) continue;
    const ext = sniffExt(buf);
    if (!ext) continue;
    images[name] = buf;
  }
  for (const r of Object.values(payload.custom.items)) {
    for (const k of ['banner', 'logo']) if (r[k] && !images[r[k]]) delete r[k];
  }
  for (const k of Object.keys(payload.custom.items)) if (!Object.keys(payload.custom.items[k]).length) delete payload.custom.items[k];

  return { payload, images, info: { createdAt: typeof doc.createdAt === 'string' ? doc.createdAt.slice(0, 40) : null, appVersion: typeof doc.appVersion === 'string' ? doc.appVersion.slice(0, 20) : null, ...summarize(payload, images) } };
}

// ------------------------------------------------------------ aplicar ----
// mode 'merge': suma lo importado a lo que ya hay. Horas: se queda el mayor valor por juego (nunca se suman,
//               porque importar dos veces el mismo archivo duplicaría las horas). Personalización: lo importado
//               sustituye campo a campo. Datos online: solo se rellenan los que faltan.
// mode 'replace': lo importado sustituye todo lo anterior.
function applyBundle(store, bundle, { mode = 'merge', settings = false, now = Date.now() } = {}) {
  if (mode !== 'merge' && mode !== 'replace') throw new Error('Modo de importación no válido.');
  const { payload, images } = bundle;
  const replace = mode === 'replace';

  // Imágenes propias: si ya existe un archivo con ese nombre y otro contenido, se guarda con nombre nuevo. Nunca se borran imágenes anteriores.
  fs.mkdirSync(store.customDir, { recursive: true });
  const rename = new Map();
  for (const [name, buf] of Object.entries(images)) {
    const dest = path.join(store.customDir, name);
    let target = name;
    try {
      if (fs.existsSync(dest) && !fs.readFileSync(dest).equals(buf)) {
        const ext = path.extname(name);
        target = `${path.basename(name, ext)}-i${now.toString(36)}${ext}`;
      }
    } catch { /* se escribe igualmente */ }
    fs.writeFileSync(path.join(store.customDir, target), buf);
    rename.set(name, target);
  }

  const stats = { games: 0, customized: 0, online: 0, images: rename.size };

  // horas
  const games = store.playtime.data.games || (store.playtime.data.games = {});
  if (replace) for (const k of Object.keys(games)) delete games[k];
  for (const [k, v] of Object.entries(payload.playtime.games)) {
    const cur = games[k];
    if (!cur) { games[k] = { ...v }; stats.games++; continue; }
    const next = {
      seconds: Math.max(cur.seconds || 0, v.seconds),
      lastPlayed: Math.max(cur.lastPlayed || 0, v.lastPlayed),
      sessions: Math.max(cur.sessions || 0, v.sessions)
    };
    if (next.seconds !== cur.seconds || next.lastPlayed !== cur.lastPlayed || next.sessions !== cur.sessions) stats.games++;
    games[k] = { ...cur, ...next };
  }

  // personalización
  const items = store.custom.data.items;
  if (replace) {
    for (const k of Object.keys(items)) delete items[k];
  }
  for (const [k, v] of Object.entries(payload.custom.items)) {
    const rec = { ...v };
    for (const kind of ['banner', 'logo']) if (rec[kind]) rec[kind] = rename.get(rec[kind]) || rec[kind];
    const cur = items[k] && typeof items[k] === 'object' ? items[k] : (items[k] = {});
    Object.assign(cur, rec);
    stats.customized++;
  }

  // datos online
  const on = store.online.data;
  if (!on.entries) on.entries = {};
  if (!on.wiki) on.wiki = {};
  if (replace) { on.entries = {}; on.wiki = {}; on.auto = {}; }
  for (const part of ['entries', 'wiki']) {
    for (const [k, v] of Object.entries(payload.online[part])) {
      if (replace || !on[part][k]) { on[part][k] = v; stats.online++; }
    }
  }

  // ajustes (solo si se pide)
  if (settings) Object.assign(store.settings.data, payload.settings);

  return stats;
}

// Copia de seguridad previa, por si la importación no es lo que se esperaba.
function snapshotBefore(store, now = Date.now()) {
  const dir = path.join(store.backupDir, 'pre-import');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  const out = path.join(dir, `antes-de-importar-${stamp}.${EXT}`);
  // Se guarda sin pasar por el saneado de exportación para no perder nada.
  const text = JSON.stringify({ playtime: store.playtime.data, custom: store.custom.data, online: store.online.data });
  fs.writeFileSync(out, zlib.gzipSync(Buffer.from(text, 'utf8')));
  // Conserva solo las 5 últimas.
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.' + EXT)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 5))) fs.unlinkSync(path.join(dir, f));
  } catch { /* limpieza opcional */ }
  return out;
}

module.exports = {
  FORMAT, EXT, exportBundle, readBundle, applyBundle, snapshotBefore,
  sanitizePlaytime, sanitizeCustom, sanitizeOnline, sanitizeSettings, imageName
};

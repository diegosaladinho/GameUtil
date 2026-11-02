'use strict';
const { norm } = require('./util');

// Consulta la tienda pública de Steam: género, descripción, desarrollador y editor.
// Solo se envía el nombre del programa (o su appId). Nada más.

const BASE = 'https://store.steampowered.com';
const SCHEMA = 2; // versión del formato guardado; sube si se añaden campos

async function getJson(url, fetchImpl, timeoutMs = 10000) {
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (res.status === 429 || res.status === 403) {
    const e = new Error(`Steam ha limitado las peticiones (HTTP ${res.status}). Inténtalo más tarde.`);
    e.code = 'RATE_LIMIT';
    throw e;
  }
  if (!res.ok) throw new Error('Error HTTP ' + res.status);
  return res.json();
}

// Quita versiones, arquitectura y paréntesis para buscar mejor.
function cleanName(name) {
  return String(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bv?\d+(\.\d+)+\b/g, ' ')
    .replace(/[™®©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Texto plano: sin etiquetas HTML y con las entidades más comunes resueltas.
function plainText(html) {
  return String(html == null ? '' : html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function searchSteam(query, fetchImpl) {
  const url = `${BASE}/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=ES`;
  const j = await getJson(url, fetchImpl);
  return Array.isArray(j.items) ? j.items : [];
}

function pickMatch(name, results, fuzzy) {
  const target = norm(name);
  const exact = results.find(r => norm(r.name) === target);
  if (exact) return { item: exact, exact: true };
  if (!fuzzy) return null;
  for (const r of results) {
    const rn = norm(r.name);
    const [short, long] = rn.length < target.length ? [rn, target] : [target, rn];
    if (short.length >= 4 && long.startsWith(short) && short.length / long.length >= 0.75) {
      return { item: r, exact: false };
    }
  }
  return null;
}

async function fetchDetails(appId, lang, fetchImpl) {
  const j = await getJson(`${BASE}/api/appdetails?appids=${encodeURIComponent(appId)}&l=${lang}`, fetchImpl);
  const entry = j && j[String(appId)];
  return entry && entry.success ? entry.data : null;
}

const names = list => (Array.isArray(list) ? list.map(x => String(x).trim()).filter(Boolean).slice(0, 6) : []);

// item: elemento del inventario. Devuelve un registro cacheable.
async function enrich(item, { fetchImpl = globalThis.fetch, fuzzy = false } = {}) {
  const checkedAt = new Date().toISOString();
  let appId = item.appId;
  let exact = true;

  if (!appId) {
    const q = cleanName(item.name);
    if (q.length < 2) return { found: false, v: SCHEMA, checkedAt };
    const results = await searchSteam(q, fetchImpl);
    const m = pickMatch(item.name, results, fuzzy);
    if (!m) return { found: false, v: SCHEMA, checkedAt };
    appId = m.item.id;
    exact = m.exact;
  }

  // Los géneros se leen en inglés (así los reconoce el categorizador); la descripción, en español.
  const d = await fetchDetails(appId, 'english', fetchImpl);
  if (!d) return { found: false, v: SCHEMA, checkedAt };
  let description = plainText(d.short_description);
  try {
    const es = await fetchDetails(appId, 'spanish', fetchImpl);
    if (es && es.short_description) description = plainText(es.short_description);
  } catch (e) {
    if (e.code === 'RATE_LIMIT') throw e;
  }
  return {
    found: true,
    v: SCHEMA,
    appId: Number(appId),
    exact,
    isGame: d.type === 'game',
    genres: (d.genres || []).map(g => g.description).filter(Boolean),
    developers: names(d.developers),
    publishers: names(d.publishers),
    description: description.slice(0, 1200),
    checkedAt
  };
}

module.exports = { enrich, cleanName, pickMatch, plainText, SCHEMA };

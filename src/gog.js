'use strict';
const { pickSame } = require('./match');

// Catálogo público de GOG: portada horizontal, desarrollador, editor y géneros. No necesita clave.
// Solo se envía el nombre del juego.

async function findGog(name, fetchImpl = globalThis.fetch) {
  const url = `https://catalog.gog.com/v1/catalog?limit=8&order=desc:score&productType=in:game,pack&query=like:${encodeURIComponent(name)}`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (res.status === 429) { const e = new Error('GOG ha limitado las peticiones.'); e.code = 'RATE_LIMIT'; throw e; }
  if (!res.ok) throw new Error('Error HTTP ' + res.status);
  const j = await res.json();
  const list = j && Array.isArray(j.products) ? j.products : [];
  const hit = pickSame(name, list, p => p && p.title);
  if (!hit) return { found: false };
  const img = [hit.coverHorizontal, hit.coverVertical].find(u => typeof u === 'string' && u.startsWith('https://')) || null;
  const names = a => (Array.isArray(a) ? a.filter(x => typeof x === 'string') : []).slice(0, 5);
  return { found: true, title: hit.title, imageUrl: img, developers: names(hit.developers), publishers: names(hit.publishers) };
}

module.exports = { findGog };

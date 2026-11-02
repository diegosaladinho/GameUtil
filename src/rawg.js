'use strict';
const { pickSame } = require('./match');

// RAWG (https://rawg.io/apidocs): descripción, desarrollador, editor e imagen de fondo. Requiere una clave gratuita del usuario.

const BASE = 'https://api.rawg.io/api';

async function api(pathname, key, fetchImpl) {
  const sep = pathname.includes('?') ? '&' : '?';
  const res = await fetchImpl(`${BASE}${pathname}${sep}key=${encodeURIComponent(key)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (res.status === 401 || res.status === 403) { const e = new Error('RAWG ha rechazado la clave de API. Revísala en Ajustes.'); e.code = 'BAD_KEY'; throw e; }
  if (res.status === 429) { const e = new Error('RAWG ha limitado las peticiones.'); e.code = 'RATE_LIMIT'; throw e; }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Error HTTP ' + res.status);
  return res.json();
}

const trim = (t, max = 700) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const i = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (i > max * 0.5 ? cut.slice(0, i + 1) : cut.replace(/\s+\S*$/, '') + '…');
};

async function findRawg(name, key, fetchImpl = globalThis.fetch) {
  const s = await api(`/games?search=${encodeURIComponent(name)}&search_precise=true&page_size=8`, key, fetchImpl);
  const hit = pickSame(name, (s && Array.isArray(s.results)) ? s.results : [], g => g && g.name);
  if (!hit) return { found: false };
  const d = await api(`/games/${encodeURIComponent(hit.id)}`, key, fetchImpl);
  const names = a => (Array.isArray(a) ? a.map(x => x && x.name).filter(x => typeof x === 'string') : []).slice(0, 5);
  const img = [hit.background_image, d && d.background_image].find(u => typeof u === 'string' && u.startsWith('https://')) || null;
  return {
    found: true, title: hit.name, imageUrl: img,
    description: d && d.description_raw ? trim(d.description_raw) : '',
    developers: names(d && d.developers), publishers: names(d && d.publishers)
  };
}

module.exports = { findRawg, trim };

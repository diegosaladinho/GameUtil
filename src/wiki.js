'use strict';
const { norm } = require('./util');

// Busca la página de Wikipedia de un juego o programa para obtener descripción y una imagen (carátula o logo).
// Solo se acepta una página cuyo título coincida exactamente con el nombre: es mejor no mostrar nada que mostrar algo equivocado.

const SCHEMA = 1;
const GAME_RE = /video ?game|videojuego|juego de|computer game|game series|saga/i;
const SUFFIXES = {
  game: [' (video game)', ' (videojuego)', ''],
  tool: ['', ' (software)', ' (programa)', ' (web browser)']
};

async function getSummary(lang, title, fetchImpl) {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json', 'Api-User-Agent': 'GameUtil/0.3 (launcher local)' }, signal: AbortSignal.timeout(10000) });
  if (res.status === 404) return null;
  if (res.status === 429 || res.status === 403) {
    const e = new Error('Wikipedia ha limitado las peticiones. Inténtalo más tarde.');
    e.code = 'RATE_LIMIT';
    throw e;
  }
  if (!res.ok) throw new Error('Error HTTP ' + res.status);
  return res.json();
}

// "Hades (video game)" -> "Hades"
const baseTitle = t => norm(String(t || '').replace(/\s*\([^)]*\)\s*$/, ''));

function trimExtract(text, max = 700) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.'));
  return (end > 200 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…').trim();
}

// Pide una miniatura más grande (Wikimedia genera el tamaño pedido).
function bigThumb(url, px = 640) {
  const u = String(url || '');
  return /\/\d+px-[^/]+$/.test(u) ? u.replace(/\/\d+px-([^/]+)$/, `/${px}px-$1`) : u;
}

function accept(summary, name, type) {
  if (!summary || summary.type === 'disambiguation' || summary.type === 'no-extract') return false;
  if (baseTitle(summary.title) !== norm(name)) return false;
  const text = `${summary.description || ''} ${summary.extract || ''}`.slice(0, 600);
  const isGame = GAME_RE.test(text);
  return type === 'game' ? isGame : !isGame;
}

// item: { name, type }. Devuelve { found, title, lang, description, imageUrl, checkedAt, v }.
async function findPage(name, type, { fetchImpl = globalThis.fetch, langs = ['es', 'en'] } = {}) {
  const checkedAt = new Date().toISOString();
  const miss = { found: false, v: SCHEMA, checkedAt };
  const base = String(name || '').trim();
  if (base.length < 2) return miss;
  let best = null;
  for (const lang of langs) {
    for (const suf of SUFFIXES[type] || ['']) {
      const s = await getSummary(lang, base + suf, fetchImpl);
      if (!accept(s, base, type)) continue;
      const cand = {
        lang, title: s.title, description: trimExtract(s.extract),
        imageUrl: s.thumbnail && s.thumbnail.source ? bigThumb(s.thumbnail.source) : null
      };
      // se queda con la primera página válida, pero si le falta la imagen sigue buscando en el otro idioma
      if (!best) best = cand;
      else if (!best.imageUrl && cand.imageUrl) best.imageUrl = cand.imageUrl;
      if (best.imageUrl) break;
    }
    if (best && best.imageUrl) break;
  }
  return best ? { found: true, v: SCHEMA, checkedAt, ...best } : miss;
}

module.exports = { findPage, accept, trimExtract, bigThumb, baseTitle, SCHEMA };

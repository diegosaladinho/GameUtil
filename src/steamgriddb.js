'use strict';
const { norm } = require('./util');

// API de SteamGridDB (https://www.steamgriddb.com/api/v2). Requiere una clave gratuita del usuario.
// Solo se envía el nombre del juego (o su appId de Steam).

const BASE = 'https://www.steamgriddb.com/api/v2';

async function api(pathname, key, fetchImpl) {
  const res = await fetchImpl(BASE + pathname, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  if (res.status === 401 || res.status === 403) {
    const e = new Error('SteamGridDB ha rechazado la clave de API. Revísala en Ajustes.');
    e.code = 'BAD_KEY';
    throw e;
  }
  if (res.status === 429) {
    const e = new Error('SteamGridDB ha limitado las peticiones. Inténtalo más tarde.');
    e.code = 'RATE_LIMIT';
    throw e;
  }
  if (res.status === 404) return [];
  if (!res.ok) throw new Error('Error HTTP ' + res.status);
  const j = await res.json();
  return j && j.success && Array.isArray(j.data) ? j.data : [];
}

async function findGameId(name, key, fetchImpl) {
  const results = await api(`/search/autocomplete/${encodeURIComponent(name)}`, key, fetchImpl);
  const target = norm(name);
  const exact = results.find(r => norm(r.name) === target);
  return exact ? exact.id : null;
}

const firstUrl = list => (list.find(x => x && typeof x.url === 'string') || {}).url || null;

// item: { name, source, appId }. Devuelve { hero, logo } (URLs o null).
async function findArt(item, key, fetchImpl = globalThis.fetch) {
  let heroes, logos;
  if (item.source === 'steam' && item.appId) {
    const id = encodeURIComponent(item.appId);
    heroes = await api(`/heroes/steam/${id}?types=static`, key, fetchImpl);
    logos = await api(`/logos/steam/${id}?types=static`, key, fetchImpl);
  } else {
    const gameId = await findGameId(item.name, key, fetchImpl);
    if (!gameId) return { hero: null, logo: null };
    heroes = await api(`/heroes/game/${gameId}?types=static`, key, fetchImpl);
    logos = await api(`/logos/game/${gameId}?types=static`, key, fetchImpl);
  }
  return { hero: firstUrl(heroes), logo: firstUrl(logos) };
}

module.exports = { findArt, findGameId };

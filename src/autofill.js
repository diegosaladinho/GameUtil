'use strict';

const DAY = 24 * 60 * 60 * 1000;
const MISS_TTL = 14 * DAY;   // tras una búsqueda sin resultado no se vuelve a intentar hasta pasado este tiempo
const SKIP_CATEGORIES = new Set(['Runtimes y controladores']);

// ¿Falta todo (banner, logo y descripción) y no lo ha personalizado el usuario?
function isBare(e) {
  const none = e.art.banner == null && e.art.logo == null && e.art.cover == null && !e.description;
  const custom = e.custom && (e.custom.banner || e.custom.logo || e.custom.description);
  return none && !custom;
}

// auto: { [key]: { checkedAt, found } } con los intentos anteriores.
function needsAutofill(e, auto, now = Date.now()) {
  if (!isBare(e)) return false;
  if (e.type === 'tool' && SKIP_CATEGORIES.has(e.category)) return false;
  const prev = auto && auto[e.key];
  if (prev && now - Date.parse(prev.checkedAt || 0) < MISS_TTL) return false;
  return true;
}

module.exports = { isBare, needsAutofill, MISS_TTL };

'use strict';
const { categorize, applyOnline, applyOverride, isValidCategory } = require('./categorizer');
const { norm, cleanTitle } = require('./util');
const { hoursFor } = require('./playtime');

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

// Convierte los elementos detectados en las fichas que muestra el launcher.
// ctx: { custom, online, playtime, steamMap, running }
function buildEntries(raws, ctx) {
  const custom = ctx.custom || {};
  const online = ctx.online || {};
  const own = (ctx.playtime && ctx.playtime.games) || {};
  const out = [];
  const seen = new Set();

  for (const raw of raws) {
    const key = norm(raw.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const e = { ...raw, key, ...categorize(raw), genres: [], overridden: false };
    const on = online[key];
    if (on) applyOnline(e, on);
    const cu = custom[key] || {};
    if (cu.type && isValidCategory(cu.type, cu.category)) applyOverride(e, cu);

    const publisher = e.publisher || '';
    const wk = (ctx.wiki || {})[key];
    const wkDev = wk && wk.found && Array.isArray(wk.developers) && wk.developers.length ? wk.developers.join(', ') : '';
    const wkPub = wk && wk.found && Array.isArray(wk.publishers) && wk.publishers.length ? wk.publishers.join(', ') : '';
    const developer = (on && on.developers && on.developers.length ? on.developers.join(', ') : '') || wkDev || publisher;
    const editor = (on && on.publishers && on.publishers.length ? on.publishers.join(', ') : '') || wkPub || publisher;
    const steamDesc = (on && on.description) || '';
    const wikiDesc = wk && wk.found && wk.description ? wk.description : '';
    const wikiSrc = (wk && typeof wk.source === 'string' && wk.source) || 'Wikipedia';
    const autoDescription = steamDesc || wikiDesc;
    e.descSource = typeof cu.description === 'string' ? null : steamDesc ? 'Steam' : wikiDesc ? wikiSrc : null;
    const hrs = e.type === 'game' ? hoursFor(e, own[key], ctx.steamMap) : { minutes: 0, source: null, lastPlayed: null };

    e.autoTitle = cleanTitle(raw.name);
    e.title = clip(cu.title, 120).trim() || e.autoTitle;
    e.developer = developer;
    e.editor = editor;
    e.description = typeof cu.description === 'string' ? cu.description : autoDescription;
    e.args = clip(cu.args, 1000);
    e.artAppId = raw.appId || (on && on.found && on.exact && on.appId) || null;
    e.hours = hrs;
    e.running = !!(ctx.running && ctx.running.has(key));
    e.custom = {
      title: !!cu.title, description: typeof cu.description === 'string', banner: !!cu.banner, logo: !!cu.logo
    };
    e.canUninstall = raw.source === 'steam' ? !!raw.appId : !!raw.regKey;
    out.push(e);
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
}

module.exports = { buildEntries };

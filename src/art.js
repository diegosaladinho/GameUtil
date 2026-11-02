'use strict';
const fs = require('fs');
const path = require('path');
const { fileId } = require('./images');
const { findSteamArt } = require('./steam');

const EXTS = ['.jpg', '.png', '.webp', '.gif'];
const KINDS = ['banner', 'logo', 'icon', 'cover', 'thumb'];

function findFile(dir, base) {
  for (const ext of EXTS) {
    const f = path.join(dir, base + ext);
    try {
      const st = fs.statSync(f);
      if (st.isFile()) return { file: f, rev: Math.round(st.mtimeMs) };
    } catch { /* no existe */ }
  }
  return null;
}

function ref(file) {
  if (!file) return null;
  try { return { file, rev: Math.round(fs.statSync(file).mtimeMs) }; } catch { return null; }
}

// Un nombre de archivo guardado por el usuario solo vale si es un nombre simple (sin carpetas).
function customRef(dir, name) {
  if (!name || typeof name !== 'string' || path.basename(name) !== name) return null;
  return ref(path.join(dir, name));
}

// Prioridad: imagen propia > descargada > caché local de Steam > icono del ejecutable.
function resolveArt(entry, { customDir, cacheDir, iconsDir, steamRoot, custom }) {
  const id = fileId(entry.key);
  const steam = entry.artAppId && steamRoot ? findSteamArt(steamRoot, entry.artAppId) : {};
  const cu = custom || {};
  const banner = customRef(customDir, cu.banner) || findFile(cacheDir, `${id}-banner`) || ref(steam.hero) || ref(steam.header);
  const logo = customRef(customDir, cu.logo) || findFile(cacheDir, `${id}-logo`) || ref(steam.logo);
  const icon = findFile(iconsDir, id) || ref(steam.icon);
  // carátula o logo de Wikipedia: sirve de miniatura y de fondo difuminado cuando no hay banner
  const cover = findFile(cacheDir, `${id}-cover`);
  const thumb = icon || cover || logo || ref(steam.header) || banner;
  return { banner, logo, icon, cover, thumb };
}

// Resumen sin rutas para la interfaz: solo la revisión de cada imagen (sirve para refrescar la caché).
function artRevs(art) {
  const out = {};
  for (const k of KINDS) out[k] = art[k] ? art[k].rev : null;
  return out;
}

module.exports = { resolveArt, artRevs, findFile, customRef, KINDS };

'use strict';

// Normaliza un texto: minúsculas, sin tildes, solo letras/números separados por un espacio.
function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ¿Contiene `normText` la secuencia de palabras `kw` (ya normalizada) como palabras completas?
function has(normText, kw) {
  return (' ' + normText + ' ').includes(' ' + kw + ' ');
}

function hasAny(normText, list) {
  for (const kw of list) if (has(normText, kw)) return true;
  return false;
}

// ¿Empieza `normText` por `kw` como palabra completa?
function startsWithKw(normText, kw) {
  return normText === kw || normText.startsWith(kw + ' ');
}

// Ruta en minúsculas, con barras de Windows y sin barra final (para comparar).
function normPath(p) {
  return String(p == null ? '' : p).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

// Nombre para mostrar: quita arquitectura y versión final ("7-Zip 24.08 (x64)" -> "7-Zip").
function cleanTitle(name) {
  const original = String(name == null ? '' : name).trim();
  let t = original;
  t = t.replace(/\s*[(\[](?:x64|x86|amd64|64[- ]?bit|32[- ]?bit)[^)\]]*[)\]]/ig, '');
  t = t.replace(/\s+v?\d+(?:\.\d+){1,3}(?:\s*(?:beta|rc\d*))?\s*$/i, '');
  t = t.replace(/\s*[-–]\s*$/, '').replace(/\s+/g, ' ').trim();
  return t || original;
}

module.exports = { norm, has, hasAny, startsWithKw, normPath, cleanTitle };

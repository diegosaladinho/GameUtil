'use strict';
const { norm } = require('./util');

// Decide si el título de un resultado es el mismo juego que buscamos.
// Es deliberadamente estricto: un número distinto ("Hades II" frente a "Hades") o una palabra extra con
// significado ("Hades: Battle Out of Hell") no cuentan como coincidencia. Mejor no mostrar nada que algo equivocado.

const ROMAN = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
// Ediciones y adornos que no cambian de qué juego se trata.
const NOISE = new Set(['the', 'a', 'edition', 'goty', 'game', 'of', 'year', 'deluxe', 'definitive', 'complete', 'remastered', 'enhanced', 'ultimate', 'standard', 'gold', 'premium', 'anniversary', 'director', 's', 'cut', 'collection']);

function tokens(s) {
  return norm(String(s || '').replace(/[™®©]/g, ''))
    .split(' ').filter(Boolean)
    .map(t => ROMAN[t] || t);
}

function core(s) {
  return tokens(s).filter(t => !NOISE.has(t));
}

function sameTitle(query, candidate) {
  const a = core(query), b = core(candidate);
  if (!a.length || !b.length) return false;
  const numA = a.filter(t => /^\d+$/.test(t)).join(','), numB = b.filter(t => /^\d+$/.test(t)).join(',');
  if (numA !== numB) return false;
  // mismas palabras con significado, en cualquier orden
  return a.length === b.length && a.every(t => b.includes(t));
}

// Elige, entre los resultados, el que se llama igual. Devuelve null si ninguno.
function pickSame(query, results, getTitle) {
  return results.find(r => sameTitle(query, getTitle(r))) || null;
}

module.exports = { sameTitle, pickSame, core };

'use strict';

// Lector del formato de texto de Valve (VDF/ACF): "clave" "valor" y bloques { }.
function parseVdf(text) {
  const s = String(text).replace(/^﻿/, '');
  const n = s.length;
  let i = 0;

  function skip() {
    while (i < n) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') i++;
      else if (c === '/' && s[i + 1] === '/') { while (i < n && s[i] !== '\n') i++; }
      else break;
    }
  }
  function str() {
    i++; // comilla de apertura
    let out = '';
    while (i < n && s[i] !== '"') {
      if (s[i] === '\\' && i + 1 < n) {
        const d = s[i + 1];
        out += d === 'n' ? '\n' : d === 't' ? '\t' : d;
        i += 2;
      } else out += s[i++];
    }
    i++; // comilla de cierre
    return out;
  }
  function block() {
    const o = {};
    for (;;) {
      skip();
      if (i >= n) return o;
      if (s[i] === '}') { i++; return o; }
      if (s[i] !== '"') { i++; continue; }
      const k = str();
      skip();
      if (s[i] === '{') { i++; o[k] = block(); }
      else if (s[i] === '"') o[k] = str();
    }
  }
  return block();
}

// Busca una clave sin distinguir mayúsculas.
function ci(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  const want = String(key).toLowerCase();
  const k = Object.keys(obj).find(x => x.toLowerCase() === want);
  return k === undefined ? undefined : obj[k];
}

function vget(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    cur = ci(cur, k);
    if (cur === undefined) return undefined;
  }
  return cur;
}

module.exports = { parseVdf, ci, vget };

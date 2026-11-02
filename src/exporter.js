'use strict';

const MB = 1024 * 1024;

const sizeMb = i => (i.sizeBytes ? (i.sizeBytes / MB).toFixed(1).replace('.', ',') : '');

const COLUMNS = {
  game: [
    ['Nombre', i => i.name],
    ['Plataforma', i => i.platform],
    ['Género', i => i.category],
    ['Tamaño (MB)', sizeMb],
    ['Fecha de instalación', i => i.installDate],
    ['Ubicación', i => i.location]
  ],
  tool: [
    ['Nombre', i => i.name],
    ['Editor', i => i.publisher],
    ['Categoría', i => i.category],
    ['Versión', i => i.version],
    ['Tamaño (MB)', sizeMb],
    ['Fecha de instalación', i => i.installDate],
    ['Ubicación', i => i.location]
  ]
};

// Evita que Excel interprete un texto como fórmula (=, +, -, @).
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// CSV con ';' y BOM UTF-8 para que Excel en español lo abra bien.
function toCsv(type, items) {
  const cols = COLUMNS[type];
  if (!cols) throw new Error('Tipo desconocido: ' + type);
  const lines = [cols.map(c => csvCell(c[0])).join(';')];
  for (const it of items) lines.push(cols.map(c => csvCell(c[1](it))).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function toJson(type, items) {
  if (!COLUMNS[type]) throw new Error('Tipo desconocido: ' + type);
  const rows = items.map(i => type === 'game'
    ? { nombre: i.name, plataforma: i.platform || null, genero: i.category, generos: i.genres || [],
        tamanoBytes: i.sizeBytes || null, fechaInstalacion: i.installDate || null, ubicacion: i.location || '' }
    : { nombre: i.name, editor: i.publisher || '', categoria: i.category, version: i.version || '',
        tamanoBytes: i.sizeBytes || null, fechaInstalacion: i.installDate || null, ubicacion: i.location || '' });
  return JSON.stringify(rows, null, 2);
}

module.exports = { toCsv, toJson, csvCell };

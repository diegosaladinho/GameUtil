'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Guardado seguro: escritura atómica, suma de comprobación SHA-256 y copias rotativas.
// El archivo sigue siendo JSON legible: { "format": 1, "sha256": "...", "data": { ... } }

const FORMAT = 1;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const clone = v => JSON.parse(JSON.stringify(v));

function encode(data) {
  const body = JSON.stringify(data);
  return `{"format":${FORMAT},"sha256":"${sha(body)}","data":${body}}`;
}

function decode(text) {
  const j = JSON.parse(String(text).replace(/^﻿/, ''));
  if (j && typeof j === 'object' && !Array.isArray(j) && j.format === FORMAT && j.data && typeof j.data === 'object') {
    if (sha(JSON.stringify(j.data)) !== j.sha256) throw new Error('La suma de comprobación no coincide');
    return j.data;
  }
  if (j && typeof j === 'object' && !Array.isArray(j) && j.format === undefined) return j; // archivo antiguo sin envoltorio
  throw new Error('Formato no reconocido');
}

function tryRead(file) {
  try {
    return { data: decode(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { error: e, missing: e && e.code === 'ENOENT' };
  }
}

function backupPaths(dir, name, keep) {
  return Array.from({ length: keep }, (_, i) => path.join(dir, `${name}.${i + 1}.json`));
}

function readSafe(file, backups) {
  const main = tryRead(file);
  if (main.data) return { data: main.data, source: 'main', corrupted: false };
  let corrupted = false;
  if (!main.missing) {
    corrupted = true;
    try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch { /* se deja donde está */ }
  }
  for (const b of backups) {
    const r = tryRead(b);
    if (r.data) return { data: r.data, source: 'backup', corrupted, backup: b };
  }
  return { data: null, source: 'none', corrupted };
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

// Guarda una copia del archivo actual (si es válido) cuando la última tiene más de minAgeMs.
function rotateBackups(file, backups, minAgeMs, now = Date.now()) {
  if (!tryRead(file).data) return;
  try {
    const st = fs.statSync(backups[0]);
    if (now - st.mtimeMs < minAgeMs) return;
  } catch { /* aún no hay copia */ }
  fs.mkdirSync(path.dirname(backups[0]), { recursive: true });
  for (let i = backups.length - 1; i >= 1; i--) {
    try { fs.renameSync(backups[i - 1], backups[i]); } catch { /* hueco */ }
  }
  fs.copyFileSync(file, backups[0]);
}

class JsonFile {
  constructor({ dir, name, defaults, backupDir, keep = 5, minBackupAgeMs = 60 * 60 * 1000 }) {
    this.name = name;
    this.file = path.join(dir, `${name}.json`);
    this.defaults = defaults;
    this.backups = backupPaths(backupDir || path.join(dir, 'backups'), name, keep);
    this.minBackupAgeMs = minBackupAgeMs;
    this.timer = null;
    this.lastError = null;
    this.load();
  }

  load() {
    const r = readSafe(this.file, this.backups);
    this.status = { source: r.source, corrupted: r.corrupted };
    const data = r.data && typeof r.data === 'object' ? r.data : {};
    for (const [k, v] of Object.entries(this.defaults)) if (!(k in data)) data[k] = clone(v);
    this.data = data;
    return this;
  }

  save() {
    rotateBackups(this.file, this.backups, this.minBackupAgeMs);
    writeAtomic(this.file, encode(this.data));
    this.lastError = null;
  }

  // Programa un guardado; si ya hay uno pendiente, no lo reprograma (como mucho 1 escritura por ventana).
  saveSoon(ms = 1000) {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try { this.save(); } catch (e) { this.lastError = e; }
    }, ms);
    if (this.timer.unref) this.timer.unref();
  }

  flush() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    try { this.save(); } catch (e) { this.lastError = e; }
  }
}

module.exports = { JsonFile, encode, decode, readSafe, writeAtomic, rotateBackups, backupPaths, clone };

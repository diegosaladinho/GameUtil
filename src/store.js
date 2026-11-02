'use strict';
const fs = require('fs');
const path = require('path');
const { JsonFile } = require('./safejson');

const DEFAULT_SETTINGS = {
  theme: 'auto',            // auto | light | dark
  transitions: true,
  background: true,         // seguir midiendo horas con la ventana cerrada (bandeja)
  trayNoticeShown: false,
  splash: true,             // pantalla de carga al abrir
  tutorialDone: false,      // el tutorial de primera vez ya se mostró
  sgdbKeyEnc: null,         // clave de SteamGridDB cifrada con Windows (DPAPI)
  view: { type: 'game', key: null, sort: 'name' }
};

// Toda la información persistente vive en una sola carpeta:
//   library.json · playtime.json · custom.json · online.json · settings.json
//   images/ (custom, cache, icons) · backups/
class Store {
  constructor(dir) {
    this.dir = dir;
    this.backupDir = path.join(dir, 'backups');
    this.imagesDir = path.join(dir, 'images');
    this.customDir = path.join(this.imagesDir, 'custom');
    this.cacheDir = path.join(this.imagesDir, 'cache');
    this.iconsDir = path.join(this.imagesDir, 'icons');
    for (const d of [dir, this.backupDir, this.customDir, this.cacheDir, this.iconsDir]) fs.mkdirSync(d, { recursive: true });

    const mk = (name, defaults) => new JsonFile({ dir, name, defaults, backupDir: this.backupDir });
    this.library = mk('library', { at: null, demo: false, items: [] });
    this.playtime = mk('playtime', { games: {} });
    this.custom = mk('custom', { items: {} });
    this.online = mk('online', { entries: {} });
    this.settings = mk('settings', DEFAULT_SETTINGS);
    this.migrateLegacy();
  }

  // Versión 0.1 guardaba todo en inventario.json
  migrateLegacy() {
    const legacy = path.join(this.dir, 'inventario.json');
    if (!fs.existsSync(legacy) || fs.existsSync(this.library.file)) return;
    try {
      const j = JSON.parse(fs.readFileSync(legacy, 'utf8'));
      if (j.lastScan && Array.isArray(j.lastScan.items)) this.library.data = { at: j.lastScan.at, demo: !!j.lastScan.demo, items: j.lastScan.items };
      for (const [k, ov] of Object.entries(j.overrides || {})) {
        if (ov && ov.type && ov.category) this.custom.data.items[k] = { type: ov.type, category: ov.category };
      }
      for (const [k, v] of Object.entries(j.online || {})) this.online.data.entries[k] = v;
      this.library.save(); this.custom.save(); this.online.save();
      fs.renameSync(legacy, legacy + '.migrado');
    } catch { /* si falla, se empieza de cero sin tocar el archivo antiguo */ }
  }

  files() {
    const size = p => {
      try {
        const st = fs.statSync(p);
        if (!st.isDirectory()) return st.size;
        let total = 0;
        const walk = d => {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const f = path.join(d, e.name);
            if (e.isDirectory()) walk(f); else { try { total += fs.statSync(f).size; } catch { /* ignorar */ } }
          }
        };
        walk(p);
        return total;
      } catch { return null; }
    };
    const entry = (id, label, p, note) => ({ id, label, path: p, file: path.basename(p), note, size: size(p) });
    return [
      entry('library', 'Biblioteca detectada', this.library.file, 'Lista de programas del último escaneo'),
      entry('playtime', 'Horas jugadas', this.playtime.file, 'Tiempo medido por esta app y horas importadas'),
      entry('custom', 'Personalización', this.custom.file, 'Títulos, descripciones, argumentos y correcciones'),
      entry('online', 'Datos de la búsqueda online', this.online.file, 'Géneros, descripciones y desarrolladores'),
      entry('settings', 'Ajustes de la app', this.settings.file, 'Tema, transiciones y segundo plano'),
      entry('images', 'Imágenes', this.imagesDir, 'Banners, logos e iconos'),
      entry('backups', 'Copias de seguridad', this.backupDir, 'Hasta 5 copias automáticas de cada archivo'),
      entry('root', 'Carpeta de datos', this.dir, 'Todo lo anterior')
    ];
  }

  flushAll() {
    for (const f of [this.library, this.playtime, this.custom, this.online, this.settings]) f.flush();
  }

  saveAll() {
    for (const f of [this.library, this.playtime, this.custom, this.online, this.settings]) {
      try { f.save(); } catch (e) { f.lastError = e; }
    }
  }
}

module.exports = { Store, DEFAULT_SETTINGS };

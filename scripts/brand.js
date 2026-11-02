'use strict';
// Hace que el proceso de desarrollo se llame GameUtil.exe en lugar de electron.exe.
// Se ejecuta solo antes de `npm start` (prestart). Es opcional: si algo falla, la app arranca igual.
// En la versión empaquetada (`npm run dist`) electron-builder ya genera GameUtil.exe.
const fs = require('fs');
const path = require('path');

const NAME = 'GameUtil';
const MARK = '.gameutil-brand.json';

async function brand({ electronDir, platform = process.platform, rcedit = null, icon = null, log = console.log } = {}) {
  if (platform !== 'win32') return { status: 'skipped', reason: 'solo Windows' };
  const dist = path.join(electronDir, 'dist');
  const src = path.join(dist, 'electron.exe');
  const dest = path.join(dist, `${NAME}.exe`);
  if (!fs.existsSync(src)) return { status: 'skipped', reason: 'electron.exe no está instalado (ejecuta: node node_modules/electron/install.js)' };

  const version = JSON.parse(fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8')).version;
  const markFile = path.join(dist, MARK);
  let mark = null;
  try { mark = JSON.parse(fs.readFileSync(markFile, 'utf8')); } catch { /* primera vez */ }
  const pathTxt = path.join(electronDir, 'path.txt');
  const current = fs.existsSync(pathTxt) ? fs.readFileSync(pathTxt, 'utf8').trim() : '';

  if (mark && mark.version === version && fs.existsSync(dest) && current === `${NAME}.exe`) return { status: 'ok', reason: 'ya estaba' };

  fs.copyFileSync(src, dest);
  let renamedInfo = false;
  let warning = null;
  if (rcedit) {
    try {
      const opts = {
        'version-string': {
          ProductName: NAME, FileDescription: NAME, InternalName: NAME, OriginalFilename: `${NAME}.exe`,
          CompanyName: NAME, LegalCopyright: NAME
        },
        'file-version': version, 'product-version': version
      };
      if (icon && fs.existsSync(icon)) opts.icon = icon;
      await rcedit(dest, opts);
      renamedInfo = true;
    } catch (e) {
      warning = `No se pudo cambiar la descripción del ejecutable (${e && e.message ? e.message : e}). El archivo se llama ${NAME}.exe, pero el Administrador de tareas puede seguir mostrando «Electron».`;
    }
  } else {
    warning = 'rcedit no está instalado (ejecuta npm install). El archivo se llama GameUtil.exe, pero el Administrador de tareas puede seguir mostrando «Electron».';
  }
  fs.writeFileSync(pathTxt, `${NAME}.exe`);
  fs.writeFileSync(markFile, JSON.stringify({ version, at: new Date().toISOString(), info: renamedInfo }));
  if (warning) log(warning);
  return { status: 'branded', info: renamedInfo, warning };
}

async function loadRcedit() {
  try {
    const mod = require('rcedit');
    return mod.rcedit || mod.default || mod;
  } catch {
    try {
      const mod = await import('rcedit');
      return mod.rcedit || mod.default;
    } catch { return null; }
  }
}

module.exports = { brand, loadRcedit };

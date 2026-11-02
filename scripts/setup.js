'use strict';
// Prepara el entorno antes de arrancar: comprueba que Electron está instalado (y lo descarga si npm
// bloqueó su script de instalación) y después le pone el nombre GameUtil al ejecutable.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { brand, loadRcedit } = require('./brand');

function electronDir() {
  try { return path.dirname(require.resolve('electron/package.json')); } catch { return null; }
}

function ensureElectron({ dir = electronDir(), run = file => execFileSync(process.execPath, [file], { stdio: 'inherit' }) } = {}) {
  if (!dir) return { status: 'missing', message: 'Electron no está instalado. Abre una terminal en esta carpeta y ejecuta primero: npm install' };
  if (fs.existsSync(path.join(dir, 'path.txt')) && fs.existsSync(path.join(dir, 'dist'))) return { status: 'ok', dir };
  try {
    run(path.join(dir, 'install.js'));
  } catch (e) {
    return { status: 'failed', dir, message: `No se pudo descargar Electron (${e.message}). Comprueba tu conexión a internet y ejecuta: node node_modules/electron/install.js` };
  }
  return fs.existsSync(path.join(dir, 'path.txt')) ? { status: 'installed', dir } : { status: 'failed', dir, message: 'Electron no terminó de instalarse. Ejecuta: node node_modules/electron/install.js' };
}

async function main() {
  const r = ensureElectron();
  if (r.status === 'missing' || r.status === 'failed') {
    console.error('\n' + r.message + '\n');
    process.exitCode = 1;
    return;
  }
  try {
    const b = await brand({ electronDir: r.dir, rcedit: process.platform === 'win32' ? await loadRcedit() : null, icon: path.join(__dirname, '..', 'build', 'icon.ico') });
    if (b.status === 'branded') console.log(`GameUtil.exe preparado${b.info ? '' : ' (sin cambiar la descripción)'}.`);
  } catch (e) {
    console.log('Aviso: no se pudo preparar GameUtil.exe:', e.message);
  }
}

if (require.main === module) main();

module.exports = { ensureElectron, electronDir };

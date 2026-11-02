'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { dataDir } = require('../src/paths');
const { sumsFor } = require('../scripts/checksums');

module.exports = function register(test) {
  test('datos: siempre en APPDATA\\GameUtil, también en la versión portable', () => {
    const appData = path.resolve('ad');
    const expected = { dir: path.join(appData, 'GameUtil'), portable: false };
    assert.deepStrictEqual(dataDir({ appData }), expected);
    process.env.PORTABLE_EXECUTABLE_DIR = path.resolve('junto-al-exe');
    try { assert.deepStrictEqual(dataDir({ appData }), expected, 'el .exe portable no cambia la ubicación'); }
    finally { delete process.env.PORTABLE_EXECUTABLE_DIR; }
    assert.throws(() => dataDir({ appData: 'relativa' }));
  });
  test('sumas SHA-256 de los .exe', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gu-sum-'));
    fs.writeFileSync(path.join(d, 'GameUtil-Portable-1.exe'), 'abc');
    fs.writeFileSync(path.join(d, 'notas.txt'), 'no');
    assert.deepStrictEqual(sumsFor(d), ['ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  GameUtil-Portable-1.exe']);
    fs.rmSync(d, { recursive: true, force: true });
  });
  test('configuración de empaquetado: solo portable, sin pruebas dentro, flujo de CI', () => {
    const root = path.join(__dirname, '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const targets = pkg.build.win.target.map(t => t.target).sort();
    assert.deepStrictEqual(targets, ['portable']);
    assert.ok(!pkg.build.nsis && !/nsis/.test(JSON.stringify(pkg.scripts)), 'el instalador está retirado');
    assert.ok(pkg.build.files.includes('!**/*.test.js'));
    for (const f of ['LICENSE', '.gitignore', '.github/workflows/build.yml', 'README.md', 'BUILDING.md', 'compilar.bat']) assert.ok(fs.existsSync(path.join(root, f)), f);
    assert.strictEqual(pkg.license, 'MIT');
    const wf = fs.readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8');
    assert.ok(/windows-latest/.test(wf) && /npm run dist/.test(wf) && /npm test/.test(wf));
  });
};

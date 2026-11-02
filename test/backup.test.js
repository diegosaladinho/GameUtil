'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const backup = require('../src/backup');
const { Store } = require('../src/store');
const { validateArgs } = require('../src/launch');
const { isValidCategory } = require('../src/categorizer');

const H = { validateArgs, isValidCategory };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 7)]);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gu-bk-'));

function seed(dir) {
  const s = new Store(dir);
  s.playtime.data.games = { hades: { seconds: 7200, lastPlayed: 1700000000000, sessions: 4 }, celeste: { seconds: 600, lastPlayed: 1600000000000, sessions: 1 } };
  fs.writeFileSync(path.join(s.customDir, 'hades-banner-x1.png'), PNG);
  s.custom.data.items = {
    hades: { title: 'Hades GOTY', description: 'Mi nota', args: '-windowed', banner: 'hades-banner-x1.png', type: 'game', category: 'Acción' },
    code: { title: 'VS Code' }
  };
  s.online.data.entries = { hades: { description: 'Roguelike', developers: ['Supergiant'], fetchedAt: 1 } };
  s.online.data.wiki = { celeste: { description: 'Plataformas', url: 'https://es.wikipedia.org/wiki/Celeste' } };
  s.settings.data.theme = 'light'; s.settings.data.sgdbKeyEnc = 'SECRETO';
  return s;
}
const exp = s => backup.exportBundle({ playtime: s.playtime.data, custom: s.custom.data, online: s.online.data, settings: s.settings.data }, { customDir: s.customDir, appVersion: '0.3.0', ...H });

module.exports = function register(test) {
  test('exportar e importar conserva horas, personalización, imágenes y datos online', () => {
    const a = tmp(), b = tmp();
    const src = seed(a);
    const { buffer, summary } = exp(src);
    assert.deepStrictEqual([summary.games, summary.customized, summary.images], [2, 2, 1]);
    const dst = new Store(b);
    const bundle = backup.readBundle(buffer, H);
    const st = backup.applyBundle(dst, bundle, { mode: 'replace', settings: true });
    assert.strictEqual(dst.playtime.data.games.hades.seconds, 7200);
    assert.strictEqual(dst.custom.data.items.hades.args, '-windowed');
    assert.strictEqual(dst.custom.data.items.hades.description, 'Mi nota');
    assert.ok(fs.readFileSync(path.join(dst.customDir, dst.custom.data.items.hades.banner)).equals(PNG));
    assert.strictEqual(dst.online.data.wiki.celeste.description, 'Plataformas');
    assert.strictEqual(dst.settings.data.theme, 'light');
    assert.strictEqual(st.images, 1);
    fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true });
  });

  test('la clave de SteamGridDB y las rutas del equipo no viajan en el archivo', () => {
    const a = tmp(); const src = seed(a);
    const raw = zlib.gunzipSync(exp(src).buffer).toString('utf8');
    assert.ok(!raw.includes('SECRETO') && !raw.includes('sgdbKeyEnc'));
    fs.rmSync(a, { recursive: true, force: true });
  });

  test('importar combinando no duplica horas y no pisa horas mayores', () => {
    const a = tmp(), b = tmp();
    const { buffer } = exp(seed(a));
    const dst = new Store(b);
    dst.playtime.data.games = { hades: { seconds: 9000, lastPlayed: 1, sessions: 2 }, otro: { seconds: 60, lastPlayed: 5, sessions: 1 } };
    const bundle = backup.readBundle(buffer, H);
    backup.applyBundle(dst, bundle, { mode: 'merge' });
    backup.applyBundle(dst, backup.readBundle(buffer, H), { mode: 'merge' }); // dos veces
    assert.strictEqual(dst.playtime.data.games.hades.seconds, 9000);
    assert.strictEqual(dst.playtime.data.games.hades.lastPlayed, 1700000000000);
    assert.strictEqual(dst.playtime.data.games.celeste.seconds, 600);
    assert.strictEqual(dst.playtime.data.games.otro.seconds, 60);
    assert.strictEqual(dst.settings.data.theme, 'auto', 'los ajustes no se tocan si no se piden');
    fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true });
  });

  test('reemplazar sustituye lo anterior y combinar no pisa datos online existentes', () => {
    const a = tmp(), b = tmp();
    const { buffer } = exp(seed(a));
    const dst = new Store(b);
    dst.online.data.entries = { hades: { description: 'Local' }, viejo: { description: 'x' } };
    backup.applyBundle(dst, backup.readBundle(buffer, H), { mode: 'merge' });
    assert.strictEqual(dst.online.data.entries.hades.description, 'Local');
    backup.applyBundle(dst, backup.readBundle(buffer, H), { mode: 'replace' });
    assert.strictEqual(dst.online.data.entries.hades.description, 'Roguelike');
    assert.ok(!dst.online.data.entries.viejo);
    fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true });
  });

  test('rechaza archivos dañados, de otra app, manipulados o de otra versión', () => {
    const a = tmp(); const { buffer } = exp(seed(a));
    assert.throws(() => backup.readBundle(Buffer.from('hola mundo, esto no es gzip'), H), /no es una copia|dañado/);
    assert.throws(() => backup.readBundle(zlib.gzipSync(Buffer.from('{"app":"Otra","format":1}')), H), /no es una copia de GameUtil/);
    const doc = JSON.parse(zlib.gunzipSync(buffer).toString());
    const bad = { ...doc, body: doc.body.replace('7200', '9999999') };
    assert.throws(() => backup.readBundle(zlib.gzipSync(Buffer.from(JSON.stringify(bad))), H), /suma de comprobación/);
    assert.throws(() => backup.readBundle(zlib.gzipSync(Buffer.from(JSON.stringify({ ...doc, format: 99 }))), H), /no compatible/);
    assert.throws(() => backup.readBundle(buffer.subarray(0, 40), H), /dañado|no es una copia/);
    fs.rmSync(a, { recursive: true, force: true });
  });

  test('un archivo malicioso se sanea: nombres con ruta, tipos falsos, claves peligrosas, imágenes que no lo son', () => {
    const body = JSON.stringify({
      payload: {
        playtime: { games: { ok: { seconds: 60, lastPlayed: 1, sessions: 1 }, neg: { seconds: -5 }, nan: { seconds: 'x' }, ['__proto__']: { seconds: 5 } } },
        custom: { items: {
          a: { title: 'T'.repeat(500), banner: '../../evil.png', logo: 'fake.png', args: '& calc.exe', type: 'game', category: 'Inventada' },
          b: { banner: 'good.png' }
        } },
        online: { entries: { x: { description: 'ok', evil: { deep: { deeper: { deepest: 1 } } }, fn: null } } },
        settings: { theme: 'rojo', transitions: 'si', splash: false, sgdbKeyEnc: 'robada' }
      },
      images: { 'fake.png': Buffer.from('MZ ejecutable').toString('base64'), 'good.png': PNG.toString('base64') }
    });
    const doc = { app: 'GameUtil', format: 1, createdAt: 'x', appVersion: '9', sha256: crypto.createHash('sha256').update(body).digest('hex'), body };
    const r = backup.readBundle(zlib.gzipSync(Buffer.from(JSON.stringify(doc))), H);
    assert.deepStrictEqual(Object.keys(r.payload.playtime.games), ['ok']);
    const a = r.payload.custom.items.a;
    assert.strictEqual(a.title.length, 120);
    assert.ok(!a.banner && !a.logo && !a.type, 'sin rutas, sin imagen falsa, sin categoría inventada');
    assert.strictEqual(r.payload.custom.items.b.banner, 'good.png');
    assert.deepStrictEqual(Object.keys(r.images), ['good.png']);
    assert.deepStrictEqual(r.payload.settings, { splash: false });
    assert.ok(!JSON.stringify(r.payload.online.entries.x).includes('deepest'), 'sin anidación profunda');
    assert.ok(!JSON.stringify(r.payload).includes('robada'));
  });

  test('copia de seguridad previa: se crea, se puede leer y solo quedan las 5 últimas', () => {
    const a = tmp(); const s = seed(a);
    let last;
    for (let i = 0; i < 7; i++) last = backup.snapshotBefore(s, 1700000000000 + i * 1000);
    const files = fs.readdirSync(path.dirname(last)).filter(f => f.endsWith('.gameutil'));
    assert.strictEqual(files.length, 5);
    const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(last)).toString());
    assert.strictEqual(j.playtime.games.hades.seconds, 7200);
    fs.rmSync(a, { recursive: true, force: true });
  });

  test('una imagen con el mismo nombre y otro contenido no se pisa', () => {
    const a = tmp(), b = tmp();
    const { buffer } = exp(seed(a));
    const dst = new Store(b);
    const other = Buffer.concat([PNG, Buffer.from('distinto')]);
    fs.writeFileSync(path.join(dst.customDir, 'hades-banner-x1.png'), other);
    backup.applyBundle(dst, backup.readBundle(buffer, H), { mode: 'merge' });
    assert.ok(fs.readFileSync(path.join(dst.customDir, 'hades-banner-x1.png')).equals(other), 'el original sigue intacto');
    const name = dst.custom.data.items.hades.banner;
    assert.notStrictEqual(name, 'hades-banner-x1.png');
    assert.ok(fs.readFileSync(path.join(dst.customDir, name)).equals(PNG));
    fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true });
  });
};

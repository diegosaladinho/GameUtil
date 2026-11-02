'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { categorize, applyOverride, applyOnline, isValidCategory, TOOL_CATEGORIES, GAME_GENRES } = require('../src/categorizer');
const scanner = require('../src/scanner');
const { enrich, cleanName } = require('../src/online');
const { toCsv, toJson, csvCell } = require('../src/exporter');
const { Store } = require('../src/store');
const { demoItems } = require('../src/demo');
const { norm, cleanTitle } = require('../src/util');
const { JsonFile, encode, decode } = require('../src/safejson');
const { parseVdf } = require('../src/vdf');
const steam = require('../src/steam');
const images = require('../src/images');
const launch = require('../src/launch');
const { hoursFor, matchRunning, Tracker } = require('../src/playtime');
const { dominantColor } = require('../src/colors');
const { buildEntries } = require('../src/library');
const { resolveArt, artRevs } = require('../src/art');
const { plainText } = require('../src/online');
const { findPage, trimExtract, bigThumb } = require('../src/wiki');
const { needsAutofill } = require('../src/autofill');
const Tour = require('../renderer/tour');
const { migrateUserData } = require('../src/migrate');
const { makeIco } = require('../src/appicon');
const { brand } = require('../scripts/brand');
const { ensureElectron } = require('../scripts/setup');
const { DEFAULT_SETTINGS } = require('../src/store');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('FALLO ' + name + '\n      ' + e.message); process.exitCode = 1; }
}
async function atest(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('FALLO ' + name + '\n      ' + e.message); process.exitCode = 1; }
}

// ------------------------------------------------------------ categorizador ----
const expectCat = (raw, type, category) => {
  const r = categorize(raw);
  assert.strictEqual(r.type, type, `${raw.name}: tipo ${r.type}`);
  if (category) assert.strictEqual(r.category, category, `${raw.name}: categoría ${r.category}`);
  return r;
};

test('launchers van a herramientas', () => {
  expectCat({ name: 'Steam' }, 'tool', 'Launchers de juegos');
  expectCat({ name: 'Epic Games Launcher', publisher: 'Epic Games, Inc.' }, 'tool', 'Launchers de juegos');
  expectCat({ name: 'Battle.net' }, 'tool', 'Launchers de juegos');
  expectCat({ name: 'OriginPro 2023' }, 'tool', 'Sin clasificar'); // no es el launcher Origin
});
test('juegos de Steam/Epic', () => {
  const r = expectCat({ name: 'Cyberpunk 2077', source: 'steam', appId: 1091500 }, 'game');
  assert.strictEqual(r.platform, 'Steam');
  assert.strictEqual(expectCat({ name: 'Fortnite', source: 'epic' }, 'game').platform, 'Epic Games');
});
test('juegos por carpeta, título conocido y editor', () => {
  expectCat({ name: 'Foo', location: 'D:\\Games\\Foo' }, 'game');
  expectCat({ name: 'Minecraft Launcher', publisher: 'Mojang' }, 'game');
  expectCat({ name: 'Algo', publisher: 'Ubisoft Entertainment' }, 'game');
  assert.strictEqual(categorize({ name: 'Algo', publisher: 'Ubisoft Entertainment' }).platform, 'Ubisoft');
});
test('Unreal Engine y herramientas de Epic son desarrollo, no juego', () => {
  expectCat({ name: 'Unreal Engine', publisher: 'Epic Games, Inc.', location: 'C:\\Program Files\\Epic Games\\UE_5.3' }, 'tool', 'Desarrollo');
});
test('categorías de herramientas', () => {
  expectCat({ name: 'Visual Studio Code' }, 'tool', 'Desarrollo');
  expectCat({ name: 'Notepad++' }, 'tool', 'Desarrollo');
  expectCat({ name: 'Python 3.12.1 (64-bit)' }, 'tool', 'Desarrollo');
  expectCat({ name: 'Google Chrome' }, 'tool', 'Navegadores');
  expectCat({ name: 'Mozilla Firefox (x64 es-ES)' }, 'tool', 'Navegadores');
  expectCat({ name: 'Microsoft Edge' }, 'tool', 'Navegadores');
  expectCat({ name: 'Adobe Acrobat' }, 'tool', 'Productividad');
  expectCat({ name: 'Adobe Photoshop 2024' }, 'tool', 'Multimedia y diseño');
  expectCat({ name: 'Discord' }, 'tool', 'Comunicación');
  expectCat({ name: 'Bitwarden' }, 'tool', 'Seguridad y privacidad');
  expectCat({ name: '7-Zip 24.08 (x64)' }, 'tool', 'Sistema y utilidades');
  expectCat({ name: 'Logitech G HUB' }, 'tool', 'Sistema y utilidades');
  expectCat({ name: 'Microsoft Office Professional Plus 2021' }, 'tool', 'Productividad');
});
test('runtimes y controladores', () => {
  expectCat({ name: 'Microsoft Visual C++ 2015-2022 Redistributable (x64) - 14.36' }, 'tool', 'Runtimes y controladores');
  expectCat({ name: 'NVIDIA Graphics Driver 546.33' }, 'tool', 'Runtimes y controladores');
  expectCat({ name: 'Microsoft Edge WebView2 Runtime' }, 'tool', 'Runtimes y controladores');
  expectCat({ name: 'Java 8 Update 361' }, 'tool', 'Runtimes y controladores');
  expectCat({ name: 'Microsoft .NET SDK 8.0' }, 'tool', 'Desarrollo');
});
test('lo desconocido queda sin clasificar con confianza baja', () => {
  const r = expectCat({ name: 'Utilidad Misteriosa 3' }, 'tool', 'Sin clasificar');
  assert.strictEqual(r.confidence, 'baja');
});
test('"Unity of Command" no se confunde con Unity Hub', () => {
  assert.notStrictEqual(categorize({ name: 'Unity of Command II' }).category, 'Desarrollo');
});
test('todas las categorías devueltas son válidas', () => {
  for (const raw of demoItems()) {
    const r = categorize(raw);
    assert.ok(isValidCategory(r.type, r.category), `${raw.name} -> ${r.type}/${r.category}`);
    assert.ok(r.type === 'game' ? r.platform : r.platform === null);
  }
});
test('corrección manual', () => {
  const it = { name: 'X', location: 'D:\\X', ...categorize({ name: 'X', location: 'D:\\X' }) };
  applyOverride(it, { type: 'tool', category: 'Desarrollo' });
  assert.deepStrictEqual([it.type, it.category, it.platform, it.overridden], ['tool', 'Desarrollo', null, true]);
  applyOverride(it, { type: 'game', category: 'RPG' });
  assert.strictEqual(it.type, 'game');
  assert.ok(it.platform);
  assert.ok(isValidCategory('game', 'RPG') && !isValidCategory('game', 'Desarrollo') && !isValidCategory('x', 'RPG'));
});
test('datos de Steam: género principal y software', () => {
  const game = { name: 'Hades', source: 'steam', ...categorize({ name: 'Hades', source: 'steam' }) };
  applyOnline(game, { found: true, isGame: true, exact: true, genres: ['Indie', 'Action', 'RPG'] });
  assert.deepStrictEqual([game.type, game.category, game.confidence], ['game', 'Acción', 'online']);
  assert.deepStrictEqual(game.genres, ['Indie', 'Acción', 'RPG']);

  const blender = { name: 'Blender', source: 'steam', ...categorize({ name: 'Blender', source: 'steam' }) };
  applyOnline(blender, { found: true, isGame: true, exact: true, genres: ['Animation & Modeling', 'Design & Illustration'] });
  assert.deepStrictEqual([blender.type, blender.category, blender.platform], ['tool', 'Multimedia y diseño', null]);

  const unk = { name: 'Raro', ...categorize({ name: 'Raro' }) };
  applyOnline(unk, { found: true, isGame: true, exact: false, genres: ['Strategy'] });
  assert.strictEqual(unk.type, 'tool', 'coincidencia no exacta no mueve a juegos');
  applyOnline(unk, { found: true, isGame: true, exact: true, genres: ['Strategy'] });
  assert.deepStrictEqual([unk.type, unk.category], ['game', 'Estrategia']);

  const chrome = { name: 'Google Chrome', ...categorize({ name: 'Google Chrome' }) };
  applyOnline(chrome, { found: true, isGame: true, exact: true, genres: ['Action'] });
  assert.strictEqual(chrome.category, 'Navegadores', 'una herramienta reconocida no cambia');
});
test('solo género puro Indie/Casual cae a su etiqueta', () => {
  const g = { name: 'G', source: 'steam', ...categorize({ name: 'G', source: 'steam' }) };
  applyOnline(g, { found: true, isGame: true, exact: true, genres: ['Indie', 'Casual'] });
  assert.strictEqual(g.category, 'Casual');
});

// ------------------------------------------------------------------ escáner ----
test('registro: filtra actualizaciones y componentes, deduplica', () => {
  const rows = [
    { DisplayName: 'Git', DisplayVersion: '2.47', Publisher: 'Git Dev', InstallLocation: 'C:\\Program Files\\Git\\', InstallDate: '20240315', EstimatedSize: 300000 },
    { DisplayName: 'Git', DisplayVersion: '' },
    { DisplayName: 'Hotfix for X (KB5001234)' },
    { DisplayName: 'KB5001234' },
    { DisplayName: 'Update for Windows', ReleaseType: 'Update' },
    { DisplayName: 'Interno', SystemComponent: 1 },
    { DisplayName: 'Sub', ParentKeyName: 'Padre' },
    { DisplayName: 'Steam App 730' },
    { DisplayName: 'Cosa', DisplayIcon: 'C:\\Games\\Cosa\\cosa.exe,0', InstallDate: '99999999' }
  ];
  const items = scanner.registryRowsToItems(rows);
  const names = items.map(i => i.name).sort();
  assert.deepStrictEqual(names, ['Cosa', 'Git', 'Steam App 730']);
  const git = items.find(i => i.name === 'Git');
  assert.strictEqual(git.location, 'C:\\Program Files\\Git');
  assert.strictEqual(git.installDate, '2024-03-15');
  assert.strictEqual(git.sizeBytes, 300000 * 1024);
  const cosa = items.find(i => i.name === 'Cosa');
  assert.strictEqual(cosa.location, 'C:\\Games\\Cosa');
  assert.strictEqual(cosa.installDate, null);
});
test('Steam: libraryfolders y appmanifest', () => {
  const vdf = '"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"D:\\\\SteamLibrary"\n\t}\n}';
  assert.deepStrictEqual(scanner.parseLibraryPaths(vdf), ['C:\\Program Files (x86)\\Steam', 'D:\\SteamLibrary']);
  const acf = scanner.parseAcf('"AppState"\n{\n\t"appid"\t\t"1145360"\n\t"name"\t\t"Hades"\n\t"StateFlags"\t\t"4"\n\t"installdir"\t\t"Hades"\n\t"LastUpdated"\t\t"1700000000"\n\t"SizeOnDisk"\t\t"16000000000"\n}');
  const it = scanner.acfToItem(acf, 'D:\\SteamLibrary');
  assert.strictEqual(it.name, 'Hades');
  assert.strictEqual(it.appId, 1145360);
  assert.strictEqual(it.sizeBytes, 16000000000);
  assert.strictEqual(it.installDate, '2023-11-14');
  assert.strictEqual(scanner.acfToItem({ appid: '228980', name: 'Steamworks Common Redistributables' }, 'C:'), null);
  assert.strictEqual(scanner.acfToItem({ appid: '1', name: 'Medio instalado', StateFlags: '1026' }, 'C:'), null);
});
test('Epic: manifiestos, DLC e instalaciones incompletas', () => {
  const ok = scanner.epicManifestToItem({ DisplayName: 'Fortnite', AppName: 'Fortnite', MainGameAppName: 'Fortnite', InstallLocation: 'D:\\Epic Games\\Fortnite', InstallSize: 123 }, 'no-existe.item');
  assert.strictEqual(ok.name, 'Fortnite');
  assert.strictEqual(ok.sizeBytes, 123);
  assert.strictEqual(scanner.epicManifestToItem({ DisplayName: 'DLC', AppName: 'a', MainGameAppName: 'b' }, 'x'), null);
  assert.strictEqual(scanner.epicManifestToItem({ DisplayName: 'Roto', bIsIncompleteInstall: true }, 'x'), null);
});
test('mezcla: el registro no duplica lo de Steam/Epic', () => {
  const registry = scanner.registryRowsToItems([
    { DisplayName: 'Steam App 1145360' },
    { DisplayName: 'Hades' },
    { DisplayName: 'Otro', InstallLocation: 'D:\\SteamLibrary\\steamapps\\common\\Hades' },
    { DisplayName: 'Git' }
  ]);
  const steam = [{ name: 'Hades', location: 'D:\\SteamLibrary\\steamapps\\common\\Hades', source: 'steam' }];
  const merged = scanner.mergeSources(registry, steam).map(i => i.name).sort();
  assert.deepStrictEqual(merged, ['Git', 'Hades']);
});

// ----------------------------------------------------------------- online ----
(async () => {
  await atest('online: limpieza de nombre', () => {
    assert.strictEqual(cleanName('Hades (64-bit) 1.2.3™'), 'Hades');
  });
  await atest('online: busca por nombre y lee géneros, descripción y estudios (fetch simulado)', async () => {
    const calls = [];
    const fakeFetch = async url => {
      calls.push(url);
      const lang = /l=spanish/.test(url) ? 'es' : 'en';
      const body = url.includes('storesearch')
        ? { items: [{ id: 111, name: 'Otro juego' }, { id: 1145360, name: 'Hades' }] }
        : { 1145360: { success: true, data: {
            type: 'game', genres: [{ description: 'Action' }, { description: 'Indie' }],
            developers: ['Supergiant Games'], publishers: ['Supergiant Games'],
            short_description: lang === 'es' ? 'Desafía al dios de la muerte &amp; escapa.<br>Fin' : 'Defy the god of the dead.' } } };
      return { ok: true, status: 200, json: async () => body };
    };
    const r = await enrich({ name: 'Hades' }, { fetchImpl: fakeFetch });
    assert.deepStrictEqual([r.found, r.appId, r.exact, r.isGame, r.v], [true, 1145360, true, true, 2]);
    assert.deepStrictEqual(r.genres, ['Action', 'Indie'], 'géneros en inglés');
    assert.deepStrictEqual([r.developers, r.publishers], [['Supergiant Games'], ['Supergiant Games']]);
    assert.strictEqual(r.description, 'Desafía al dios de la muerte & escapa.\nFin', 'descripción en español y sin HTML');
    assert.strictEqual(calls.length, 3);
    const miss = await enrich({ name: 'Nada que ver' }, { fetchImpl: fakeFetch });
    assert.strictEqual(miss.found, false);
  });
  await atest('online: con appId no busca; 429 lanza RATE_LIMIT', async () => {
    let n = 0;
    const f1 = async () => { n++; return { ok: true, status: 200, json: async () => ({ 730: { success: true, data: { type: 'game', genres: [] } } }) }; };
    const r = await enrich({ name: 'CS2', appId: 730 }, { fetchImpl: f1 });
    assert.deepStrictEqual([n, r.found], [2, true]);
    const f2 = async () => ({ ok: false, status: 429, json: async () => ({}) });
    await assert.rejects(enrich({ name: 'X', appId: 1 }, { fetchImpl: f2 }), e => e.code === 'RATE_LIMIT');
  });
  test('online: texto plano', () => {
    assert.strictEqual(plainText('<b>Hola</b> &quot;mundo&quot; &lt;3'), 'Hola "mundo" <3');
  });

  // --------------------------------------------------------------- exportar ----
  test('CSV: separador ;, BOM, comillas y protección de fórmulas', () => {
    assert.strictEqual(csvCell('=SUMA(A1)'), "'=SUMA(A1)");
    assert.strictEqual(csvCell('a;b'), '"a;b"');
    assert.strictEqual(csvCell('di "hola"'), '"di ""hola"""');
    const csv = toCsv('tool', [{ name: 'A;B', publisher: 'P', category: 'Desarrollo', version: '1', sizeBytes: 5 * 1024 * 1024, installDate: '2026-01-02', location: 'C:\\A' }]);
    assert.ok(csv.startsWith('\uFEFFNombre;Editor;Categoría;Versión;Tamaño (MB);Fecha de instalación;Ubicación\r\n'));
    assert.ok(csv.includes('"A;B";P;Desarrollo;1;5,0;2026-01-02;C:\\A'));
    const g = toCsv('game', demoItems().slice(0, 2).map(r => ({ ...r, ...categorize(r) })));
    assert.ok(g.split('\r\n')[0].startsWith('\uFEFFNombre;Plataforma;Género'));
  });
  test('JSON válido y solo con campos esperados', () => {
    const rows = JSON.parse(toJson('game', [{ name: 'G', platform: 'Steam', category: 'RPG', genres: ['RPG'], sizeBytes: 10, installDate: null, location: 'C:', secreto: 'x' }]));
    assert.deepStrictEqual(Object.keys(rows[0]), ['nombre', 'plataforma', 'genero', 'generos', 'tamanoBytes', 'fechaInstalacion', 'ubicacion']);
    assert.throws(() => toJson('otro', []));
  });

  // ---------------------------------------------------------------- almacén ----
  // ------------------------------------------------------- guardado seguro ----
  const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'inv-'));
  test('guardado seguro: suma de comprobación, copias y recuperación', () => {
    const dir = tmpDir();
    const mk = () => new JsonFile({ dir, name: 'playtime', defaults: { games: {} }, backupDir: path.join(dir, 'backups'), minBackupAgeMs: 0 });
    const f = mk();
    f.data.games.hades = { seconds: 3600 };
    f.save();
    f.data.games.hades.seconds = 7200;
    f.save(); // la primera versión pasa a copia
    assert.strictEqual(decode(fs.readFileSync(f.file, 'utf8')).games.hades.seconds, 7200);
    assert.ok(fs.existsSync(path.join(dir, 'backups', 'playtime.1.json')));
    // se corrompe el archivo principal (alguien lo edita a mano): se recupera de la copia
    fs.writeFileSync(f.file, fs.readFileSync(f.file, 'utf8').replace('7200', '9999'));
    const g = mk();
    assert.strictEqual(g.status.source, 'backup');
    assert.strictEqual(g.status.corrupted, true);
    assert.strictEqual(g.data.games.hades.seconds, 3600);
    assert.ok(fs.readdirSync(dir).some(n => n.includes('.corrupt-')), 'el archivo dañado se conserva aparte');
    // sin archivo ni copias: valores por defecto
    const h = new JsonFile({ dir: tmpDir(), name: 'x', defaults: { a: 1 } });
    assert.deepStrictEqual([h.data.a, h.status.source], [1, 'none']);
    assert.throws(() => decode('{"format":9,"data":{}}'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  test('almacén: carpetas, ajustes por defecto, lista de archivos y migración', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'inventario.json'), JSON.stringify({
      overrides: { 'mi app': { type: 'game', category: 'RPG' } },
      online: { hades: { found: true } },
      lastScan: { at: '2026-11-01T10:00:00Z', demo: false, items: [{ name: 'Mi App' }] }
    }));
    const s = new Store(dir);
    assert.deepStrictEqual(s.custom.data.items['mi app'], { type: 'game', category: 'RPG' });
    assert.strictEqual(s.library.data.items.length, 1);
    assert.strictEqual(s.settings.data.transitions, true);
    assert.ok(fs.existsSync(path.join(dir, 'inventario.json.migrado')));
    const ids = s.files().map(f => f.id);
    assert.deepStrictEqual(ids, ['library', 'playtime', 'custom', 'online', 'settings', 'images', 'backups', 'root']);
    s.saveAll();
    assert.ok(fs.existsSync(path.join(dir, 'playtime.json')));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // --------------------------------------------------------------- Steam ----
  test('VDF: bloques anidados, escapes y claves sin distinguir mayúsculas', () => {
    const v = parseVdf('"UserLocalConfigStore"\n{\n "Software"\n {\n  "Valve" { "Steam" { "apps" {\n   "1145360" { "LastPlayed" "1700000000" "Playtime" "930" }\n   "730" { "playtime" "60" }\n  } } }\n }\n}\n// comentario\n');
    const map = steam.parsePlaytime('"UserLocalConfigStore" { "Software" { "Valve" { "Steam" { "apps" { "1145360" { "LastPlayed" "1700000000" "Playtime" "930" } "730" { "Playtime" "60" } "5" { } } } } } }');
    assert.strictEqual(v.UserLocalConfigStore.Software.Valve.Steam.apps['1145360'].Playtime, '930');
    assert.deepStrictEqual(map.get('1145360'), { minutes: 930, lastPlayed: 1700000000 });
    assert.deepStrictEqual(map.get('730'), { minutes: 60, lastPlayed: null });
    assert.strictEqual(map.has('5'), false);
    assert.strictEqual(parseVdf('"a" "x\\"y\\\\n"').a, 'x"y\\n');
  });
  test('Steam: arte local en caché (plano y por carpeta)', () => {
    const root = tmpDir();
    const lc = path.join(root, 'appcache', 'librarycache');
    fs.mkdirSync(path.join(lc, '1145360', 'abc'), { recursive: true });
    fs.writeFileSync(path.join(lc, '1145360_library_hero.jpg'), 'x');
    fs.writeFileSync(path.join(lc, '1145360_icon.jpg'), 'x');
    fs.writeFileSync(path.join(lc, '1145360', 'abc', 'logo.png'), 'x');
    const a = steam.findSteamArt(root, 1145360);
    assert.ok(a.hero.endsWith('1145360_library_hero.jpg') && a.icon.endsWith('1145360_icon.jpg') && a.logo.endsWith('logo.png'));
    assert.deepStrictEqual(steam.findSteamArt(root, '../x'), {}, 'appId no numérico se ignora');
    fs.rmSync(root, { recursive: true, force: true });
  });

  // ------------------------------------------------------------ imágenes ----
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400, 1)]);
  const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 2)]);
  test('imágenes: servidores permitidos y comprobación de contenido', () => {
    assert.ok(images.hostAllowed('https://cdn.akamai.steamstatic.com/steam/apps/1/library_hero.jpg'));
    assert.ok(images.hostAllowed('https://cdn2.steamgriddb.com/hero/x.png'));
    assert.ok(!images.hostAllowed('http://cdn.akamai.steamstatic.com/x.jpg'), 'solo https');
    assert.ok(!images.hostAllowed('https://evil.com/cdn.akamai.steamstatic.com'));
    assert.ok(!images.hostAllowed('https://steamgriddb.com.evil.com/x.png'));
    assert.strictEqual(images.sniffExt(PNG), '.png');
    assert.strictEqual(images.sniffExt(JPG), '.jpg');
    assert.strictEqual(images.sniffExt(Buffer.from('<svg onload=alert(1)>')), null, 'SVG y texto no valen');
  });
  test('imágenes: importar valida contenido, no extensión', () => {
    const d = tmpDir();
    const ok = path.join(d, 'foto.txt'); fs.writeFileSync(ok, PNG);
    const bad = path.join(d, 'falsa.png'); fs.writeFileSync(bad, 'esto no es una imagen');
    const out = path.join(d, 'custom');
    assert.strictEqual(images.importImage(ok, out, 'abc-banner'), 'abc-banner.png');
    assert.throws(() => images.importImage(bad, out, 'x'), /no es una imagen/);
    assert.throws(() => images.importImage(d, out, 'x'), /No es un archivo/);
    fs.rmSync(d, { recursive: true, force: true });
  });
  await atest('imágenes: descarga solo con tipo y contenido válidos', async () => {
    const d = tmpDir();
    const resp = (status, type, buf, url) => ({ ok: status < 400, status, url, headers: { get: () => type }, arrayBuffer: async () => buf });
    const u = 'https://cdn.akamai.steamstatic.com/steam/apps/1/header.jpg';
    const f = await images.downloadImage(u, d, 'a-banner', { fetchImpl: async () => resp(200, 'image/jpeg', JPG, u) });
    assert.ok(f.endsWith('a-banner.jpg') && fs.existsSync(f));
    assert.strictEqual(await images.downloadImage(u, d, 'b', { fetchImpl: async () => resp(404, '', Buffer.alloc(0), u) }), null);
    assert.strictEqual(await images.downloadImage(u, d, 'c', { fetchImpl: async () => resp(200, 'text/html', JPG, u) }), null);
    assert.strictEqual(await images.downloadImage(u, d, 'e', { fetchImpl: async () => resp(200, 'image/png', Buffer.from('nope'.repeat(100)), u) }), null);
    await assert.rejects(images.downloadImage('https://evil.com/x.png', d, 'f', { fetchImpl: async () => resp(200, 'image/png', PNG) }), /no permitido/);
    await assert.rejects(images.downloadImage(u, d, 'g', { fetchImpl: async () => resp(200, 'image/png', PNG, 'https://evil.com/x.png') }), /Redirección/);
    // al cambiar de formato no queda la versión anterior
    await images.downloadImage(u, d, 'a-banner', { fetchImpl: async () => resp(200, 'image/png', PNG, u) });
    assert.deepStrictEqual(fs.readdirSync(d).filter(n => n.startsWith('a-banner')), ['a-banner.png']);
    fs.rmSync(d, { recursive: true, force: true });
  });
  test('arte: prioridad propia > descargada > Steam; nombres con rutas se ignoran', () => {
    const root = tmpDir();
    const dirs = { customDir: path.join(root, 'c'), cacheDir: path.join(root, 'k'), iconsDir: path.join(root, 'i'), steamRoot: null };
    for (const d of [dirs.customDir, dirs.cacheDir, dirs.iconsDir]) fs.mkdirSync(d, { recursive: true });
    const entry = { key: 'hades', artAppId: null };
    const id = images.fileId('hades');
    assert.deepStrictEqual(artRevs(resolveArt(entry, { ...dirs, custom: {} })), { banner: null, logo: null, icon: null, cover: null, thumb: null });
    fs.writeFileSync(path.join(dirs.cacheDir, `${id}-banner.jpg`), JPG);
    fs.writeFileSync(path.join(dirs.iconsDir, `${id}.png`), PNG);
    let a = resolveArt(entry, { ...dirs, custom: {} });
    assert.ok(a.banner.file.endsWith('-banner.jpg') && a.thumb.file.endsWith(`${id}.png`));
    fs.writeFileSync(path.join(dirs.customDir, 'mio.png'), PNG);
    a = resolveArt(entry, { ...dirs, custom: { banner: 'mio.png' } });
    assert.ok(a.banner.file.endsWith('mio.png'), 'la imagen propia gana');
    a = resolveArt(entry, { ...dirs, custom: { banner: '..\\..\\secreto.png' } });
    assert.ok(a.banner.file.endsWith('-banner.jpg'), 'un nombre con ruta no sale de la carpeta');
    fs.rmSync(root, { recursive: true, force: true });
  });
  test('color de acento: prefiere tonos vivos y evita el gris', () => {
    const px = (r, g, b) => [b, g, r, 255];
    const buf = Buffer.from([...px(200, 30, 30), ...px(200, 30, 30), ...px(90, 90, 90), ...px(10, 10, 10)].flat());
    const c = dominantColor(buf, 'bgra');
    const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    assert.ok(r > 150 && g < 80 && b < 80, c);
    assert.strictEqual(dominantColor(Buffer.alloc(8, 0)), null);
  });

  // ------------------------------------------------------------ lanzamiento ----
  test('argumentos: separación con comillas y validación', () => {
    assert.deepStrictEqual(launch.splitArgs('-windowed -w 1920 "C:\\mi carpeta\\x" ""'), ['-windowed', '-w', '1920', 'C:\\mi carpeta\\x', '']);
    assert.deepStrictEqual(launch.splitArgs('   '), []);
    assert.strictEqual(launch.validateArgs('  -novid  '), '-novid');
    assert.throws(() => launch.validateArgs('a\nb'));
    assert.throws(() => launch.validateArgs('x'.repeat(1001)));
  });
  test('lanzamiento: Steam y Epic por protocolo, el resto por ejecutable', () => {
    assert.deepStrictEqual(launch.planLaunch({ source: 'steam', appId: 1145360 }, null, ''), { kind: 'url', url: 'steam://rungameid/1145360' });
    assert.strictEqual(launch.planLaunch({ source: 'steam', appId: 730 }, null, '-novid -console').url, 'steam://run/730//-novid%20-console/');
    assert.ok(launch.planLaunch({ source: 'epic', id: 'epic:Sugar' }, 'C:\\E\\f.exe', '').url.startsWith('com.epicgames.launcher://apps/Sugar'));
    assert.strictEqual(launch.planLaunch({ source: 'epic', id: 'epic:Sugar' }, 'C:\\E\\f.exe', '-a').kind, 'exe', 'con argumentos, Epic lanza el ejecutable');
    assert.strictEqual(launch.planLaunch({ source: 'epic', id: 'epic:a&calc' }, null, ''), null, 'identificador raro rechazado');
    const p = launch.planLaunch({ source: 'registry' }, 'C:\\Apps\\x\\x.exe', '-a "b c"');
    assert.deepStrictEqual([p.kind, p.file, p.args, p.cwd], ['exe', 'C:\\Apps\\x\\x.exe', ['-a', 'b c'], 'C:\\Apps\\x'.replace(/\\/g, path.sep === '/' ? '\\' : path.sep)].map((v, i) => (i === 3 ? p.cwd : v)));
    assert.strictEqual(launch.planLaunch({ source: 'registry' }, null, ''), null);
  });
  test('ejecutable principal: ignora desinstaladores y elige el más parecido', () => {
    const d = tmpDir();
    fs.mkdirSync(path.join(d, 'bin'));
    fs.writeFileSync(path.join(d, 'unins000.exe'), Buffer.alloc(9000));
    fs.writeFileSync(path.join(d, 'CrashHandler.exe'), Buffer.alloc(9000));
    fs.writeFileSync(path.join(d, 'Launcher.exe'), Buffer.alloc(5000));
    fs.writeFileSync(path.join(d, 'bin', 'Hades.exe'), Buffer.alloc(100));
    assert.ok(launch.findMainExe(d, 'Hades').endsWith('Hades.exe'));
    assert.ok(launch.findMainExe(d, 'Otro').endsWith('Launcher.exe'), 'sin coincidencia por nombre gana el más grande permitido');
    assert.strictEqual(launch.findMainExe(path.join(d, 'no-existe'), 'x'), null);
    fs.rmSync(d, { recursive: true, force: true });
  });
  test('desinstalar: comando MSI y clave de registro válida', () => {
    assert.strictEqual(launch.uninstallCommand({ UninstallString: 'MsiExec.exe /I{12345678-1234-1234-1234-123456789ABC}' }), 'msiexec.exe /x {12345678-1234-1234-1234-123456789ABC}');
    assert.strictEqual(launch.uninstallCommand({ UninstallString: '"C:\\A\\unins000.exe" /SILENT' }), '"C:\\A\\unins000.exe" /SILENT');
    assert.strictEqual(launch.uninstallCommand({}), null);
    const ok = 'Microsoft.PowerShell.Core\\Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{ABC}';
    assert.ok(launch.validUninstallKey(ok));
    assert.ok(!launch.validUninstallKey(ok + "'; calc; '"), 'no admite comillas');
    assert.ok(!launch.validUninstallKey('Microsoft.PowerShell.Core\\Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Otra\\Clave'));
  });

  // ------------------------------------------------------- horas y seguimiento ----
  test('horas: Steam y medidas propias se toman por máximo, nunca se suman', () => {
    const steamMap = new Map([['1145360', { minutes: 600, lastPlayed: 1700000000 }]]);
    const g = { source: 'steam', appId: 1145360 };
    let h = hoursFor(g, { seconds: 3000, lastPlayed: 1800000000000 }, steamMap);
    assert.deepStrictEqual([h.minutes, h.source], [600, 'steam']);
    assert.strictEqual(h.lastPlayed, new Date(1800000000000).toISOString(), 'gana la fecha más reciente');
    h = hoursFor(g, { seconds: 60 * 700 }, steamMap);
    assert.deepStrictEqual([h.minutes, h.source], [700, 'launcher']);
    h = hoursFor({ source: 'registry' }, { seconds: 150, lastPlayed: 0 }, steamMap);
    assert.deepStrictEqual([h.minutes, h.source, h.lastPlayed], [2, 'launcher', null]);
    assert.deepStrictEqual(hoursFor({ source: 'registry' }, undefined, steamMap), { minutes: 0, source: null, lastPlayed: null });
  });
  test('seguimiento: coincidencia por carpeta, sin falsos positivos', () => {
    const targets = [
      { key: 'hades', location: 'D:\\SteamLibrary\\steamapps\\common\\Hades' },
      { key: 'hades 2', location: 'D:\\SteamLibrary\\steamapps\\common\\Hades II' },
      { key: 'office', location: 'C:\\Program Files' },
      { key: 'vacio', location: '' }
    ];
    const run = matchRunning([
      'd:\\steamlibrary\\steamapps\\common\\hades\\x64\\Hades.exe',
      'C:\\Program Files\\Algo\\algo.exe',
      'D:\\SteamLibrary\\steamapps\\common\\Hades IIextra\\x.exe'
    ], targets);
    assert.deepStrictEqual([...run], ['hades']);
  });
  await atest('seguimiento: acumula tiempo, cuenta sesiones y limita saltos grandes', async () => {
    const dir = tmpDir();
    const file = new JsonFile({ dir, name: 'playtime', defaults: { games: {} } });
    let t = 1_000_000, procs = [];
    const changes = [];
    const tr = new Tracker({
      file, intervalMs: 30000, now: () => t,
      getTargets: () => [{ key: 'hades', location: 'D:\\Lib\\steamapps\\common\\Hades' }],
      listPaths: async () => procs,
      onChange: (run, c) => changes.push([[...run], c])
    });
    await tr.tick();                                   // nada en marcha
    assert.deepStrictEqual(file.data.games, {});
    procs = ['D:\\Lib\\steamapps\\common\\Hades\\Hades.exe'];
    t += 30000; await tr.tick();                       // arranca: sesión 1, aún 30 s desde el tick anterior
    t += 30000; await tr.tick();
    t += 30000; await tr.tick();
    assert.deepStrictEqual([file.data.games.hades.seconds, file.data.games.hades.sessions], [90, 1]);
    t += 3_600_000; await tr.tick();                   // el equipo estuvo suspendido: solo cuenta hasta 2 intervalos
    assert.strictEqual(file.data.games.hades.seconds, 150);
    procs = [];
    t += 30000; await tr.tick();                       // cierra
    procs = ['D:\\Lib\\steamapps\\common\\Hades\\Hades.exe'];
    t += 30000; await tr.tick();                       // nueva sesión
    assert.strictEqual(file.data.games.hades.sessions, 2);
    assert.ok(changes.some(([r, c]) => c && r.length === 0), 'se avisa al cerrar');
    tr.stop();
    assert.strictEqual(decode(fs.readFileSync(file.file, 'utf8')).games.hades.sessions, 2, 'stop() guarda en disco');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // ------------------------------------------------------------- biblioteca ----
  test('biblioteca: título, estudio, descripción, horas y personalización', () => {
    const raws = [
      { name: 'Hades', source: 'steam', appId: 1145360, location: 'D:\\L\\steamapps\\common\\Hades', installDate: '2026-03-02', sizeBytes: 5 },
      { name: '7-Zip 24.08 (x64)', publisher: 'Igor Pavlov', source: 'registry', regKey: 'k' },
      { name: 'hades', source: 'registry' }
    ];
    const online = { hades: { found: true, isGame: true, exact: true, appId: 1145360, genres: ['Action', 'Indie'], developers: ['Supergiant Games'], publishers: ['Supergiant Games'], description: 'Desafía a la muerte.' } };
    const e = buildEntries(raws, { custom: {}, online, playtime: { games: {} }, steamMap: new Map([['1145360', { minutes: 930, lastPlayed: 1700000000 }]]), running: new Set(['hades']) });
    assert.strictEqual(e.length, 2, 'los duplicados por nombre se descartan');
    const h = e.find(x => x.key === 'hades'), z = e.find(x => x.type === 'tool');
    assert.deepStrictEqual([h.type, h.category, h.developer, h.editor, h.description, h.hours.minutes, h.running, h.artAppId], ['game', 'Acción', 'Supergiant Games', 'Supergiant Games', 'Desafía a la muerte.', 930, true, 1145360]);
    assert.deepStrictEqual([z.title, z.developer, z.editor, z.description, z.hours.minutes, z.canUninstall], ['7-Zip', 'Igor Pavlov', 'Igor Pavlov', '', 0, true]);
    const c = buildEntries(raws.slice(0, 1), {
      custom: { hades: { title: 'Mi Hades', description: '', args: '-windowed', banner: 'x.png' } },
      online, playtime: { games: {} }, steamMap: new Map()
    })[0];
    assert.deepStrictEqual([c.title, c.description, c.args, c.custom], ['Mi Hades', '', '-windowed', { title: true, description: true, banner: true, logo: false }]);
    const m = buildEntries(raws.slice(0, 1), { custom: { hades: { type: 'tool', category: 'Desarrollo' } }, online, playtime: { games: {} }, steamMap: new Map() })[0];
    assert.deepStrictEqual([m.type, m.hours.minutes], ['tool', 0], 'una app movida a software no muestra horas');
  });
  test('título para mostrar: quita arquitectura y versión', () => {
    assert.strictEqual(cleanTitle('7-Zip 24.08 (x64)'), '7-Zip');
    assert.strictEqual(cleanTitle('Mozilla Firefox (x64 es-ES)'), 'Mozilla Firefox');
    assert.strictEqual(cleanTitle('Python 3.12.1 (64-bit)'), 'Python');
    assert.strictEqual(cleanTitle('Cyberpunk 2077'), 'Cyberpunk 2077');
    assert.strictEqual(cleanTitle('1.2.3'), '1.2.3');
  });

  // ------------------------------------------------------- relleno automático ----
  const wikiFetch = pages => async url => {
    const m = /\/\/(\w+)\.wikipedia\.org\/api\/rest_v1\/page\/summary\/([^?]+)/.exec(url);
    const key = m ? `${m[1]}:${decodeURIComponent(m[2])}` : '';
    const body = pages[key];
    if (key === 'xx:limit') return { ok: false, status: 429, json: async () => ({}) };
    return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
  };
  await atest('wikipedia: acepta solo el título exacto y del tipo correcto', async () => {
    const pages = {
      'en:Hades_(video_game)': { type: 'standard', title: 'Hades (video game)', description: '2020 video game', extract: 'Hades is a roguelike dungeon crawler video game developed by Supergiant Games. '.repeat(3), thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/cc/Hades_cover_art.jpg/320px-Hades_cover_art.jpg' } },
      'en:Hades': { type: 'disambiguation', title: 'Hades', extract: 'Hades may refer to:' },
      'en:Firefox': { type: 'standard', title: 'Firefox', description: 'Web browser', extract: 'Mozilla Firefox is a free and open-source web browser.', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Firefox_logo.svg/200px-Firefox_logo.svg.png' } },
      'en:Celeste': { type: 'standard', title: 'Celeste', description: 'Genus of moth', extract: 'Celeste is a genus of moths.' }
    };
    const f = wikiFetch(pages);
    const g = await findPage('Hades', 'game', { fetchImpl: f, langs: ['es', 'en'] });
    assert.deepStrictEqual([g.found, g.title, g.lang], [true, 'Hades (video game)', 'en']);
    assert.ok(g.imageUrl.endsWith('/640px-Hades_cover_art.jpg'), 'pide una miniatura mayor: ' + g.imageUrl);
    assert.ok(g.description.length <= 700 && g.description.startsWith('Hades is'));
    const t = await findPage('Firefox', 'tool', { fetchImpl: f, langs: ['en'] });
    assert.ok(t.found && t.imageUrl.includes('/640px-Firefox_logo.svg.png'));
    assert.strictEqual((await findPage('Firefox', 'game', { fetchImpl: f, langs: ['en'] })).found, false, 'una herramienta no vale como juego');
    assert.strictEqual((await findPage('Celeste', 'game', { fetchImpl: f, langs: ['en'] })).found, false, 'una página que no es un videojuego se descarta');
    assert.strictEqual((await findPage('Nada', 'game', { fetchImpl: f, langs: ['en'] })).found, false);
    assert.strictEqual((await findPage('Hades Extra', 'game', { fetchImpl: f, langs: ['en'] })).found, false, 'el nombre debe coincidir exacto');
    await assert.rejects(findPage('Firefox', 'tool', { fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }), langs: ['en'] }), e => e.code === 'RATE_LIMIT');
    assert.strictEqual((await findPage('x', 'tool', { fetchImpl: async () => { throw new Error('no debe consultar'); } })).found, false, 'nombres de una letra no se buscan');
  });
  test('wikipedia: recorte de texto y miniatura', () => {
    assert.strictEqual(trimExtract('Corto.'), 'Corto.');
    const long = ('Frase de relleno número uno. ').repeat(40);
    const out = trimExtract(long, 300);
    assert.ok(out.length <= 300 && out.endsWith('.'), out.slice(-20));
    assert.strictEqual(bigThumb('https://upload.wikimedia.org/a/thumb/x/y.png/250px-y.png', 600), 'https://upload.wikimedia.org/a/thumb/x/y.png/600px-y.png');
    assert.strictEqual(bigThumb('https://upload.wikimedia.org/a/b/original.png'), 'https://upload.wikimedia.org/a/b/original.png');
    assert.ok(images.hostAllowed('https://upload.wikimedia.org/wikipedia/en/a/ab/X.png'));
  });
  test('relleno automático: solo lo que no tiene nada y no se intentó hace poco', () => {
    const base = { key: 'k', type: 'game', category: 'Sin género', art: { banner: null, logo: null, cover: null }, description: '', custom: {} };
    const now = Date.parse('2026-11-02T00:00:00Z');
    assert.strictEqual(needsAutofill(base, {}, now), true);
    assert.strictEqual(needsAutofill({ ...base, description: 'Algo' }, {}, now), false);
    assert.strictEqual(needsAutofill({ ...base, art: { banner: 1, logo: null, cover: null } }, {}, now), false);
    assert.strictEqual(needsAutofill({ ...base, art: { banner: null, logo: null, cover: 1 } }, {}, now), false);
    assert.strictEqual(needsAutofill({ ...base, custom: { banner: true } }, {}, now), false, 'lo personalizado no se toca');
    assert.strictEqual(needsAutofill({ ...base, type: 'tool', category: 'Runtimes y controladores' }, {}, now), false);
    assert.strictEqual(needsAutofill(base, { k: { checkedAt: '2026-10-25T00:00:00Z' } }, now), false, 'intento reciente');
    assert.strictEqual(needsAutofill(base, { k: { checkedAt: '2026-10-01T00:00:00Z' } }, now), true, 'intento antiguo: se reintenta');
  });
  test('biblioteca: la descripción de Wikipedia se usa si Steam no tiene y se indica la fuente', () => {
    const raws = [{ name: 'Mozilla Firefox (x64 es-ES)', publisher: 'Mozilla', source: 'registry' }];
    const wiki = { 'mozilla firefox x64 es es': { found: true, description: 'Firefox es un navegador web.' } };
    const e = buildEntries(raws, { custom: {}, online: {}, wiki, playtime: { games: {} }, steamMap: new Map() })[0];
    assert.deepStrictEqual([e.description, e.descSource], ['Firefox es un navegador web.', 'Wikipedia']);
    const c = buildEntries(raws, { custom: { [e.key]: { description: 'Mía' } }, online: {}, wiki, playtime: { games: {} }, steamMap: new Map() })[0];
    assert.deepStrictEqual([c.description, c.descSource], ['Mía', null]);
  });

  // ------------------------------------------------------------- GameUtil ----
  test('tutorial: unión y colocación de la tarjeta', () => {
    const vp = { w: 1320, h: 820 }, card = { w: 360, h: 230 };
    assert.deepStrictEqual(Tour.unionRect([{ x: 10, y: 20, w: 100, h: 50 }, { x: 60, y: 10, w: 100, h: 100 }]), { x: 10, y: 10, w: 150, h: 100 });
    assert.strictEqual(Tour.unionRect([]), null);
    assert.deepStrictEqual(Tour.placeCard(null, card, vp), { x: 480, y: 295, side: 'center' });
    // un botón de la barra lateral: la tarjeta va a su derecha y centrada en vertical
    const btn = { x: 14, y: 768, w: 120, h: 40 };
    const r = Tour.placeCard(btn, card, vp);
    assert.strictEqual(r.side, 'right');
    assert.ok(r.x >= btn.x + btn.w && r.y + card.h <= vp.h - 16, JSON.stringify(r));
    // una zona ancha en la parte baja: va arriba
    const wide = { x: 390, y: 520, w: 900, h: 260 };
    assert.strictEqual(Tour.placeCard(wide, card, vp).side, 'top');
    // nunca se sale de la ventana
    for (const rect of [{ x: 0, y: 0, w: 20, h: 20 }, { x: 1300, y: 800, w: 20, h: 20 }, { x: 600, y: 400, w: 700, h: 400 }, { x: 0, y: 0, w: 1320, h: 820 }]) {
      const p = Tour.placeCard(rect, card, vp);
      assert.ok(p.x >= 16 && p.y >= 16 && p.x + card.w <= vp.w - 16 && p.y + card.h <= vp.h - 16, JSON.stringify([rect, p]));
    }
    // ventana pequeña: elige el lado con más espacio y se mantiene dentro
    const small = Tour.placeCard({ x: 20, y: 20, w: 300, h: 200 }, card, { w: 420, h: 300 });
    assert.ok(small.x >= 16 && small.x + card.w <= 404);
    assert.deepStrictEqual(Tour.padRect({ x: 2, y: 2, w: 50, h: 50 }, 8, vp), { x: 0, y: 0, w: 60, h: 60 });
  });
  test('tutorial: pasos completos y sin duplicados', () => {
    const ids = Tour.STEPS.map(s => s.id);
    assert.strictEqual(new Set(ids).size, ids.length);
    assert.strictEqual(ids[0], 'welcome');
    assert.ok(Tour.STEPS[Tour.STEPS.length - 1].last);
    for (const s of Tour.STEPS) {
      assert.ok(s.title && s.body, s.id);
      if (s.target) { assert.ok(Array.isArray(s.target) && s.target.every(t => typeof t === 'string'), s.id); }
    }
    for (const must of ['tabs', 'library', 'scan', 'online', 'cover', 'actions', 'settings']) assert.ok(ids.includes(must), must);
    // las zonas que no existen con la biblioteca vacía explican qué verás cuando haya elementos
    for (const id of ['cover', 'actions']) assert.ok(Tour.STEPS.find(s => s.id === id).empty);
  });
  test('migración: copia sin tocar lo anterior y no pisa datos nuevos', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gu-'));
    const oldD = path.join(base, 'inventario-software'), newD = path.join(base, 'GameUtil');
    assert.deepStrictEqual(migrateUserData(oldD, newD), { migrated: false }, 'sin carpeta anterior');
    fs.mkdirSync(path.join(oldD, 'data', 'images'), { recursive: true });
    fs.writeFileSync(path.join(oldD, 'data', 'playtime.json'), '{"horas":1}');
    fs.writeFileSync(path.join(oldD, 'data', 'images', 'a.png'), 'x');
    fs.writeFileSync(path.join(oldD, 'Cookies'), 'no se copia');
    const r = migrateUserData(oldD, newD);
    assert.deepStrictEqual([r.migrated, r.items], [true, ['data']]);
    assert.strictEqual(fs.readFileSync(path.join(newD, 'data', 'playtime.json'), 'utf8'), '{"horas":1}');
    assert.ok(fs.existsSync(path.join(newD, 'data', 'images', 'a.png')));
    assert.ok(fs.existsSync(path.join(oldD, 'data', 'playtime.json')), 'la carpeta anterior queda intacta');
    assert.ok(!fs.existsSync(path.join(newD, 'Cookies')));
    fs.writeFileSync(path.join(newD, 'data', 'playtime.json'), '{"horas":99}');
    assert.strictEqual(migrateUserData(oldD, newD).migrated, false, 'ya hay datos nuevos');
    assert.strictEqual(fs.readFileSync(path.join(newD, 'data', 'playtime.json'), 'utf8'), '{"horas":99}');
    assert.strictEqual(migrateUserData(oldD, oldD).migrated, false);
    fs.rmSync(base, { recursive: true, force: true });
  });
  test('icono .ico válido con varios tamaños', () => {
    const ico = makeIco([16, 32, 256]);
    assert.deepStrictEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 3]);
    for (let k = 0; k < 3; k++) {
      const off = 6 + k * 16;
      const len = ico.readUInt32LE(off + 8), at = ico.readUInt32LE(off + 12);
      assert.strictEqual(ico.subarray(at, at + 8).toString('hex'), '89504e470d0a1a0a', 'PNG en la entrada ' + k);
      assert.ok(at + len <= ico.length);
    }
    assert.strictEqual(ico[6], 16);
    assert.strictEqual(ico[6 + 32], 0, '256 px se codifica como 0');
  });
  await atest('ejecutable GameUtil.exe: copia, renombra y no repite el trabajo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gu-'));
    const ed = path.join(dir, 'electron');
    fs.mkdirSync(path.join(ed, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(ed, 'package.json'), '{"version":"33.4.11"}');
    fs.writeFileSync(path.join(ed, 'path.txt'), 'electron.exe');
    fs.writeFileSync(path.join(ed, 'dist', 'electron.exe'), 'EXE');
    const calls = [];
    const rc = async (f, o) => { calls.push([f, o]); };
    const logs = [];
    assert.strictEqual((await brand({ electronDir: ed, platform: 'linux', rcedit: rc })).status, 'skipped');
    const r = await brand({ electronDir: ed, platform: 'win32', rcedit: rc, icon: path.join(ed, 'nada.ico'), log: m => logs.push(m) });
    assert.deepStrictEqual([r.status, r.info], ['branded', true]);
    assert.strictEqual(fs.readFileSync(path.join(ed, 'dist', 'GameUtil.exe'), 'utf8'), 'EXE');
    assert.strictEqual(fs.readFileSync(path.join(ed, 'path.txt'), 'utf8'), 'GameUtil.exe');
    assert.ok(fs.existsSync(path.join(ed, 'dist', 'electron.exe')), 'el original no se toca');
    assert.deepStrictEqual([calls.length, calls[0][0].endsWith('GameUtil.exe'), calls[0][1]['version-string'].ProductName, calls[0][1]['version-string'].FileDescription], [1, true, 'GameUtil', 'GameUtil']);
    assert.strictEqual((await brand({ electronDir: ed, platform: 'win32', rcedit: rc })).status, 'ok');
    assert.strictEqual(calls.length, 1, 'segunda vez: sin trabajo');
    // si npm reinstala Electron, path.txt vuelve a electron.exe y se rehace
    fs.writeFileSync(path.join(ed, 'path.txt'), 'electron.exe');
    assert.strictEqual((await brand({ electronDir: ed, platform: 'win32', rcedit: rc })).status, 'branded');
    // si rcedit falla, el archivo se renombra igualmente y se avisa
    fs.writeFileSync(path.join(ed, 'package.json'), '{"version":"34.0.0"}');
    const bad = await brand({ electronDir: ed, platform: 'win32', rcedit: async () => { throw new Error('boom'); }, log: m => logs.push(m) });
    assert.deepStrictEqual([bad.status, bad.info], ['branded', false]);
    assert.ok(logs.some(l => /boom/.test(l) && /Electron/.test(l)));
    assert.strictEqual(fs.readFileSync(path.join(ed, 'path.txt'), 'utf8'), 'GameUtil.exe');
    // sin rcedit también funciona
    fs.writeFileSync(path.join(ed, 'package.json'), '{"version":"35.0.0"}');
    assert.strictEqual((await brand({ electronDir: ed, platform: 'win32', rcedit: null, log: () => {} })).info, false);
    fs.rmSync(path.join(ed, 'dist', 'electron.exe'));
    assert.strictEqual((await brand({ electronDir: ed, platform: 'win32', rcedit: rc })).status, 'skipped', 'sin electron.exe, Electron no está instalado');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  test('preparación: avisa si falta Electron y lo descarga si npm bloqueó su script', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gu-'));
    assert.strictEqual(ensureElectron({ dir: null }).status, 'missing');
    assert.ok(/npm install/.test(ensureElectron({ dir: null }).message));
    const ran = [];
    const failing = ensureElectron({ dir: d, run: f => { ran.push(f); throw new Error('sin red'); } });
    assert.deepStrictEqual([failing.status, ran.length], ['failed', 1]);
    assert.ok(/node_modules\/electron\/install\.js/.test(failing.message));
    const ok = ensureElectron({ dir: d, run: f => { fs.mkdirSync(path.join(d, 'dist')); fs.writeFileSync(path.join(d, 'path.txt'), 'electron.exe'); } });
    assert.strictEqual(ok.status, 'installed');
    assert.strictEqual(ensureElectron({ dir: d, run: () => { throw new Error('no debe ejecutarse'); } }).status, 'ok');
    fs.rmSync(d, { recursive: true, force: true });
  });
  test('ajustes por defecto: tutorial pendiente y nombre del paquete', () => {
    assert.strictEqual(DEFAULT_SETTINGS.tutorialDone, false);
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.deepStrictEqual([pkg.productName, pkg.build.productName, pkg.build.appId], ['GameUtil', 'GameUtil', 'com.gameutil.app']);
    assert.strictEqual(pkg.scripts.prestart, 'node scripts/setup.js');
    assert.strictEqual(pkg.scripts.postinstall, 'node scripts/setup.js');
    assert.ok(fs.existsSync(path.join(__dirname, '..', pkg.build.win.icon)), 'existe el icono de la build');
  });

  test('listas de categorías sin duplicados', () => {
    assert.strictEqual(new Set(TOOL_CATEGORIES).size, TOOL_CATEGORIES.length);
    assert.strictEqual(new Set(GAME_GENRES).size, GAME_GENRES.length);
  });

  require('./backup.test')(test);
  await require('./finder.test')(test, atest);
  require('./dist.test')(test);

  console.log(`\n${passed} pruebas correctas` + (process.exitCode ? ' (con fallos)' : ''));
})();

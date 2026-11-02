'use strict';
const fs = require('fs');
const path = require('path');
const { norm, normPath } = require('./util');
const { runPowerShell } = require('./ps');
const { findSteamRoot } = require('./steam');

// ------------------------------------------------------------- utilidades ----

function parseInstallDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function unixToDate(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString().slice(0, 10);
}

// ----------------------------------------------------- registro de Windows ----

const PS_UNINSTALL = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$paths = @(
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$rows = Get-ItemProperty -Path $paths | Where-Object { $_.DisplayName } |
  Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, InstallDate, EstimatedSize,
                SystemComponent, ParentKeyName, ReleaseType, DisplayIcon, PSPath
if ($null -eq $rows) { '[]' } else { ConvertTo-Json -InputObject @($rows) -Compress -Depth 2 }
`;

const UPDATE_TYPES = new Set(['update', 'hotfix', 'security update', 'update rollup', 'service pack']);

function locationFromRow(r) {
  let loc = String(r.InstallLocation || '').trim().replace(/^"+|"+$/g, '');
  if (!loc && r.DisplayIcon) {
    const m = /^"?([A-Za-z]:\\[^",]+)/.exec(String(r.DisplayIcon).trim());
    if (m) {
      const p = m[1];
      loc = /\.[A-Za-z0-9]{2,4}$/.test(p) ? path.win32.dirname(p) : p;
    }
  }
  return loc.replace(/\\+$/, '');
}

// Ruta del ejecutable principal si DisplayIcon apunta a un .exe ("C:\x\app.exe,0").
function exeFromRow(r) {
  const m = /^"?([A-Za-z]:\\[^",]+?\.exe)\b/i.exec(String(r.DisplayIcon || '').trim());
  return m ? m[1] : '';
}

// Convierte filas del registro en elementos, descartando actualizaciones y componentes del sistema.
function registryRowsToItems(rows) {
  const out = [];
  for (const r of rows || []) {
    const name = String(r.DisplayName || '').trim();
    if (!name) continue;
    if (Number(r.SystemComponent) === 1) continue;
    if (r.ParentKeyName) continue;
    if (UPDATE_TYPES.has(String(r.ReleaseType || '').toLowerCase())) continue;
    if (/^KB\d{6,}$/i.test(name) || /\(KB\d{6,}\)/i.test(name)) continue;
    if (/^(Update for|Security Update for|Hotfix for)\b/i.test(name)) continue;
    const kb = Number(r.EstimatedSize);
    out.push({
      id: 'reg:' + norm(name),
      name,
      version: String(r.DisplayVersion || '').trim(),
      publisher: String(r.Publisher || '').trim(),
      location: locationFromRow(r),
      exe: exeFromRow(r),
      regKey: String(r.PSPath || ''),
      installDate: parseInstallDate(r.InstallDate),
      sizeBytes: Number.isFinite(kb) && kb > 0 ? Math.round(kb * 1024) : null,
      source: 'registry'
    });
  }
  return dedupe(out);
}

function infoScore(i) {
  return (i.location ? 2 : 0) + (i.sizeBytes ? 2 : 0) + (i.installDate ? 1 : 0) + (i.version ? 1 : 0) + (i.publisher ? 1 : 0);
}

function dedupe(items) {
  const best = new Map();
  for (const it of items) {
    const k = norm(it.name);
    if (!k) continue;
    const cur = best.get(k);
    if (!cur || infoScore(it) > infoScore(cur)) best.set(k, it);
  }
  return [...best.values()];
}

// ------------------------------------------------------------------ Steam ----

function parseLibraryPaths(vdfText) {
  const out = [];
  const re = /"path"\s+"([^"]+)"/g;
  let m;
  while ((m = re.exec(vdfText))) out.push(m[1].replace(/\\\\/g, '\\'));
  return out;
}

function parseAcf(text) {
  const obj = {};
  const re = /"([^"]+)"\s+"([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) if (!(m[1] in obj)) obj[m[1]] = m[2];
  return obj;
}

const STEAM_SKIP_IDS = new Set(['228980']);
const STEAM_SKIP_NAMES = /^(proton|steam linux runtime|steamworks common)/i;

function acfToItem(acf, libraryPath) {
  if (!acf.appid || !acf.name) return null;
  if (STEAM_SKIP_IDS.has(acf.appid) || STEAM_SKIP_NAMES.test(acf.name)) return null;
  if (acf.StateFlags && (Number(acf.StateFlags) & 4) === 0) return null; // no instalado del todo
  const size = Number(acf.SizeOnDisk);
  return {
    id: 'steam:' + acf.appid,
    name: acf.name,
    version: '',
    publisher: '',
    location: acf.installdir ? path.join(libraryPath, 'steamapps', 'common', acf.installdir) : '',
    installDate: unixToDate(acf.LastUpdated),
    sizeBytes: Number.isFinite(size) && size > 0 ? size : null,
    source: 'steam',
    appId: Number(acf.appid)
  };
}

async function scanSteam() {
  const root = await findSteamRoot();
  if (!root) return [];
  const libs = new Set([root]);
  try {
    const vdf = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const p of parseLibraryPaths(vdf)) libs.add(p);
  } catch { /* sin libraryfolders.vdf */ }

  const items = [];
  for (const lib of libs) {
    const dir = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!/^appmanifest_\d+\.acf$/i.test(f)) continue;
      try {
        const acf = parseAcf(fs.readFileSync(path.join(dir, f), 'utf8'));
        const it = acfToItem(acf, lib);
        if (it) items.push(it);
      } catch { /* manifiesto ilegible: se ignora */ }
    }
  }
  return items;
}

// ------------------------------------------------------------ Epic Games ----

function epicManifestToItem(json, file) {
  if (!json || !json.DisplayName || json.bIsIncompleteInstall) return null;
  if (json.MainGameAppName && json.AppName && json.MainGameAppName !== json.AppName) return null; // DLC
  let date = null;
  try { date = fs.statSync(file).birthtime.toISOString().slice(0, 10); } catch { /* sin fecha */ }
  const size = Number(json.InstallSize);
  const loc = String(json.InstallLocation || '');
  const exeRel = String(json.LaunchExecutable || '');
  return {
    id: 'epic:' + (json.AppName || norm(json.DisplayName)),
    name: String(json.DisplayName),
    version: String(json.AppVersionString || ''),
    publisher: '',
    location: loc,
    exe: loc && exeRel && !/\.\./.test(exeRel) ? path.join(loc, exeRel) : '',
    installDate: date,
    sizeBytes: Number.isFinite(size) && size > 0 ? size : null,
    source: 'epic'
  };
}

function scanEpic() {
  const base = process.env.ProgramData || 'C:\\ProgramData';
  const dir = path.join(base, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return []; }
  const items = [];
  for (const f of files) {
    if (!f.toLowerCase().endsWith('.item')) continue;
    const full = path.join(dir, f);
    try {
      const it = epicManifestToItem(JSON.parse(fs.readFileSync(full, 'utf8')), full);
      if (it) items.push(it);
    } catch { /* manifiesto ilegible */ }
  }
  return items;
}

// ---------------------------------------------------------------- mezcla ----

// Quita del registro lo que ya viene de Steam/Epic y las entradas "Steam App 1234".
function mergeSources(registry, launcherItems) {
  const names = new Set(launcherItems.map(i => norm(i.name)));
  const locs = new Set(launcherItems.map(i => normPath(i.location)).filter(Boolean));
  const kept = registry.filter(i => {
    if (/^steam app \d+$/i.test(i.name)) return false;
    if (names.has(norm(i.name))) return false;
    const l = normPath(i.location);
    if (l && locs.has(l)) return false;
    return true;
  });
  return [...launcherItems, ...kept];
}

async function scanSystem() {
  const warnings = [];
  let registry = [];
  try {
    const out = (await runPowerShell(PS_UNINSTALL)).replace(/^\uFEFF/, '').trim();
    registry = registryRowsToItems(out ? JSON.parse(out) : []);
  } catch (e) {
    warnings.push('No se pudo leer el registro de Windows: ' + (e && e.message ? e.message : e));
  }

  let steam = [];
  try { steam = await scanSteam(); } catch (e) { warnings.push('No se pudo leer Steam: ' + e.message); }
  let epic = [];
  try { epic = scanEpic(); } catch (e) { warnings.push('No se pudo leer Epic Games: ' + e.message); }

  const items = mergeSources(registry, [...steam, ...epic]);
  if (!items.length && warnings.length) throw new Error(warnings.join(' '));
  return { items, warnings, demo: false };
}

module.exports = {
  scanSystem, registryRowsToItems, parseAcf, parseLibraryPaths, acfToItem,
  epicManifestToItem, mergeSources, parseInstallDate, dedupe
};

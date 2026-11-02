'use strict';
const fs = require('fs');
const path = require('path');
const { norm } = require('./util');

const MAX_ARGS = 1000;

// "-windowed -w 1920 \"C:\\mi carpeta\\x\"" -> ['-windowed', '-w', '1920', 'C:\\mi carpeta\\x']
function splitArgs(str) {
  const out = [];
  let cur = '';
  let inQ = false;
  let has = false;
  for (const ch of String(str || '')) {
    if (ch === '"') { inQ = !inQ; has = true; continue; }
    if (!inQ && /\s/.test(ch)) {
      if (has) { out.push(cur); cur = ''; has = false; }
      continue;
    }
    cur += ch;
    has = true;
  }
  if (has) out.push(cur);
  return out;
}

function validateArgs(str) {
  const s = String(str == null ? '' : str);
  if (s.length > MAX_ARGS) throw new Error(`Los argumentos no pueden superar los ${MAX_ARGS} caracteres.`);
  if (/[\u0000\r\n]/.test(s)) throw new Error('Los argumentos no pueden contener saltos de línea.');
  return s.trim();
}

const EXE_SKIP = /(unins|uninstall|setup|install|crash|report|redist|vcredist|dxsetup|dotnet|updater|update|helper|webhelper|cef|notification|eac|easyanticheat|battleye)/i;

// Busca el ejecutable más probable dentro de una carpeta de instalación (hasta 2 niveles).
function findMainExe(dir, title) {
  if (!dir) return null;
  const want = norm(title).split(' ').filter(w => w.length > 2);
  let best = null;
  const walk = (d, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 2) walk(full, depth + 1); continue; }
      if (!/\.exe$/i.test(e.name) || EXE_SKIP.test(e.name)) continue;
      let size = 0;
      try { size = fs.statSync(full).size; } catch { continue; }
      const base = norm(path.basename(e.name, path.extname(e.name)));
      const match = want.some(w => base.includes(w)) ? 1 : 0;
      const score = match * 1e12 + size / (1 + depth * 4);
      if (!best || score > best.score) best = { file: full, score };
    }
  };
  walk(dir, 0);
  return best ? best.file : null;
}

// Decide cómo lanzar un elemento. item: entrada de la biblioteca; exe: ruta resuelta (o null).
function planLaunch(item, exe, argsStr) {
  const args = validateArgs(argsStr);
  if (item.source === 'steam' && item.appId) {
    const id = Number(item.appId);
    if (!Number.isInteger(id) || id <= 0) return null;
    return { kind: 'url', url: args ? `steam://run/${id}//${encodeURIComponent(args)}/` : `steam://rungameid/${id}` };
  }
  if (item.source === 'epic' && !args) {
    const app = String(item.id || '').replace(/^epic:/, '');
    if (/^[A-Za-z0-9_.-]{1,80}$/.test(app)) {
      return { kind: 'url', url: `com.epicgames.launcher://apps/${encodeURIComponent(app)}?action=launch&silent=true` };
    }
  }
  if (exe) return { kind: 'exe', file: exe, args: splitArgs(args), cwd: path.dirname(exe) };
  return null;
}

// Convierte los datos del desinstalador del registro en el comando a ejecutar.
function uninstallCommand(row) {
  const raw = String((row && (row.UninstallString || row.QuietUninstallString)) || '').trim();
  if (!raw) return null;
  const msi = /msiexec(?:\.exe)?"?\s+\/[IX]\s*(\{[0-9A-Fa-f-]{36}\})/i.exec(raw);
  if (msi) return `msiexec.exe /x ${msi[1]}`;
  return raw;
}

const UNINSTALL_KEY = /^Microsoft\.PowerShell\.Core\\Registry::HKEY_(LOCAL_MACHINE|CURRENT_USER)\\SOFTWARE\\(Wow6432Node\\)?Microsoft\\Windows\\CurrentVersion\\Uninstall\\[^'"\r\n`$]+$/i;

function validUninstallKey(k) {
  return UNINSTALL_KEY.test(String(k || ''));
}

module.exports = { splitArgs, validateArgs, findMainExe, planLaunch, uninstallCommand, validUninstallKey, MAX_ARGS };

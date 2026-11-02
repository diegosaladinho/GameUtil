'use strict';
const { execFile } = require('child_process');

function execFileP(file, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', ...opts },
      (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

// Ejecuta PowerShell con -EncodedCommand para evitar problemas de comillas.
function runPowerShell(script, timeout = 90000) {
  const full = '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;\n' + script;
  const encoded = Buffer.from(full, 'utf16le').toString('base64');
  return execFileP('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { timeout });
}

module.exports = { execFileP, runPowerShell };

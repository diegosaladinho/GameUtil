'use strict';
// Genera dist/SHA256SUMS.txt con la suma SHA-256 de cada .exe, para que se pueda comprobar la descarga.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sumsFor(dir) {
  const lines = [];
  for (const f of fs.readdirSync(dir).filter(n => n.toLowerCase().endsWith('.exe')).sort()) {
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex');
    lines.push(`${h}  ${f}`);
  }
  return lines;
}

function main(dir = path.join(__dirname, '..', 'dist')) {
  if (!fs.existsSync(dir)) { console.error('No existe la carpeta dist. Ejecuta antes «npm run dist».'); process.exit(1); }
  const lines = sumsFor(dir);
  if (!lines.length) { console.error('No hay archivos .exe en dist.'); process.exit(1); }
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

if (require.main === module) main();
module.exports = { sumsFor };

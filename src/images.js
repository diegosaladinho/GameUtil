'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EXTS = ['.jpg', '.png', '.webp'];
const TYPE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// Solo se descargan imágenes de estos servidores.
const ALLOWED_HOSTS = [
  'cdn.akamai.steamstatic.com', 'shared.akamai.steamstatic.com', 'cdn.cloudflare.steamstatic.com',
  'steamcdn-a.akamaihd.net', 'steamgriddb.com', 'upload.wikimedia.org',
  'images.gog-statics.com', 'media.rawg.io'
];

const fileId = key => crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 16);

function hostAllowed(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch { return false; }
}

function sniffExt(buf) {
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return '.webp';
  if (buf.length > 6 && /^GIF8[79]a/.test(buf.toString('latin1', 0, 6))) return '.gif';
  return null;
}

function removeVariants(dir, base) {
  for (const ext of [...EXTS, '.gif']) {
    try { fs.unlinkSync(path.join(dir, base + ext)); } catch { /* no existía */ }
  }
}

// Descarga una imagen a dir/<base>.<ext>. Devuelve la ruta o null si no existe o no es válida.
async function downloadImage(url, dir, base, { fetchImpl = globalThis.fetch, maxBytes = 12 * 1024 * 1024 } = {}) {
  if (!hostAllowed(url)) throw new Error('Servidor de imágenes no permitido');
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(25000) });
  if (res.url && !hostAllowed(res.url)) throw new Error('Redirección a un servidor no permitido');
  if (res.status === 404 || res.status === 403) return null;
  if (res.status === 429) { const e = new Error('Límite de peticiones alcanzado'); e.code = 'RATE_LIMIT'; throw e; }
  if (!res.ok) throw new Error('Error HTTP ' + res.status);
  const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPE_EXT[type]) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200 || buf.length > maxBytes) return null;
  const ext = sniffExt(buf);
  if (!ext || ext === '.gif') return null;
  fs.mkdirSync(dir, { recursive: true });
  removeVariants(dir, base);
  const dest = path.join(dir, base + ext);
  fs.writeFileSync(dest, buf);
  return dest;
}

// Copia una imagen elegida por el usuario. Valida tamaño y contenido (no solo la extensión).
function importImage(srcFile, dir, base, maxBytes = 15 * 1024 * 1024) {
  const st = fs.statSync(srcFile);
  if (!st.isFile()) throw new Error('No es un archivo.');
  if (st.size > maxBytes) throw new Error('La imagen supera los 15 MB.');
  const buf = fs.readFileSync(srcFile);
  const ext = sniffExt(buf);
  if (!ext) throw new Error('El archivo no es una imagen PNG, JPG, WEBP o GIF válida.');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${base}${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return name;
}

module.exports = { downloadImage, importImage, hostAllowed, sniffExt, fileId, EXTS, ALLOWED_HOSTS };

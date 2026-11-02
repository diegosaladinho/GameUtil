'use strict';
const zlib = require('zlib');

// Icono de la app generado por código (sin archivos de imagen): cuadrado redondeado con degradado y un triángulo de "play".

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
}

function makeIconPng(size = 64) {
  const px = Buffer.alloc(size * size * 4);
  const r = size * 0.22;
  const inRound = (x, y) => {
    const cx = Math.min(Math.max(x, r), size - r), cy = Math.min(Math.max(y, r), size - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const tri = [[size * 0.38, size * 0.28], [size * 0.38, size * 0.72], [size * 0.74, size * 0.5]];
  const inTri = (x, y) => {
    const s = (a, b, c) => (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1]);
    const p = [x, y];
    const d1 = s(p, tri[0], tri[1]), d2 = s(p, tri[1], tri[2]), d3 = s(p, tri[2], tri[0]);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const SS = 3; // supersampling para bordes suaves
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cover = 0, white = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
        if (inRound(fx, fy)) { cover++; if (inTri(fx, fy)) white++; }
      }
      const a = cover / (SS * SS);
      const t = (x + y) / (2 * size);
      const bg = [123 + (45 - 123) * t, 108 + (212 - 108) * t, 255 + (191 - 255) * t]; // violeta -> turquesa
      const k = cover ? white / cover : 0;
      const i = (y * size + x) * 4;
      px[i] = Math.round(bg[0] + (255 - bg[0]) * k);
      px[i + 1] = Math.round(bg[1] + (255 - bg[1]) * k);
      px[i + 2] = Math.round(bg[2] + (255 - bg[2]) * k);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return encodePng(size, size, px);
}

// Archivo .ico con varias imágenes PNG incrustadas (válido desde Windows Vista).
function makeIco(sizes = [16, 32, 48, 64, 128, 256]) {
  const pngs = sizes.map(s => makeIconPng(s));
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const dir = pngs.map((png, i) => {
    const e = Buffer.alloc(16);
    const sz = sizes[i];
    e[0] = sz >= 256 ? 0 : sz; e[1] = sz >= 256 ? 0 : sz;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([head, ...dir, ...pngs]);
}

module.exports = { makeIconPng, makeIco, encodePng, crc32 };

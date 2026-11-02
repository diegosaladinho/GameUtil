'use strict';

const hex = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

// Color de acento a partir de píxeles en bruto (4 bytes por píxel). Prefiere tonos vivos y evita grises y negros.
function dominantColor(buf, order = 'bgra') {
  const ri = order === 'bgra' ? 2 : 0;
  const bi = order === 'bgra' ? 0 : 2;
  let R = 0, G = 0, B = 0, W = 0;
  for (let i = 0; i + 3 < buf.length; i += 4) {
    const a = buf[i + 3];
    if (a < 128) continue;
    const r = buf[i + ri], g = buf[i + 1], b = buf[i + bi];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max / 255;
    const s = max === 0 ? 0 : (max - min) / max;
    const w = s * s * v + 0.02;
    R += r * w; G += g * w; B += b * w; W += w;
  }
  if (!W) return null;
  let r = R / W, g = G / W, b = B / W;
  // sube el brillo si quedó demasiado oscuro para usarse como acento
  const max = Math.max(r, g, b);
  if (max < 150 && max > 0) { const k = 150 / max; r *= k; g *= k; b *= k; }
  // realza la saturación si es muy baja
  const avg = (r + g + b) / 3;
  const sat = Math.max(r, g, b) === 0 ? 0 : (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
  if (sat < 0.3) { const k = 1.6; r = avg + (r - avg) * k; g = avg + (g - avg) * k; b = avg + (b - avg) * k; }
  return '#' + hex(r) + hex(g) + hex(b);
}

module.exports = { dominantColor };

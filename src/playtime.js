'use strict';
const { normPath } = require('./util');

// ------------------------------------------------------------------ horas ----
// Windows no guarda horas jugadas. Se combinan dos fuentes:
//  - Steam: lo que Steam ya tiene guardado en local (minutos y última vez).
//  - Esta app: mide cuánto tiempo está abierto el proceso del juego (cualquier launcher).
// Para juegos de Steam se toma el mayor de los dos (nunca se suman, para no contar dos veces).

function hoursFor(entry, own, steamMap) {
  const rec = own || {};
  const ownMin = Math.floor((rec.seconds || 0) / 60);
  let steamMin = 0;
  let steamLast = null;
  if (entry.source === 'steam' && entry.appId && steamMap) {
    const s = steamMap.get(String(entry.appId));
    if (s) { steamMin = s.minutes || 0; steamLast = s.lastPlayed ? s.lastPlayed * 1000 : null; }
  }
  const useSteam = steamMin > 0 && steamMin >= ownMin;
  const minutes = useSteam ? steamMin : ownMin;
  const lastMs = Math.max(rec.lastPlayed || 0, steamLast || 0);
  return {
    minutes,
    source: minutes === 0 ? null : useSteam ? 'steam' : 'launcher',
    lastPlayed: lastMs ? new Date(lastMs).toISOString() : null
  };
}

// ---------------------------------------------------------------- tracker ----

// Devuelve qué elementos tienen algún proceso en marcha. targets: [{ key, location }]
function matchRunning(processPaths, targets) {
  const prefixes = [];
  for (const t of targets) {
    const loc = normPath(t.location);
    const depth = loc.split('\\').filter(Boolean).length;
    if (!loc || depth < 3) continue; // carpetas demasiado genéricas (C:\Program Files) darían falsos positivos
    prefixes.push({ key: t.key, prefix: loc + '\\' });
  }
  prefixes.sort((a, b) => b.prefix.length - a.prefix.length);
  const running = new Set();
  for (const p of processPaths) {
    const np = normPath(p) + '\\';
    const hit = prefixes.find(x => np.startsWith(x.prefix));
    if (hit) running.add(hit.key);
  }
  return running;
}

class Tracker {
  // file: JsonFile con { games: { key: { seconds, lastPlayed, sessions } } }
  constructor({ file, getTargets, listPaths, onChange, intervalMs = 30000, now = Date.now }) {
    this.file = file;
    this.getTargets = getTargets;
    this.listPaths = listPaths;
    this.onChange = onChange || (() => {});
    this.intervalMs = intervalMs;
    this.now = now;
    this.running = new Set();
    this.lastTick = null;
    this.timer = null;
    this.busy = false;
  }

  record(key) {
    const g = this.file.data.games;
    if (!g[key] || typeof g[key] !== 'object') g[key] = { seconds: 0, lastPlayed: 0, sessions: 0 };
    return g[key];
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const t = this.now();
      const paths = await this.listPaths();
      const nowRunning = matchRunning(paths, this.getTargets());
      const gap = this.lastTick == null ? 0 : Math.min(t - this.lastTick, this.intervalMs * 2);
      let dirty = false;
      for (const key of nowRunning) {
        const r = this.record(key);
        if (!this.running.has(key)) { r.sessions = (r.sessions || 0) + 1; dirty = true; }
        const add = Math.round(gap / 1000);
        if (add > 0) r.seconds = (r.seconds || 0) + add;
        r.lastPlayed = t;
        dirty = true;
      }
      const changed = nowRunning.size !== this.running.size || [...nowRunning].some(k => !this.running.has(k));
      this.running = nowRunning;
      this.lastTick = t;
      if (dirty) this.file.saveSoon();
      if (changed || dirty) this.onChange(this.running, changed);
    } catch { /* un fallo al listar procesos no debe detener el seguimiento */ } finally {
      this.busy = false;
    }
  }

  start() {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.file.flush();
  }

  // Marca el momento de lanzamiento (aunque el proceso tarde en aparecer).
  touch(key) {
    this.record(key).lastPlayed = this.now();
    this.file.saveSoon();
  }
}

module.exports = { hoursFor, matchRunning, Tracker };

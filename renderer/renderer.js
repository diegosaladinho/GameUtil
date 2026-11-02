'use strict';
(() => {
  const api = window.api;

  // ---------------------------------------------------------- pantalla de carga --
  // Visible desde el primer pintado (está en el HTML). Se retira cuando hay datos y ha
  // pasado el tiempo mínimo para que la animación se vea completa.
  const Splash = (() => {
    const node = document.getElementById('splash');
    const boot = api.boot || {};
    const motion = boot.transitions !== false;
    const MIN = motion ? 2400 : 500;
    const t0 = performance.now();
    if (node && boot.splash === false) { node.remove(); return { finish: () => Promise.resolve() }; }
    if (!motion) document.body.dataset.motion = 'off';
    let p = null;
    return {
      finish() {
        if (p) return p;
        p = new Promise(res => {
          if (!node) return res();
          setTimeout(() => {
            node.classList.add('out');
            setTimeout(() => { node.remove(); res(); }, motion ? 600 : 180);
          }, Math.max(0, MIN - (performance.now() - t0)));
        });
        return p;
      }
    };
  })();
  const $ = id => document.getElementById(id);

  // ============================================================== utilidades ==
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return n;
  }

  // Iconos de trazo (24x24)
  const ICONS = {
    play: [['polygon', { points: '6 4 20 12 6 20 6 4' }]],
    gear: [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' }]],
    refresh: [['polyline', { points: '23 4 23 10 17 10' }], ['polyline', { points: '1 20 1 14 7 14' }], ['path', { d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' }]],
    cloud: [['polyline', { points: '8 17 12 21 16 17' }], ['line', { x1: 12, y1: 12, x2: 12, y2: 21 }], ['path', { d: 'M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29' }]],
    min: [['line', { x1: 5, y1: 12, x2: 19, y2: 12 }]],
    max: [['rect', { x: 5, y: 5, width: 14, height: 14, rx: 1 }]],
    restore: [['rect', { x: 4, y: 8, width: 12, height: 12, rx: 1 }], ['path', { d: 'M8 4h11a1 1 0 0 1 1 1v11' }]],
    close: [['line', { x1: 6, y1: 6, x2: 18, y2: 18 }], ['line', { x1: 18, y1: 6, x2: 6, y2: 18 }]],
    x: [['line', { x1: 6, y1: 6, x2: 18, y2: 18 }], ['line', { x1: 18, y1: 6, x2: 6, y2: 18 }]],
    folder: [['path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }]],
    trash: [['polyline', { points: '3 6 5 6 21 6' }], ['path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }]]
  };
  function icon(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i'); s.setAttribute('aria-hidden', 'true');
    for (const [tag, attrs] of ICONS[name]) {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      s.append(n);
    }
    return s;
  }

  const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
  function fmtHours(min) {
    if (!min) return '0 h';
    if (min < 60) return `${min} min`;
    const h = min / 60;
    return `${h < 10 ? nf1.format(h) : nf0.format(h)} h`;
  }
  function fmtSize(bytes) {
    if (!bytes) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = bytes, i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${(v >= 100 ? nf0 : nf1).format(v)} ${u[i]}`;
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(String(iso).length <= 10 ? iso + 'T00:00:00' : iso);
    return isNaN(d) ? '—' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function ago(iso) {
    if (!iso) return 'Nunca';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 30) return `Hace ${days} días`;
    return fmtDate(iso);
  }
  const errMsg = e => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

  function hueOf(str) {
    let h = 7;
    for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }
  const tint = key => hslToHex(hueOf(key), 45, 38);

  const artUrl = (e, kind) => (e.art && e.art[kind] != null ? api.artUrl(e.key, kind, e.art[kind]) : null);

  // ================================================================== estado ==
  const S = {
    entries: [], by: new Map(),
    settings: { theme: 'auto', transitions: true, background: true, hasSgdbKey: false, canEncrypt: true },
    meta: { toolCategories: [], gameGenres: [] },
    scannedAt: null, demo: false, isWindows: true,
    tab: 'game', sel: { game: null, tool: null }, query: '', sort: 'name', filter: { game: '', tool: '' },
    busy: null, draft: null, dlgKey: null, flip: false
  };

  const TYPE = {
    game: { noun: ['juego', 'juegos'], play: 'Jugar', moveTo: 'tool', moveLabel: 'Mover a Software', filterAll: 'Plataformas' },
    tool: { noun: ['programa', 'programas'], play: 'Abrir', moveTo: 'game', moveLabel: 'Mover a Juegos', filterAll: 'Categorías' }
  };

  function toast(msg, kind = 'info', ms = 5000) {
    const t = el('div', { class: 'toast ' + kind, text: msg });
    $('toasts').append(t);
    setTimeout(() => t.remove(), ms);
  }

  function setEntries(list) {
    S.entries = list;
    S.by = new Map(list.map(e => [e.key, e]));
  }
  function mergeEntry(v) {
    const i = S.entries.findIndex(e => e.key === v.key);
    if (i >= 0) S.entries[i] = v; else S.entries.push(v);
    S.by.set(v.key, v);
  }

  // ============================================================== tema/ajustes ==
  function applySettings() {
    const r = document.documentElement;
    if (S.settings.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', S.settings.theme);
    document.body.dataset.motion = S.settings.transitions ? 'on' : 'off';
  }

  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function setAccent(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
    const n = parseInt(hex.slice(1), 16);
    const r = document.documentElement.style;
    r.setProperty('--accent-rgb', `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`);
    r.setProperty('--on-accent', luminance(hex) > 0.4 ? '#0c0e13' : '#ffffff');
  }

  // ============================================================== biblioteca ==
  function typeEntries() { return S.entries.filter(e => e.type === S.tab); }

  function visible() {
    const q = norm(S.query);
    const f = S.filter[S.tab];
    const list = typeEntries().filter(e => {
      if (f && (S.tab === 'game' ? e.platform : e.category) !== f) return false;
      return !q || norm([e.title, e.developer, e.editor, e.category, e.platform].join(' ')).includes(q);
    });
    const byName = (a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
    if (S.sort === 'hours') list.sort((a, b) => (b.hours.minutes - a.hours.minutes) || byName(a, b));
    else if (S.sort === 'recent') list.sort((a, b) => (Date.parse(b.hours.lastPlayed || 0) - Date.parse(a.hours.lastPlayed || 0)) || byName(a, b));
    else list.sort(byName);
    return list;
  }

  function thumbNode(e) {
    const t = el('div', { class: 'thumb' });
    const url = artUrl(e, 'thumb');
    const letter = () => { t.replaceChildren(String(e.title).trim().charAt(0).toUpperCase() || '?'); t.style.background = tint(e.key); };
    if (url) {
      const img = el('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' });
      img.addEventListener('error', letter);
      t.append(img);
    } else letter();
    return t;
  }

  function renderFilters() {
    const sel = $('filter');
    const field = S.tab === 'game' ? 'platform' : 'category';
    const values = [...new Set(typeEntries().map(e => e[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    if (S.filter[S.tab] && !values.includes(S.filter[S.tab])) S.filter[S.tab] = '';
    sel.replaceChildren(el('option', { value: '', text: TYPE[S.tab].filterAll }), values.map(v => el('option', { value: v, text: v })));
    sel.value = S.filter[S.tab] || '';
    $('sort').value = S.sort;
  }

  function renderList() {
    const list = $('list');
    const top = list.scrollTop;
    const rows = visible();
    const frag = document.createDocumentFragment();
    for (const e of rows) {
      const sub = e.type === 'game' ? (e.category && e.category !== 'Sin género' ? e.category : e.platform || '') : e.category;
      const end = e.running ? el('span', { class: 'live', title: 'En ejecución' }) : (e.type === 'game' && e.hours.minutes ? fmtHours(e.hours.minutes) : '');
      frag.append(el('button', {
        class: 'row', type: 'button', role: 'option', 'data-key': e.key, tabindex: '-1',
        'aria-selected': e.key === S.sel[S.tab] ? 'true' : 'false', onclick: () => select(e.key)
      }, thumbNode(e),
        el('div', { class: 'row-text' }, el('div', { class: 'row-title', text: e.title }), el('div', { class: 'row-sub', text: sub })),
        el('div', { class: 'row-end' }, end)));
    }
    if (!rows.length) {
      const none = !typeEntries().length;
      frag.append(el('div', { class: 'list-empty' },
        el('strong', { text: none ? `No hay ${TYPE[S.tab].noun[1]} todavía` : 'Sin resultados' }),
        none ? 'Escanea el sistema para detectarlos.' : 'Prueba con otra búsqueda o quita el filtro.'));
    }
    list.replaceChildren(frag);
    list.scrollTop = top;
    const cur = list.querySelector('[aria-selected="true"]');
    if (cur) cur.tabIndex = 0; else if (list.firstElementChild && list.firstElementChild.tabIndex === -1) list.firstElementChild.tabIndex = 0;
  }

  function renderCounts() {
    let g = 0, t = 0;
    for (const e of S.entries) e.type === 'game' ? g++ : t++;
    $('count-game').textContent = g;
    $('count-tool').textContent = t;
  }

  function switchTab(type, quiet) {
    S.tab = type;
    for (const b of document.querySelectorAll('.seg-btn')) b.setAttribute('aria-selected', b.dataset.type === type ? 'true' : 'false');
    renderFilters();
    ensureSelection();
    renderList();
    renderDetail(true);
    if (!quiet) persistView();
  }

  function ensureSelection() {
    const cur = S.sel[S.tab];
    const e = cur && S.by.get(cur);
    if (e && e.type === S.tab) return;
    const first = visible()[0] || typeEntries()[0];
    S.sel[S.tab] = first ? first.key : null;
  }

  let persistTimer = null;
  function persistView() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => api.setSettings({ view: { type: S.tab, key: S.sel[S.tab], sort: S.sort } }).catch(() => {}), 400);
  }

  function select(key, scroll) {
    if (S.sel[S.tab] === key) return;
    S.sel[S.tab] = key;
    for (const r of $('list').children) {
      const on = r.dataset.key === key;
      r.setAttribute('aria-selected', on ? 'true' : 'false');
      r.tabIndex = on ? 0 : -1;
      if (on && scroll) { r.scrollIntoView({ block: 'nearest' }); r.focus({ preventScroll: true }); }
    }
    renderDetail(true);
    persistView();
  }

  // ================================================================== detalle ==
  function setBackdrop(e) {
    const next = $(S.flip ? 'bd-a' : 'bd-b');
    const prev = $(S.flip ? 'bd-b' : 'bd-a');
    S.flip = !S.flip;
    const h = hueOf(e.key);
    const gradient = `radial-gradient(120% 90% at 85% 0%, hsl(${(h + 40) % 360} 55% 30% / .9), transparent 60%), linear-gradient(135deg, hsl(${h} 50% 24%), hsl(${(h + 60) % 360} 55% 12%))`;
    const swap = bg => { next.style.backgroundImage = bg; next.classList.add('on'); prev.classList.remove('on'); };
    const url = artUrl(e, 'banner');
    const coverUrl = url ? null : artUrl(e, 'cover');
    next.classList.toggle('blur', !!coverUrl);
    if (!url && !coverUrl) { swap(gradient); return; }
    const img = new Image();
    const src = url || coverUrl;
    img.onload = () => { if (S.sel[S.tab] === e.key) swap(`url("${src}")`); };
    img.onerror = () => swap(gradient);
    img.src = src;
  }

  function fact(label, value, opts = {}) {
    return el('div', { class: 'fact' + (opts.big ? ' big' : '') },
      el('div', { class: 'fact-v', text: value || '—' }),
      el('div', { class: 'fact-l', text: label }),
      opts.note ? el('div', { class: 'fact-l faint', text: opts.note }) : null);
  }

  function hoursNote(h) {
    if (h.source === 'steam') return 'Según Steam';
    if (h.source === 'launcher') return 'Medido por esta app';
    return 'Se cuenta desde que abras el juego';
  }

  function renderDetail(animate) {
    const box = $('detail');
    const e = S.by.get(S.sel[S.tab]);
    const top = box.scrollTop;

    if (!e) {
      box.replaceChildren(S.entries.length
        ? el('div', { class: 'welcome' }, el('h2', { text: `No hay ${TYPE[S.tab].noun[1]}` }), el('p', { text: 'Esta pestaña está vacía. Puedes mover elementos desde sus ajustes.' }))
        : el('div', { class: 'welcome' },
            el('h2', { text: 'Tu biblioteca está vacía' }),
            el('p', { text: 'Escanea el sistema para detectar tus juegos y programas instalados.' }),
            el('button', { class: 'btn primary play', type: 'button', onclick: doScan }, icon('refresh'), 'Escanear sistema')));
      $('bd-a').classList.remove('on'); $('bd-b').classList.remove('on');
      return;
    }

    if (animate) {
      setBackdrop(e);
      setAccent(hslToHex(hueOf(e.key), 62, 62));
      if (e.art.banner != null || e.art.cover != null) {
        api.accent(e.key).then(c => { if (c && S.sel[S.tab] === e.key) setAccent(c); }).catch(() => {});
      }
    }

    const hasLogo = e.art.logo != null;
    const iconUrl = artUrl(e, 'icon') || artUrl(e, 'cover');
    const tile = el('div', { class: 'head-icon' + (e.art.icon == null && e.art.cover != null ? ' cover' : '') });
    if (iconUrl) {
      const img = el('img', { src: iconUrl, alt: '' });
      img.addEventListener('error', () => { tile.replaceChildren(e.title.trim().charAt(0).toUpperCase()); tile.style.background = tint(e.key); });
      tile.append(img);
    } else { tile.append(e.title.trim().charAt(0).toUpperCase()); tile.style.background = tint(e.key); }

    const logo = hasLogo ? el('img', { class: 'logo', src: artUrl(e, 'logo'), alt: e.title }) : null;
    if (logo) logo.addEventListener('error', () => logo.remove());
    const head = el('div', { class: 'head' }, hasLogo ? null : tile,
      el('div', { class: 'title-wrap' }, logo, el('h1', { class: 'title' + (hasLogo ? ' sr' : ''), text: e.title })));

    const play = el('button', { class: 'btn primary play', type: 'button', disabled: !e.canLaunch || e.running, onclick: () => launch(e.key),
      title: e.canLaunch ? '' : 'No se encontró cómo iniciarlo. Abre sus ajustes para revisar la carpeta.' },
      e.running ? null : icon('play'), e.running ? 'En ejecución' : TYPE[e.type].play);
    const cog = el('button', { class: 'btn cog', type: 'button', 'aria-label': 'Ajustes de ' + e.title, title: 'Ajustes', onclick: () => openItem(e.key) }, icon('gear'));
    const actions = el('div', { class: 'actions' }, play, cog,
      e.running ? el('span', { class: 'state' }, el('span', { class: 'live' }), 'Jugando ahora') : null);

    const facts = el('div', { class: 'facts' });
    if (e.type === 'game') {
      facts.append(
        fact('Horas jugadas', fmtHours(e.hours.minutes), { big: true, note: hoursNote(e.hours) }),
        fact('Última vez', ago(e.hours.lastPlayed)),
        fact('Desarrollador', e.developer), fact('Editor', e.editor),
        fact('Plataforma', e.platform), fact('Género', e.category),
        fact('Tamaño', fmtSize(e.sizeBytes)));
    } else {
      facts.append(
        fact('Desarrollador', e.developer), fact('Editor', e.editor),
        fact('Categoría', e.category), fact('Versión', e.version),
        fact('Tamaño', fmtSize(e.sizeBytes)), fact('Instalado', fmtDate(e.installDate)));
    }

    const desc = e.description
      ? el('div', { class: 'desc-wrap' }, el('p', { class: 'desc', text: e.description }), e.descSource ? el('p', { class: 'src', text: `Fuente: ${e.descSource}` }) : null)
      : el('p', { class: 'desc empty', text: 'Sin descripción. Añádela en Ajustes, o espera a que la búsqueda automática la encuentre.' });

    // la animación de entrada solo se usa al cambiar de elemento, no al refrescar horas
    const inner = el('div', { class: 'detail-inner' + (animate ? ' enter' : '') }, el('div', { class: 'detail-spacer' }), head, actions, facts, desc);
    box.replaceChildren(inner);
    box.scrollTop = animate ? 0 : top;
  }

  // ================================================================== acciones ==
  async function launch(key) {
    try {
      const v = await api.launch(key);
      if (v) { mergeEntry(v); renderList(); if (S.sel[S.tab] === key) renderDetail(false); }
    } catch (e) { toast(errMsg(e), 'error', 7000); }
  }

  function setBusy(kind, text, progress) {
    S.busy = kind;
    const bar = $('busy');
    bar.hidden = !kind;
    bar.classList.toggle('indeterminate', progress == null);
    $('busy-text').textContent = text || '';
    $('busy-fill').style.width = progress == null ? '' : `${Math.round(progress * 100)}%`;
    $('busy-cancel').hidden = kind !== 'online';
    $('btn-scan').disabled = $('btn-online').disabled = !!kind;
  }

  function applyPayload(p) {
    setEntries(p.entries || []);
    S.meta = p.meta || S.meta;
    S.scannedAt = p.scannedAt; S.demo = !!p.demo; S.isWindows = p.isWindows !== false;
    if (p.settings) S.settings = { ...S.settings, ...p.settings };
    applySettings();
    renderCounts();
    renderFilters();
    ensureSelection();
    renderList();
    renderDetail(true);
  }

  async function doScan() {
    if (S.busy) return;
    setBusy('scan', 'Escaneando el sistema…');
    try {
      const p = await api.scan();
      applyPayload(p);
      if (p.demo) toast('No es Windows: se muestran datos de demostración.', 'info', 7000);
      else if (p.warnings && p.warnings.length) toast(p.warnings.join(' '), 'error', 9000);
      else toast(`Escaneo completado: ${plural(p.entries.length, 'elemento', 'elementos')}.`, 'ok');
    } catch (e) { toast('El escaneo ha fallado: ' + errMsg(e), 'error', 9000); }
    finally { setBusy(null); }
  }

  async function doOnline() {
    if (S.busy) return;
    if (!S.entries.length) { toast('Primero escanea el sistema.'); return; }
    setBusy('online', 'Preparando la búsqueda…');
    try {
      const p = await api.onlineRun();
      if (p.declined) return;
      applyPayload(p);
      const s = p.stats || {};
      if (s.upToDate) toast('Todo está al día: no hay nada nuevo que consultar.', 'ok');
      else {
        const base = `Datos de ${s.found} de ${s.checked} consultados y ${plural(s.images, 'imagen descargada', 'imágenes descargadas')}.`;
        if (s.stopped === 'cancelled') toast('Búsqueda cancelada. ' + base);
        else if (s.stopped) toast(s.stopped + ' ' + base, 'error', 9000);
        else toast(base, 'ok', 7000);
      }
    } catch (e) { toast('La búsqueda online ha fallado: ' + errMsg(e), 'error', 9000); }
    finally { setBusy(null); }
  }

  // ======================================================== ajustes del elemento ==
  const dlgItem = $('dlg-item');

  function openItem(key) {
    const e = S.by.get(key);
    if (!e) return;
    S.dlgKey = key;
    S.draft = { key, title: e.custom.title ? e.title : '', description: e.description, args: e.args };
    renderItemDialog();
    if (!dlgItem.open) dlgItem.showModal();
  }

  async function itemAction(fn, okMsg) {
    try {
      const v = await fn();
      if (v && v.key) {
        const before = S.by.get(v.key);
        mergeEntry(v);
        if (before && before.type !== v.type) { S.sel[v.type] = v.key; switchTab(v.type); }
        renderCounts(); renderFilters(); renderList();
        if (S.sel[S.tab] === v.key) renderDetail(false);
        if (S.dlgKey === v.key && dlgItem.open) renderItemDialog();
      }
      if (okMsg) toast(okMsg, 'ok');
      return v;
    } catch (e) { toast(errMsg(e), 'error', 7000); return null; }
  }

  function imageRow(e, kind, label) {
    const url = artUrl(e, kind);
    const prev = el('div', { class: 'imgprev' + (kind === 'banner' ? ' cover' : '') });
    if (url) { const im = el('img', { src: url, alt: '' }); im.addEventListener('error', () => im.replaceWith('Sin imagen')); prev.append(im); } else prev.append('Sin imagen');
    const own = e.custom[kind];
    return el('div', { class: 'imgrow' }, prev,
      el('div', { class: 'imgmeta' }, el('b', { text: label }), el('span', { text: own ? 'Imagen personalizada' : url ? 'Imagen automática' : 'Sin imagen' })),
      el('button', { class: 'btn small', type: 'button', onclick: () => itemAction(() => api.pickImage(e.key, kind)) }, 'Elegir imagen'),
      own ? el('button', { class: 'btn small ghost', type: 'button', onclick: () => itemAction(() => api.clearImage(e.key, kind)) }, 'Quitar') : null);
  }

  function renderItemDialog() {
    const e = S.by.get(S.dlgKey);
    if (!e) { dlgItem.close(); return; }
    const d = S.draft;
    const cats = e.type === 'game' ? S.meta.gameGenres : S.meta.toolCategories;
    const t = TYPE[e.type];

    const inTitle = el('input', { type: 'text', id: 'f-title', value: d.title, placeholder: e.autoTitle, maxlength: 120, oninput: ev => { d.title = ev.target.value; } });
    const inDesc = el('textarea', { id: 'f-desc', placeholder: 'Escribe una descripción…', maxlength: 4000, oninput: ev => { d.description = ev.target.value; } });
    inDesc.value = d.description;
    const inArgs = el('input', { type: 'text', id: 'f-args', value: d.args, placeholder: '-windowed -novid', maxlength: 1000, spellcheck: 'false', oninput: ev => { d.args = ev.target.value; } });

    const save = el('button', { class: 'btn primary', type: 'button', onclick: async () => {
      const v = await itemAction(() => api.update(e.key, { title: d.title, description: d.description === e.description && !e.custom.description ? null : d.description, args: d.args }), 'Cambios guardados');
      if (v) S.draft = { key: v.key, title: v.custom.title ? v.title : '', description: v.description, args: v.args };
      if (v) renderItemDialog();
    } }, 'Guardar cambios');

    const catSel = el('select', { id: 'f-cat', onchange: ev => itemAction(() => api.update(e.key, { classification: { type: e.type, category: ev.target.value } })) },
      (cats.includes(e.category) ? cats : [e.category, ...cats]).map(c => el('option', { value: c, text: c })));
    catSel.value = e.category;

    const body = el('div', { class: 'dlg-body' },
      el('section', { class: 'sec' },
        el('h3', { text: 'Inicio' }),
        el('p', { text: 'Estos argumentos se añaden cada vez que lo inicias desde aquí.' }),
        el('div', { class: 'field' }, el('label', { for: 'f-args', text: 'Argumentos de lanzamiento' }), inArgs)),
      el('section', { class: 'sec' },
        el('h3', { text: 'Archivos locales' }),
        e.location ? el('div', { class: 'path', text: e.location }) : el('p', { text: 'No se conoce la carpeta de instalación.' }),
        el('button', { class: 'btn', type: 'button', onclick: () => itemAction(() => api.openFolder(e.key)) }, icon('folder'), 'Abrir carpeta')),
      el('section', { class: 'sec' },
        el('h3', { text: 'Buscar información' }),
        el('p', { text: 'Vuelve a buscar banner, logo y descripción en Steam, GOG, Wikipedia y, si hay clave, RAWG y SteamGridDB. Solo se acepta un resultado con el mismo título.' }),
        el('button', { class: 'btn', type: 'button', onclick: async ev => {
          const b = ev.currentTarget; b.disabled = true; b.textContent = 'Buscando…';
          try {
            const r = await api.refind(e.key);
            await itemAction(async () => r.entry);
            toast(r.found.description || r.found.images ? 'Información actualizada.' : 'No se encontró ninguna coincidencia segura para este título.', r.found.description || r.found.images ? 'ok' : 'info', 6000);
          } catch (err) { toast(errMsg(err), 'error', 8000); }
          if (b.isConnected) { b.disabled = false; b.textContent = 'Buscar de nuevo'; }
        } }, 'Buscar de nuevo')),
      el('section', { class: 'sec' },
        el('h3', { text: 'Personalizar' }),
        el('p', { text: 'Cambia cómo se muestra. El original se puede restaurar.' }),
        el('div', { class: 'field' }, el('label', { for: 'f-title', text: 'Título' }), inTitle),
        el('div', { class: 'field' }, el('label', { for: 'f-desc', text: 'Descripción' }), inDesc),
        imageRow(e, 'banner', 'Banner'), imageRow(e, 'logo', 'Logo'),
        el('div', { class: 'inline' },
          save,
          el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
            const v = await itemAction(() => api.resetAppearance(e.key), 'Valores originales restaurados');
            if (v) { S.draft = { key: v.key, title: '', description: v.description, args: d.args }; renderItemDialog(); }
          } }, 'Restaurar originales'))),
      el('section', { class: 'sec' },
        el('h3', { text: 'Clasificación' }),
        el('p', { text: e.overridden ? 'La asignaste tú.' : 'Se asignó automáticamente.' }),
        el('div', { class: 'field' }, el('label', { for: 'f-cat', text: e.type === 'game' ? 'Género' : 'Categoría' }), catSel),
        el('div', { class: 'inline' },
          el('button', { class: 'btn', type: 'button', onclick: () => itemAction(() => api.update(e.key, { classification: { type: t.moveTo, category: t.moveTo === 'game' ? 'Sin género' : 'Sin clasificar' } }), t.moveTo === 'game' ? 'Movido a Juegos' : 'Movido a Software') }, t.moveLabel),
          e.overridden ? el('button', { class: 'btn ghost', type: 'button', onclick: () => itemAction(() => api.update(e.key, { classification: null }), 'Clasificación automática restaurada') }, 'Restaurar automática') : null)),
      el('section', { class: 'sec' },
        el('h3', { text: 'Desinstalar' }),
        el('p', { text: e.canUninstall ? 'Usa el desinstalador que registró en Windows.' : 'No tiene desinstalador registrado en Windows.' }),
        el('button', { class: 'btn danger', type: 'button', disabled: !e.canUninstall, onclick: async () => {
          const r = await itemAction(() => api.uninstall(e.key));
          if (r && r.started) { dlgItem.close(); toast('Desinstalador iniciado. La lista se actualizará al terminar.', 'ok', 7000); }
        } }, icon('trash'), 'Desinstalar')));

    dlgItem.replaceChildren(
      el('div', { class: 'dlg-head' }, el('h2', { id: 'dlg-item-title', text: e.title }),
        el('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Cerrar', onclick: () => dlgItem.close() }, icon('x'))),
      body,
      el('div', { class: 'dlg-foot' }, el('button', { class: 'btn', type: 'button', onclick: () => dlgItem.close() }, 'Cerrar')));
  }

  // ========================================================= ajustes de la app ==
  const dlgApp = $('dlg-app');

  function sw(checked, onchange, label, disabled) {
    return el('label', { class: 'switch' }, el('input', { type: 'checkbox', role: 'switch', checked: checked || null, disabled: disabled || null, 'aria-label': label, onchange: ev => onchange(ev.target.checked) }), el('span'));
  }
  async function setSetting(patch) {
    try { S.settings = { ...S.settings, ...(await api.setSettings(patch)) }; applySettings(); }
    catch (e) { toast(errMsg(e), 'error'); }
  }

  // ----------------------------------------------------- importar / exportar datos --
  const dlgData = $('dlg-data');

  async function doDataExport() {
    try {
      const r = await api.dataExport();
      if (!r || !r.saved) return;
      const m = r.summary || {};
      toast(`Datos exportados: ${plural(m.games || 0, 'juego con horas', 'juegos con horas')}, ${plural(m.customized || 0, 'ficha personalizada', 'fichas personalizadas')}, ${plural(m.images || 0, 'imagen', 'imágenes')}.`, 'ok', 9000);
    } catch (e) { toast(errMsg(e), 'error', 8000); }
  }

  async function doDataImport() {
    let info;
    try { info = await api.dataImportPick(); }
    catch (e) { toast(errMsg(e), 'error', 9000); return; }
    if (!info) return;
    openImportDialog(info);
  }

  function openImportDialog(info) {
    let mode = 'merge';
    let withSettings = false;
    const date = info.createdAt ? new Date(info.createdAt) : null;
    const when = date && !isNaN(date) ? date.toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }) : 'fecha desconocida';
    const note = el('p', { class: 'dim' });
    const apply = el('button', { class: 'btn primary', type: 'button' }, 'Importar');
    const modeBtn = (v, label) => el('button', { type: 'button', 'aria-pressed': v === mode ? 'true' : 'false', onclick: ev => {
      mode = v;
      for (const b of ev.currentTarget.parentNode.children) b.setAttribute('aria-pressed', b === ev.currentTarget ? 'true' : 'false');
      paint();
    } }, label);
    function paint() {
      note.textContent = mode === 'merge'
        ? 'Se suma a lo que ya tienes. De las horas se conserva el valor mayor de cada juego (nunca se suman, así importar dos veces no las duplica). Lo importado sustituye a tu personalización y solo se rellenan los datos online que faltan.'
        : 'Lo que hay ahora (horas, personalización y datos online) se sustituye por el contenido del archivo. Antes se guarda una copia por si te arrepientes.';
    }
    const row = (label, value) => el('div', { class: 'opt' }, el('div', { class: 'opt-text' }, el('b', { text: label })), el('span', { class: 'dim', text: String(value) }));
    apply.onclick = async () => {
      apply.disabled = true;
      try {
        const r = await api.dataImportApply({ mode, settings: withSettings });
        dlgData.close();
        applyPayload(r);
        if (withSettings) { S.settings = { ...S.settings, ...r.settings }; applySettings(); }
        toast(`Importado: ${plural(r.stats.games, 'juego actualizado', 'juegos actualizados')}, ${plural(r.stats.customized, 'ficha personalizada', 'fichas personalizadas')}, ${plural(r.stats.images, 'imagen', 'imágenes')}. Copia previa guardada.`, 'ok', 9000);
      } catch (e) { apply.disabled = false; toast(errMsg(e), 'error', 9000); }
    };
    dlgData.replaceChildren(
      el('div', { class: 'dlg-head' }, el('h2', { id: 'dlg-data-title', text: 'Importar datos' })),
      el('div', { class: 'dlg-body' },
        el('p', { class: 'dim', text: `${info.name} · creado el ${when}${info.appVersion ? ' · GameUtil ' + info.appVersion : ''}` }),
        row('Juegos con horas', `${info.games} (${info.hours} h en total)`),
        row('Fichas personalizadas', info.customized),
        row('Datos online', info.online),
        row('Imágenes propias', info.images),
        el('div', { class: 'opt' }, el('div', { class: 'opt-text' }, el('b', { text: 'Cómo importar' })),
          el('div', { class: 'choice', role: 'group', 'aria-label': 'Modo de importación' }, modeBtn('merge', 'Combinar'), modeBtn('replace', 'Reemplazar'))),
        note,
        info.hasSettings ? el('div', { class: 'opt' }, el('div', { class: 'opt-text' }, el('b', { text: 'Importar también los ajustes' }), el('span', { text: 'Tema, transiciones, pantalla de carga y segundo plano.' })),
          sw(false, v => { withSettings = v; }, 'Importar también los ajustes')) : null),
      el('div', { class: 'dlg-foot' },
        el('button', { class: 'btn', type: 'button', onclick: () => dlgData.close() }, 'Cancelar'), apply));
    paint();
    dlgData.showModal();
  }

  function openApp() { renderAppDialog(); if (!dlgApp.open) dlgApp.showModal(); loadFiles(); }

  function renderAppDialog() {
    const s = S.settings;
    const themeBtn = (v, label) => el('button', { type: 'button', 'aria-pressed': s.theme === v ? 'true' : 'false', onclick: async () => { await setSetting({ theme: v }); renderAppDialog(); loadFiles(); } }, label);
    const keyIn = el('input', { type: 'text', id: 's-key', placeholder: s.hasSgdbKey ? 'Clave guardada (cifrada)' : 'Clave de la API', autocomplete: 'off', spellcheck: 'false' });
    const rawgIn = el('input', { type: 'text', id: 's-rawg', placeholder: s.hasRawgKey ? 'Clave guardada (cifrada)' : 'Clave de la API', autocomplete: 'off', spellcheck: 'false' });
    const exp = (type, label) => ['csv', 'json'].map(f => el('button', { class: 'btn small', type: 'button', onclick: async () => {
      try {
        const keys = S.entries.filter(e => e.type === type).map(e => e.key);
        const r = await api.exportList({ type, format: f, keys });
        if (r && r.saved) toast(`Guardado: ${plural(r.count, 'elemento', 'elementos')} en ${r.path}`, 'ok', 8000);
      } catch (e) { toast(errMsg(e), 'error'); }
    } }, `${label} en ${f.toUpperCase()}`));

    dlgApp.replaceChildren(
      el('div', { class: 'dlg-head' }, el('h2', { id: 'dlg-app-title', text: 'Ajustes de la aplicación' }),
        el('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Cerrar', onclick: () => dlgApp.close() }, icon('x'))),
      el('div', { class: 'dlg-body' },
        el('section', { class: 'sec' },
          el('h3', { text: 'Apariencia' }),
          el('div', { class: 'opt' }, el('div', { class: 'opt-text' }, el('b', { text: 'Tema' }), el('span', { text: 'Automático sigue el de Windows.' })),
            el('div', { class: 'choice', role: 'group', 'aria-label': 'Tema' }, themeBtn('auto', 'Automático'), themeBtn('light', 'Claro'), themeBtn('dark', 'Oscuro'))),
          el('div', { class: 'opt' }, el('div', { class: 'opt-text' }, el('b', { text: 'Transiciones y fondos animados' }), el('span', { text: 'Desactívalas para ahorrar recursos en equipos modestos.' })),
            sw(s.transitions, v => setSetting({ transitions: v }), 'Transiciones y fondos animados')),
          el('div', { class: 'opt' }, el('div', { class: 'opt-text' }, el('b', { text: 'Pantalla de carga al abrir' }), el('span', { text: 'La animación de GameUtil que aparece al iniciar.' })),
            sw(s.splash !== false, v => setSetting({ splash: v }), 'Pantalla de carga al abrir'))),
        el('section', { class: 'sec' },
          el('h3', { text: 'Segundo plano' }),
          el('div', { class: 'opt' }, el('div', { class: 'opt-text' }, el('b', { text: 'Al pulsar la X' }), el('span', { text: 'Qué hacer al cerrar la ventana.' })),
            el('div', { class: 'choice', role: 'group', 'aria-label': 'Al pulsar la X' },
              ...[['ask', 'Preguntar'], ['tray', 'Bandeja'], ['quit', 'Cerrar']].map(([v, l]) => el('button', { type: 'button', 'aria-pressed': s.closeAction === v ? 'true' : 'false', onclick: async () => { await setSetting({ closeAction: v }); renderAppDialog(); loadFiles(); } }, l)))),
          el('div', { class: 'opt' }, el('div', { class: 'opt-text' }, el('b', { text: 'Iniciar GameUtil con Windows' }), el('span', { text: s.canAutoStart ? 'Se abre al iniciar sesión, en la bandeja si el segundo plano está activo.' : 'Disponible en la versión instalada o portable, no con npm start.' })),
            sw(s.autoStart, v => setSetting({ autoStart: v }), 'Iniciar con Windows', !s.canAutoStart)),
          el('div', { class: 'opt' }, el('div', { class: 'opt-text' }, el('b', { text: 'Seguir contando horas con la ventana cerrada' }), el('span', { text: 'La app queda en la bandeja del sistema. Se cierra del todo desde su icono.' })),
            sw(s.background, v => setSetting({ background: v }), 'Seguir en segundo plano'))),
        el('section', { class: 'sec' },
          el('h3', { text: 'Datos online' }),
          el('p', { text: 'Trae descripción, desarrollador, editor, banner y logo desde Steam y Wikipedia. Solo se envía el nombre de cada elemento.' }),
          el('div', { class: 'opt' }, el('div', { class: 'opt-text' }, el('b', { text: 'Completar automáticamente lo que no tiene imagen ni descripción' }), el('span', { text: 'Se ejecuta en segundo plano tras escanear y al abrir la app. Solo acepta coincidencias exactas de nombre.' })),
            sw(s.autoFill, v => setSetting({ autoFill: v }), 'Completar automáticamente')),
          el('div', { class: 'field' }, el('label', { for: 's-key', text: 'Clave de SteamGridDB (opcional, para más imágenes)' }),
            el('div', { class: 'inline' }, keyIn,
              el('button', { class: 'btn', type: 'button', disabled: !s.canEncrypt, onclick: async () => {
                try { S.settings = { ...S.settings, ...(await api.setSgdbKey(keyIn.value)) }; toast('Clave guardada, cifrada con tu cuenta de Windows.', 'ok'); renderAppDialog(); }
                catch (e) { toast(errMsg(e), 'error'); }
              } }, 'Guardar clave'),
              s.hasSgdbKey ? el('button', { class: 'btn ghost', type: 'button', onclick: async () => { S.settings = { ...S.settings, ...(await api.setSgdbKey(null)) }; renderAppDialog(); } }, 'Quitar') : null)),
          el('div', { class: 'field' }, el('label', { for: 's-rawg', text: 'Clave de RAWG (opcional, para más descripciones y banners)' }),
            el('div', { class: 'inline' }, rawgIn,
              el('button', { class: 'btn', type: 'button', disabled: !s.canEncrypt, onclick: async () => {
                try { S.settings = { ...S.settings, ...(await api.setRawgKey(rawgIn.value)) }; toast('Clave guardada, cifrada con tu cuenta de Windows.', 'ok'); renderAppDialog(); }
                catch (e) { toast(errMsg(e), 'error', 8000); }
              } }, 'Guardar clave'),
              s.hasRawgKey ? el('button', { class: 'btn ghost', type: 'button', onclick: async () => { S.settings = { ...S.settings, ...(await api.setRawgKey(null)) }; renderAppDialog(); } }, 'Quitar') : null)),
          el('button', { class: 'btn', type: 'button', onclick: () => { dlgApp.close(); doOnline(); } }, icon('cloud'), 'Buscar datos e imágenes ahora')),
        el('section', { class: 'sec' },
          el('h3', { text: 'Copia de tus datos' }),
          el('p', { text: 'Guarda en un solo archivo .gameutil tus horas, descripciones, títulos, argumentos de lanzamiento, categorías, imágenes propias y datos online. Útil para cambiar de equipo o reinstalar.' }),
          el('div', { class: 'inline' },
            el('button', { class: 'btn', type: 'button', onclick: doDataExport }, 'Exportar todos los datos'),
            el('button', { class: 'btn', type: 'button', onclick: doDataImport }, 'Importar datos…'))),
        el('section', { class: 'sec' },
          el('h3', { text: 'Exportar listas' }),
          el('p', { text: 'Se exporta cada pestaña por separado, con su orden actual.' }),
          el('div', { class: 'inline' }, exp('game', 'Juegos'), exp('tool', 'Software'))),
        el('section', { class: 'sec' },
          el('h3', { text: 'Ayuda' }),
          el('div', { class: 'opt' }, el('div', { class: 'opt-text' }, el('b', { text: 'Tutorial de la interfaz' }), el('span', { text: 'Repasa las partes principales de GameUtil.' })),
            el('button', { class: 'btn', type: 'button', onclick: () => { dlgApp.close(); setTimeout(startTour, 280); } }, 'Ver tutorial'))),
        el('section', { class: 'sec' },
          el('h3', { text: 'Datos guardados' }),
          el('p', { text: 'Todo se guarda en tu equipo. Las horas llevan suma de comprobación y copias automáticas.' }),
          el('div', { class: 'files', id: 'files' }, el('p', { text: 'Cargando…' })))),
      el('div', { class: 'dlg-foot' }, el('button', { class: 'btn', type: 'button', onclick: () => dlgApp.close() }, 'Cerrar')));
  }

  async function loadFiles() {
    const box = document.getElementById('files');
    if (!box) return;
    try {
      const list = await api.files();
      box.replaceChildren(...list.map(f => el('div', { class: 'file' },
        el('div', { class: 'file-name' }, el('b', { text: f.label }), el('span', { text: `${f.file} — ${f.note}` })),
        el('div', { class: 'file-size', text: f.size == null ? '—' : fmtSize(f.size) }),
        el('button', { class: 'btn small', type: 'button', onclick: () => api.revealFile(f.id).catch(e => toast(errMsg(e), 'error')) }, 'Mostrar'))));
    } catch (e) { box.replaceChildren(el('p', { text: 'No se pudo leer la lista: ' + errMsg(e) })); }
  }

  // ================================================================ tutorial ==
  function startTour() {
    if (!window.Tour || window.Tour.isActive()) return;
    if (dlgItem.open) dlgItem.close();
    if (dlgApp.open) dlgApp.close();
    window.Tour.start({});
    // se marca como visto al empezar: si lo cierras sin terminar, no vuelve a salir solo
    if (!S.settings.tutorialDone) {
      S.settings.tutorialDone = true;
      api.setSettings({ tutorialDone: true }).catch(() => {});
    }
  }

  // ============================================================= eventos / inicio ==
  document.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.type)));
  let searchTimer = null;
  $('search').addEventListener('input', ev => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { S.query = ev.target.value; renderList(); }, 80); });
  $('sort').addEventListener('change', ev => { S.sort = ev.target.value; renderList(); persistView(); });
  $('filter').addEventListener('change', ev => { S.filter[S.tab] = ev.target.value; renderList(); });
  $('btn-scan').replaceChildren(icon('refresh'), 'Escanear');
  $('btn-online').replaceChildren(icon('cloud'), 'Datos online');
  $('btn-settings').replaceChildren(icon('gear'));
  $('btn-scan').addEventListener('click', doScan);
  $('btn-online').addEventListener('click', doOnline);
  $('btn-settings').addEventListener('click', openApp);
  $('busy-cancel').addEventListener('click', () => api.onlineCancel());

  $('win-min').replaceChildren(icon('min'));
  $('win-max').replaceChildren(icon('max'));
  $('win-close').replaceChildren(icon('close'));
  $('win-min').addEventListener('click', () => api.win.minimize());
  $('win-max').addEventListener('click', () => api.win.toggleMaximize());
  $('win-close').addEventListener('click', () => api.win.close());

  // Desplegable al cerrar: minimizar a la bandeja o cerrar por completo.
  const closeMenu = $('close-menu');
  function hideCloseMenu() { closeMenu.hidden = true; document.removeEventListener('pointerdown', onOutside, true); document.removeEventListener('keydown', onCloseKey, true); }
  function onOutside(ev) { if (!closeMenu.contains(ev.target)) hideCloseMenu(); }
  function onCloseKey(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); hideCloseMenu(); } }
  function showCloseMenu() {
    if (!closeMenu.hidden) return;
    $('cm-remember').checked = false;
    closeMenu.hidden = false;
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onCloseKey, true);
    $('cm-tray').focus();
  }
  async function chooseClose(choice) {
    const remember = $('cm-remember').checked;
    hideCloseMenu();
    try { const s = await api.win.closeChoice(choice, remember); if (s) S.settings = { ...S.settings, ...s }; }
    catch (e) { toast(errMsg(e), 'error'); }
  }
  $('cm-tray').addEventListener('click', () => chooseClose('tray'));
  $('cm-quit').addEventListener('click', () => chooseClose('quit'));
  api.on('win:askClose', showCloseMenu);
  api.on('win:maximized', m => $('win-max').replaceChildren(icon(m ? 'restore' : 'max')));

  $('list').addEventListener('keydown', ev => {
    const keys = visible().map(e => e.key);
    const i = keys.indexOf(S.sel[S.tab]);
    let n = null;
    if (ev.key === 'ArrowDown') n = Math.min(keys.length - 1, i + 1);
    else if (ev.key === 'ArrowUp') n = Math.max(0, i - 1);
    else if (ev.key === 'Home') n = 0;
    else if (ev.key === 'End') n = keys.length - 1;
    else if (ev.key === 'Enter' && i >= 0) { launch(keys[i]); ev.preventDefault(); return; }
    if (n != null && keys.length) { ev.preventDefault(); select(keys[n], true); }
  });
  document.addEventListener('keydown', ev => {
    if ((ev.ctrlKey && ev.key.toLowerCase() === 'f') || (ev.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) {
      ev.preventDefault(); $('search').focus(); $('search').select();
    }
  });
  for (const d of [dlgItem, dlgApp]) {
    d.addEventListener('click', ev => { if (ev.target === d) d.close(); });
  }
  dlgItem.addEventListener('close', () => { S.dlgKey = null; S.draft = null; });

  api.on('library:update', list => {
    for (const v of list) mergeEntry(v);
    renderList();
    const cur = S.by.get(S.sel[S.tab]);
    if (cur && list.some(v => v.key === cur.key)) renderDetail(false);
    if (S.dlgKey && list.some(v => v.key === S.dlgKey) && dlgItem.open) { /* el diálogo no se rehace para no pisar lo que se escribe */ }
  });
  api.on('library:changed', async () => { try { applyPayload(await api.state()); } catch { /* se mantiene lo que hay */ } });
  api.on('auto:status', p => {
    const box = $('auto-status');
    box.hidden = !p;
    if (p) box.textContent = `Buscando datos: ${p.done + 1} de ${p.total} · ${p.name}`;
  });
  api.on('auto:done', r => toast(`Se completaron datos de ${plural(r.filled, 'elemento', 'elementos')} que no tenían imagen ni descripción.`, 'ok', 6000));
  api.on('online:progress', p => setBusy('online', `Consultando ${p.done + 1} de ${p.total}: ${p.name}`, (p.done + 1) / p.total));

  (async () => {
    try {
      const p = await api.state();
      const v = p.settings && p.settings.view;
      if (v) { S.tab = v.type === 'tool' ? 'tool' : 'game'; S.sort = v.sort || 'name'; if (v.key) S.sel[S.tab] = v.key; }
      applyPayload(p);
      for (const b of document.querySelectorAll('.seg-btn')) b.setAttribute('aria-selected', b.dataset.type === S.tab ? 'true' : 'false');
      if (S.demo) toast('Datos de demostración: ejecuta la app en Windows para ver tu biblioteca real.', 'info', 7000);
      await Splash.finish();
      if (!S.settings.tutorialDone) setTimeout(startTour, 500);
    } catch (e) { Splash.finish(); toast('No se pudieron cargar los datos: ' + errMsg(e), 'error', 9000); renderDetail(true); }
  })();
})();

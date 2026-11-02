'use strict';
// Tutorial de primera vez: un foco que se desliza entre las zonas importantes y una tarjeta con la explicación.
(function (root) {
  const STEPS = [
    { id: 'welcome', title: 'Bienvenido a GameUtil',
      body: 'Tu biblioteca de juegos y programas en un solo lugar. Te enseñamos lo esencial en menos de un minuto.' },
    { id: 'tabs', target: ['.seg'], title: 'Juegos y software, por separado',
      body: 'Cada elemento aparece en una sola pestaña. Si algo está mal clasificado, lo cambias desde su engranaje.' },
    { id: 'library', target: ['.side-top', '#list'], title: 'Tu biblioteca',
      body: 'Elige un elemento para ver su portada. Busca por nombre con Ctrl+F y ordena por nombre, más jugados o recientes.' },
    { id: 'scan', target: ['#btn-scan'], title: 'Escanear el sistema',
      body: 'Detecta lo instalado en Windows, incluidos Steam y Epic. Hazlo la primera vez y cuando instales algo nuevo.' },
    { id: 'online', target: ['#btn-online'], title: 'Datos online',
      body: 'Trae descripción, estudio, banner y logo. Lo que no tenga nada se completa solo, en segundo plano.' },
    { id: 'cover', target: ['.head', '.facts'], title: 'La portada',
      body: 'Horas jugadas, desarrollador, editor y descripción. Las horas de Steam se leen de Steam; en el resto se cuentan desde que abres el juego desde aquí.',
      empty: 'Al elegir un elemento verás su portada con las horas jugadas, el desarrollador, el editor y la descripción. Las horas de Steam se leen de Steam; en el resto se cuentan desde que abres el juego desde aquí.' },
    { id: 'actions', target: ['.actions'], title: 'Jugar y ajustes del elemento',
      body: 'Jugar lo inicia. El engranaje permite añadir argumentos de lanzamiento, abrir sus archivos, desinstalar y personalizar título, descripción, banner y logo.',
      empty: 'Cada elemento tiene un botón para iniciarlo y un engranaje con sus ajustes: argumentos de lanzamiento, archivos locales, desinstalar y personalizar título, descripción, banner y logo.' },
    { id: 'settings', target: ['#btn-settings'], title: 'Ajustes de la aplicación',
      body: 'Tema claro u oscuro, transiciones, segundo plano y los archivos que se guardan. Desde aquí también puedes repetir este tutorial.' },
    { id: 'done', title: 'Todo listo', body: 'Pulsa Escanear para detectar tus juegos y programas.', last: true }
  ];

  // ------------------------------------------------------------ geometría ----

  function unionRect(rects) {
    if (!rects.length) return null;
    const x1 = Math.min(...rects.map(r => r.x)), y1 = Math.min(...rects.map(r => r.y));
    const x2 = Math.max(...rects.map(r => r.x + r.w)), y2 = Math.max(...rects.map(r => r.y + r.h));
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function padRect(r, pad, vp) {
    const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad);
    return { x, y, w: Math.min(vp.w, r.x + r.w + pad) - x, h: Math.min(vp.h, r.y + r.h + pad) - y };
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Sitúa la tarjeta junto al objetivo: a la derecha si cabe, si no arriba, abajo o a la izquierda.
  function placeCard(rect, card, vp, { gap = 18, margin = 16 } = {}) {
    if (!rect) return { x: Math.round((vp.w - card.w) / 2), y: Math.round((vp.h - card.h) / 2), side: 'center' };
    const room = {
      right: vp.w - (rect.x + rect.w) - margin, left: rect.x - margin,
      bottom: vp.h - (rect.y + rect.h) - margin, top: rect.y - margin
    };
    const need = { right: card.w + gap, left: card.w + gap, bottom: card.h + gap, top: card.h + gap };
    const order = ['right', 'top', 'bottom', 'left'];
    let side = order.find(s => room[s] >= need[s]);
    if (!side) side = order.slice().sort((a, b) => (room[b] - need[b]) - (room[a] - need[a]))[0];
    let x, y;
    if (side === 'right') { x = rect.x + rect.w + gap; y = rect.y + rect.h / 2 - card.h / 2; }
    else if (side === 'left') { x = rect.x - gap - card.w; y = rect.y + rect.h / 2 - card.h / 2; }
    else if (side === 'bottom') { x = rect.x + rect.w / 2 - card.w / 2; y = rect.y + rect.h + gap; }
    else { x = rect.x + rect.w / 2 - card.w / 2; y = rect.y - gap - card.h; }
    return {
      x: Math.round(clamp(x, margin, Math.max(margin, vp.w - card.w - margin))),
      y: Math.round(clamp(y, margin, Math.max(margin, vp.h - card.h - margin))),
      side
    };
  }

  // ------------------------------------------------------------------ DOM ----

  let active = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function motionOff() {
    return document.body.dataset.motion === 'off' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function visibleRect(sel) {
    const n = document.querySelector(sel);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  function start({ steps = STEPS, onEnd } = {}) {
    if (active) return active;
    const prevFocus = document.activeElement;
    let i = 0, ended = false, first = true, timer = null;

    const overlay = el('div', 'tour');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'tour-title');
    const spot = el('div', 'tour-spot');
    const card = el('div', 'tour-card');
    const body = el('div', 'tour-body');
    body.setAttribute('aria-live', 'polite');
    const count = el('div', 'tour-count');
    const title = el('h2'); title.id = 'tour-title';
    const text = el('p');
    body.append(count, title, text);
    const bar = el('div', 'tour-bar');
    bar.setAttribute('aria-hidden', 'true');
    for (let k = 0; k < steps.length; k++) bar.append(el('i'));
    const skip = el('button', 'btn ghost small', 'Omitir');
    const back = el('button', 'btn small', 'Anterior');
    const next = el('button', 'btn primary small');
    for (const b of [skip, back, next]) b.type = 'button';
    const actions = el('div', 'tour-actions');
    actions.append(skip, el('span', 'spacer'), back, next);
    card.append(body, bar, actions);
    overlay.append(spot, card);
    document.body.append(overlay);

    function vp() { return { w: window.innerWidth, h: window.innerHeight }; }

    function layout(step, animate) {
      const v = vp();
      const rects = (step.target || []).map(visibleRect).filter(Boolean);
      const u = unionRect(rects);
      const pad = padRect(u || { x: v.w / 2, y: v.h / 2, w: 0, h: 0 }, u ? 8 : 0, v);
      spot.style.left = pad.x + 'px'; spot.style.top = pad.y + 'px';
      spot.style.width = pad.w + 'px'; spot.style.height = pad.h + 'px';
      spot.classList.toggle('empty', !u);
      return { hasTarget: !!u, rect: u ? pad : null };
    }

    function fill(step, hasTarget) {
      count.textContent = `${i + 1} de ${steps.length}`;
      title.textContent = step.title;
      text.textContent = hasTarget || !step.empty ? step.body : step.empty;
      bar.childNodes.forEach((n, k) => n.classList.toggle('on', k <= i));
      back.hidden = i === 0;
      skip.hidden = !!step.last;
      next.textContent = i === 0 ? 'Empezar' : step.last ? 'Terminar' : 'Siguiente';
    }

    function place(rect, animate) {
      const size = { w: card.offsetWidth, h: card.offsetHeight };
      const p = placeCard(rect, size, vp());
      if (!animate) card.style.transition = 'none';
      card.style.transform = `translate(${p.x}px, ${p.y}px)`;
      if (!animate) { void card.offsetWidth; card.style.transition = ''; }
    }

    function show() {
      const step = steps[i];
      const { hasTarget, rect } = layout(step, !first);
      const swap = () => {
        fill(step, hasTarget);
        place(rect, !first);
        body.classList.remove('swap');
        first = false;
        next.focus({ preventScroll: true });
      };
      clearTimeout(timer);
      if (first || motionOff()) swap();
      else { body.classList.add('swap'); timer = setTimeout(swap, 140); }
    }

    function go(d) {
      const n = i + d;
      if (n < 0) return;
      if (n >= steps.length) { finish('done'); return; }
      i = n;
      show();
    }

    function onKey(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish('skipped'); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); go(1); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); go(-1); }
      else if (ev.key === 'Tab') {
        const items = [skip, back, next].filter(b => !b.hidden);
        const idx = items.indexOf(document.activeElement);
        ev.preventDefault();
        items[(idx + (ev.shiftKey ? -1 : 1) + items.length) % items.length].focus();
      }
    }
    const onResize = () => { const s = steps[i]; const { rect } = layout(s, false); place(rect, false); };

    function finish(reason) {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      active = null;
      if (onEnd) onEnd(reason);
      const remove = () => {
        overlay.remove();
        if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      };
      if (motionOff()) remove(); else { overlay.classList.add('out'); setTimeout(remove, 260); }
    }

    next.addEventListener('click', () => go(1));
    back.addEventListener('click', () => go(-1));
    skip.addEventListener('click', () => finish('skipped'));
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);

    active = { next: () => go(1), prev: () => go(-1), finish, get step() { return i; }, get total() { return steps.length; } };
    show();
    return active;
  }

  const api = { start, STEPS, placeCard, unionRect, padRect, isActive: () => !!active };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Tour = api;
})(typeof window !== 'undefined' ? window : globalThis);

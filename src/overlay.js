// Injected into the app page while recording. Draws what a screen recording of a person would
// show (a cursor and click ripples) plus video furniture: captions, title cards, zoom, highlight.
// Everything lives in #demoreel on <html>, outside <body>, so zooming <body> never moves it.
(() => {
  if (window.__demoreel) return;
  const css = `
    #demoreel, #demoreel * { box-sizing: border-box; }
    #demoreel { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; }
    #dr-cursor { position: absolute; left: 0; top: 0; width: 26px; height: 26px; transform: translate(-100px, -100px); filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    .dr-ripple { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid rgba(47, 107, 255, .85); background: rgba(47, 107, 255, .18); animation: dr-ripple .55s ease-out forwards; }
    @keyframes dr-ripple { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.5); opacity: 0; } }
    #dr-caption { position: absolute; left: 50%; bottom: 34px; transform: translate(-50%, 12px); max-width: 78%; padding: 10px 20px; border-radius: 12px; background: rgba(15, 18, 28, .82); color: #fff; font-size: 23px; line-height: 1.35; font-weight: 500; text-align: center; opacity: 0; transition: opacity .25s, transform .25s; }
    #dr-caption.on { opacity: 1; transform: translate(-50%, 0); }
    #dr-card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: linear-gradient(135deg, #1b2a6b 0%, #2f5be0 55%, #4f8cff 100%); color: #fff; opacity: 0; transition: opacity .6s; text-align: center; padding: 0 10%; }
    #dr-card.on { opacity: 1; }
    #dr-card img { width: 112px; height: 112px; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,.3); }
    #dr-card h1 { margin: 0; font-size: 64px; font-weight: 700; letter-spacing: -.5px; }
    #dr-card p { margin: 0; font-size: 28px; opacity: .92; max-width: 900px; }
    #dr-card .dr-cta { margin-top: 14px; padding: 12px 26px; border-radius: 999px; background: #fff; color: #1b2a6b; font-size: 24px; font-weight: 600; }
    #dr-badge { position: absolute; left: 50%; top: 22px; transform: translate(-50%, -8px); padding: 8px 18px; border-radius: 999px; background: rgba(15, 18, 28, .85); color: #fff; font-size: 20px; font-weight: 600; opacity: 0; transition: opacity .25s, transform .25s; }
    #dr-badge.on { opacity: 1; transform: translate(-50%, 0); }
    #dr-ring { position: absolute; border: 4px solid #ffb020; border-radius: 12px; box-shadow: 0 0 0 9999px rgba(10, 12, 20, .35); opacity: 0; transition: opacity .35s, left .35s, top .35s, width .35s, height .35s; }
    #dr-ring.on { opacity: 1; }
    body { transition: transform .9s cubic-bezier(.45, 0, .2, 1); transform-origin: 0 0; }
    html.dr-noscroll ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    html.dr-nocursor, html.dr-nocursor * { cursor: none !important; }
  `;
  const root = document.createElement('div');
  root.id = 'demoreel';
  root.innerHTML = `<style>${css}</style>
    <div id="dr-ring"></div>
    <div id="dr-card"></div>
    <div id="dr-caption"></div>
    <div id="dr-badge"></div>
    <svg id="dr-cursor" viewBox="0 0 24 24"><path d="M4 2.5 L4 19 L8.6 14.9 L11.6 21.5 L14.6 20.2 L11.6 13.7 L17.8 13.7 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  document.documentElement.appendChild(root);
  document.documentElement.classList.add('dr-noscroll', 'dr-nocursor');
  const $ = (id) => root.querySelector('#' + id);
  const cursor = $('dr-cursor');

  document.addEventListener('mousemove', (e) => { cursor.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`; }, true);
  document.addEventListener('mousedown', (e) => {
    const r = document.createElement('div');
    r.className = 'dr-ripple';
    r.style.left = e.clientX + 'px';
    r.style.top = e.clientY + 'px';
    root.appendChild(r);
    setTimeout(() => r.remove(), 700);
  }, true);

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  window.__demoreel = {
    /** Script-level styling: extra page CSS (e.g. a tighter layout for portrait) and caption placement. */
    style({ css: pageCss, caption } = {}) {
      if (pageCss) {
        const s = document.createElement('style');
        s.textContent = pageCss;
        root.appendChild(s);
      }
      if (caption) {
        const c = $('dr-caption');
        if (caption.bottom != null) c.style.bottom = caption.bottom + 'px';
        if (caption.fontSize != null) c.style.fontSize = caption.fontSize + 'px';
        if (caption.maxWidth != null) c.style.maxWidth = caption.maxWidth;
      }
    },
    badge(text) {
      const b = $('dr-badge');
      if (!text) { b.classList.remove('on'); return; }
      b.textContent = text;
      b.classList.add('on');
    },
    caption(text) {
      const c = $('dr-caption');
      if (!text) { c.classList.remove('on'); return; }
      c.textContent = text;
      c.classList.add('on');
    },
    card(card) {
      const el = $('dr-card');
      if (!card) { el.classList.remove('on'); return; }
      el.innerHTML = `${card.image ? `<img src="${esc(card.image)}">` : ''}<h1>${esc(card.title)}</h1>${card.subtitle ? `<p>${esc(card.subtitle)}</p>` : ''}${card.cta ? `<div class="dr-cta">${esc(card.cta)}</div>` : ''}`;
      el.classList.add('on');
    },
    /** Zoom the page so the rectangle (viewport coords, unzoomed) fills about 1/scale of the screen. */
    zoom(rect, scale) {
      const b = document.body;
      if (!rect) { b.style.transform = ''; return; }
      const vw = innerWidth, vh = innerHeight;
      const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
      const tx = clamp(vw / 2 - scale * cx, vw - scale * vw, 0);
      const ty = clamp(vh / 2 - scale * cy, vh - scale * vh, 0);
      b.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    },
    ring(rect) {
      const r = $('dr-ring');
      if (!rect) { r.classList.remove('on'); return; }
      const pad = 8;
      Object.assign(r.style, { left: rect.x - pad + 'px', top: rect.y - pad + 'px', width: rect.width + 2 * pad + 'px', height: rect.height + 2 * pad + 'px' });
      r.classList.add('on');
    },
  };
})();

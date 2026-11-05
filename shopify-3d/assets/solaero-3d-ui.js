/* SOLAERO 3D – UI glue: opens the pill window on click, lazy-loads the engine + model, handles swatches/close/keyboard/scroll-lock.
 * Event-delegated and idempotent (safe if several model sections are on one page). Nothing 3D is downloaded until the button is hovered/touched/clicked. */
(function () {
  'use strict';
  if (window.__s3dUI) return; window.__s3dUI = true;
  var NS = (window.SOLAERO3D = window.SOLAERO3D || { models: {} });
  var loading = {}, active = null;

  function loadScript(src) {
    if (loading[src]) return loading[src];
    return (loading[src] = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = function () { delete loading[src]; rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    }));
  }
  function hex2rgb(c) {
    c = (c || '').trim(); var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (m) { var h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; }
    m = /rgba?\(([^)]+)\)/.exec(c); if (m) { var p = m[1].split(','); return [p[0] / 255, p[1] / 255, p[2] / 255]; }
    return [0.95, 0.95, 0.96];
  }
  function prefetch(root) {
    var eng = root.getAttribute('data-engine'); if (eng) loadScript(eng).catch(function () {});
    var first = root.querySelector('.s3d__swb[aria-checked="true"]') || root.querySelector('.s3d__swb'); if (first) { var u = first.getAttribute('data-src'); if (u) loadScript(u).catch(function () {}); }
  }
  function open(root) {
    if (active) return;
    var ov = root.querySelector('.s3d__overlay'); if (!ov) return;
    active = { root: root, ov: ov, parent: ov.parentNode, next: ov.nextSibling, viewer: null, opener: document.activeElement, interacted: false };
    var st = root.getAttribute('style'); if (st) ov.style.cssText += ';' + st;   // carry the section's colour variables along
    document.body.appendChild(ov);                      // escape any transformed/overflow-hidden ancestor of the buy box
    ov.hidden = false; void ov.offsetWidth; ov.classList.add('is-open'); document.documentElement.classList.add('s3d-lock');
    var cv = ov.querySelector('.s3d__canvas'), ld = ov.querySelector('.s3d__load'), msg = ov.querySelector('.s3d__msg'), hint = ov.querySelector('.s3d__hint');
    ov.querySelector('.s3d__close').focus({ preventScroll: true });
    if (hint && window.matchMedia && matchMedia('(pointer:coarse)').matches && hint.getAttribute('data-hint-touch')) hint.textContent = hint.getAttribute('data-hint-touch');
    if (hint) { var hide = function () { hint.classList.add('is-gone'); }; cv.addEventListener('pointerdown', hide, { once: true }); cv.addEventListener('wheel', hide, { once: true, passive: true }); setTimeout(hide, 6000); }
    var sel = ov.querySelector('.s3d__swb[aria-checked="true"]') || ov.querySelector('.s3d__swb');
    var step = loadScript(root.getAttribute('data-engine')).then(function () {
      var bg = hex2rgb(getComputedStyle(ov.querySelector('.s3d__win')).backgroundColor);
      active.viewer = NS.current = NS.Viewer(cv, { background: bg });
      return show(sel);
    }).then(function () { ld.classList.add('is-done'); })
      .catch(function (e) { if (!active) return; try { console.warn('[SOLAERO3D]', e); } catch (_) {} ld.classList.add('is-done'); cv.style.display = 'none'; var p = ov.querySelector('.s3d__poster'); if (p) p.hidden = false;
        if (msg) { msg.hidden = false; msg.textContent = (e && e.code === 'nowebgl') ? (msg.getAttribute('data-nowebgl') || '3D wird von diesem Gerät nicht unterstützt.') : (msg.getAttribute('data-error') || '3D konnte nicht geladen werden.'); } });
    return step;
  }
  function show(btn) {
    if (!active || !btn) return Promise.resolve();
    var ov = active.ov, ld = ov.querySelector('.s3d__load');
    ov.querySelectorAll('.s3d__swb').forEach(function (b) { b.setAttribute('aria-checked', b === btn ? 'true' : 'false'); });
    var src = btn.getAttribute('data-src'), key = btn.getAttribute('data-key');
    var ready = NS.models[key] ? Promise.resolve() : (ld.classList.remove('is-done'), loadScript(src));
    return ready.then(function () { if (active && active.viewer) { active.viewer.load(key); ld.classList.add('is-done'); } });
  }
  function close() {
    if (!active) return; var a = active; active = null;
    a.ov.classList.remove('is-open'); document.documentElement.classList.remove('s3d-lock');
    if (a.viewer) { try { a.viewer.destroy(); } catch (_) {} }
    setTimeout(function () { a.ov.hidden = true; if (a.parent) a.parent.insertBefore(a.ov, a.next); var cv = a.ov.querySelector('.s3d__canvas'); if (cv) { var n = cv.cloneNode(false); cv.parentNode.replaceChild(n, cv); n.style.display = ''; } }, 300);
    if (a.opener && a.opener.focus) a.opener.focus({ preventScroll: true });
  }
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t.closest) return;
    var o = t.closest('[data-s3d-open]'); if (o) { e.preventDefault(); open(o.closest('.s3d')); return; }
    if (!active) return;
    if (t.closest('.s3d__close') || t.classList.contains('s3d__scrim')) { close(); return; }
    var sw = t.closest('.s3d__swb'); if (sw && active.ov.contains(sw)) show(sw);
  });
  document.addEventListener('keydown', function (e) {
    if (!active) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Tab') {                               // keep focus inside the window
      var f = active.ov.querySelectorAll('button,[tabindex="0"]'); if (!f.length) return; var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  var pre = function (e) { var b = e.target.closest && e.target.closest('[data-s3d-open]'); if (b && !b.__s3dPre) { b.__s3dPre = 1; prefetch(b.closest('.s3d')); } };
  document.addEventListener('pointerover', pre, { passive: true }); document.addEventListener('touchstart', pre, { passive: true }); document.addEventListener('focusin', pre);
})();

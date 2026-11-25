/**
 * stage.js — bộ điều phối hiệu ứng chạy LIÊN TỤC, chuyển tiếp mượt giữa các
 * "trang" bằng một lớp màn (veil) tối: màn hiện tại tối dần -> đổi scene ->
 * sáng dần. Không bao giờ quay về nền tim idle sau khi đã bắt đầu.
 * Hết danh sách thì xáo lại và chạy vòng lặp từ đầu.
 *
 * Tương tác: con trỏ/chạm trên #stage được chuyển cho effect hiện tại
 * (cur.pointer(x,y) khi di, cur.tap(x,y) khi chạm) nếu effect có định nghĩa.
 * Mọi effect đều có thêm lớp chung: vệt sáng theo con trỏ + vòng nổ khi chạm.
 *
 * API:
 *   Stage.advance(cb)      -> bấm nút "yêu anh". cb(res) khi scene mới đã hiện ra.
 *   Stage.transitioning()  -> true khi đang crossfade.
 *   Stage.remaining()      -> số scene còn lại trong vòng lặp hiện tại.
 *   Stage.reset()          -> xáo lại thứ tự.
 */
'use strict';

(function () {
  const UP = 0.26, DOWN = 0.42;
  const TAU = Math.PI * 2;
  const PAL = [[255, 77, 109], [255, 140, 170], [255, 209, 102], [200, 120, 255]];

  let canvas, ctx;
  let w = 0, h = 0, dpr = 1;
  let order = [], idx = 0, cur = null, raf = 0, started = false;
  let lastT = 0, elapsed = 0;
  let veil = 0, mode = 'idle', advanceCb = null;
  const ptr = { x: -1e4, y: -1e4, ex: 0, ey: 0 };
  let sparkles = [], bursts = [];

  function resize() {
    if (!canvas) return;
    w = window.innerWidth; h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(3000000 / (w * h)));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (cur && cur.resize) cur.resize(w, h);
    sparkles = []; bursts = [];
  }

  function boot() {
    canvas = document.getElementById('stage');
    if (!canvas) return false;
    ctx = canvas.getContext('2d');
    order = window.FX.shuffled();
    resize();
    window.addEventListener('resize', resize);

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    // di chuột / chạm kéo: effect đáp ứng
    canvas.addEventListener('pointermove', (e) => {
      const p = pos(e); ptr.x = p.x; ptr.y = p.y;
      if (cur && cur.pointer) cur.pointer(p.x, p.y);
      emitTrail(false);
    });
    // chạm: effect tự xử, nếu không có thì Stage bung tim
    canvas.addEventListener('pointerdown', (e) => {
      const p = pos(e); ptr.x = p.x; ptr.y = p.y;
      if (cur && cur.pointer) cur.pointer(p.x, p.y);
      const custom = !!(cur && cur.tap);
      if (custom) cur.tap(p.x, p.y);
      bursts.push({ x: p.x, y: p.y, r: 6, life: 1 });
      if (!custom) {
        for (let i = 0; i < 18; i++) {
          const a = rnd(0, TAU), sp = rnd(90, 300);
          sparkles.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 1, max: rnd(0.8, 1.3), s: rnd(3, 7), heart: true, rot: rnd(0, TAU), vr: rnd(-3, 3), k: (Math.random() * PAL.length) | 0 });
        }
      }
      emitTrail(true);
    });
    canvas.addEventListener('pointerleave', () => { ptr.x = -1e4; ptr.y = -1e4; if (cur && cur.leave) cur.leave(); });
    return true;
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function emitTrail(force) {
    if (ptr.x < 0) return;
    const d = Math.hypot(ptr.x - ptr.ex, ptr.y - ptr.ey);
    if (!force && d < 12) return;
    ptr.ex = ptr.x; ptr.ey = ptr.y;
    const n = Math.min(4, (1 + d / 30) | 0);
    for (let i = 0; i < n && sparkles.length < 160; i++) {
      const heart = Math.random() < 0.2;
      sparkles.push({ x: ptr.x + rnd(-4, 4), y: ptr.y + rnd(-4, 4), vx: rnd(-20, 20), vy: rnd(-40, 10), life: 1, max: rnd(0.5, 0.9), s: heart ? rnd(3, 6) : rnd(1.2, 2.6), heart, rot: rnd(0, TAU), vr: rnd(-3, 3), k: (Math.random() * PAL.length) | 0 });
    }
  }

  function drawMiniHeart(c, x, y, s, rot, fill) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.beginPath(); c.moveTo(0, s * 0.5);
    c.bezierCurveTo(-s, -s * 0.6, -s * 0.6, -s * 1.5, 0, -s * 0.8);
    c.bezierCurveTo(s * 0.6, -s * 1.5, s, -s * 0.6, 0, s * 0.5);
    c.closePath(); c.fillStyle = fill; c.fill(); c.restore();
  }

  function clearOnce() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#08030c';
    ctx.fillRect(0, 0, w, h);
  }

  function pickNext() {
    if (idx >= order.length) { order = window.FX.shuffled(); idx = 0; }
    cur = window.FX.create(order[idx]); idx++;
    document.body.dataset.effect = cur.name;
    elapsed = 0;                                      // t của effect đếm từ lúc nó chạy
    cur.resize(w, h); cur.init(); clearOnce();
    sparkles = []; bursts = []; ptr.x = -1e4; ptr.y = -1e4;
    return { name: cur.name };
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000) || 0;
    lastT = now; elapsed += dt;

    if (mode === 'up') {
      veil = Math.min(1, veil + dt / UP);
      if (veil >= 1) {
        const res = pickNext();
        mode = 'down';
        if (advanceCb) { const cb = advanceCb; advanceCb = null; cb(res); }
      }
    } else if (mode === 'down') {
      veil = Math.max(0, veil - dt / DOWN);
      if (veil <= 0) mode = 'idle';
    }

    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (cur) cur.frame(ctx, elapsed, dt);

    // lớp tương tác chung: vệt sáng/tim nhỏ theo con trỏ
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 50 * dt;
      s.life -= dt / s.max; s.rot += s.vr * dt;
      if (s.life <= 0) { sparkles.splice(i, 1); continue; }
      const c = PAL[s.k];
      const fill = 'rgba(' + c.join(',') + ',' + (s.life * 0.85).toFixed(2) + ')';
      if (s.heart) drawMiniHeart(ctx, s.x, s.y, s.s * s.life, s.rot, fill);
      else {
        ctx.fillStyle = fill;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.s * s.life, 0, TAU); ctx.fill();
      }
    }
    // vòng sáng báo hiệu cú chạm
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]; b.r += dt * 420; b.life -= dt * 3;
      if (b.life <= 0) { bursts.splice(i, 1); continue; }
      ctx.strokeStyle = 'rgba(255,235,242,' + (b.life * 0.7).toFixed(2) + ')'; ctx.lineWidth = 2 * b.life;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
    }

    if (veil > 0) {
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(8,3,12,' + veil.toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
    }
    raf = requestAnimationFrame(loop);
  }

  const Stage = {
    advance(cb) {
      if (!started) {
        if (!canvas && !boot()) { if (cb) cb(null); return null; }
        started = true;
        document.body.classList.add('fx-on');
        if (window.Heart && window.Heart.stop) window.Heart.stop();
        lastT = performance.now();
        const res = pickNext();
        veil = 1; mode = 'down';
        if (!raf) raf = requestAnimationFrame(loop);
        if (cb) cb(res);
        return res;
      }
      if (mode !== 'idle') return null;              // đang crossfade -> bỏ qua
      advanceCb = cb || null;
      mode = 'up';
      return { pending: true };
    },

    transitioning() { return mode !== 'idle'; },
    remaining() { return Math.max(0, order.length - idx); },
    reset() { idx = 0; order = window.FX.shuffled(); }
  };

  window.Stage = Stage;
})();

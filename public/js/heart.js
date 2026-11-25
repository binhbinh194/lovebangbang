/**
 * heart.js — trái tim thuật toán, một canvas 2D, không asset.
 *
 * Toán học đứng sau:
 *   1. Đường cong trái tim (dạng lượng giác cổ điển):
 *        x = 16 sin³t
 *        y = 13cos t − 5cos 2t − 2cos 3t − cos 4t
 *   2. Nhịp đập mô phỏng sóng tâm thu — hai đỉnh kép (lub-dub):
 *        beat(t) = 0.06·exp((t−0.14)/s²)·sin²(π(t−0.14)/0.32)
 *                  + 0.045·exp((t−0.30)/s²)·sin²(π(t−0.30)/0.32)
 *   3. ~700 hạt bám trên cung tim, mỗi hạt dao động quanh vị trí tham số
 *      bằng spring_critically_damped — tán loạn khi "burst", tự hội tụ lại.
 *   4. Đuôi con trỏ: polyline giảm trọng số theo hàm mũ + trọng số khoảng cách.
 *   5. Nổ khi chạm: 3 vòng tròn nở theo suy giảm mũ, additive blending.
 *
 * Render: additive (globalCompositeOperation = 'lighter'), thang màu
 * rose → gold, bloom bằng shadowBlur có kiểm soát.
 */
'use strict';

(function () {
  const TAU = Math.PI * 2;
  const N = 720;                    // số hạt trên cung tim
  const BPM = 66;                  // nhịp tim cơ sở

  // bảng màu rose→gold, tra bằng chỉ số nguyên (nhanh hơn parse chuỗi)
  const PAL = buildPalette('#ff4d6d', '#ffd166', 32);

  let canvas, ctx, dpr = 1, W = 0, H = 0;
  let particles = [];
  let rings = [];                  // sóng nở (click / burst / accept)
  let sparks = [];                 // tia nhỏ bay lên
  let motes = [];                  // bụi nền trôi
  let blooms = [];                 // tim nhỏ nở ra rồi tan tại điểm chạm
  let trail = [];                  // đuôi con trỏ {x,y,t}
  let cursor = { x: -999, y: -999, moved: 0 };
  let t0 = performance.now();
  let energy = 1;                  // 1 = bình thường, 1.6 = mode accept
  let burstAt = -1e9;              // thời điểm tán gần nhất
  let raf = 0, reduced = false;

  function buildPalette(a, b, n) {
    const pa = hex(a), pb = hex(b), out = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      out.push([
        Math.round(pa[0] + (pb[0] - pa[0]) * k),
        Math.round(pa[1] + (pb[1] - pa[1]) * k),
        Math.round(pa[2] + (pb[2] - pa[2]) * k)
      ]);
    }
    return out;
  }
  function hex(s) {
    return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  }

  /* ---------- 1. đường cong tim ---------- */

  // t ∈ [0, 2π) → toạ độ chuẩn hoá về [0,1] rồi nhân scale
  function heartPoint(t, scale, cx, cy) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    // miền gốc: x ∈ [-16,16], y ∈ [-19,12] (y hướng lên) → canvas y hướng xuống
    return {
      x: cx + (x / 32) * scale,
      y: cy - ((y + 5) / 29) * scale
    };
  }

  /* ---------- 2. nhịp đập ---------- */

  function lubdub(phase, center, width, amp) {
    const d = (phase - center) / width;
    if (d < 0 || d > 1) return 0;
    return amp * Math.exp(-d * d * 2) * Math.pow(Math.sin(Math.PI * d), 2);
  }

  function beat(now) {
    const period = 60 / BPM;
    const p = ((now - t0) / 1000 / period) % 1;
    return lubdub(p, 0.12, 0.32, 0.085) + lubdub(p, 0.30, 0.30, 0.05);
  }

  /* ---------- 3. hạt trên cung ---------- */

  function seedParticles() {
    particles = new Array(N);
    for (let i = 0; i < N; i++) {
      const t = (i / N) * TAU;
      particles[i] = {
        t,
        // vị trí hiện tại + vận tốc cho spring
        x: 0, y: 0, vx: 0, vy: 0,
        // lệch dao động riêng của hạt
        wob: Math.random() * TAU,
        wobA: 0.6 + Math.random() * 2.2,
        size: 0.7 + Math.random() * 1.9,
        hue: Math.random(),
        tw: Math.random() * TAU,          // nhấp nháy pha riêng
        init: false
      };
    }
  }

  function seedMotes() {
    motes = [];
    const n = Math.round(W * H / 26000);
    for (let i = 0; i < n; i++) {
      motes.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -0.03 - Math.random() * 0.09,
        r: 0.5 + Math.random() * 1.4,
        a: 0.06 + Math.random() * 0.2,
        tw: Math.random() * TAU
      });
    }
  }

  /* ---------- 4. vòng sóng & tia ---------- */

  function addRing(x, y, opts) {
    rings.push({
      x, y, r: opts.r0 || 4, vr: opts.vr || 6,
      life: 1, decay: opts.decay || 0.018,
      lw: opts.lw || 1.6, color: opts.color || PAL[26], a: opts.a || 0.5
    });
  }

  function addBloom(x, y) {
    blooms.push({ x, y, r: 2, life: 1, hue: Math.random() });
  }

  function emitSparks(x, y, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * (spread || 1.6);
      const sp = 0.6 + Math.random() * (spread || 2.2);
      sparks.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1, decay: 0.012 + Math.random() * 0.02,
        size: 0.8 + Math.random() * 1.8, hue: Math.random()
      });
    }
  }

  /* ---------- vòng lặp chính ---------- */

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedMotes();
  }

  function frame(now) {
    const dt = Math.min(2.5, (now - (frame.last || now)) / 16.67);
    frame.last = now;

    const b = reduced ? 0 : beat(now);
    const pulse = 1 + b * energy;
    const scale = Math.min(W, H) * (0.44 + 0.06 * energy) * pulse;
    const cx = W / 2;
    const cy = H * 0.40;

    // nền đêm hồng rất nhẹ, vignette
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0b0510';
    ctx.fillRect(0, 0, W, H);
    drawVignette(cx, cy);

    // additive cho toàn bộ phát sáng
    ctx.globalCompositeOperation = 'lighter';

    drawMotes(dt);
    updateParticles(dt, scale, cx, cy, now, b);
    drawHeartFill(cx, cy, scale, b);
    drawRings(dt);
    drawSparks(dt);
    drawBlooms(dt);
    drawTrail(now);
    drawCursorSpark();

    raf = requestAnimationFrame(frame);
  }

  function drawVignette(cx, cy) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(58, 12, 40, 0.55)');
    g.addColorStop(0.55, 'rgba(20, 6, 18, 0.25)');
    g.addColorStop(1, 'rgba(4, 2, 8, 0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawMotes(dt) {
    for (const m of motes) {
      m.x += m.vx * dt; m.y += m.vy * dt; m.tw += 0.02 * dt;
      if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; }
      if (m.x < -4) m.x = W + 4; else if (m.x > W + 4) m.x = -4;
      const a = m.a * (0.6 + 0.4 * Math.sin(m.tw));
      ctx.fillStyle = `rgba(255,214,224,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, TAU);
      ctx.fill();
    }
  }

  function updateParticles(dt, scale, cx, cy, now, b) {
    // kể từ burst: hạt nhận xung hướng tâm, sau đó spring kéo về cung
    const sinceBurst = (now - burstAt) / 1000;
    const spring = 0.055 * energy;
    const damp = 0.86;

    for (let i = 0; i < N; i++) {
      const p = particles[i];
      const target = heartPoint(p.t, scale, cx, cy);

      // dao động hữu cơ quanh đích
      p.wob += 0.013 * dt;
      const ox = Math.sin(p.wob * 1.7 + p.t * 3) * p.wobA;
      const oy = Math.cos(p.wob * 1.3 + p.t * 2) * p.wobA;
      const tx = target.x + ox, ty = target.y + oy;

      if (!p.init) { p.x = tx; p.y = ty; p.init = true; }

      // spring tới đích (hội tụ sau burst)
      p.vx += (tx - p.x) * spring * dt;
      p.vy += (ty - p.y) * spring * dt;

      // xung tán của burst, suy giảm mũ theo thời gian
      if (sinceBurst < 1.4) {
        const dx = p.x - cx, dy = p.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        const kick = Math.exp(-sinceBurst * 3.2) * 9;
        p.vx += (dx / d) * kick * dt * 0.12;
        p.vy += (dy / d) * kick * dt * 0.12;
      }

      p.vx *= Math.pow(damp, dt);
      p.vy *= Math.pow(damp, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.tw += 0.03 * dt;

      // màu rose→gold theo vị trí trên cung + nhấp nháy pha riêng
      const idx = (p.hue * 0.55 + 0.45 * (1 - Math.abs(Math.sin(p.t * 0.5)))) * (PAL.length - 1) | 0;
      const c = PAL[Math.min(PAL.length - 1, idx)];
      const twinkle = 0.55 + 0.45 * Math.sin(p.tw);
      const glow = 0.35 + b * 4.2;
      const r = p.size * (1 + b * 1.6);

      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.5 * twinkle * glow).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
    }
  }

  function drawHeartFill(cx, cy, scale, b) {
    // 10 lớp co dần → miền trong được "lấp" bằng đường cong lượng giác
    ctx.shadowColor = 'rgba(255, 77, 109, 0.55)';
    ctx.shadowBlur = 10 + b * 110;
    for (let k = 1; k <= 10; k++) {
      const s = scale * (k / 10);
      ctx.beginPath();
      for (let i = 0; i <= 160; i++) {
        const t = (i / 160) * TAU;
        const q = heartPoint(t, s, cx, cy);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(255, ${92 + k * 6}, ${120 + k * 4}, ${(0.05 + 0.012 * k) * (1 + b * 3)})`;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  function drawRings(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.r += r.vr * dt;
      r.vr *= Math.pow(0.965, dt);
      r.life -= r.decay * dt;
      if (r.life <= 0) { rings.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(${r.color[0]},${r.color[1]},${r.color[2]},${(r.a * r.life).toFixed(3)})`;
      ctx.lineWidth = r.lw * r.life;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
  }

  function drawSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vy -= 0.006 * dt;                    // bay lên nhẹ
      s.vx *= Math.pow(0.98, dt);
      s.life -= s.decay * dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      const c = PAL[(s.hue * (PAL.length - 1)) | 0];
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.7 * s.life).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * s.life, 0, TAU);
      ctx.fill();
    }
  }

  function drawBlooms(dt) {
    // tim nhỏ nở theo hàm mũ rồi tan
    for (let i = blooms.length - 1; i >= 0; i--) {
      const bl = blooms[i];
      bl.r += (26 - bl.r) * 0.06 * dt;
      bl.life -= 0.016 * dt;
      if (bl.life <= 0) { blooms.splice(i, 1); continue; }
      const c = PAL[(bl.hue * (PAL.length - 1)) | 0];
      ctx.save();
      ctx.translate(bl.x, bl.y);
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.55 * bl.life).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = 0; k <= 64; k++) {
        const t = (k / 64) * TAU;
        const q = heartPoint(t, bl.r * 2.2, 0, 0);
        if (k === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTrail(now) {
    // xoá điểm già hơn 420ms
    while (trail.length && now - trail[0].t > 420) trail.shift();
    if (trail.length < 2) return;
    ctx.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], c = trail[i];
      const age = (now - c.t) / 420;                  // 0 mới → 1 cũ
      const dist = Math.hypot(c.x - a.x, c.y - a.y);
      const weight = (1 - age) * Math.min(1, dist / 14);
      if (weight <= 0.02) continue;
      ctx.strokeStyle = `rgba(255, 190, 205, ${(0.34 * weight).toFixed(3)})`;
      ctx.lineWidth = 0.6 + 2.4 * weight;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
      if (Math.random() < weight * 0.16) emitSparks(c.x, c.y, 1, 0.9);
    }
  }

  function drawCursorSpark() {
    if (cursor.x < 0) return;
    ctx.fillStyle = 'rgba(255, 225, 232, 0.9)';
    ctx.beginPath();
    ctx.arc(cursor.x, cursor.y, 1.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 150, 175, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cursor.x, cursor.y, 7 + Math.sin(performance.now() / 260) * 2, 0, TAU);
    ctx.stroke();
  }

  /* ---------- API ---------- */

  const Heart = {
    start() {
      canvas = document.getElementById('scene');
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      resize();
      seedParticles();
      window.addEventListener('resize', resize);

      window.addEventListener('pointermove', (e) => {
        cursor.x = e.clientX; cursor.y = e.clientY;
        const lastP = trail[trail.length - 1];
        if (!lastP || Math.hypot(e.clientX - lastP.x, e.clientY - lastP.y) > 3) {
          trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
          if (trail.length > 90) trail.shift();
        }
      }, { passive: true });

      window.addEventListener('pointerdown', (e) => {
        addBloom(e.clientX, e.clientY);
        addRing(e.clientX, e.clientY, { color: PAL[28], vr: 4.5, a: 0.4, decay: 0.03 });
        emitSparks(e.clientX, e.clientY, 6, 1.4);
      }, { passive: true });

      raf = requestAnimationFrame(frame);
    },

    /** Tán hạt ra xa rồi để spring tự hội tụ — hiệu ứng "tan rồi tụ lại". */
    burst() {
      burstAt = performance.now();
      for (const p of particles) {
        const a = Math.random() * TAU;
        const sp = 2 + Math.random() * 7;
        p.vx += Math.cos(a) * sp;
        p.vy += Math.sin(a) * sp;
      }
      addRing(W / 2, H * 0.4, { color: PAL[31], vr: 9, lw: 2.2, a: 0.55, decay: 0.012, r0: 10 });
      addRing(W / 2, H * 0.4, { color: PAL[10], vr: 6, lw: 1.4, a: 0.4, decay: 0.016, r0: 4 });
      emitSparks(W / 2, H * 0.4, 40, 3.2);
    },

    /** Mode accept: tim đập nhanh + sáng hơn, màu tiến về gold. */
    setEnergy(v) {
      energy = v;
      if (v > 1.3) {
        addRing(W / 2, H * 0.4, { color: PAL[30], vr: 7, lw: 2, a: 0.5, decay: 0.01 });
        emitSparks(W / 2, H * 0.4, 24, 2.4);
      }
    },

    stop() { if (raf) cancelAnimationFrame(raf); }
  };

  window.Heart = Heart;
})();

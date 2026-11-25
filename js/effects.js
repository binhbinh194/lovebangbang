/**
 * effects.js — thư viện các "trang" hiệu ứng lãng mạn, mỗi cái một thuật toán.
 *
 * Hợp đồng: mỗi effect là factory trả về
 *   { name, resize(w,h), init(), frame(ctx, t, dt) }
 * t = giây kể từ lúc effect chạy, dt = giây giữa 2 frame.
 * Effect tự lo nền của frame đầu (điền màu / trail), Stage không clear hộ.
 * Tương tác (tuỳ chọn): effect định nghĩa thêm pointer(x,y) khi con trỏ di,
 * tap(x,y) khi chạm/click. Không có thì Stage vẽ lớp chung (vệt sáng + nổ tim).
 *
 * 20 hiệu ứng, mỗi cái một thuật toán: (xem tiêu đề từng mục bên dưới)
 */
'use strict';

(function () {
  const TAU = Math.PI * 2;
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));   // góc vàng ~137.5°

  const PAL = buildPalette('#ff4d6d', '#ffd166', 48);
  const ROSE = '#ff4d6d', GOLD = '#ffd166', VIOLET = '#c86bff', CYAN = '#7ee0c0';

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
  function hex(s) { return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; }
  function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  function pickPal(u) { return PAL[Math.max(0, Math.min(PAL.length - 1, (u * (PAL.length - 1)) | 0))]; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // đường cong tim lượng giác cổ điển, lượng tử hoá về [0,1] rồi nhân scale
  function heartPoint(t, scale, cx, cy) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return { x: cx + (x / 32) * scale, y: cy - ((y + 5) / 29) * scale };
  }

  function fillBg(ctx, w, h, color) { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); }

  /* ================= 1. CONSTELLATION ================= */

  function makeConstellation() {
    let w = 0, h = 0, pts = [], N = 70, px = -1e4, py = -1e4;
    return {
      name: 'constellation',
      pointer(x, y) { px = x; py = y; },
      resize(nw, nh) { w = nw; h = nh; },
      init() {
        pts = [];
        const cx = w / 2, cy = h * 0.44, scale = Math.min(w, h) * 0.5;
        for (let i = 0; i < N; i++) {
          const t = (i / N) * TAU;
          const home = heartPoint(t, scale, cx, cy);
          pts.push({
            x: rnd(0, w), y: rnd(0, h), vx: 0, vy: 0,
            hx: home.x, hy: home.y, ph: rnd(0, TAU), sz: rnd(1.2, 2.8)
          });
        }
      },
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, 'rgba(9,4,14,0.32)');
        const pull = Math.min(1, t / 3.2);        // 3.2s thì về hẳn hình tim
        ctx.globalCompositeOperation = 'lighter';
        for (const p of pts) {
          p.ph += dt * 1.4;
          // spring về home + lang thang
          p.vx += (p.hx - p.x) * 0.02 * pull * dt * 60 + Math.cos(p.ph) * 0.05;
          p.vy += (p.hy - p.y) * 0.02 * pull * dt * 60 + Math.sin(p.ph * 1.3) * 0.05;
          const dx = p.x - px, dy = p.y - py, d = Math.hypot(dx, dy);     // con trỏ xua sao
          if (d < 110 && d > 0.1) { const f = (1 - d / 110) * 3.2; p.vx += dx / d * f; p.vy += dy / d * f; }
          p.vx *= 0.9; p.vy *= 0.9;
          p.x += p.vx * dt * 60; p.y += p.vy * dt * 60;
        }
        // nối chòm sao giữa các điểm gần nhau
        ctx.lineWidth = 0.7;
        for (let i = 0; i < N; i++) {
          for (let j = i + 1; j < N; j++) {
            const a = pts[i], b = pts[j];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < 92) {
              ctx.strokeStyle = rgba(PAL[30], (1 - d / 92) * 0.28);
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            }
          }
        }
        // các ngôi sao
        for (const p of pts) {
          const c = pickPal(0.4 + 0.6 * Math.sin(p.ph) * 0.5 + 0.3);
          ctx.shadowBlur = 12; ctx.shadowColor = rgba(c, 0.9);
          ctx.fillStyle = rgba(c, 0.95);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, TAU); ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
    };
  }

  /* ================= 2. PHYLLOTAXIS ================= */

  function makePhyllotaxis() {
    let w = 0, h = 0, total = 460, c = 12;
    return {
      name: 'phyllotaxis',
      resize(nw, nh) { w = nw; h = nh; c = Math.min(nw, nh) / 34; },
      init() {},
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, '#0a0410');
        ctx.globalCompositeOperation = 'lighter';
        const cx = w / 2, cy = h * 0.46;
        const shown = Math.min(total, t * 150);
        for (let i = 0; i < shown; i++) {
          const ang = i * GOLDEN + t * 0.12;
          const r = c * Math.sqrt(i);
          const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang) * 0.92;
          const u = i / total;
          const s = 2 + u * 7;
          const col = pickPal(0.15 + 0.85 * u);
          ctx.fillStyle = rgba(col, 0.75);
          // mỗi hạt là một trái tim tí hon xoay theo tiếp tuyến
          drawMiniHeart(ctx, x, y, s, ang + Math.PI / 2, rgba(col, 0.85));
        }
        // vòng nhị vàng giữa
        ctx.fillStyle = rgba(PAL[46], 0.9);
        ctx.beginPath(); ctx.arc(cx, cy, 4 + Math.sin(t * 3) * 1.5, 0, TAU); ctx.fill();
      }
    };
  }

  function drawMiniHeart(ctx, x, y, s, rot, fill) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, s * 0.5);
    ctx.bezierCurveTo(-s, -s * 0.6, -s * 0.6, -s * 1.5, 0, -s * 0.8);
    ctx.bezierCurveTo(s * 0.6, -s * 1.5, s, -s * 0.6, 0, s * 0.5);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    ctx.restore();
  }

  /* ================= 3. AURORA (rèm cực quang nhiều lớp, vân dọc, hồ phản chiếu) ================= */

  function makeAurora() {
    let w = 0, h = 0, stars = [], hills = [], sparks = [], px = -1e4, py = -1e4, rip = 0;
    const HORIZON = 0.86;            // chân trời / mặt hồ (tỉ lệ chiều cao)
    const curtains = [
      { y: 0.31, amp: 56, f1: 0.0045, f2: 0.011, sp: 0.32, col: [86, 255, 186], len: 0.30, a: 0.6 },
      { y: 0.22, amp: 72, f1: 0.0032, f2: 0.009, sp: 0.21, col: [255, 118, 196], len: 0.36, a: 0.45 },
      { y: 0.41, amp: 38, f1: 0.0060, f2: 0.014, sp: 0.45, col: [150, 128, 255], len: 0.22, a: 0.4 }
    ];
    function gen() {
      stars = [];
      for (let i = 0; i < 240; i++) stars.push({ x: Math.random() * w, y: Math.random() * h * 0.6, r: rnd(0.6, 1.8), ph: rnd(0, TAU), sp: rnd(1.5, 4) });
      hills = [];
      for (let L = 0; L < 2; L++) {
        const pts = [], amp = h * (L ? 0.045 : 0.085), seg = L ? 22 : 38;
        for (let x = -60; x <= w + 60; x += seg) {
          const y = h * HORIZON - amp * (0.55 + 0.45 * Math.sin(x * 0.0045 + L * 3)) - rnd(0, amp * 0.45);
          pts.push({ x, y });
        }
        hills.push(pts);
      }
    }
    return {
      name: 'aurora',
      resize(nw, nh) { w = nw; h = nh; gen(); },
      init() { gen(); sparks = []; rip = 0; },
      pointer(x, y) { px = x; py = y; },
      tap(x, y) {
        px = x; py = y; rip = 1;
        for (let i = 0; i < 30; i++) {
          const a = rnd(0, TAU), sp = rnd(60, 240);
          sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 1, k: (Math.random() * 3) | 0 });
        }
      },
      frame(ctx, t, dt) {
        const horizon = h * HORIZON;
        const sky = ctx.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, '#040815'); sky.addColorStop(0.55, '#0a1130'); sky.addColorStop(0.85, '#1b1038'); sky.addColorStop(1, '#2a1440');
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon + 2);
        ctx.globalCompositeOperation = 'lighter';
        for (const s of stars) {
          s.ph += dt * s.sp;
          ctx.fillStyle = 'rgba(255,245,250,' + (0.25 + 0.7 * Math.abs(Math.sin(s.ph))).toFixed(2) + ')';
          ctx.fillRect(s.x, s.y, s.r, s.r);
        }
        // rèm cực quang: từng cột dọc một, độ sáng theo vân nhiễu sin nhiều tần số
        rip = Math.max(0, rip - dt * 0.9);
        const step = 6;
        const topY = (c, x) => h * c.y + Math.sin(x * c.f1 + t * c.sp) * c.amp + Math.sin(x * c.f2 - t * c.sp * 1.7) * c.amp * 0.45 + Math.sin(x * 0.021 + t * 0.9) * 10;
        for (let ci = 0; ci < curtains.length; ci++) {
          const c = curtains[ci], near = 1 - ci * 0.22, L = h * c.len;
          const g = ctx.createLinearGradient(0, 0, 0, L), rgb = c.col.join(',');
          g.addColorStop(0, 'rgba(' + rgb + ',0)');
          g.addColorStop(0.45, 'rgba(' + rgb + ',0.5)');
          g.addColorStop(0.9, 'rgba(' + rgb + ',1)');
          g.addColorStop(1, 'rgba(' + rgb + ',0.15)');
          ctx.fillStyle = g;
          for (let x = -step; x <= w + step; x += step) {
            let y = topY(c, x);
            let I = 0.55 + 0.45 * Math.sin(x * 0.045 + t * 1.6 + ci * 2) * Math.sin(x * 0.013 - t * 0.7);
            const dp = Math.hypot(x - px, y - py);                     // con trỏ: rèm phồng lên & sáng hơn
            if (dp < 260) { const k = 1 - dp / 260; I += k * 0.9; y -= k * 30; }
            if (rip > 0) {                                             // chạm: vòng sóng chạy ngang trời
              const dr = Math.abs(Math.hypot(x - px, y - py) - (1 - rip) * 460);
              if (dr < 36) I += rip * 1.2;
            }
            if (I <= 0.03) continue;
            const len = L * (0.75 + 0.25 * Math.sin(x * 0.009 + t * 0.4));
            ctx.globalAlpha = Math.min(1, I * c.a * near);
            ctx.save(); ctx.translate(x, y); ctx.fillRect(0, 0, step + 1, len); ctx.restore();
          }
        }
        ctx.globalAlpha = 1;
        // tia lửa từ cú chạm
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 90 * dt; s.life -= dt * 0.9;
          if (s.life <= 0) { sparks.splice(i, 1); continue; }
          const c = curtains[s.k].col;
          ctx.fillStyle = 'rgba(' + c.join(',') + ',' + (s.life * 0.9).toFixed(2) + ')';
          ctx.beginPath(); ctx.arc(s.x, s.y, 1.6 + s.life * 1.4, 0, TAU); ctx.fill();
        }
        // núi silhouette
        ctx.globalCompositeOperation = 'source-over';
        for (let L = 0; L < 2; L++) {
          ctx.fillStyle = L ? '#05050f' : '#0b0a1e';
          ctx.beginPath(); ctx.moveTo(-60, horizon + 2);
          for (const p of hills[L]) ctx.lineTo(p.x, p.y);
          ctx.lineTo(w + 60, horizon + 2); ctx.closePath(); ctx.fill();
        }
        // hồ: phản chiếu phần trời phía trên chân trời, lật ngược + nén lại
        const dpr = ctx.canvas.width / w, S = h * 0.3, rh = h - horizon;
        ctx.save(); ctx.translate(0, h); ctx.scale(1, -1);
        ctx.globalAlpha = 0.42;
        ctx.drawImage(ctx.canvas, 0, (horizon - S) * dpr, w * dpr, S * dpr, 0, 0, w, rh);
        ctx.restore(); ctx.globalAlpha = 1;
        const dg = ctx.createLinearGradient(0, horizon, 0, h);
        dg.addColorStop(0, 'rgba(6,6,24,0.15)'); dg.addColorStop(1, 'rgba(4,4,16,0.85)');
        ctx.fillStyle = dg; ctx.fillRect(0, horizon, w, rh);
        // vân sóng nhẹ trên mặt hồ
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 9; i++) {
          const y = horizon + ((i + 0.5) / 9) * rh + Math.sin(t * 1.3 + i) * 3;
          const a = 0.05 + 0.04 * Math.sin(t * 2 + i * 1.7);
          ctx.fillStyle = 'rgba(160,255,220,' + Math.max(0, a).toFixed(3) + ')';
          ctx.fillRect(0, y, w, 1);
        }
        ctx.fillStyle = 'rgba(190,255,225,0.22)'; ctx.fillRect(0, horizon, w, 1);
      }
    };
  }

  /* ================= 4. METEOR (băng sao vẽ hình tim) ================= */

  function makeMeteor() {
    let w = 0, h = 0, stars = [], comets = [], dust = [], shooters = [], spawn = 0, boost = 0;
    const TAIL = 30, STEP = 0.035;    // đuôi 30 nét x 0.035 rad = 60°, 6 sao chổi khép kín vòng tim
    return {
      name: 'meteor',
      resize(nw, nh) { w = nw; h = nh; },
      init() {
        stars = []; comets = []; dust = []; shooters = []; spawn = 0; boost = 0;
        for (let i = 0; i < 260; i++) stars.push({ x: Math.random() * w, y: Math.random() * h, r: rnd(0.6, 1.9), ph: rnd(0, TAU), sp: rnd(1.5, 4) });
        for (let i = 0; i < 6; i++) comets.push({ t: (i / 6) * TAU, sp: rnd(0.42, 0.6), hue: Math.random(), sz: rnd(2.2, 3.4) });
      },
      tap() { boost = 2.4; },
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, 'rgba(6,2,10,0.22)');
        ctx.globalCompositeOperation = 'lighter';
        for (const s of stars) {
          s.ph += dt * s.sp;
          ctx.fillStyle = 'rgba(255,240,250,' + (0.2 + 0.7 * Math.abs(Math.sin(s.ph))).toFixed(2) + ')';
          ctx.fillRect(s.x, s.y, s.r, s.r);
        }
        const cx = w / 2, cy = h * 0.56, S = Math.min(w, h) * 0.66;
        boost = Math.max(0, boost - dt);
        const fast = 1 + boost * 1.2;
        // lòng tim mờ
        ctx.fillStyle = 'rgba(255,77,109,0.05)';
        ctx.beginPath(); heartPath(ctx, cx, cy, S); ctx.fill();
        // sao băng chéo nền
        spawn -= dt;
        if (spawn <= 0) { spawn = rnd(0.9, 2.0); shooters.push({ x: rnd(-w * 0.1, w * 0.8), y: rnd(-40, h * 0.3), vx: rnd(500, 800), vy: rnd(260, 420), life: 1 }); }
        for (let i = shooters.length - 1; i >= 0; i--) {
          const m = shooters[i];
          m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt * 1.1;
          if (m.life <= 0) { shooters.splice(i, 1); continue; }
          const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 0.16, m.y - m.vy * 0.16);
          g.addColorStop(0, 'rgba(255,230,240,' + (0.9 * m.life).toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,77,109,0)');
          ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 0.16, m.y - m.vy * 0.16); ctx.stroke();
        }
        // sao chổi chạy dọc đường cong tim, đuôi là vệt băng sao -> hình tim hiện ra
        ctx.lineCap = 'round';
        for (const c of comets) {
          c.t += dt * c.sp * fast;
          const col = pickPal(0.3 + 0.55 * c.hue);
          let prev = heartPoint(c.t, S, cx, cy);
          for (let k = 1; k <= TAIL; k++) {
            const p = heartPoint(c.t - k * STEP, S, cx, cy), u = 1 - k / TAIL;
            ctx.strokeStyle = rgba(col, u * u * 0.85);
            ctx.lineWidth = 0.4 + u * 3.4;
            ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
            prev = p;
          }
          // đầu sao chổi
          const head = heartPoint(c.t, S, cx, cy);
          ctx.shadowBlur = 16; ctx.shadowColor = rgba(col, 0.9);
          ctx.fillStyle = 'rgba(255,250,250,0.95)';
          ctx.beginPath(); ctx.arc(head.x, head.y, c.sz, 0, TAU); ctx.fill();
          ctx.shadowBlur = 0;
          // bụi sao rơi ra sau đầu
          if (dust.length < 320 && Math.random() < dt * 40 * fast) {
            dust.push({ x: head.x, y: head.y, vx: rnd(-26, 26), vy: rnd(8, 50), life: 1, sz: rnd(0.8, 2), hue: c.hue });
          }
        }
        for (let i = dust.length - 1; i >= 0; i--) {
          const d = dust[i];
          d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt * 0.8;
          if (d.life <= 0) { dust.splice(i, 1); continue; }
          ctx.fillStyle = rgba(pickPal(d.hue), d.life * 0.8);
          ctx.beginPath(); ctx.arc(d.x, d.y, d.sz * d.life + 0.3, 0, TAU); ctx.fill();
        }
      }
    };
  }

  /* ================= 5. HEART TUNNEL (hầm tim 3D, con trỏ lái) ================= */

  function makeHeartTunnel() {
    let w = 0, h = 0, items = [], px = 0.5, py = 0.5, tx = 0.5, ty = 0.5, boost = 0;
    function reset(it, deep) {
      it.z = deep ? rnd(0.3, 1) : 1;
      it.a = rnd(0, TAU); it.r = rnd(0.25, 1); it.rot = rnd(0, TAU); it.spin = rnd(-2, 2);
      it.hue = Math.random(); it.sz = rnd(0.6, 1.3); it.star = Math.random() < 0.6;
    }
    return {
      name: 'heartTunnel',
      resize(nw, nh) { w = nw; h = nh; },
      init() { items = []; boost = 0; for (let i = 0; i < 190; i++) { const it = {}; reset(it, true); items.push(it); } },
      pointer(x, y) { tx = x / w; ty = y / h; },
      tap() { boost = 1.2; },
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, 'rgba(8,3,12,0.55)');
        ctx.globalCompositeOperation = 'lighter';
        px += (tx - px) * Math.min(1, dt * 4); py += (ty - py) * Math.min(1, dt * 4);
        boost = Math.max(0, boost - dt);
        const cx = w / 2 + (px - 0.5) * w * 0.4, cy = h * 0.57 + (py - 0.5) * h * 0.4;
        const M = Math.min(w, h) * 0.5, sp = 0.3 * (1 + boost * 2.2);
        // điểm tụ sáng
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, M * 0.35);
        g.addColorStop(0, 'rgba(255,120,160,0.35)'); g.addColorStop(1, 'rgba(255,77,109,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, M * 0.35, 0, TAU); ctx.fill();
        for (const it of items) {
          it.z -= dt * sp * (0.6 + it.sz * 0.5);
          if (it.z <= 0.045) { reset(it, false); continue; }
          it.rot += it.spin * dt;
          const k = 0.06 / it.z, R = it.r * M * 2.6;
          const x = cx + Math.cos(it.a) * R * k, y = cy + Math.sin(it.a) * R * k * 0.85;
          if (x < -80 || x > w + 80 || y < -80 || y > h + 80) { reset(it, true); continue; }
          const depth = 1 - it.z, size = it.sz * (1.5 + 34 * k);
          const col = pickPal(0.15 + 0.8 * depth);
          if (it.star) {
            ctx.fillStyle = rgba(col, 0.25 + 0.7 * depth);
            ctx.fillRect(x, y, Math.max(1, size * 0.5), Math.max(1, size * 0.5));
          } else {
            drawMiniHeart(ctx, x, y, size, it.rot, rgba(col, 0.2 + 0.75 * depth));
          }
        }
        // tim lõi giữa hầm
        ctx.shadowBlur = 18; ctx.shadowColor = ROSE;
        drawMiniHeart(ctx, cx, cy, 16 * (1 + 0.1 * Math.sin(t * 4)), 0, 'rgba(255,235,240,0.9)');
        ctx.shadowBlur = 0;
      }
    };
  }

  /* ================= 6. BUBBLES (bong bóng tim bay nhanh, vỡ tung thành tim to) ================= */

  function makeBubbles() {
    let w = 0, h = 0, bubbles = [], hearts = [], rings = [], drops = [], spawn = 0, px = -1e4, py = -1e4;
    function pop(b, big) {
      rings.push({ x: b.x, y: b.y, r: b.r * 0.5, life: 1 });
      const n = big ? 22 : 15;
      for (let k = 0; k < n && hearts.length < 420; k++) {
        const a = rnd(0, TAU), sp = rnd(180, 460) * (big ? 1.25 : 1);
        hearts.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, s: rnd(12, 28), rot: rnd(0, TAU), vr: rnd(-4, 4), life: 1, hue: Math.random() });
      }
      for (let k = 0; k < 10 && drops.length < 180; k++) {
        const a = rnd(0, TAU), sp = rnd(80, 280);
        drops.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, r: rnd(1.5, 3.5), hue: b.hue });
      }
    }
    return {
      name: 'bubbles',
      resize(nw, nh) { w = nw; h = nh; },
      init() { bubbles = []; hearts = []; rings = []; drops = []; spawn = 0; },
      pointer(x, y) { px = x; py = y; },
      tap(x, y) {
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i];
          if (Math.hypot(b.x - x, b.y - y) < 130) { pop(b, true); bubbles.splice(i, 1); }
        }
        rings.push({ x, y, r: 12, life: 1 });
        if (rings.length > 48) rings.shift();
      },
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, 'rgba(9,4,14,0.35)');
        ctx.globalCompositeOperation = 'lighter';
        spawn -= dt;
        if (spawn <= 0 && bubbles.length < 34) {
          spawn = rnd(0.1, 0.3);
          bubbles.push({ x: rnd(0, w), y: h + 60, r: rnd(18, 64), vy: -rnd(130, 270), vx: 0, ph: rnd(0, TAU), wob: rnd(14, 40), hue: Math.random() });
        }
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i];
          b.ph += dt * 2.4; b.y += b.vy * dt; b.x += (Math.sin(b.ph) * b.wob + b.vx) * dt; b.vx *= 0.94;
          const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy);          // con trỏ đẩy bong bóng
          if (d < b.r + 60 && d > 0.1) { const f = (1 - d / (b.r + 60)) * 320 * dt; b.vx += dx / d * f; b.y += dy / d * f * 0.6; }
          if (b.y < -b.r) { bubbles.splice(i, 1); continue; }
          // tự vỡ ngẫu nhiên giữa đường, hoặc vỡ khi chạm đỉnh màn
          if (Math.random() < dt * 0.25 || b.y < b.r + 12) { pop(b, false); bubbles.splice(i, 1); continue; }
          // thân bong bóng iridescent
          const g = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
          g.addColorStop(0, rgba(pickPal(b.hue), 0.28));
          g.addColorStop(0.7, 'rgba(255,255,255,0.03)');
          g.addColorStop(1, rgba(pickPal(1 - b.hue), 0.32));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
          ctx.strokeStyle = rgba(PAL[40], 0.55); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.beginPath(); ctx.arc(b.x - b.r * 0.38, b.y - b.r * 0.4, b.r * 0.13, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath(); ctx.arc(b.x + b.r * 0.3, b.y + b.r * 0.35, b.r * 0.06, 0, TAU); ctx.fill();
          // tim mờ bên trong
          drawMiniHeart(ctx, b.x, b.y, b.r * 0.42, Math.sin(b.ph) * 0.2, rgba(pickPal(b.hue), 0.32));
        }
        // vòng xung kích khi vỡ
        for (let i = rings.length - 1; i >= 0; i--) {
          const r = rings[i]; r.r += dt * 320; r.life -= dt * 2.4;
          if (r.life <= 0) { rings.splice(i, 1); continue; }
          ctx.strokeStyle = 'rgba(255,230,240,' + (r.life * 0.8).toFixed(2) + ')'; ctx.lineWidth = 2 * r.life;
          ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
        }
        // giọt nước văng
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i]; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 520 * dt; d.life -= dt * 1.7;
          if (d.life <= 0) { drops.splice(i, 1); continue; }
          ctx.fillStyle = rgba(pickPal(d.hue), d.life * 0.9);
          ctx.beginPath(); ctx.arc(d.x, d.y, d.r * d.life, 0, TAU); ctx.fill();
        }
        // tim bay ra
        for (let i = hearts.length - 1; i >= 0; i--) {
          const p = hearts[i];
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 170 * dt; p.vx *= 0.985; p.vy *= 0.985; p.rot += p.vr * dt; p.life -= dt * 0.6;
          if (p.life <= 0) { hearts.splice(i, 1); continue; }
          const col = pickPal(p.hue), s = p.s * (0.6 + 0.4 * p.life);
          drawMiniHeart(ctx, p.x, p.y, s * 1.5, p.rot, rgba(col, p.life * 0.18));           // quầng
          drawMiniHeart(ctx, p.x, p.y, s, p.rot, rgba(col, Math.min(1, p.life * 1.3)));     // thân
        }
      }
    };
  }

  /* ================= 7. ECG ================= */

  function makeEcg() {
    let w = 0, h = 0, samples = [], penX = 0, phase = 0, heartPulse = 0;
    return {
      name: 'ecg',
      resize(nw, nh) { w = nw; h = nh; },
      init() { samples = []; penX = 0; phase = 0; },
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, 'rgba(8,3,12,0.85)');
        ctx.globalCompositeOperation = 'source-over';
        const baseY = h * 0.46;
        // tốc độ tăng dần theo thời gian (hồi hộp)
        const rate = 1 + Math.min(1.4, t * 0.08);
        phase += dt * 2.2 * rate;
        const v = ecgWave(phase % 1);
        if (v > 0.85) heartPulse = 1;
        heartPulse = Math.max(0, heartPulse - dt * 3);

        samples.push({ x: penX, y: baseY - v * h * 0.16 });
        penX += 3 * rate;
        if (penX > w) { penX = 0; samples = []; }

        // lưới y tế mờ
        ctx.strokeStyle = 'rgba(255,120,150,0.06)'; ctx.lineWidth = 1;
        for (let gx = 0; gx < w; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
        for (let gy = 0; gy < h; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

        // đường ECG
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = ROSE; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
        ctx.shadowBlur = 14; ctx.shadowColor = ROSE;
        ctx.beginPath();
        for (let i = 0; i < samples.length; i++) {
          const s = samples[i];
          if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // con trỏ sáng ở đầu bút
        const head = samples[samples.length - 1];
        if (head) {
          ctx.fillStyle = rgba(PAL[46], 0.95);
          ctx.beginPath(); ctx.arc(head.x, head.y, 3, 0, TAU); ctx.fill();
        }
        // tim nhấp theo R-peak
        const cx = w / 2, cy = h * 0.24;
        const s = 34 * (1 + heartPulse * 0.4);
        drawMiniHeart(ctx, cx, cy, s, 0, rgba(PAL[0], 0.5 + heartPulse * 0.5));
        ctx.fillStyle = 'rgba(255,220,230,0.85)';
        ctx.font = '600 15px Inter, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(Math.round(66 * rate) + ' BPM', cx, cy + 62);
      }
    };
    // dạng sóng P-QRS-T chuẩn hoá [0,1] theo pha 0..1
    function ecgWave(p) {
      const g = (c, w2, a) => { const d = (p - c) / w2; return a * Math.exp(-d * d); };
      let y = 0;
      y += g(0.16, 0.03, 0.18);      // P
      y += g(0.30, 0.010, -0.22);    // Q
      y += g(0.34, 0.012, 1.0);      // R
      y += g(0.38, 0.014, -0.32);    // S
      y += g(0.58, 0.05, 0.35);      // T
      return y;
    }
  }

  /* ================= 8. RHODONEA (hồng lượng cực) ================= */

  function makeRhodonea() {
    let w = 0, h = 0;
    const k = 5;                        // k lẻ -> k cánh
    return {
      name: 'rhodonea',
      resize(nw, nh) { w = nw; h = nh; },
      init() {},
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, '#08030c');
        ctx.globalCompositeOperation = 'lighter';
        const cx = w / 2, cy = h * 0.58, A = Math.min(w, h) * 0.44, rot = t * 0.35;
        for (let layer = 0; layer < 3; layer++) {
          const amp = A * (0.62 + 0.38 * Math.sin(t * 0.7 + layer * 1.1));
          ctx.beginPath();
          for (let i = 0; i <= 420; i++) {
            const th = i / 420 * TAU;
            const r = amp * Math.cos(k * th);
            const x = cx + r * Math.cos(th + rot), y = cy + r * Math.sin(th + rot);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.strokeStyle = rgba(pickPal(layer / 2), 0.5);
          ctx.lineWidth = 1.6;
          ctx.shadowBlur = 18; ctx.shadowColor = ROSE;
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = rgba(PAL[46], 0.9);
        ctx.beginPath(); ctx.arc(cx, cy, 4 + Math.sin(t * 3) * 2, 0, TAU); ctx.fill();
      }
    };
  }

  /* ================= 9. FIREWORKS (pháo hoa tim to, lấp lánh, chạm để bắn) ================= */

  function makeFireworks() {
    let w = 0, h = 0, rockets = [], sparks = [], spawn = 0, px = -1e4;
    const G = 300;
    function explode(r) {
      const S = Math.min(w, h) / 800, n = r.heart ? 120 : 90;     // tỉ lệ theo màn hình, không bị bé
      for (let i = 0; i < n; i++) {
        let vx, vy;
        if (r.heart) {
          const th = i / n * TAU;
          vx = 16 * Math.pow(Math.sin(th), 3) * rnd(9, 12) * S;
          vy = -(13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th)) * rnd(9, 12) * S;
        } else {
          const a = i / n * TAU, sp = rnd(140, 360) * S;
          vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
        }
        sparks.push({ x: r.x, y: r.y, vx, vy, g: 100, life: 1, ttl: rnd(1.5, 2.6), rad: rnd(1.6, 3.4), hue: r.hue + rnd(-0.06, 0.06), tw: rnd(0, TAU), crackle: Math.random() < 0.22, done: false });
      }
      sparks.push({ x: r.x, y: r.y, ring: true, r: 4, life: 1, hue: r.hue });
      for (let i = 0; i < 24; i++) {
        const a = rnd(0, TAU), sp = rnd(30, 120) * S;
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 40, life: 1, ttl: rnd(0.3, 0.6), rad: 1.2, hue: 0.95, tw: 0, crackle: false, done: true });
      }
    }
    function launch(x, ty) {
      if (rockets.length >= 24) return;
      // vận tốc khởi phát đủ để tên lửa lên đúng tới ty rồi nổ
      rockets.push({ x, y: h + 10, ty, vy: -Math.sqrt(2 * G * (h + 10 - ty)) * 1.04, hue: Math.random(), heart: Math.random() < 0.65, trail: 0 });
    }
    return {
      name: 'fireworks',
      resize(nw, nh) { w = nw; h = nh; },
      init() { rockets = []; sparks = []; spawn = 0; },
      pointer(x) { px = x; },
      tap(x, y) { launch(x, Math.max(40, Math.min(y, h * 0.8))); },
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, 'rgba(8,3,12,0.26)');
        if (sparks.length > 2400) sparks.splice(0, sparks.length - 2400);
        ctx.globalCompositeOperation = 'lighter';
        spawn -= dt;
        if (spawn <= 0) {
          spawn = rnd(0.5, 1.1);
          const bx = px > 0 ? px + rnd(-w * 0.2, w * 0.2) : rnd(w * 0.12, w * 0.88);
          launch(Math.max(20, Math.min(w - 20, bx)), rnd(h * 0.12, h * 0.42));
        }
        // tên lửa + đuôi lửa
        for (let i = rockets.length - 1; i >= 0; i--) {
          const r = rockets[i];
          r.y += r.vy * dt; r.vy += G * dt; r.trail -= dt;
          if (r.trail <= 0) {
            r.trail = 0.016;
            sparks.push({ x: r.x + rnd(-1.5, 1.5), y: r.y, vx: rnd(-15, 15), vy: rnd(20, 60), g: 60, life: 1, ttl: rnd(0.25, 0.5), rad: 1.1, hue: 0.95, tw: 0, crackle: false, done: true });
          }
          ctx.fillStyle = 'rgba(255,240,210,0.95)';
          ctx.beginPath(); ctx.arc(r.x, r.y, 2.4, 0, TAU); ctx.fill();
          if (r.y <= r.ty || r.vy >= 0) { explode(r); rockets.splice(i, 1); }
        }
        // đốm lửa
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          if (s.ring) {
            s.r += dt * Math.min(w, h) * 0.9; s.life -= dt * 2.4;
            if (s.life <= 0) { sparks.splice(i, 1); continue; }
            ctx.strokeStyle = rgba(pickPal(s.hue), s.life * 0.6); ctx.lineWidth = 2 * s.life;
            ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.stroke();
            continue;
          }
          s.x += s.vx * dt; s.y += s.vy * dt; s.vy += s.g * dt; s.vx *= 0.982; s.vy *= 0.982; s.tw += dt * 28;
          s.life -= dt / s.ttl;
          if (s.life <= 0) { sparks.splice(i, 1); continue; }
          // nổ nhánh (crackle) ở nửa cuối đời
          if (s.crackle && !s.done && s.life < 0.45) {
            s.done = true;
            for (let k = 0; k < 5; k++) {
              const a = rnd(0, TAU), sp = rnd(30, 110);
              sparks.push({ x: s.x, y: s.y, vx: s.vx * 0.3 + Math.cos(a) * sp, vy: s.vy * 0.3 + Math.sin(a) * sp, g: 80, life: 0.7, ttl: rnd(0.5, 0.9), rad: 1, hue: s.hue, tw: rnd(0, TAU), crackle: false, done: true });
            }
          }
          // cuối đời lấp lánh
          const a = s.life < 0.5 ? s.life * (0.45 + 0.55 * Math.abs(Math.sin(s.tw))) : Math.min(1, s.life * 1.3);
          ctx.fillStyle = rgba(pickPal(s.hue), a);
          ctx.beginPath(); ctx.arc(s.x, s.y, s.rad * Math.max(0.35, s.life), 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.5).toFixed(2) + ')';
          ctx.fillRect(s.x - 0.6, s.y - 0.6, 1.2, 1.2);
        }
      }
    };
  }

  /* ================= 10. SAKURA (hoa anh đào rơi) ================= */

  function makeSakura() {
    let w = 0, h = 0, petals = [], spawn = 0, gust = 0;
    return {
      name: 'sakura',
      tap() { gust = 1.6; },
      resize(nw, nh) { w = nw; h = nh; },
      init() { petals = []; spawn = 0; },
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, 'rgba(12,4,14,0.55)');
        ctx.globalCompositeOperation = 'source-over';
        spawn -= dt;
        if (spawn <= 0 && petals.length < 150) {
          spawn = rnd(0.02, 0.07);
          petals.push({ x: rnd(0, w), y: -20, vx: rnd(-10, 20), vy: rnd(40, 95), rot: rnd(0, TAU), vr: rnd(-2, 2), s: rnd(6, 15), sw: rnd(0, TAU), hue: Math.random() });
        }
        const wind = Math.sin(t * 0.6) * 34 + gust * 280;
        gust = Math.max(0, gust - dt);
        for (let i = petals.length - 1; i >= 0; i--) {
          const p = petals[i];
          p.sw += dt * 2; p.x += (p.vx + wind + Math.sin(p.sw) * 22) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
          if (p.y > h + 24) { petals.splice(i, 1); continue; }
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = rgba(pickPal(0.05 + 0.55 * p.hue), 0.92);
          ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.6, 0, 0, TAU); ctx.fill();
          ctx.restore();
        }
      }
    };
  }

  /* ================= 11. GALAXY (sao dạng sprite, không vẽ lại gradient mỗi frame) ================= */

  const galaxySprites = {
    clouds: [0.08, 0.32, 0.58, 0.82].map((hue) => makeGalaxySprite(hue)),
    core: makeGalaxySprite(0.04, [[0, 'rgba(255,242,235,0.95)'], [0.22, 'rgba(255,190,175,0.55)'], [1, 'rgba(255,120,150,0)']]),
    heart: makeGalaxySprite(0.9, [[0, 'rgba(255,77,109,0.5)'], [0.45, 'rgba(255,77,109,0.12)'], [1, 'rgba(255,77,109,0)']]),
    star: makeGalaxySprite(0.85, [[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,235,245,0.9)'], [1, 'rgba(255,200,230,0)']])
  };

  function makeGalaxySprite(alpha, stops) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    if (stops) {
      for (const [at, color] of stops) rg.addColorStop(at, color);
    } else {
      const col = pickPal(alpha);
      rg.addColorStop(0, rgba(col, 0.55)); rg.addColorStop(0.45, rgba(col, 0.18)); rg.addColorStop(1, rgba(col, 0));
    }
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    return c;
  }

  function makeGalaxy() {
    let w = 0, h = 0, buckets = [], clouds = [], waves = [], px = -1e4, py = -1e4;
    return {
      name: 'galaxy',
      resize(nw, nh) { w = nw; h = nh; },
      init() {
        const count = Math.max(520, Math.min(1400, Math.round(w * h / 1100)));
        buckets = Array.from({ length: 8 }, (_, i) => ({ color: rgba(pickPal(i / 7), 1), stars: [] }));
        for (let i = 0; i < count; i++) {
          const arm = i % 4, rad = Math.pow(Math.random(), 0.55) * 0.5;
          buckets[(rad * 7) | 0].stars.push({
            rad, ang: arm * (TAU / 4) + rad * 5.2 + rnd(-0.18, 0.18) * (1 - rad * 0.6),
            spd: 0.55 / (0.25 + rad), tw: rnd(0, TAU),
            sz: Math.random() < 0.08 ? rnd(1.8, 3) : rnd(0.6, 1.5),
            bright: Math.random() < 0.08
          });
        }
        clouds = [];
        for (let i = 0; i < 12; i++) {
          const arm = i % 4, rad = rnd(0.04, 0.48);
          clouds.push({
            rad, ang: arm * (TAU / 4) + rad * 5.2 + rnd(-0.2, 0.2),
            spd: 0.55 / (0.25 + rad), r: rnd(0.07, 0.2),
            sprite: galaxySprites.clouds[i % galaxySprites.clouds.length]
          });
        }
        waves = [];
      },
      pointer(x, y) { px = x; py = y; },
      leave() { px = -1e4; py = -1e4; },
      tap(x, y) { waves.push({ x, y, t: 0 }); if (waves.length > 3) waves.shift(); },
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, 'rgba(7,3,11,0.32)');
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
        const cx = w / 2, cy = h * 0.56, R = Math.min(w, h) * 0.5;

        for (const c of clouds) {
          c.ang += c.spd * dt * 0.5;
          const x = cx + Math.cos(c.ang) * c.rad * R * 2;
          const y = cy + Math.sin(c.ang) * c.rad * R * 1.6;
          const rr = c.r * R * 1.8;
          ctx.drawImage(c.sprite, x - rr, y - rr * 0.55, rr * 2, rr * 1.1);
        }

        for (let i = waves.length - 1; i >= 0; i--) {
          waves[i].t += dt;
          if (waves[i].t > 1.4) waves.splice(i, 1);
        }
        const sig2 = 2 * 70 * 70;
        for (const bucket of buckets) {
          ctx.fillStyle = bucket.color;
          for (const s of bucket.stars) {
            s.ang += s.spd * dt * 0.5; s.tw += dt * 3;
            let x = cx + Math.cos(s.ang) * s.rad * R * 2;
            let y = cy + Math.sin(s.ang) * s.rad * R * 1.6;
            for (const wv of waves) {
              const dx = x - wv.x, dy = y - wv.y, d2 = dx * dx + dy * dy;
              const ring = wv.t * 900, delta = Math.sqrt(d2) - ring;
              const k = Math.exp(-(delta * delta) / sig2) * (1 - wv.t / 1.4);
              if (k > 0.01 && d2 > 1) { const d = Math.sqrt(d2); x += dx / d * k * 70; y += dy / d * k * 70; }
            }
            const dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
            if (px > -1000 && d2 < 28900 && d2 > 1) {
              const d = Math.sqrt(d2), k = (1 - d / 170) * 30;
              x += (px - x) / d * k; y += (py - y) / d * k;
            }
            const twinkle = 0.72 + 0.28 * Math.abs(Math.sin(s.tw));
            if (s.bright) {
              const size = s.sz * 7 * twinkle;
              ctx.drawImage(galaxySprites.star, x - size / 2, y - size / 2, size, size);
            } else {
              const size = s.sz * twinkle;
              ctx.fillRect(x - size, y - size, size * 2, size * 2);
            }
          }
        }

        const coreSize = R * 0.6;
        ctx.drawImage(galaxySprites.core, cx - coreSize / 2, cy - coreSize * 0.32, coreSize, coreSize * 0.64);
        ctx.strokeStyle = 'rgba(255,238,242,0.45)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - R * 0.45, cy); ctx.lineTo(cx + R * 0.45, cy); ctx.moveTo(cx, cy - R * 0.24); ctx.lineTo(cx, cy + R * 0.24); ctx.stroke();
        const b = 0.6 + 0.4 * Math.sin(t * 3), hs = R * (0.48 * b + 0.16);
        const glowSize = hs * 2.6;
        ctx.globalAlpha = 0.7;
        ctx.drawImage(galaxySprites.heart, cx - glowSize / 2, cy - glowSize / 2, glowSize, glowSize);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = rgba(PAL[30], 0.58); ctx.lineWidth = 1.6;
        ctx.beginPath(); heartPath(ctx, cx, cy, hs); ctx.stroke();
      }
    };
  }

  /* ================= 12. BUTTERFLIES (bướm về bên tim) ================= */

  function makeButterflies() {
    let w = 0, h = 0, bugs = [], px = -1e4, py = -1e4;
    function drawBug(ctx, b, col) {
      const flap = Math.abs(Math.sin(b.ph));
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(-b.sz * flap * 0.8, -b.sz * 0.2, b.sz * flap, b.sz * 0.7, 0.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(b.sz * flap * 0.8, -b.sz * 0.2, b.sz * flap, b.sz * 0.7, -0.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -b.sz * 0.6); ctx.lineTo(0, b.sz * 0.6); ctx.stroke();
      ctx.restore();
    }
    return {
      name: 'butterflies',
      pointer(x, y) { px = x; py = y; },
      resize(nw, nh) { w = nw; h = nh; },
      init() {
        bugs = [];
        const N = 26, cx = w / 2, cy = h * 0.46, S = Math.min(w, h) * 0.5;
        for (let i = 0; i < N; i++) {
          const th = i / N * TAU, home = heartPoint(th, S, cx, cy);
          bugs.push({ x: rnd(0, w), y: rnd(0, h), vx: 0, vy: 0, hx: home.x, hy: home.y, ph: rnd(0, TAU), hue: Math.random(), sz: rnd(7, 13) });
        }
      },
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, 'rgba(9,4,14,0.5)');
        ctx.globalCompositeOperation = 'lighter';
        const pull = Math.min(1, t / 3);
        for (const b of bugs) {
          b.ph += dt * 10;
          const gx = px > -1000 ? px : b.hx, gy = px > -1000 ? py : b.hy;
          b.vx += ((gx - b.x) * 0.9 + Math.cos(b.ph * 0.3) * 30) * dt * pull;
          b.vy += ((gy - b.y) * 0.9 + Math.sin(b.ph * 0.5) * 30) * dt * pull;
          b.vx *= 0.92; b.vy *= 0.92;
          b.x += b.vx * dt; b.y += b.vy * dt;
          drawBug(ctx, b, rgba(pickPal(b.hue), 0.9));
        }
      }
    };
  }

  /* ================= helpers chung cho các scene chi tiết ================= */

  // vết tim (dùng cho clip / stroke / fill)
  function heartPath(ctx, cx, cy, scale) {
    for (let i = 0; i <= 160; i++) {
      const t = i / 160 * TAU;
      const q = heartPoint(t, scale, cx, cy);
      if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawCar(ctx, x, y, t) {
    ctx.save(); ctx.translate(x, y);
    ctx.globalCompositeOperation = 'source-over';
    const grad = ctx.createLinearGradient(0, -34, 0, 4);
    grad.addColorStop(0, '#ff7aa8'); grad.addColorStop(1, '#b81f4e');
    ctx.fillStyle = grad;
    roundRect(ctx, -48, -22, 96, 24, 7); ctx.fill();
    roundRect(ctx, -26, -36, 48, 18, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,250,0.9)'; roundRect(ctx, -20, -33, 36, 13, 3); ctx.fill();
    ctx.fillStyle = '#ffe3ee'; ctx.fillRect(-48, -12, 96, 3);
    for (const wx of [-28, 28]) {
      ctx.save(); ctx.translate(wx, 4); ctx.rotate(t * 6);
      ctx.fillStyle = '#160810'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ================= 13. GALAXY 3D (xoay góc nhìn, sao gom lô, tim dựng sẵn) ================= */

  function makeGalaxy3d() {
    let w = 0, h = 0, buckets = [], rot = 0, tilt = 0.55, tiltT = 0.55, px = -1e4, py = -1e4, pulse = 0, glows = [], heartGlow = null;
    const outline = [], inner = [];
    for (let i = 0; i < 180; i++) outline.push(heartPoint(i / 180 * TAU, 1, 0, 0));
    for (let i = 0; i < 72; i++) inner.push(heartPoint(((i * 0.618) % 1) * TAU, (i % 7) / 7, 0, 0));

    function glowSprite(rgb) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      rg.addColorStop(0, 'rgba(' + rgb + ',0.28)'); rg.addColorStop(0.5, 'rgba(' + rgb + ',0.08)'); rg.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
      return c;
    }

    function heartGlowSprite() {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      rg.addColorStop(0, 'rgba(255,40,80,0.28)'); rg.addColorStop(0.5, 'rgba(255,40,80,0.08)'); rg.addColorStop(1, 'rgba(255,40,80,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
      return c;
    }

    return {
      name: 'galaxy3d',
      resize(nw, nh) { w = nw; h = nh; },
      init() {
        glows = [[255,90,130], [170,110,255], [255,190,110]].map(glowSprite);
        heartGlow = heartGlowSprite();
        const count = Math.max(450, Math.min(1200, Math.round(w * h / 1000)));
        buckets = Array.from({ length: 8 }, (_, i) => ({ color: rgba(pickPal(0.2 + 0.8 * i / 7), 1), stars: [] }));
        rot = 0; tilt = tiltT = 0.55; pulse = 0;
        for (let i = 0; i < count; i++) {
          const arm = i % 4, rad = Math.pow(Math.random(), 0.6);
          const a = arm * (TAU / 4) + rad * 3.6 + rnd(-0.3, 0.3);
          buckets[(rad * 7) | 0].stars.push({
            rad, ca: Math.cos(a), sa: Math.sin(a),
            y: (Math.random() - 0.5) * (1 - rad) * 0.5,
            tw: rnd(0, TAU), bright: Math.random() < 0.1,
            sz: Math.random() < 0.1 ? rnd(1.6, 2.6) : rnd(0.7, 1.4)
          });
        }
      },
      pointer(x, y) {
        if (px > -1000) {
          rot += (x - px) * 0.004;
          tiltT = Math.max(0.12, Math.min(1.25, tiltT + (y - py) * 0.003));
        }
        px = x; py = y;
      },
      leave() { px = -1e4; py = -1e4; },
      tap() { pulse = 1; },
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, 'rgba(6,2,10,0.5)');
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
        const cx = w / 2, cy = h * 0.58, R = Math.min(w, h) * 0.52;
        rot += dt * 0.26;
        if (px < -1000) tiltT = 0.55 + 0.28 * Math.sin(t * 0.22);
        tilt += (tiltT - tilt) * Math.min(1, dt * 6);
        const cosT = Math.cos(tilt), sinT = Math.sin(tilt), cosR = Math.cos(rot), sinR = Math.sin(rot);

        for (let i = 0; i < 3; i++) {
          const a = rot * 0.6 + i * 2.1, rr = R * (0.25 + i * 0.12);
          const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * cosT;
          const size = R * 0.6;
          ctx.drawImage(glows[i], x - size / 2, y - size * cosT / 2, size, size * cosT);
        }

        for (const bucket of buckets) {
          ctx.fillStyle = bucket.color;
          for (const s of bucket.stars) {
            const x = s.ca * cosR - s.sa * sinR, z = s.ca * sinR + s.sa * cosR;
            const y2 = s.y * cosT - z * sinT, z2 = s.y * sinT + z * cosT;
            const persp = 1 / (1.6 - z2 * 0.5);
            const sx = cx + x * s.rad * R * 2 * persp, sy = cy + y2 * s.rad * R * 1.7 * persp;
            s.tw += dt * 3;
            const size = s.sz * (0.6 + persp) * (0.72 + 0.28 * Math.abs(Math.sin(s.tw)));
            if (s.bright) { ctx.beginPath(); ctx.arc(sx, sy, size, 0, TAU); ctx.fill(); }
            else ctx.fillRect(sx - size, sy - size, size * 2, size * 2);
          }
        }

        pulse = Math.max(0, pulse - dt * 1.4);
        const beat = 1 + 0.06 * Math.sin(t * 3.2) + pulse * 0.18, hs = R * 0.46 * beat;
        const glowSize = hs * 1.6;
        ctx.globalAlpha = 0.85 + pulse * 0.15;
        ctx.drawImage(heartGlow, cx - glowSize / 2, cy - glowSize / 2, glowSize, glowSize);
        ctx.globalAlpha = 1;

        ctx.fillStyle = 'rgba(255,75,110,0.98)'; ctx.beginPath();
        for (let i = 0; i < outline.length; i++) {
          const q = outline[i], j = 0.5 + 0.5 * Math.sin(t * 4 + i), r = 1.1 + 1.2 * j;
          const x = cx + q.x * hs, y = cy + q.y * hs;
          ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
        }
        ctx.fill();

        ctx.fillStyle = 'rgba(255,205,220,0.68)'; ctx.beginPath();
        for (let i = 0; i < inner.length; i++) {
          const q = inner[i], j = 0.5 + 0.5 * Math.sin(t * 5 + i * 1.3), r = 0.7 + 0.8 * j;
          const x = cx + q.x * hs, y = cy + q.y * hs;
          ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
        }
        ctx.fill();
      }
    };
  }

  /* ================= 14. HEART TEXT (chữ chạy trong tim) ================= */

  function makeHeartText() {
    let w = 0, h = 0, items = [];
    const cfg = (window.CONFIG && window.CONFIG.names && window.CONFIG.names.length)
      ? window.CONFIG.names
      : ['Băng Băng', '冰冰', 'yêu', 'love', '520', '1314', '❤', 'tim'];
    return {
      name: 'heartText',
      resize(nw, nh) { w = nw; h = nh; },
      init() {
        const cx = w / 2, cy = h * 0.46, sc = Math.min(w, h) * 0.62;
        for (let i = 0; i < 48; i++) {
          items.push({ x: cx + rnd(-sc / 2, sc / 2), y: cy + rnd(-sc / 2, sc / 2), vy: -rnd(12, 34), txt: cfg[i % cfg.length], hue: Math.random(), sz: rnd(12, 24), a: rnd(0, TAU) });
        }
      },
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, '#0a0410');
        const cx = w / 2, cy = h * 0.58, sc = Math.min(w, h) * 0.62 * (1 + 0.04 * Math.sin(t * 3));
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(PAL[24], 0.5); ctx.lineWidth = 2; ctx.shadowBlur = 24; ctx.shadowColor = ROSE;
        ctx.beginPath(); heartPath(ctx, cx, cy, sc); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.save();
        ctx.beginPath(); heartPath(ctx, cx, cy, sc); ctx.clip();
        ctx.globalCompositeOperation = 'source-over';
        for (const it of items) {
          it.y += it.vy * dt; it.a += dt * 0.6;
          if (it.y < cy - sc * 0.5) { it.y = cy + sc * 0.5; it.x = cx + rnd(-sc / 2, sc / 2); }
          ctx.save(); ctx.translate(it.x + Math.sin(it.a) * 6, it.y); ctx.rotate(Math.sin(it.a) * 0.15);
          ctx.font = '600 ' + it.sz + 'px "Dancing Script", Inter, sans-serif'; ctx.textAlign = 'center';
          ctx.fillStyle = rgba(pickPal(0.2 + 0.6 * it.hue), 0.92);
          ctx.fillText(it.txt, 0, 0); ctx.restore();
        }
        ctx.restore();
      }
    };
  }

  /* ================= 15. PINK CITY (thành phố hồng 3 lớp sâu, tim neon, chạm để bắn tim) ================= */

  function makePinkCity() {
    let w = 0, h = 0, layers = [], hearts = [], bigs = [], stars = [], clouds = [], sparks = [], lamps = [], spawn = 0;
    const BASE = 0.9, WARM = ['255,214,150', '255,182,205', '205,230,255', '255,240,200'];
    function genLayer(hMin, hMax, wMin, wMax, lit, gap) {
      const out = []; let x = -10; const base = h * BASE;
      while (x < w + 10) {
        const bw = rnd(wMin, wMax), bh = rnd(h * hMin, h * hMax);
        const b = { x, w: bw, h: bh, win: [], ant: 0, tank: false, neon: null, tiers: Math.random() < 0.35 ? 1 + ((Math.random() * 2) | 0) : 0 };
        const cw = Math.max(3, bw * 0.1), ch = Math.max(4, bh * 0.03), gx = cw * 2.2, gy = ch * 2.4;
        for (let wy = base - bh + 14; wy < base - 10; wy += gy)
          for (let wx = x + 6; wx < x + bw - 6 - cw; wx += gx)
            if (Math.random() < lit) b.win.push({ x: wx, y: wy, w: cw, h: ch, c: WARM[(Math.random() * WARM.length) | 0], ph: rnd(0, TAU), sp: rnd(0.3, 1.2), fl: Math.random() < 0.06 });
        if (Math.random() < 0.35) b.ant = rnd(16, 44);
        if (Math.random() < 0.3) b.tank = true;
        if (bw > 80 && Math.random() < 0.55) b.neon = { x: x + bw / 2, y: base - bh + rnd(26, 60), s: rnd(9, 15), hue: Math.random(), ph: rnd(0, TAU) };
        out.push(b); x += bw + rnd(gap * 0.3, gap);
      }
      return out;
    }
    function gen() {
      layers = [
        { list: genLayer(0.10, 0.26, 18, 44, 0.2, 4), col: '#4a1a5c', top: '#6b2a74', winA: 0.35 },
        { list: genLayer(0.16, 0.40, 30, 72, 0.42, 6), col: '#2e0f40', top: '#451a55', winA: 0.65 },
        { list: genLayer(0.22, 0.54, 48, 124, 0.55, 10), col: '#150622', top: '#220b33', winA: 1 }
      ];
      stars = []; for (let i = 0; i < 160; i++) stars.push({ x: Math.random() * w, y: Math.random() * h * 0.45, ph: rnd(0, TAU), sp: rnd(1, 3), r: rnd(0.6, 1.6) });
      clouds = []; for (let i = 0; i < 6; i++) clouds.push({ x: Math.random() * w, y: h * rnd(0.06, 0.42), r: rnd(120, 300), sp: rnd(5, 14), a: rnd(0.05, 0.1) });
      lamps = []; for (let x = 30; x < w; x += rnd(90, 140)) lamps.push({ x, ph: rnd(0, TAU) });
      hearts = []; sparks = []; spawn = 0;
      bigs = []; for (let i = 0; i < 7; i++) bigs.push({ x: Math.random() * w, y: h * rnd(0.25, 0.7), s: rnd(40, 110), ph: rnd(0, TAU), hue: Math.random(), vy: -rnd(6, 14) });
    }
    return {
      name: 'pinkCity',
      resize(nw, nh) { w = nw; h = nh; gen(); },
      init() { gen(); },
      tap(x, y) {
        if (sparks.length > 1200) sparks.splice(0, sparks.length - 1200);
        for (let i = 0; i < 40; i++) {
          const a = i / 40 * TAU;
          const hx = 16 * Math.pow(Math.sin(a), 3), hy = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
          const sp = rnd(5, 7);
          sparks.push({ x, y, vx: hx * sp, vy: -hy * sp, g: 70, life: 1, hue: Math.random() });
        }
      },
      frame(ctx, t, dt) {
        const base = h * BASE;
        // bầu trời
        const g = ctx.createLinearGradient(0, 0, 0, base);
        g.addColorStop(0, '#160630'); g.addColorStop(0.45, '#4a1248'); g.addColorStop(0.8, '#b0306a'); g.addColorStop(1, '#ff7aa0');
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        // trăng + quầng + miệng núi lửa
        const mx = w * 0.78, my = h * 0.2, mr = Math.min(w, h) * 0.07;
        const mg = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4.5);
        mg.addColorStop(0, 'rgba(255,225,238,0.35)'); mg.addColorStop(1, 'rgba(255,200,230,0)');
        ctx.fillStyle = mg; ctx.fillRect(mx - mr * 4.5, my - mr * 4.5, mr * 9, mr * 9);
        ctx.fillStyle = '#ffe9f2'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(226,170,200,0.35)';
        ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.2, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + mr * 0.25, my + mr * 0.3, mr * 0.12, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + mr * 0.1, my - mr * 0.45, mr * 0.08, 0, TAU); ctx.fill();
        for (const s of stars) { s.ph += dt * s.sp; ctx.fillStyle = 'rgba(255,240,250,' + (0.25 + 0.6 * Math.abs(Math.sin(s.ph))).toFixed(2) + ')'; ctx.fillRect(s.x, s.y, s.r, s.r); }
        // mây mỏng trôi
        for (const c of clouds) {
          c.x += c.sp * dt; if (c.x - c.r > w) c.x = -c.r;
          ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1, 0.35);
          const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, c.r);
          cg.addColorStop(0, 'rgba(255,170,205,' + c.a.toFixed(2) + ')'); cg.addColorStop(1, 'rgba(255,170,205,0)');
          ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, c.r, 0, TAU); ctx.fill(); ctx.restore();
        }
        // nhà: xa -> gần, mỗi lớp vẽ thân (source-over) rồi cửa sổ (lighter)
        for (const ly of layers) {
          for (const b of ly.list) {
            const top = base - b.h, bg = ctx.createLinearGradient(0, top, 0, base);
            bg.addColorStop(0, ly.top); bg.addColorStop(1, ly.col);
            ctx.fillStyle = bg;
            const tierH = b.h * 0.08;
            ctx.fillRect(b.x, top + b.tiers * tierH, b.w, b.h - b.tiers * tierH + 2);
            let wd = b.w, x0 = b.x;
            for (let k = 0; k < b.tiers; k++) { wd *= 0.7; x0 += (b.w - wd) / 2; ctx.fillRect(x0, top + (b.tiers - 1 - k) * tierH, wd, tierH + 1); }
            if (b.ant) ctx.fillRect(b.x + b.w / 2 - 1, top - b.ant, 2, b.ant);
            if (b.tank) ctx.fillRect(b.x + b.w * 0.2, top - 12, b.w * 0.22, 12);
          }
          ctx.globalCompositeOperation = 'lighter';
          for (const b of ly.list) {
            const top = base - b.h;
            for (const wn of b.win) {
              let a = 0.5 + 0.5 * Math.sin(t * wn.sp + wn.ph);
              if (wn.fl && Math.sin(t * 22 + wn.ph) > 0.6) a *= 0.25;
              ctx.fillStyle = 'rgba(' + wn.c + ',' + (a * ly.winA).toFixed(2) + ')';
              ctx.fillRect(wn.x, wn.y, wn.w, wn.h);
            }
            if (b.ant && Math.sin(t * 3 + b.x) > 0.5) { ctx.fillStyle = 'rgba(255,60,90,' + ly.winA + ')'; ctx.fillRect(b.x + b.w / 2 - 1.5, top - b.ant - 1.5, 3, 3); }
            if (b.neon) {
              const k = 0.75 + 0.25 * Math.sin(t * 3 + b.neon.ph), col = pickPal(b.neon.hue);
              ctx.fillStyle = rgba(col, 0.16 * ly.winA);
              ctx.beginPath(); ctx.arc(b.neon.x, b.neon.y, b.neon.s * 2.6, 0, TAU); ctx.fill();
              drawMiniHeart(ctx, b.neon.x, b.neon.y, b.neon.s * k, 0, rgba(col, 0.95 * ly.winA));
            }
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        // đường phố: vỉa hè phát sáng + đèn đường
        ctx.fillStyle = '#0c0418'; ctx.fillRect(0, base, w, h - base);
        const rg = ctx.createLinearGradient(0, base, 0, h);
        rg.addColorStop(0, 'rgba(255,122,160,0.28)'); rg.addColorStop(1, 'rgba(255,122,160,0)');
        ctx.fillStyle = rg; ctx.fillRect(0, base, w, h - base);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,170,200,0.55)'; ctx.fillRect(0, base, w, 1.5);
        for (const l of lamps) {
          const ly = base + (h - base) * 0.35, a = 0.6 + 0.3 * Math.sin(t * 2 + l.ph);
          const lg = ctx.createRadialGradient(l.x, ly, 0, l.x, ly, 26);
          lg.addColorStop(0, 'rgba(255,230,180,' + (a * 0.5).toFixed(2) + ')'); lg.addColorStop(1, 'rgba(255,230,180,0)');
          ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(l.x, ly, 26, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,240,210,' + a.toFixed(2) + ')'; ctx.fillRect(l.x - 1, ly, 2, 2);
        }
        // tim bóng đồ lớn trôi trên thành phố
        for (const p of bigs) {
          p.ph += dt * 0.6; p.y += p.vy * dt; p.x += Math.sin(p.ph) * 8 * dt;
          if (p.y < -p.s) { p.y = h + p.s; p.x = Math.random() * w; }
          const rot = Math.sin(p.ph) * 0.15;
          drawMiniHeart(ctx, p.x, p.y, p.s * 1.12, rot, rgba(pickPal(p.hue), 0.07));
          drawMiniHeart(ctx, p.x, p.y, p.s, rot, rgba(pickPal(p.hue), 0.09));
        }
        // mưa tim nhỏ
        spawn -= dt;
        if (spawn <= 0 && hearts.length < 90) { spawn = rnd(0.04, 0.12); hearts.push({ x: rnd(0, w), y: h + 20, vy: -rnd(40, 120), s: rnd(6, 18), ph: rnd(0, TAU), hue: Math.random() }); }
        for (let i = hearts.length - 1; i >= 0; i--) {
          const p = hearts[i]; p.ph += dt * 2; p.y += p.vy * dt; p.x += Math.sin(p.ph) * 16 * dt;
          if (p.y < -30) { hearts.splice(i, 1); continue; }
          drawMiniHeart(ctx, p.x, p.y, p.s, Math.sin(p.ph) * 0.25, rgba(pickPal(p.hue), 0.9));
        }
        // pháo tim người chơi bắn
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += s.g * dt; s.vx *= 0.98; s.vy *= 0.98; s.life -= dt * 0.7;
          if (s.life <= 0) { sparks.splice(i, 1); continue; }
          ctx.fillStyle = rgba(pickPal(s.hue), s.life);
          ctx.beginPath(); ctx.arc(s.x, s.y, 2.4 * s.life + 0.5, 0, TAU); ctx.fill();
        }
      }
    };
  }

  /* ================= 16. BALLOON CAR (bóng bay tim chở xe) ================= */

  function makeBalloonCar() {
    let w = 0, h = 0, balloons = [], carX = 0;
    return {
      name: 'balloonCar',
      resize(nw, nh) { w = nw; h = nh; },
      init() { balloons = []; for (let i = 0; i < 24; i++) balloons.push({ ox: rnd(-150, 150), oy: rnd(-210, -70), s: rnd(22, 44), ph: rnd(0, TAU), hue: Math.random() }); carX = -180; },
      frame(ctx, t, dt) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#150822'); g.addColorStop(0.7, '#3a1030'); g.addColorStop(1, '#5a1a3a');
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 46; i++) { const x = (i * 97.3) % w, y = (i * 53.7) % (h * 0.5); ctx.fillStyle = 'rgba(255,240,250,' + (0.25 + 0.3 * Math.sin(t * 2 + i)).toFixed(2) + ')'; ctx.fillRect(x, y, 1.4, 1.4); }
        carX += Math.min(w, h) * 0.12 * dt; if (carX > w + 200) carX = -200;
        const groundY = h * 0.72, bob = Math.sin(t * 3) * 4, cx = carX, cy = groundY + bob;
        const anchorX = cx + 40, anchorY = cy - 26;
        ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = 'rgba(255,220,235,0.4)'; ctx.lineWidth = 1;
        for (const b of balloons) { b.ph += dt * 1.6; const bx = anchorX + b.ox + Math.sin(b.ph) * 10, by = anchorY + b.oy + Math.cos(b.ph * 0.8) * 8; ctx.beginPath(); ctx.moveTo(anchorX, anchorY); ctx.lineTo(bx, by); ctx.stroke(); }
        ctx.globalCompositeOperation = 'lighter';
        for (const b of balloons) { const bx = anchorX + b.ox + Math.sin(b.ph) * 10, by = anchorY + b.oy + Math.cos(b.ph * 0.8) * 8;
          drawMiniHeart(ctx, bx, by, b.s, Math.sin(b.ph) * 0.12, rgba(pickPal(b.hue), 0.9));
          ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(bx - b.s * 0.3, by - b.s * 0.5, b.s * 0.12, 0, TAU); ctx.fill(); }
        drawCar(ctx, cx, cy, t);
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(18,6,16,0.92)'; ctx.fillRect(0, groundY + 14, w, h - groundY);
      }
    };
  }

  /* ================= 17. CITY FIREWORKS (pháo hoa tim trên phố, chạm để bắn) ================= */

  function makeCityFireworks() {
    let w = 0, h = 0, layers = [], rockets = [], sparks = [], stars = [], spawn = 0;
    const G = 300, BASE = 0.9;
    function genRow(hMin, hMax, wMin, wMax, lit) {
      const out = []; let x = -10; const base = h * BASE;
      while (x < w + 10) {
        const bw = rnd(wMin, wMax), bh = rnd(h * hMin, h * hMax), b = { x, y: base - bh, w: bw, h: bh, win: [], ant: Math.random() < 0.3 ? rnd(14, 40) : 0 };
        for (let wy = b.y + 8; wy < base - 6; wy += 11) for (let wx = x + 5; wx < x + bw - 7; wx += 10) if (Math.random() < lit) b.win.push({ x: wx, y: wy, ph: rnd(0, TAU), sp: rnd(0.5, 2) });
        out.push(b); x += bw + rnd(3, 10);
      }
      return out;
    }
    function gen() {
      layers = [
        { list: genRow(0.06, 0.18, 16, 40, 0.15), col: '#1a0b26', a: 0.3 },
        { list: genRow(0.10, 0.32, 28, 70, 0.3), col: '#0a0410', a: 1 }
      ];
      stars = []; for (let i = 0; i < 160; i++) stars.push({ x: rnd(0, w), y: rnd(0, h * 0.6), tw: rnd(0, TAU), r: rnd(0.6, 1.6) });
    }
    function explode(r) {
      const S = Math.min(w, h) / 800, n = r.heart ? 120 : 90;
      for (let i = 0; i < n; i++) {
        let vx, vy;
        if (r.heart) {
          const th = i / n * TAU;
          vx = 16 * Math.pow(Math.sin(th), 3) * rnd(9, 12) * S;
          vy = -(13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th)) * rnd(9, 12) * S;
        } else { const a = i / n * TAU, sp = rnd(140, 340) * S; vx = Math.cos(a) * sp; vy = Math.sin(a) * sp; }
        sparks.push({ x: r.x, y: r.y, vx, vy, g: 100, life: 1, ttl: rnd(1.5, 2.5), rad: rnd(1.6, 3.2), hue: r.hue + rnd(-0.06, 0.06), tw: rnd(0, TAU), crackle: Math.random() < 0.22, done: false });
      }
      sparks.push({ x: r.x, y: r.y, ring: true, r: 4, life: 1, hue: r.hue });
    }
    function launch(x, ty, fromY) {
      if (rockets.length >= 24) return;
      rockets.push({ x, y: fromY, ty, vy: -Math.sqrt(2 * G * (fromY - ty)) * 1.04, hue: Math.random(), heart: Math.random() < 0.75, trail: 0 });
    }
    return {
      name: 'cityFireworks',
      resize(nw, nh) { w = nw; h = nh; gen(); },
      init() { gen(); rockets = []; sparks = []; spawn = 0; },
      tap(x, y) { launch(x, Math.max(30, Math.min(y, h * BASE - h * 0.3)), h * BASE - 4); },
      frame(ctx, t, dt) {
        const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a0414'); g.addColorStop(1, '#2a0a34');
        if (sparks.length > 2400) sparks.splice(0, sparks.length - 2400);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        for (const s of stars) { s.tw += dt * 3; ctx.fillStyle = 'rgba(255,240,250,' + (0.3 + 0.5 * Math.sin(s.tw)).toFixed(2) + ')'; ctx.fillRect(s.x, s.y, s.r, s.r); }
        spawn -= dt;
        if (spawn <= 0) {
          spawn = rnd(0.35, 0.85);
          const ly = layers[1], b = ly.list[(Math.random() * ly.list.length) | 0] || { x: w / 2, y: h * BASE, w: 0 };
          launch(b.x + b.w / 2, rnd(h * 0.1, h * 0.42), b.y);
        }
        // tên lửa + đuôi lửa
        for (let i = rockets.length - 1; i >= 0; i--) {
          const r = rockets[i]; r.y += r.vy * dt; r.vy += G * dt; r.trail -= dt;
          if (r.trail <= 0) {
            r.trail = 0.016;
            sparks.push({ x: r.x + rnd(-1.5, 1.5), y: r.y, vx: rnd(-12, 12), vy: rnd(20, 60), g: 60, life: 1, ttl: rnd(0.25, 0.5), rad: 1, hue: 0.95, tw: 0, crackle: false, done: true });
          }
          ctx.fillStyle = 'rgba(255,240,210,0.95)'; ctx.beginPath(); ctx.arc(r.x, r.y, 2.2, 0, TAU); ctx.fill();
          if (r.y <= r.ty || r.vy >= 0) { explode(r); rockets.splice(i, 1); }
        }
        // đốm lửa
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          if (s.ring) {
            s.r += dt * Math.min(w, h) * 0.9; s.life -= dt * 2.4;
            if (s.life <= 0) { sparks.splice(i, 1); continue; }
            ctx.strokeStyle = rgba(pickPal(s.hue), s.life * 0.6); ctx.lineWidth = 2 * s.life;
            ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.stroke(); continue;
          }
          s.x += s.vx * dt; s.y += s.vy * dt; s.vy += s.g * dt; s.vx *= 0.982; s.vy *= 0.982; s.tw += dt * 28; s.life -= dt / s.ttl;
          if (s.life <= 0) { sparks.splice(i, 1); continue; }
          if (s.crackle && !s.done && s.life < 0.45) {
            s.done = true;
            for (let k = 0; k < 5; k++) {
              const a = rnd(0, TAU), sp = rnd(30, 110);
              sparks.push({ x: s.x, y: s.y, vx: s.vx * 0.3 + Math.cos(a) * sp, vy: s.vy * 0.3 + Math.sin(a) * sp, g: 80, life: 0.7, ttl: rnd(0.5, 0.9), rad: 1, hue: s.hue, tw: rnd(0, TAU), crackle: false, done: true });
            }
          }
          const a = s.life < 0.5 ? s.life * (0.45 + 0.55 * Math.abs(Math.sin(s.tw))) : Math.min(1, s.life * 1.3);
          ctx.fillStyle = rgba(pickPal(s.hue), a); ctx.beginPath(); ctx.arc(s.x, s.y, s.rad * Math.max(0.35, s.life), 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.5).toFixed(2) + ')'; ctx.fillRect(s.x - 0.6, s.y - 0.6, 1.2, 1.2);
        }
        // skyline: xa -> gần (che pháo hoa phía sau)
        ctx.globalCompositeOperation = 'source-over';
        const base = h * BASE;
        for (const ly of layers) {
          ctx.fillStyle = ly.col;
          for (const b of ly.list) { ctx.fillRect(b.x, b.y, b.w, b.h + 40); if (b.ant) ctx.fillRect(b.x + b.w / 2 - 1, b.y - b.ant, 2, b.ant); }
          for (const b of ly.list) for (const win of b.win) {
            const on = 0.5 + 0.5 * Math.sin(t * win.sp + win.ph);
            ctx.fillStyle = 'rgba(255,210,120,' + ((0.1 + 0.5 * on) * ly.a).toFixed(2) + ')'; ctx.fillRect(win.x, win.y, 3, 4);
          }
        }
      }
    };
  }

  /* ================= 18. DNA HEARTS (xoắn kép trái tim) ================= */

  function makeDnaHearts() {
    let w = 0, h = 0;
    return {
      name: 'dnaHearts',
      resize(nw, nh) { w = nw; h = nh; },
      init() {},
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, 'rgba(8,3,12,0.5)');
        ctx.globalCompositeOperation = 'lighter';
        const cx = w / 2, N = 18, gap = h * 0.9 / N, amp = Math.min(w, h) * 0.24;
        for (let i = 0; i <= N; i++) {
          const y = h * 0.05 + i * gap, ph = t * 1.6 + i * 0.5;
          const x1 = cx + Math.sin(ph) * amp, x2 = cx + Math.sin(ph + Math.PI) * amp;
          const z1 = Math.cos(ph), z2 = Math.cos(ph + Math.PI);
          ctx.strokeStyle = rgba(PAL[20], 0.22); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
          drawMiniHeart(ctx, x1, y, 8 + 7 * ((z1 + 1) / 2), 0, rgba(pickPal(0.2 + 0.4 * (z1 + 1) / 2), 0.9));
          drawMiniHeart(ctx, x2, y, 8 + 7 * ((z2 + 1) / 2), 0, rgba(pickPal(0.6 + 0.4 * (z2 + 1) / 2), 0.9));
        }
      }
    };
  }

  /* ================= 19. STARDUST HEART (bụi sao vẽ tim) ================= */

  function makeStardustHeart() {
    let w = 0, h = 0, fresh = true, ang = 0, burst = [];
    return {
      name: 'stardustHeart',
      resize(nw, nh) { w = nw; h = nh; },
      init() { fresh = true; ang = 0; burst = []; },
      tap(x, y) {
        for (let i = 0; i < 44; i++) {
          const a = rnd(0, TAU), sp = rnd(60, 320);
          burst.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, sz: rnd(0.8, 2.4) });
        }
      },
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, fresh ? '#08030c' : 'rgba(8,3,12,0.03)'); fresh = false;
        ctx.globalCompositeOperation = 'lighter';
        for (let i = burst.length - 1; i >= 0; i--) {
          const p = burst[i];
          p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; p.life -= dt * 0.9;
          if (p.life <= 0) { burst.splice(i, 1); continue; }
          ctx.fillStyle = rgba(pickPal(0.5 + 0.5 * Math.sin(i + t * 3)), p.life);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.sz * p.life + 0.3, 0, TAU); ctx.fill();
        }
        const cx = w / 2, cy = h * 0.46, S = Math.min(w, h) * 0.5, sub = 40;
        ctx.shadowBlur = 10; ctx.shadowColor = ROSE;
        for (let s = 0; s < sub; s++) {
          ang += dt * 3 / sub;
          const wob = 1 + 0.12 * Math.sin(ang * 3 + t);
          const q = heartPoint(ang, S * wob, cx, cy);
          ctx.fillStyle = rgba(pickPal(0.5 + 0.5 * Math.sin(ang * 2)), 0.9);
          ctx.beginPath(); ctx.arc(q.x, q.y, 1.6, 0, TAU); ctx.fill();
        }
        ctx.shadowBlur = 0;
        if (Math.random() < 0.7) { const th = Math.random() * TAU, q = heartPoint(th, S, cx, cy);
          ctx.fillStyle = 'rgba(255,255,255,' + rnd(0.3, 0.8).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(q.x + rnd(-6, 6), q.y + rnd(-6, 6), rnd(0.5, 1.6), 0, TAU); ctx.fill(); }
      }
    };
  }

  /* ================= 20. HEART CONFETTI (mưa trái tim) ================= */

  function makeHeartConfetti() {
    let w = 0, h = 0, parts = [], spawn = 0;
    return {
      name: 'heartConfetti',
      resize(nw, nh) { w = nw; h = nh; },
      init() { parts = []; spawn = 0; },
      tap(x, y) {
        for (let k = 0; k < 28; k++) {
          const a = rnd(0, TAU), sp = rnd(80, 340);
          parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, s: rnd(6, 16), rot: rnd(0, TAU), vr: rnd(-3, 3), hue: Math.random(), sw: rnd(0, TAU) });
        }
      },
      frame(ctx, t, dt) {
        fillBg(ctx, w, h, 'rgba(10,3,12,0.4)');
        ctx.globalCompositeOperation = 'lighter';
        spawn -= dt;
        if (spawn <= 0 && parts.length < 220) { spawn = rnd(0.01, 0.04);
          parts.push({ x: rnd(0, w), y: -20, vx: rnd(-30, 30), vy: rnd(60, 180), s: rnd(6, 20), rot: rnd(0, TAU), vr: rnd(-3, 3), hue: Math.random(), sw: rnd(0, TAU) }); }
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i]; p.sw += dt * 3; p.x += (p.vx + Math.sin(p.sw) * 30) * dt; p.y += p.vy * dt; p.vy += 40 * dt; p.rot += p.vr * dt;
          if (p.y > h + 30) { parts.splice(i, 1); continue; }
          drawMiniHeart(ctx, p.x, p.y, p.s, p.rot, rgba(pickPal(p.hue), 0.9));
        }
      }
    };
  }

  /* ================= registry ================= */

  const FACTORY = {
    constellation: makeConstellation,
    phyllotaxis: makePhyllotaxis,
    aurora: makeAurora,
    meteor: makeMeteor,
    heartTunnel: makeHeartTunnel,
    bubbles: makeBubbles,
    ecg: makeEcg,
    rhodonea: makeRhodonea,
    fireworks: makeFireworks,
    sakura: makeSakura,
    galaxy: makeGalaxy,
    butterflies: makeButterflies,
    galaxy3d: makeGalaxy3d,
    heartText: makeHeartText,
    pinkCity: makePinkCity,
    balloonCar: makeBalloonCar,
    cityFireworks: makeCityFireworks,
    dnaHearts: makeDnaHearts,
    stardustHeart: makeStardustHeart,
    heartConfetti: makeHeartConfetti
  };

  window.FX = {
    heartPoint, PAL,
    names() { return Object.keys(FACTORY); },
    create(name) { return FACTORY[name] ? FACTORY[name]() : null; },
    shuffled() {
      const a = Object.keys(FACTORY);
      for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
  };
})();

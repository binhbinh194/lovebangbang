/**
 * main.js — logic DOM tối giản.
 * Mỗi lần bấm "yêu anh" dựng một hiệu ứng (js/stage.js + js/effects.js).
 * Hết danh sách thì Stage tự lặp lại từ đầu.
 */
'use strict';

(function () {
  const C = window.CONFIG || {};
  const $ = (sel) => document.querySelector(sel);

  function applyText() {
    setText('[data-k="question"]', C.question);
    setText('[data-k="yes"]', C.yesLabel);
    setText('[data-k="no"]', C.noLabel);
    document.title = C.question || 'Dành riêng cho Băng Băng';
  }

  function setText(sel, value) {
    const el = $(sel);
    if (el && value) el.textContent = value;
  }

  /* ---------- hai nút ---------- */

  const COOLDOWN = 2000;
  let cooling = false;

  function lock(yes) {
    cooling = true;
    yes.classList.add('cooling');
    yes.disabled = true;
    setTimeout(() => {
      cooling = false;
      yes.classList.remove('cooling');
      yes.disabled = false;
    }, COOLDOWN);
  }

  function wireActions() {
    const yes = $('#btnYes');
    wireNoFlee();
    if (!yes) return;

    yes.addEventListener('click', () => {
      if (cooling) return;
      if (window.Stage && Stage.transitioning()) return;
      lock(yes);
      if (window.Stage) Stage.advance();
    });
  }

  /* ---------- nút "ghét": không cho bấm, chạy trốn khi chạm/hover ---------- */

  function wireNoFlee() {
    const no = $('#btnNo');
    if (!no) return;
    let dodges = 0;

    const flee = (ev) => {
      if (ev && ev.cancelable) ev.preventDefault();
      dodges++;
      const pad = 14;
      const w = no.offsetWidth, h = no.offsetHeight;
      const maxX = Math.max(pad, window.innerWidth - w - pad);
      const maxY = Math.max(pad, window.innerHeight - h - pad);
      const x = pad + Math.random() * (maxX - pad);
      const y = pad + Math.random() * (maxY - pad);
      no.style.position = 'fixed';
      no.style.left = x + 'px';
      no.style.top = y + 'px';
      no.style.zIndex = 6;
      no.style.transform = `rotate(${(Math.random() - 0.5) * 40}deg) scale(${Math.max(0.55, 1 - dodges * 0.04)})`;
      if (dodges >= 10) no.style.opacity = '0.35';
    };

    no.addEventListener('mouseenter', flee);
    no.addEventListener('touchstart', flee, { passive: false });
    no.addEventListener('pointerdown', flee);
    no.addEventListener('click', flee);
  }

  function boot() {
    applyText();
    wireActions();
    window.Heart && window.Heart.start();
    window.Stage && Stage.reset();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

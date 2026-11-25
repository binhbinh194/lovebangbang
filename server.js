/**
 * server.js — static server không dependency cho web tỏ tình.
 *
 *   node server.js            -> http://localhost:4173
 *   PORT=8080 node server.js  -> http://localhost:8080
 *
 * Cờ tiện dụng:
 *   http://localhost:4173/?skip=1   -> bỏ qua màn phong bì, vào thẳng lời tỏ tình (chụp/quay nhanh)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 4173);
const ROOT = path.join(__dirname, 'public');
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function reply(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function resolveTarget(urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const abs = path.normalize(path.join(ROOT, rel));
  // Chặn traversal ra ngoài thư mục public.
  if (!abs.toLowerCase().startsWith(ROOT.toLowerCase())) return null;
  return abs;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return reply(res, 405, 'Method not allowed');
  }

  if (req.url.startsWith('/api/health')) {
    return reply(res, 200, JSON.stringify({ ok: true, uptime: process.uptime() }), MIME['.json']);
  }

  const abs = resolveTarget(req.url);
  if (!abs) return reply(res, 400, 'Bad path');

  fs.stat(abs, (err, stat) => {
    if (err) return reply(res, 404, 'Không tìm thấy: ' + req.url);

    if (stat.isDirectory()) {
      const inner = path.join(abs, 'index.html');
      return fs.readFile(inner, (e2, buf) =>
        e2 ? reply(res, 404, 'Không tìm thấy thư mục') : reply(res, 200, buf, MIME['.html'])
      );
    }

    const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    const range = parseRange(req.headers.range, stat.size);

    // Hỗ trợ Range: gắn mp3/video vào <audio> thì tua được, không vỡ trên iOS Safari.
    if (range) {
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': range.end - range.start + 1,
        'Cache-Control': 'no-store'
      });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(abs, { start: range.start, end: range.end })
        .pipe(res).on('error', () => res.destroy());
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(abs).pipe(res).on('error', () => res.destroy());
  });
});

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!m) return null;
  let start = m[1] === '' ? null : Number(m[1]);
  let end = m[2] === '' ? null : Number(m[2]);
  if (start === null) { start = Math.max(0, size - (end || size)); end = size - 1; }
  else if (end === null || end >= size) end = size - 1;
  if (start > end || start >= size) return null;
  return { start, end };
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[x] Cổng ${PORT} đang bị chiếm. Chạy: $env:PORT=4174; node server.js`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log('============================================================');
  console.log('  WEB TỎ TÌNH — sân khấu đã dựng, chi tiết chờ cấp sau');
  console.log(`  Mở cho cô ấy   : http://localhost:${PORT}`);
  console.log(`  Quay/chụp nhanh: http://localhost:${PORT}/?skip=1`);
  console.log('  Chữ nghĩa: sửa public/js/config.js (không đụng HTML).');
  console.log('  Ảnh chờ : public/assets/photo1.jpg .. photo4.jpg');
  console.log('  Nhạc chờ: public/assets/bg.mp3');
  console.log('============================================================');
});

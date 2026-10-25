/**
 * 极简静态服务器（零依赖），用于本地预览与真机调试。
 *
 *   node tools/serve.mjs            # 端口 8123，目录 web/
 *   node tools/serve.mjs 9000       # 自定义端口
 *   node tools/serve.mjs 9000 ./web
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const port = Number(process.argv[2] || 8123);
const root = path.resolve(process.argv[3] || path.join(process.cwd(), 'web'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    let filePath = path.join(root, pathname);
    if (!filePath.startsWith(root)) return send(res, 403, 'Forbidden');

    let info = null;
    try {
      info = await stat(filePath);
    } catch {
      info = null;
    }
    if (info && info.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      try {
        info = await stat(filePath);
      } catch {
        info = null;
      }
    }
    if (!info) {
      // 没有扩展名当作前端路由，回退到 index.html
      if (!path.extname(pathname)) {
        filePath = path.join(root, 'index.html');
        info = await stat(filePath).catch(() => null);
      }
    }
    if (!info) return send(res, 404, 'Not Found');

    const body = await readFile(filePath);
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    return send(res, 200, body, { 'Content-Type': type });
  } catch (err) {
    return send(res, 500, `Server Error: ${err.message}`);
  }
});

server.listen(port, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const lan = [];
  Object.values(nets).forEach((list) => {
    (list || []).forEach((n) => {
      if (n.family === 'IPv4' && !n.internal) lan.push(n.address);
    });
  });
  console.log(`模拟考场 · 本地服务已启动 (root=${root})`);
  console.log(`  本机:   http://localhost:${port}/`);
  lan.forEach((ip) => console.log(`  局域网: http://${ip}:${port}/   （手机连同一 Wi-Fi 可访问）`));
  console.log('按 Ctrl+C 停止');
});

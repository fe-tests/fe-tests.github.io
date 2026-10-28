#!/usr/bin/env node
/**
 * 零依赖静态服务器（只用 Node 内置模块），监听 0.0.0.0 以支持局域网访问。
 *
 * 用法：
 *   node server.js                    # 默认 0.0.0.0:39977
 *   node server.js --port=3000        # 指定端口
 *   node server.js --host=127.0.0.1   # 只允许本机访问
 *   PORT=3000 node server.js          # 环境变量同样生效
 *
 * 站点根目录 = 本文件所在目录（index.html / registry.json / examples/）。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* ------------------------------ 参数解析 ------------------------------ */
const argv = process.argv.slice(2);
const argOf = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};

const PORT = Number(process.env.PORT || argOf('port', '39977'));
const HOST = process.env.HOST || argOf('host', '0.0.0.0');
const ROOT = __dirname;
const LOG = process.env.QUIET !== '1';

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`[server] 非法端口: ${PORT}`);
  process.exit(1);
}

/* ------------------------------ MIME 表 ------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

const NO_CACHE_RE = /(\.html?|\/registry\.json)$/i; // 首页与注册表：改完刷新即生效

/* ------------------------------ 工具函数 ------------------------------ */
function lanIPv4() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const it of list || []) {
      const v4 = it.family === 'IPv4' || it.family === 4;
      if (v4 && !it.internal) out.push({ name, address: it.address });
    }
  }
  return out;
}

/** 把 URL 路径安全映射到磁盘路径；越界返回 null。 */
function resolveFile(rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://localhost').pathname);
  } catch {
    return { error: 400 };
  }

  const rel = path.normalize(pathname).replace(/^([\\/])+/g, ''); // 去掉开头的 /，防越界
  let target = path.join(ROOT, rel);

  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return { error: 403 };

  let st = null;
  try {
    st = fs.statSync(target);
  } catch {
    return { error: 404 };
  }

  if (st.isDirectory()) {
    target = path.join(target, 'index.html'); // 目录 → 该目录下的 index.html
    try {
      st = fs.statSync(target);
    } catch {
      return { error: 404 };
    }
  }
  if (!st.isFile()) return { error: 404 };
  return { file: target, stat: st };
}

function send(res, code, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': buf.length, ...headers });
  res.end(buf);
}

const PAGE_404 = (p) =>
  `<!doctype html><meta charset="utf-8"><title>404</title>` +
  `<body style="font:16px/1.8 system-ui;padding:48px;background:#0f1115;color:#e6e6e6">` +
  `<h1>404 Not Found</h1><p>找不到 <code>${p}</code></p>` +
  `<p><a style="color:#7aa2f7" href="/">← 返回首页</a></p>`;

/* ------------------------------ 请求处理 ------------------------------ */
function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }

  const hit = resolveFile(req.url);
  if (hit.error) {
    const msg = { 400: 'Bad Request', 403: '403 禁止越界访问站点根目录之外', 404: '404 Not Found' }[hit.error];
    if (hit.error === 404 && /\.html?$/i.test(req.url)) return send(res, 404, PAGE_404(req.url), { 'Content-Type': 'text/html; charset=utf-8' });
    return send(res, hit.error, msg);
  }

  const { file, stat } = hit;
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const cache = NO_CACHE_RE.test(file) ? 'no-store' : 'public, max-age=300';
  const etag = `W/"${stat.size}-${Number(stat.mtime).toString(36)}"`;

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cache });
    return res.end();
  }

  const base = {
    'Content-Type': type,
    'Cache-Control': cache,
    ETag: etag,
    'Last-Modified': stat.mtime.toUTCString(),
    'Access-Control-Allow-Origin': '*', // 便于 examples 内页面跨端口取数据
  };

  // Range：音频/大文件分段请求（音乐编辑器、3D 资源等）
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    const total = stat.size;
    let start = range[1] ? Number(range[1]) : 0;
    let end = range[2] ? Number(range[2]) : total - 1;
    if (start > end || end >= total) {
      return send(res, 416, 'Range Not Satisfiable', { 'Content-Range': `bytes */${total}` });
    }
    res.writeHead(206, { ...base, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Accept-Ranges': 'bytes' });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }

  res.writeHead(200, { ...base, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

/* ------------------------------ 启动 ------------------------------ */
const server = http.createServer((req, res) => {
  const t0 = Date.now();
  res.on('finish', () => {
    if (LOG) console.log(`${new Date().toISOString().slice(11, 19)}  ${res.statusCode}  ${String(Date.now() - t0).padStart(4)}ms  ${req.method} ${req.url}`);
  });
  try {
    handler(req, res);
  } catch (err) {
    console.error('[server] 内部错误:', err.message);
    if (!res.headersSent) send(res, 500, 'Internal Server Error');
    else res.end();
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`[server] 端口 ${PORT} 已被占用。换端口：node server.js --port=${PORT + 1}`);
  else if (err.code === 'EACCES') console.error(`[server] 无权限监听 ${HOST}:${PORT}（端口过小或权限不足）。`);
  else console.error('[server] 启动失败:', err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' || HOST === '::' ? null : HOST;
  console.log('\n  静态站点已启动（Ctrl+C 停止）\n');
  console.log(`  本机访问   : http://localhost:${PORT}/`);
  if (!shown) {
    const ips = lanIPv4();
    if (ips.length) {
      console.log('  局域网访问 :');
      for (const ip of ips) console.log(`    http://${ip.address}:${PORT}/   (${ip.name})`);
      console.log('\n  手机/其他设备与本机需在同一 Wi-Fi（同网段），用上面的地址打开。');
      console.log('  若访问不通：Windows 防火墙放行 —— 以管理员运行：');
      console.log(`    netsh advfirewall firewall add rule name="node static ${PORT}" dir=in action=allow protocol=TCP localport=${PORT}`);
    } else {
      console.log('  局域网访问 : 未检测到有线/无线网卡 IPv4，请确认已连网');
    }
  }
  console.log(`\n  根目录: ${ROOT}\n  监听: ${HOST}:${PORT}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n[server] 正在关闭…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}

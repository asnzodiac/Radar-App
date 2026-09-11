const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.APP_PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
  // CORS headers for all local requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse and validate the requested path before resolving it under PUBLIC_DIR.
  let reqPath = '/index.html';
  try {
    reqPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }

  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const filePath = path.resolve(PUBLIC_DIR, `.${reqPath}`);
  const relativePath = path.relative(PUBLIC_DIR, filePath);
  if (relativePath.startsWith('..' + path.sep) || relativePath === '..' || path.isAbsolute(relativePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    let resolvedFilePath = filePath;
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA routing if requested
      resolvedFilePath = path.join(PUBLIC_DIR, 'index.html');
    }

    fs.readFile(resolvedFilePath, (readErr, data) => {
      if (res.writableEnded) return;

      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(resolvedFilePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    });
  });
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

server.on('clientError', (err, socket) => {
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

// Keep process active
setInterval(() => {}, 1000 * 60 * 60);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`AIX SEC OPS server listening on http://0.0.0.0:${PORT}`);
});

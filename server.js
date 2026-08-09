const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'photos.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ photos: [] }, null, 2), 'utf8');
}

function readPhotos() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.photos)) {
      return { photos: [] };
    }
    return parsed;
  } catch (err) {
    console.error('Failed to read photo store:', err);
    return { photos: [] };
  }
}

function writePhotos(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res) {
  const requestedPath = req.url === '/' ? '/index.html' : req.url;
  const safePath = decodeURIComponent(requestedPath.split('?')[0]);
  const targetPath = path.normalize(path.join(ROOT, safePath));

  if (!targetPath.startsWith(ROOT)) {
    sendJson(res, 403, { error: 'Forbidden path' });
    return;
  }

  fs.readFile(targetPath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const extension = path.extname(targetPath).toLowerCase();
    const typeMap = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml'
    };

    res.writeHead(200, {
      'Content-Type': typeMap[extension] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (req.url.startsWith('/api/photos')) {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET') {
      const current = readPhotos();
      const id = url.pathname.split('/').pop();

      if (id && id !== 'photos') {
        const match = current.photos.find((photo) => photo.id === id);
        if (!match) {
          sendJson(res, 404, { error: 'Photo not found' });
          return;
        }
        sendJson(res, 200, { photo: match });
        return;
      }

      sendJson(res, 200, { photos: current.photos });
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const incoming = payload && payload.image ? payload : null;
          if (!incoming || !incoming.image) {
            sendJson(res, 400, { error: 'Missing photo image' });
            return;
          }

          const current = readPhotos();
          const photoId = String(payload.id || crypto.randomUUID());
          const photo = {
            id: photoId,
            image: incoming.image,
            caption: String(incoming.caption || ''),
            uploader: String(incoming.uploader || ''),
            ts: Number(incoming.ts) || Date.now()
          };

          const existingIndex = current.photos.findIndex((item) => item.id === photoId);
          if (existingIndex >= 0) {
            current.photos[existingIndex] = photo;
          } else {
            current.photos.push(photo);
          }

          writePhotos(current);
          sendJson(res, 200, { ok: true, photo });
        } catch (err) {
          console.error('POST /api/photos failed:', err);
          sendJson(res, 400, { error: 'Invalid upload payload' });
        }
      });
      return;
    }

    if (req.method === 'DELETE') {
      const parts = url.pathname.split('/').filter(Boolean);
      const id = parts[parts.length - 1];

      if (!id || id === 'photos') {
        sendJson(res, 400, { error: 'Photo id required' });
        return;
      }

      const current = readPhotos();
      const before = current.photos.length;
      current.photos = current.photos.filter((photo) => photo.id !== id);

      if (current.photos.length !== before) {
        writePhotos(current);
        sendJson(res, 200, { ok: true, deleted: id });
      } else {
        sendJson(res, 404, { error: 'Photo not found' });
      }
      return;
    }
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Teacher Trip board server running at http://localhost:${PORT}`);
});

#!/usr/bin/env node
'use strict';

/**
 * FolderManager — minimal zero-dependency local server.
 * Serves the static frontend (./public) and a small JSON API that lists
 * the contents of directories under the user's home directory. Nothing
 * outside the home directory can be reached through the API.
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const url = require('url');

const ROOT = os.homedir();
const PORT = process.env.PORT || 5173;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Resolve a "path" query param (posix-style, relative to ROOT) to an
// absolute path, guaranteeing the result stays inside ROOT. Returns null
// if the request tries to escape (e.g. via "..").
function resolveSafe(relPath) {
  const segments = String(relPath || '')
    .split('/')
    .filter((seg) => seg !== '' && seg !== '.');
  const target = path.resolve(ROOT, ...segments);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (target === ROOT || target.startsWith(rootWithSep)) return target;
  return null;
}

async function listDirectory(relPath) {
  const target = resolveSafe(relPath);
  if (!target) {
    const err = new Error('该路径超出了主目录范围');
    err.code = 'FORBIDDEN';
    throw err;
  }

  const stat = await fsp.stat(target);
  if (!stat.isDirectory()) {
    const err = new Error('目标不是一个文件夹');
    err.code = 'NOT_DIR';
    throw err;
  }

  const dirents = await fsp.readdir(target, { withFileTypes: true });
  const entries = [];

  for (const d of dirents) {
    const full = path.join(target, d.name);
    const entry = {
      name: d.name,
      isDir: d.isDirectory(),
      hidden: d.name.startsWith('.'),
      size: null,
      mtimeMs: null,
      error: false,
    };
    try {
      const st = await fsp.stat(full); // follow symlinks
      entry.isDir = st.isDirectory();
      entry.size = entry.isDir ? null : st.size;
      entry.mtimeMs = st.mtimeMs;
    } catch (e) {
      // Broken symlink, permission denied, etc — keep the entry visible
      // but flag it so the UI can grey it out instead of failing the
      // whole listing.
      entry.error = true;
    }
    entries.push(entry);
  }

  return {
    path: path.relative(ROOT, target).split(path.sep).join('/'),
    entries,
  };
}

const MAX_PREVIEW_BYTES = 1.5 * 1024 * 1024; // 1.5 MB — keep Quick Look snappy

// Heuristic used by git and most editors: a NUL byte within the first
// chunk of a file almost never appears in real text, so its presence is
// a reliable-enough signal that the file is binary.
function looksBinary(buffer) {
  const len = Math.min(buffer.length, 8000);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

async function readFilePreview(relPath) {
  const target = resolveSafe(relPath);
  if (!target) {
    const err = new Error('该路径超出了主目录范围');
    err.code = 'FORBIDDEN';
    throw err;
  }

  const stat = await fsp.stat(target);
  if (!stat.isFile()) {
    const err = new Error('这不是一个文件');
    err.code = 'NOT_FILE';
    throw err;
  }

  const base = { name: path.basename(target), size: stat.size, mtimeMs: stat.mtimeMs };

  if (stat.size > MAX_PREVIEW_BYTES) {
    return { ...base, tooLarge: true, binary: false, content: '' };
  }

  const buffer = await fsp.readFile(target);
  if (looksBinary(buffer)) {
    return { ...base, tooLarge: false, binary: true, content: '' };
  }

  return { ...base, tooLarge: false, binary: false, content: buffer.toString('utf8') };
}

const RAW_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

// Streams raw file bytes for image/PDF preview — <img>/<iframe> elements
// point straight at this endpoint. Supports Range requests so the browser's
// native PDF viewer can seek within large papers instead of downloading the
// whole file up front.
async function serveRawFile(req, res, relPath) {
  const target = resolveSafe(relPath);
  if (!target) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(target);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }
  if (!stat.isFile()) {
    res.writeHead(400);
    res.end('Not a file');
    return;
  }

  const contentType = RAW_MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;
  const rangeMatch = range && /^bytes=(\d*)-(\d*)$/.exec(range);

  if (rangeMatch) {
    const start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0;
    const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      'Content-Type': contentType,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(target, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
  });
  fs.createReadStream(target).pipe(res);
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  try {
    rel = decodeURIComponent(rel);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  const filePath = path.join(PUBLIC_DIR, rel);
  const publicWithSep = PUBLIC_DIR + path.sep;
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(publicWithSep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const data = await fsp.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);

    if (parsed.pathname === '/api/list') {
      const relPath = Array.isArray(parsed.query.path) ? parsed.query.path[0] : parsed.query.path || '';
      try {
        const result = await listDirectory(relPath);
        sendJSON(res, 200, result);
      } catch (e) {
        const status =
          e.code === 'FORBIDDEN' ? 403 : e.code === 'ENOENT' ? 404 : e.code === 'EACCES' ? 403 : 500;
        sendJSON(res, status, { error: e.message || '未知错误' });
      }
      return;
    }

    if (parsed.pathname === '/api/file') {
      const relPath = Array.isArray(parsed.query.path) ? parsed.query.path[0] : parsed.query.path || '';
      try {
        const result = await readFilePreview(relPath);
        sendJSON(res, 200, result);
      } catch (e) {
        const status =
          e.code === 'FORBIDDEN' ? 403 : e.code === 'NOT_FILE' ? 400 : e.code === 'ENOENT' ? 404 : e.code === 'EACCES' ? 403 : 500;
        sendJSON(res, status, { error: e.message || '未知错误' });
      }
      return;
    }

    if (parsed.pathname === '/api/raw') {
      const relPath = Array.isArray(parsed.query.path) ? parsed.query.path[0] : parsed.query.path || '';
      await serveRawFile(req, res, relPath);
      return;
    }

    if (parsed.pathname === '/api/home') {
      sendJSON(res, 200, { home: ROOT, hostname: os.hostname() });
      return;
    }

    await serveStatic(req, res, parsed.pathname);
  } catch (e) {
    res.writeHead(500);
    res.end('Internal Server Error: ' + e.message);
  }
});

server.listen(PORT, () => {
  console.log(`FolderManager 已启动: http://localhost:${PORT}`);
  console.log(`浏览根目录: ${ROOT}`);
});

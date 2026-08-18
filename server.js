#!/usr/bin/env node
'use strict';

/**
 * FolderManager — minimal zero-dependency local server.
 * Serves the static frontend (./public) and a small JSON API that lists
 * the contents of directories under one of several auto-detected root
 * folders. Nothing outside a given root can be reached through the API —
 * see resolveSafe().
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const url = require('url');
const crypto = require('crypto');
const zlib = require('zlib');
const { exec } = require('child_process');

const PORT = process.env.PORT || 5174;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

/* ---------------------------------------------------------------------
 * Optional login (session cookie)
 *
 * Off by default (matches the original "runs on localhost, trust the
 * machine" model). Set FM_USER + FM_PASS before deploying this somewhere
 * reachable over a real network — this app has no other access control
 * and happily streams any file under the detected roots to whoever asks.
 *
 * A styled in-app login page beats the browser's native Basic Auth prompt
 * (better UX, works with the "stay in my last folder on refresh" feature,
 * one real logout action), so successful login gets an opaque random
 * session token in an HttpOnly cookie; the token itself is meaningless
 * without the server-side `sessions` map, so there's nothing to forge.
 * ------------------------------------------------------------------- */
const AUTH_USER = process.env.FM_USER || '';
const AUTH_PASS = process.env.FM_PASS || '';
const AUTH_ENABLED = Boolean(AUTH_USER && AUTH_PASS);
const SESSION_COOKIE = 'fm_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, sliding

const sessions = new Map(); // token -> expiresAt

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function touchSession(token) {
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + SESSION_TTL_MS); // sliding expiration
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, exp] of sessions) if (now > exp) sessions.delete(token);
}, 60 * 60 * 1000).unref();

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function isAuthed(req) {
  if (!AUTH_ENABLED) return true;
  const token = parseCookies(req)[SESSION_COOKIE];
  return token ? touchSession(token) : false;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

// Basic brute-force guard on /api/login — keyed by remote address, which is
// good enough for a single-user tool (not meant to survive behind a proxy
// that doesn't forward a trustworthy client IP).
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const loginAttempts = new Map(); // ip -> { count, resetAt }

function loginRateLimited(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now > rec.resetAt) {
    loginAttempts.set(ip, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  return rec.count >= LOGIN_MAX_ATTEMPTS;
}
function recordLoginFailure(ip) {
  const rec = loginAttempts.get(ip);
  if (rec) rec.count++;
}
function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

function readBody(req, maxBytes = 4096) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/* ---------------------------------------------------------------------
 * Root discovery
 *
 * A single hardcoded "home directory" root only makes sense for the
 * original desktop/WSL use case. Once this runs on a real server, the
 * folders worth browsing are usually scattered across a handful of
 * well-known locations (site roots, /srv, /opt, docker volumes, ...).
 * Rather than making the operator configure every one of them, we probe
 * a candidate list at startup and expose whichever ones actually exist.
 * FM_ROOT still lets an operator pin an exact, additional root explicitly.
 * ------------------------------------------------------------------- */
const ROOT_CANDIDATES = [
  { id: 'home', dir: os.homedir(), icon: 'fa-solid fa-house', label: null },
  { id: 'var-www', dir: '/var/www', icon: 'fa-solid fa-globe', label: '/var/www' },
  { id: 'srv', dir: '/srv', icon: 'fa-solid fa-server', label: '/srv' },
  { id: 'opt', dir: '/opt', icon: 'fa-solid fa-cubes', label: '/opt' },
  { id: 'data', dir: '/data', icon: 'fa-solid fa-database', label: '/data' },
  { id: 'docker-volumes', dir: '/var/lib/docker/volumes', icon: 'fa-brands fa-docker', label: 'Docker 数据卷' },
];

function detectRoots() {
  const candidates = [];
  if (process.env.FM_ROOT) {
    const dir = path.resolve(process.env.FM_ROOT);
    candidates.push({ id: 'custom', dir, icon: 'fa-solid fa-folder-tree', label: path.basename(dir) || dir });
  }
  candidates.push(...ROOT_CANDIDATES);

  const seenReal = new Set();
  const roots = [];
  for (const c of candidates) {
    let st;
    try {
      st = fs.statSync(c.dir);
    } catch {
      continue; // doesn't exist / not accessible on this machine — skip silently
    }
    if (!st.isDirectory()) continue;
    const real = (() => {
      try { return fs.realpathSync(c.dir); } catch { return c.dir; }
    })();
    if (seenReal.has(real)) continue; // e.g. FM_ROOT pointed at the home dir
    seenReal.add(real);
    roots.push({ id: c.id, dir: c.dir, icon: c.icon, label: c.label || path.basename(c.dir) || c.dir });
  }
  // os.homedir() always exists, so `roots` is never empty in practice; this
  // is just a last-resort guard in case every candidate above somehow fails.
  if (roots.length === 0) {
    roots.push({ id: 'home', dir: os.homedir(), icon: 'fa-solid fa-house', label: '主目录' });
  }
  return roots;
}

const ROOTS = detectRoots();
const ROOTS_BY_ID = new Map(ROOTS.map((r) => [r.id, r]));
const DEFAULT_ROOT_ID = ROOTS[0].id;

function rootDirFor(rootId) {
  return (ROOTS_BY_ID.get(rootId) || ROOTS_BY_ID.get(DEFAULT_ROOT_ID)).dir;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Resolve a "path" query param (posix-style, relative to the given root) to
// an absolute path, guaranteeing the result stays inside that root. Returns
// null if the request tries to escape (e.g. via "..") or names an unknown
// root.
function resolveSafe(rootId, relPath) {
  const root = ROOTS_BY_ID.get(rootId);
  if (!root) return null;
  const segments = String(relPath || '')
    .split('/')
    .filter((seg) => seg !== '' && seg !== '.');
  const target = path.resolve(root.dir, ...segments);
  const rootWithSep = root.dir.endsWith(path.sep) ? root.dir : root.dir + path.sep;
  if (target === root.dir || target.startsWith(rootWithSep)) return target;
  return null;
}

// Node's raw fs error messages ("ENOENT: ... stat '/home/alice/secret/x'")
// include the absolute server-side path — fine in a log, not fine echoed
// back to a client. Callers that let fs errors reach an API response
// should route them through this first.
function wrapFsError(e, fallback = '操作失败') {
  const messages = {
    ENOENT: '目标不存在',
    EACCES: '没有权限访问该路径',
    EPERM: '没有权限执行该操作',
    ENOTDIR: '路径中包含非文件夹节点',
    EISDIR: '目标是一个文件夹',
    ENOTEMPTY: '目标文件夹非空',
  };
  const err = new Error(messages[e.code] || fallback);
  err.code = e.code;
  return err;
}

async function listDirectory(rootId, relPath) {
  const rootDir = rootDirFor(rootId);
  const target = resolveSafe(rootId, relPath);
  if (!target) {
    const err = new Error('该路径超出了当前位置的范围');
    err.code = 'FORBIDDEN';
    throw err;
  }

  let stat;
  try {
    stat = await fsp.stat(target);
  } catch (e) {
    throw wrapFsError(e);
  }
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
    path: path.relative(rootDir, target).split(path.sep).join('/'),
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

async function readFilePreview(rootId, relPath) {
  const target = resolveSafe(rootId, relPath);
  if (!target) {
    const err = new Error('该路径超出了当前位置的范围');
    err.code = 'FORBIDDEN';
    throw err;
  }

  let stat;
  try {
    stat = await fsp.stat(target);
  } catch (e) {
    throw wrapFsError(e);
  }
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
async function serveRawFile(req, res, rootId, relPath) {
  const target = resolveSafe(rootId, relPath);
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

/* ---------------------------------------------------------------------
 * Download — files stream straight through with an attachment header;
 * folders get zipped on the fly. The zip writer is hand-rolled against the
 * ZIP spec (store/deflate, UTF-8 filenames) using only `zlib` and `Buffer`
 * so folder download doesn't depend on a `zip` binary being installed —
 * plenty of minimal server/container images don't have one.
 * ------------------------------------------------------------------- */
function contentDispositionAttachment(filename) {
  // RFC 5987 filename* covers non-ASCII names (very common here — Chinese
  // project/paper names); the plain `filename=` fallback is ASCII-only so
  // older clients still get a sane (if transliterated) name.
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dateVal = (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, dateVal };
}

// Streams a directory as a zip archive directly into the HTTP response.
// Peak memory is bounded by the size of the single largest file (each file
// is read, compressed, and written before moving to the next) rather than
// the whole tree, which is good enough for a personal-scale tool.
async function streamDirectoryAsZip(res, targetAbs, downloadName) {
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': contentDispositionAttachment(downloadName),
  });

  let offset = 0;
  let aborted = false;
  res.on('close', () => { aborted = true; });

  async function write(buf) {
    if (aborted) throw new Error('client disconnected');
    if (!res.write(buf)) await new Promise((resolve) => res.once('drain', resolve));
    offset += buf.length;
  }

  function localHeader({ nameBuf, method, time, dateVal, crc, compSize, size }) {
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4); // version needed
    h.writeUInt16LE(0x0800, 6); // UTF-8 filenames
    h.writeUInt16LE(method, 8);
    h.writeUInt16LE(time, 10);
    h.writeUInt16LE(dateVal, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(compSize, 18);
    h.writeUInt32LE(size, 22);
    h.writeUInt16LE(nameBuf.length, 26);
    h.writeUInt16LE(0, 28);
    return h;
  }

  const entries = [];

  async function addFile(relPath, absPath, stat) {
    const content = await fsp.readFile(absPath);
    const crc = crc32(content);
    const deflated = zlib.deflateRawSync(content);
    const useStore = deflated.length >= content.length;
    const method = useStore ? 0 : 8;
    const data = useStore ? content : deflated;
    const { time, dateVal } = toDosDateTime(stat.mtime);
    const nameBuf = Buffer.from(relPath, 'utf8');
    const entry = { nameBuf, method, time, dateVal, crc, compSize: data.length, size: content.length, offset, isDir: false };
    await write(localHeader(entry));
    await write(nameBuf);
    await write(data);
    entries.push(entry);
  }

  async function addDir(relPath) {
    const nameBuf = Buffer.from(`${relPath}/`, 'utf8');
    const { time, dateVal } = toDosDateTime(new Date());
    const entry = { nameBuf, method: 0, time, dateVal, crc: 0, compSize: 0, size: 0, offset, isDir: true };
    await write(localHeader(entry));
    await write(nameBuf);
    entries.push(entry);
  }

  async function walk(dirAbs, relPath) {
    if (aborted) return;
    let dirents;
    try {
      dirents = await fsp.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return; // permission denied etc — skip, same tolerance as listDirectory()
    }
    if (dirents.length === 0) {
      await addDir(relPath);
      return;
    }
    for (const d of dirents) {
      if (aborted) return;
      const abs = path.join(dirAbs, d.name);
      const rel = `${relPath}/${d.name}`;
      let st;
      try {
        st = await fsp.stat(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) await walk(abs, rel);
      else if (st.isFile()) {
        try {
          await addFile(rel, abs, st);
        } catch {
          /* unreadable file — skip it, don't fail the whole archive */
        }
      }
    }
  }

  try {
    await walk(targetAbs, path.basename(targetAbs));

    const cdStart = offset;
    for (const e of entries) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(20, 4);
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(e.method, 10);
      c.writeUInt16LE(e.time, 12);
      c.writeUInt16LE(e.dateVal, 14);
      c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(e.compSize, 20);
      c.writeUInt32LE(e.size, 24);
      c.writeUInt16LE(e.nameBuf.length, 28);
      c.writeUInt16LE(0, 30);
      c.writeUInt16LE(0, 32);
      c.writeUInt16LE(0, 34);
      c.writeUInt16LE(0, 36);
      c.writeUInt32LE(e.isDir ? 0x10 << 16 : 0, 38);
      c.writeUInt32LE(e.offset, 42);
      await write(c);
      await write(e.nameBuf);
    }
    const cdEnd = offset;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cdEnd - cdStart, 12);
    eocd.writeUInt32LE(cdStart, 16);
    await write(eocd);
  } catch {
    /* client disconnected mid-stream — nothing more to do */
  } finally {
    res.end();
  }
}

async function serveDownload(req, res, rootId, relPath) {
  const target = resolveSafe(rootId, relPath);
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

  if (stat.isDirectory()) {
    await streamDirectoryAsZip(res, target, `${path.basename(target)}.zip`);
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': stat.size,
    'Content-Disposition': contentDispositionAttachment(path.basename(target)),
  });
  fs.createReadStream(target).pipe(res);
}

/* ---------------------------------------------------------------------
 * Rename — same-directory only (rejects anything with a path separator in
 * the new name), so this can never be used to move a file elsewhere.
 * ------------------------------------------------------------------- */
const INVALID_NAME_RE = /[/\\]|[\x00-\x1f]/;

async function renameEntry(rootId, relPath, newName) {
  const target = resolveSafe(rootId, relPath);
  if (!target) {
    const err = new Error('该路径超出了当前位置的范围');
    err.code = 'FORBIDDEN';
    throw err;
  }

  const trimmed = String(newName || '').trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    const err = new Error('名称不能为空');
    err.code = 'BAD_NAME';
    throw err;
  }
  if (trimmed.length > 255 || INVALID_NAME_RE.test(trimmed)) {
    const err = new Error('名称包含非法字符');
    err.code = 'BAD_NAME';
    throw err;
  }

  const newTarget = path.join(path.dirname(target), trimmed);
  let exists = true;
  try {
    await fsp.stat(newTarget);
  } catch {
    exists = false;
  }
  if (exists && newTarget !== target) {
    const err = new Error('已存在同名文件或文件夹');
    err.code = 'CONFLICT';
    throw err;
  }

  try {
    await fsp.rename(target, newTarget);
  } catch (e) {
    throw wrapFsError(e, '重命名失败');
  }
  const rootDir = rootDirFor(rootId);
  return { newName: trimmed, newPath: path.relative(rootDir, newTarget).split(path.sep).join('/') };
}

/* ---------------------------------------------------------------------
 * Upload — a hand-rolled *streaming* multipart/form-data parser (no
 * external deps). File data is written to disk as it arrives; at no point
 * does the server hold a whole upload (or even a whole file) in memory —
 * only a small rolling buffer bounded by the boundary marker's length.
 * This matters: an earlier version buffered the entire request before
 * parsing it, which was fine on a beefy dev machine but could push a
 * memory-constrained VPS into swapping on a single big upload, dragging
 * the whole box (even unrelated SSH sessions) to a crawl.
 * ------------------------------------------------------------------- */
const MAX_UPLOAD_MB = parseInt(process.env.FM_MAX_UPLOAD_MB || '512', 10);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const MAX_PART_HEADER_BYTES = 16 * 1024; // generous for Content-Disposition/Content-Type — never legitimately this big

function tooLargeError() {
  const err = new Error(`上传内容过大（上限 ${MAX_UPLOAD_MB}MB）`);
  err.code = 'TOO_LARGE';
  return err;
}

function parseMultipartBoundary(contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  return match ? (match[1] || match[2]).trim() : null;
}

// Client-supplied filenames are never trusted with their directory
// component (some browsers include picked-path fragments) — only the
// basename survives, run through the same character rules as rename.
function sanitizeUploadName(rawName) {
  let name = String(rawName || '').replace(/\\/g, '/').split('/').pop().trim();
  if (!name || name === '.' || name === '..' || INVALID_NAME_RE.test(name)) name = 'upload';
  if (name.length > 255) name = name.slice(0, 255);
  return name;
}

// Finder-style de-duplication on name collision: "photo.png" -> "photo (1).png".
async function uniqueNameIn(dirAbs, desired) {
  let candidate = desired;
  let n = 1;
  const dot = desired.lastIndexOf('.');
  const stem = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : '';
  while (true) {
    try {
      await fsp.stat(path.join(dirAbs, candidate));
    } catch {
      return candidate; // ENOENT — free to use
    }
    candidate = `${stem} (${n})${ext}`;
    n++;
  }
}

function writeToStream(stream, buf) {
  return new Promise((resolve, reject) => {
    if (buf.length === 0 || stream.write(buf)) resolve();
    else stream.once('drain', resolve);
    stream.once('error', reject);
  });
}
function endStream(stream) {
  return new Promise((resolve) => stream.end(resolve));
}

// Streams a multipart/form-data request body straight into files under
// targetDir. Keeps only a small "pending" buffer in memory at any time —
// bounded by the boundary length plus a few bytes, regardless of how large
// the files being uploaded are.
async function streamMultipartToDir(req, boundary, targetDir, maxBytes) {
  const delim = Buffer.from(`--${boundary}`);
  const CRLF = Buffer.from('\r\n');
  const CRLFCRLF = Buffer.from('\r\n\r\n');

  let pending = Buffer.alloc(0);
  let state = 'PREAMBLE'; // PREAMBLE -> AFTER_DELIM -> HEADERS -> BODY -> DONE
  let current = null; // { finalName, size, stream }
  let totalBytes = 0;
  const uploaded = [];
  const failed = [];

  async function abortCurrent() {
    if (!current) return;
    current.stream.destroy();
    try {
      await fsp.unlink(current.path);
    } catch {
      /* never existed or already gone — fine */
    }
    current = null;
  }

  async function finishCurrent() {
    if (!current) return;
    await endStream(current.stream);
    uploaded.push({ name: current.finalName, size: current.size });
    current = null;
  }

  async function startPart(headerText) {
    const filenameMatch = /filename="([^"]*)"/i.exec(headerText);
    if (!filenameMatch || !filenameMatch[1]) return; // a non-file field — nothing to stream to
    const rawName = filenameMatch[1];
    try {
      const safeName = sanitizeUploadName(rawName);
      const finalName = await uniqueNameIn(targetDir, safeName);
      const dest = path.join(targetDir, finalName);
      current = { finalName, path: dest, size: 0, stream: fs.createWriteStream(dest) };
    } catch (e) {
      failed.push({ name: rawName, error: wrapFsError(e, '写入失败').message });
    }
  }

  const declaredLength = parseInt(req.headers['content-length'] || '0', 10);
  if (declaredLength && declaredLength > maxBytes) throw tooLargeError();

  try {
    for await (const chunk of req) {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) throw tooLargeError(); // cleanup happens once, in the catch below
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;

      let progressed = true;
      while (progressed) {
        progressed = false;

        if (state === 'PREAMBLE') {
          const idx = pending.indexOf(delim);
          if (idx === -1) {
            if (pending.length > delim.length) pending = pending.slice(pending.length - delim.length + 1);
            break;
          }
          pending = pending.slice(idx + delim.length);
          state = 'AFTER_DELIM';
          progressed = true;
        } else if (state === 'AFTER_DELIM') {
          if (pending.length < 2) break;
          if (pending[0] === 0x2d && pending[1] === 0x2d) {
            state = 'DONE';
            pending = Buffer.alloc(0);
            break;
          }
          if (pending[0] === 0x0d && pending[1] === 0x0a) pending = pending.slice(2);
          state = 'HEADERS';
          progressed = true;
        } else if (state === 'HEADERS') {
          const idx = pending.indexOf(CRLFCRLF);
          if (idx === -1) {
            if (pending.length > MAX_PART_HEADER_BYTES) {
              const err = new Error('请求格式错误');
              err.code = 'BAD_REQUEST';
              throw err;
            }
            break;
          }
          const headerText = pending.slice(0, idx).toString('utf8');
          pending = pending.slice(idx + CRLFCRLF.length);
          await startPart(headerText);
          state = 'BODY';
          progressed = true;
        } else if (state === 'BODY') {
          const idx = pending.indexOf(delim);
          if (idx !== -1) {
            let dataEnd = idx;
            if (dataEnd >= 2 && pending[dataEnd - 2] === 0x0d && pending[dataEnd - 1] === 0x0a) dataEnd -= CRLF.length;
            if (current && dataEnd > 0) {
              const piece = pending.slice(0, dataEnd);
              current.size += piece.length;
              await writeToStream(current.stream, piece);
            }
            await finishCurrent();
            pending = pending.slice(idx + delim.length);
            state = 'AFTER_DELIM';
            progressed = true;
          } else {
            // No boundary in what we have yet — flush everything except a
            // safety tail long enough to still catch a boundary that spans
            // this chunk and the next one.
            const safeLen = Math.max(0, pending.length - (delim.length + CRLF.length));
            if (safeLen > 0) {
              const piece = pending.slice(0, safeLen);
              if (current) {
                current.size += piece.length;
                await writeToStream(current.stream, piece);
              }
              pending = pending.slice(safeLen);
            }
            break;
          }
        } else {
          break; // DONE
        }
      }
    }
  } catch (e) {
    await abortCurrent();
    throw e;
  }

  await abortCurrent(); // stray unterminated part, if the body ended mid-file — discard it, don't leave a truncated file behind
  return { uploaded, failed };
}

async function handleUpload(req, rootId, relPath) {
  const targetDir = resolveSafe(rootId, relPath);
  if (!targetDir) {
    const err = new Error('该路径超出了当前位置的范围');
    err.code = 'FORBIDDEN';
    throw err;
  }
  let dirStat;
  try {
    dirStat = await fsp.stat(targetDir);
  } catch (e) {
    throw wrapFsError(e);
  }
  if (!dirStat.isDirectory()) {
    const err = new Error('目标不是一个文件夹');
    err.code = 'NOT_DIR';
    throw err;
  }

  const boundary = parseMultipartBoundary(req.headers['content-type']);
  if (!boundary) {
    const err = new Error('请求格式错误');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const result = await streamMultipartToDir(req, boundary, targetDir, MAX_UPLOAD_BYTES);
  if (result.uploaded.length === 0 && result.failed.length === 0) {
    const err = new Error('没有找到要上传的文件');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  return result;
}

/* ---------------------------------------------------------------------
 * Server usage dashboard
 *
 * CPU% and network throughput are both *rates*, not point-in-time values,
 * so a background sampler keeps a short rolling history by diffing
 * successive snapshots. The dashboard polls /api/stats and gets both the
 * latest reading and that history in one shot, cheap enough to do every
 * couple of seconds for a single-user local tool.
 * ------------------------------------------------------------------- */
const STATS_HISTORY_LEN = 60;
const STATS_INTERVAL_MS = 2000;
const statsHistory = [];

function readCpuTotals() {
  return os.cpus().reduce(
    (acc, c) => {
      acc.idle += c.times.idle;
      acc.total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
      return acc;
    },
    { idle: 0, total: 0 }
  );
}

let lastCpu = readCpuTotals();
function sampleCpuPercent() {
  const now = readCpuTotals();
  const idleDelta = now.idle - lastCpu.idle;
  const totalDelta = now.total - lastCpu.total;
  lastCpu = now;
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

// /proc/meminfo's MemAvailable accounts for reclaimable page cache, unlike
// os.freemem() — without it "used" looks alarmingly high on any Linux box
// that's been up for more than a few minutes, since the kernel happily
// uses spare RAM as disk cache.
function readMemUsage() {
  try {
    const text = fs.readFileSync('/proc/meminfo', 'utf8');
    const grab = (key) => {
      const m = text.match(new RegExp(`^${key}:\\s*(\\d+)`, 'm'));
      return m ? parseInt(m[1], 10) * 1024 : null;
    };
    const total = grab('MemTotal');
    const available = grab('MemAvailable');
    if (total && available != null) return { total, available, used: total - available };
  } catch {
    /* not on Linux, or /proc unavailable — fall through */
  }
  const total = os.totalmem();
  const available = os.freemem();
  return { total, available, used: total - available };
}

function readNetTotals() {
  try {
    const text = fs.readFileSync('/proc/net/dev', 'utf8');
    let rx = 0;
    let tx = 0;
    for (const line of text.split('\n').slice(2)) {
      const m = /^\s*([^:]+):\s*(.+)$/.exec(line);
      if (!m || m[1].trim() === 'lo') continue;
      const fields = m[2].trim().split(/\s+/).map(Number);
      rx += fields[0] || 0; // bytes received
      tx += fields[8] || 0; // bytes transmitted
    }
    return { rx, tx };
  } catch {
    return null; // non-Linux, or /proc/net/dev not present
  }
}

let lastNet = readNetTotals();
let lastNetAt = Date.now();
function sampleNetRates() {
  const now = readNetTotals();
  const at = Date.now();
  const dtSec = Math.max(0.001, (at - lastNetAt) / 1000);
  let rxRate = 0;
  let txRate = 0;
  if (now && lastNet) {
    rxRate = Math.max(0, (now.rx - lastNet.rx) / dtSec);
    txRate = Math.max(0, (now.tx - lastNet.tx) / dtSec);
  }
  lastNet = now;
  lastNetAt = at;
  return { available: now !== null, rxRate, txRate };
}

function sampleTick() {
  const mem = readMemUsage();
  statsHistory.push({
    t: Date.now(),
    cpu: sampleCpuPercent(),
    mem: (mem.used / mem.total) * 100,
    net: sampleNetRates(),
  });
  if (statsHistory.length > STATS_HISTORY_LEN) statsHistory.shift();
}
setInterval(sampleTick, STATS_INTERVAL_MS).unref();

const PSEUDO_FS_TYPES = new Set([
  'tmpfs', 'devtmpfs', 'proc', 'sysfs', 'cgroup', 'cgroup2', 'devpts', 'mqueue',
  'debugfs', 'tracefs', 'securityfs', 'pstore', 'bpf', 'autofs', 'binfmt_misc',
  'overlay', 'squashfs', 'fuse.portal', 'rootfs', // 'rootfs' is WSL2's throwaway init ramdisk, not real storage
]);

function getDiskUsage() {
  return new Promise((resolve) => {
    // -P for POSIX-stable column output, -T to get the filesystem type so
    // virtual/pseudo mounts (tmpfs, overlay, cgroup, ...) can be filtered.
    exec('df -kPT', { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) { resolve([]); return; }
      const lines = stdout.trim().split('\n').slice(1);
      const disks = [];
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 7) continue;
        const [fs_, type, blocks, used, avail, , ...mountParts] = parts;
        if (PSEUDO_FS_TYPES.has(type)) continue;
        const size = parseInt(blocks, 10) * 1024;
        if (!size) continue;
        disks.push({
          fs: fs_,
          type,
          mount: mountParts.join(' '),
          size,
          used: parseInt(used, 10) * 1024,
          avail: parseInt(avail, 10) * 1024,
          percent: size ? (parseInt(used, 10) * 1024 * 100) / size : 0,
        });
      }
      disks.sort((a, b) => b.size - a.size);
      resolve(disks);
    });
  });
}

let diskCache = { at: 0, disks: [] };
async function getDiskUsageCached() {
  if (Date.now() - diskCache.at < 4000) return diskCache.disks;
  const disks = await getDiskUsage();
  diskCache = { at: Date.now(), disks };
  return disks;
}

async function buildStatsPayload() {
  const cpus = os.cpus();
  const latest = statsHistory[statsHistory.length - 1];
  const mem = readMemUsage();
  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    uptimeSec: os.uptime(),
    cpu: {
      percent: latest ? latest.cpu : sampleCpuPercent(),
      cores: cpus.length,
      model: cpus[0] ? cpus[0].model.trim() : '未知',
      loadavg: os.loadavg(),
    },
    mem: {
      total: mem.total,
      used: mem.used,
      available: mem.available,
      percent: (mem.used / mem.total) * 100,
    },
    net: latest ? latest.net : { available: false, rxRate: 0, txRate: 0 },
    history: statsHistory,
    disks: await getDiskUsageCached(),
  };
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

function qp(parsed, key, def = '') {
  const v = parsed.query[key];
  return Array.isArray(v) ? v[0] : v || def;
}

// Always reachable without a session — the login page itself, and login/
// logout/session-check need to work before the user has one.
const PUBLIC_API_PATHS = new Set(['/api/session', '/api/login', '/api/logout']);

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);

    if (parsed.pathname === '/api/session') {
      sendJSON(res, 200, { authRequired: AUTH_ENABLED, authenticated: isAuthed(req) });
      return;
    }

    if (parsed.pathname === '/api/login') {
      if (req.method !== 'POST') {
        sendJSON(res, 405, { error: 'Method Not Allowed' });
        return;
      }
      if (!AUTH_ENABLED) {
        sendJSON(res, 400, { error: '未启用登录' });
        return;
      }
      const ip = req.socket.remoteAddress || 'unknown';
      if (loginRateLimited(ip)) {
        sendJSON(res, 429, { error: '尝试次数过多，请稍后再试' });
        return;
      }
      let body;
      try {
        body = JSON.parse((await readBody(req)) || '{}');
      } catch {
        sendJSON(res, 400, { error: '请求格式错误' });
        return;
      }
      const username = String(body.username || '');
      const password = String(body.password || '');
      if (safeEqual(username, AUTH_USER) && safeEqual(password, AUTH_PASS)) {
        clearLoginAttempts(ip);
        setSessionCookie(res, createSession());
        sendJSON(res, 200, { ok: true });
      } else {
        recordLoginFailure(ip);
        sendJSON(res, 401, { error: '用户名或密码错误' });
      }
      return;
    }

    if (parsed.pathname === '/api/logout') {
      if (req.method !== 'POST') {
        sendJSON(res, 405, { error: 'Method Not Allowed' });
        return;
      }
      const token = parseCookies(req)[SESSION_COOKIE];
      if (token) sessions.delete(token);
      clearSessionCookie(res);
      sendJSON(res, 200, { ok: true });
      return;
    }

    if (parsed.pathname.startsWith('/api/') && !PUBLIC_API_PATHS.has(parsed.pathname) && !isAuthed(req)) {
      sendJSON(res, 401, { error: '未登录' });
      return;
    }

    if (parsed.pathname === '/api/list') {
      const rootId = qp(parsed, 'root', DEFAULT_ROOT_ID);
      const relPath = qp(parsed, 'path');
      try {
        const result = await listDirectory(rootId, relPath);
        sendJSON(res, 200, { root: rootId, ...result });
      } catch (e) {
        const status =
          e.code === 'FORBIDDEN' ? 403 : e.code === 'ENOENT' ? 404 : e.code === 'EACCES' ? 403 : 500;
        sendJSON(res, status, { error: e.message || '未知错误' });
      }
      return;
    }

    if (parsed.pathname === '/api/file') {
      const rootId = qp(parsed, 'root', DEFAULT_ROOT_ID);
      const relPath = qp(parsed, 'path');
      try {
        const result = await readFilePreview(rootId, relPath);
        sendJSON(res, 200, result);
      } catch (e) {
        const status =
          e.code === 'FORBIDDEN' ? 403 : e.code === 'NOT_FILE' ? 400 : e.code === 'ENOENT' ? 404 : e.code === 'EACCES' ? 403 : 500;
        sendJSON(res, status, { error: e.message || '未知错误' });
      }
      return;
    }

    if (parsed.pathname === '/api/raw') {
      const rootId = qp(parsed, 'root', DEFAULT_ROOT_ID);
      const relPath = qp(parsed, 'path');
      await serveRawFile(req, res, rootId, relPath);
      return;
    }

    if (parsed.pathname === '/api/download') {
      const rootId = qp(parsed, 'root', DEFAULT_ROOT_ID);
      const relPath = qp(parsed, 'path');
      await serveDownload(req, res, rootId, relPath);
      return;
    }

    if (parsed.pathname === '/api/rename') {
      if (req.method !== 'POST') {
        sendJSON(res, 405, { error: 'Method Not Allowed' });
        return;
      }
      let body;
      try {
        body = JSON.parse((await readBody(req)) || '{}');
      } catch {
        sendJSON(res, 400, { error: '请求格式错误' });
        return;
      }
      const rootId = body.root || DEFAULT_ROOT_ID;
      try {
        const result = await renameEntry(rootId, body.path, body.newName);
        sendJSON(res, 200, { ok: true, ...result });
      } catch (e) {
        const status =
          e.code === 'FORBIDDEN' ? 403 : e.code === 'BAD_NAME' ? 400 : e.code === 'CONFLICT' ? 409 :
          e.code === 'ENOENT' ? 404 : e.code === 'EACCES' ? 403 : 500;
        sendJSON(res, status, { error: e.message || '重命名失败' });
      }
      return;
    }

    if (parsed.pathname === '/api/upload') {
      if (req.method !== 'POST') {
        sendJSON(res, 405, { error: 'Method Not Allowed' });
        return;
      }
      const rootId = qp(parsed, 'root', DEFAULT_ROOT_ID);
      const relPath = qp(parsed, 'path');
      try {
        const result = await handleUpload(req, rootId, relPath);
        sendJSON(res, 200, { ok: true, ...result });
      } catch (e) {
        const status =
          e.code === 'FORBIDDEN' ? 403 : e.code === 'NOT_DIR' ? 400 : e.code === 'BAD_REQUEST' ? 400 :
          e.code === 'TOO_LARGE' ? 413 : e.code === 'ENOENT' ? 404 : e.code === 'EACCES' ? 403 : 500;
        // These mean we bailed out with the request body still (partly)
        // incoming — don't try to keep the connection alive for a next
        // request, just answer and close.
        if (e.code === 'TOO_LARGE' || e.code === 'BAD_REQUEST') res.setHeader('Connection', 'close');
        sendJSON(res, status, { error: e.message || '上传失败' });
      }
      return;
    }

    if (parsed.pathname === '/api/home') {
      sendJSON(res, 200, {
        hostname: os.hostname(),
        defaultRoot: DEFAULT_ROOT_ID,
        roots: ROOTS.map((r) => ({ id: r.id, label: r.label, icon: r.icon })),
      });
      return;
    }

    if (parsed.pathname === '/api/stats') {
      try {
        sendJSON(res, 200, await buildStatsPayload());
      } catch (e) {
        sendJSON(res, 500, { error: e.message || '无法读取服务器状态' });
      }
      return;
    }

    await serveStatic(req, res, parsed.pathname);
  } catch (e) {
    res.writeHead(500);
    res.end('Internal Server Error: ' + e.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FolderManager 已启动: http://${HOST}:${PORT}`);
  console.log(`检测到的可浏览位置：`);
  for (const r of ROOTS) console.log(`  - [${r.id}] ${r.label} → ${r.dir}`);
  console.log(`身份验证: ${AUTH_ENABLED ? '已启用（登录页 + Session Cookie）' : '未启用'}`);
  if (!AUTH_ENABLED && HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.log('警告: 未设置 FM_USER/FM_PASS，且监听地址非本机回环 —— 如果部署到公网/共享网络，请务必配置身份验证或用防火墙限制访问。');
  }
});

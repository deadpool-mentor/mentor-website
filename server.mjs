import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import sanitizeHtml from 'sanitize-html';

const assetDir = existsSync('dist/index.html') ? 'dist' : '.';
const dataDir = resolve(process.env.DATA_DIR || 'data');
await mkdir(dataDir, { recursive: true });
const uploadDir = join(dataDir, 'uploads');
await mkdir(uploadDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, 'consultations.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS consultations (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, goal TEXT NOT NULL, education TEXT NOT NULL, message TEXT NOT NULL, calculator TEXT)`);
const contentExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='content_entries'").get();
db.exec(`CREATE TABLE IF NOT EXISTS content_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, sample INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
if (!db.prepare('PRAGMA table_info(content_entries)').all().some(column => column.name === 'format')) db.exec("ALTER TABLE content_entries ADD COLUMN format TEXT NOT NULL DEFAULT 'text'");
if (!db.prepare('PRAGMA table_info(content_entries)').all().some(column => column.name === 'cover_image')) db.exec('ALTER TABLE content_entries ADD COLUMN cover_image TEXT');
if (!contentExists) {
  const now = new Date().toISOString();
  const insert = db.prepare('INSERT INTO content_entries (type, category, title, body, sample, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)');
  insert.run('post', '학위취득', '학위 취득 안내 글 예시', '게시판 형식을 확인하기 위한 예시 글입니다. 실제 교육과정 안내로 교체해 주세요.', now, now);
  insert.run('post', '편입', '편입 준비 안내 글 예시', '편입 게시판의 예시 글입니다. 지원 대학의 실제 모집 요강을 확인한 뒤 내용을 작성해 주세요.', now, now);
  insert.run('review', '학위취득', '학생 후기 예시', '이 카드는 후기 화면을 보여주는 샘플입니다. 실제 학생의 경험담이 아닙니다.', now, now);
}
if (process.env.NODE_ENV === 'production' && !process.env.MENTOR_ADMIN_PASSWORD) throw new Error('MENTOR_ADMIN_PASSWORD is required in production');
const password = process.env.MENTOR_ADMIN_PASSWORD || randomBytes(18).toString('base64url');
const sessionToken = randomBytes(32).toString('base64url');
const loginAttempts = new Map();
if (!process.env.MENTOR_ADMIN_PASSWORD) console.log(`관리 화면 암호: ${password}`);
const files = { '/': ['index.html','text/html; charset=utf-8'], '/index.html': ['index.html','text/html; charset=utf-8'], '/styles.css': ['styles.css','text/css; charset=utf-8'], '/app.js': ['app.js','text/javascript; charset=utf-8'], '/catalog.json': ['catalog.json','application/json; charset=utf-8'], '/logo.svg': ['logo.svg','image/svg+xml'], '/admin': ['admin.html','text/html; charset=utf-8'], '/admin.js': ['admin.js','text/javascript; charset=utf-8'] };
function json(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); }
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
function cleanHtml(value) {
  return sanitizeHtml(value, {
    allowedTags: ['p','br','strong','b','em','i','u','s','h2','h3','h4','ul','ol','li','blockquote','a','img','hr','div'],
    allowedAttributes: { a: ['href','target','rel'], img: ['src','alt'] },
    allowedSchemes: ['http','https','mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
    exclusiveFilter: frame => frame.tag === 'img' && !/^\/uploads\/[a-f0-9]{32}\.(?:png|jpg|webp|gif)$/.test(frame.attribs.src || '')
  });
}
const plain = row => row.format === 'html' ? sanitizeHtml(row.body, { allowedTags: [], allowedAttributes: {} }) : row.body;
const contentHtml = row => row.format === 'html' ? cleanHtml(row.body) : `<p>${escapeHtml(row.body).replace(/\n/g, '<br>')}</p>`;
function originUrl(request) { const host = request.headers.host || 'localhost'; return `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${host}`; }
function articlePage(request, row) {
  const url = `${originUrl(request)}/${row.type === 'review' ? 'reviews' : 'posts'}/${row.id}`;
  const title = `${row.title} | 정수멘토`;
  const description = plain(row).replace(/\s+/g, ' ').slice(0, 150);
  const category = row.type === 'review' ? '학생 후기' : '교육과정 안내';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${row.sample ? 'noindex,follow' : 'index,follow'}"><link rel="canonical" href="${escapeHtml(url)}"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(row.title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(url)}">${row.cover_image ? `<meta property="og:image" content="${escapeHtml(originUrl(request) + row.cover_image)}">` : ''}<link rel="stylesheet" href="/styles.css"><link rel="icon" href="/logo.svg" type="image/svg+xml"></head><body class="article-page"><header class="article-header"><a class="brand" href="/"><img class="brand-mark" src="/logo.svg" alt=""><span>정수멘토<small>JUNGSOO MENTOR</small></span></a><a href="/#${row.type === 'review' ? 'reviews' : 'board'}">목록으로 ↗</a></header><main class="article-main"><span class="eyebrow">${category} · ${escapeHtml(row.category)}${row.sample ? ' · 예시' : ''}</span><h1>${escapeHtml(row.title)}</h1><time datetime="${escapeHtml(row.created_at)}">${escapeHtml(row.created_at.slice(0,10))}</time>${row.cover_image ? `<img class="article-cover" src="${escapeHtml(row.cover_image)}" alt="">` : ''}<div class="article-body">${contentHtml(row)}</div>${row.sample ? `<p class="article-sample">${row.type === 'review' ? '화면 구성 예시입니다. 실제 학생 후기가 아닙니다.' : '화면 구성 예시 글입니다. 실제 교육과정 정보로 교체해 주세요.'}</p>` : ''}<a class="button button-dark" href="/#consult">무료 학습계획표 상담 ↗</a></main><a class="kakao-float" href="https://open.kakao.com/o/sfAip6Mi" target="_blank" rel="noopener noreferrer" aria-label="카카오톡 상담하기"><span class="kakao-icon">TALK</span><span>카카오톡<br>상담하기</span></a></body></html>`;
}
async function readUpload(request) { const chunks = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > 5_000_000) throw new Error('Too large'); chunks.push(chunk); } return Buffer.concat(chunks); }
function imageExtension(data, type) {
  if (type === 'image/png' && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (type === 'image/jpeg' && data.subarray(0,3).equals(Buffer.from([255,216,255]))) return 'jpg';
  if (type === 'image/gif' && ['GIF87a','GIF89a'].includes(data.subarray(0,6).toString())) return 'gif';
  if (type === 'image/webp' && data.subarray(0,4).toString() === 'RIFF' && data.subarray(8,12).toString() === 'WEBP') return 'webp';
  return null;
}
function sameOrigin(request) { const origin = request.headers.origin; return !origin || [`http://${request.headers.host}`, `https://${request.headers.host}`].includes(origin); }
function authorized(request) {
  const cookie = (request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('mentor_session='));
  const actual = Buffer.from(cookie?.slice('mentor_session='.length) || ''), expected = Buffer.from(sessionToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function readBody(request) { const chunks = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > 100_000) throw new Error('Too large'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && /^\/uploads\/[a-f0-9]{32}\.(png|jpg|webp|gif)$/.test(path)) {
      const file = await readFile(join(uploadDir, path.slice(9))).catch(() => null);
      if (!file) return json(response, 404, { error: 'Not found' });
      const ext = path.split('.').pop();
      response.writeHead(200, { 'Content-Type': { jpg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp' }[ext], 'X-Content-Type-Options':'nosniff', 'Cache-Control':'public, max-age=86400' }); return response.end(file);
    }
    if (request.method === 'POST' && path === '/api/uploads') {
      if (!authorized(request) || !sameOrigin(request)) return json(response, 403, { error: 'Forbidden' });
      const file = await readUpload(request), ext = imageExtension(file, String(request.headers['content-type'] || '').split(';')[0]);
      if (!ext) return json(response, 400, { error: 'PNG, JPG, GIF, WEBP 이미지만 업로드할 수 있습니다.' });
      const name = `${randomBytes(16).toString('hex')}.${ext}`;
      await writeFile(join(uploadDir, name), file, { flag: 'wx' });
      return json(response, 201, { url: `/uploads/${name}` });
    }
    if (request.method === 'GET' && /^\/(posts|reviews)\/\d+$/.test(path)) {
      const [, collection, id] = path.split('/');
      const row = db.prepare('SELECT * FROM content_entries WHERE id=? AND type=?').get(Number(id), collection === 'posts' ? 'post' : 'review');
      if (!row) return json(response, 404, { error: 'Not found' });
      response.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'public, max-age=60' }); return response.end(articlePage(request, row));
    }
    if (request.method === 'GET' && path === '/robots.txt') {
      response.writeHead(200, { 'Content-Type':'text/plain; charset=utf-8' }); return response.end(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${originUrl(request)}/sitemap.xml\n`);
    }
    if (request.method === 'GET' && path === '/sitemap.xml') {
      const rows = db.prepare('SELECT id, type, updated_at FROM content_entries WHERE sample=0 ORDER BY id DESC').all();
      const pages = [{ url: `${originUrl(request)}/`, date: new Date().toISOString() }, ...rows.map(row => ({ url: `${originUrl(request)}/${row.type === 'review' ? 'reviews' : 'posts'}/${row.id}`, date: row.updated_at }))];
      response.writeHead(200, { 'Content-Type':'application/xml; charset=utf-8' }); return response.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(page => `<url><loc>${escapeHtml(page.url)}</loc><lastmod>${page.date.slice(0,10)}</lastmod></url>`).join('')}</urlset>`);
    }
    if (request.method === 'POST' && path === '/api/admin/login') {
      if (!sameOrigin(request)) return json(response, 403, { error: 'Forbidden' });
      const now = Date.now(), attempts = loginAttempts.get(request.socket.remoteAddress) || [];
      const recent = attempts.filter(time => now - time < 15 * 60_000);
      if (recent.length >= 5) return json(response, 429, { error: 'Too many attempts' });
      const data = await readBody(request), actual = Buffer.from(String(data.password || '')), expected = Buffer.from(password);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { recent.push(now); loginAttempts.set(request.socket.remoteAddress, recent); return json(response, 401, { error: 'Wrong password' }); }
      loginAttempts.delete(request.socket.remoteAddress);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': `mentor_session=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` });
      return response.end('{"ok":true}');
    }
    if (request.method === 'POST' && path === '/api/consultations') {
      if (!sameOrigin(request)) return json(response, 403, { error: 'Forbidden' });
      const data = await readBody(request);
      const name = String(data.name || '').trim().slice(0, 80), phone = String(data.phone || '').trim().slice(0, 40), goal = String(data.goal || '').trim().slice(0, 80), education = String(data.education || '').trim().slice(0, 80), message = String(data.message || '').trim().slice(0, 3000);
      const calculator = data.calculator == null ? null : JSON.stringify(data.calculator);
      if (!name || !/^0\d[\d\s-]{7,15}$/.test(phone) || !goal || !education || (calculator && calculator.length > 80_000)) return json(response, 400, { error: 'Invalid submission' });
      const result = db.prepare('INSERT INTO consultations (created_at, name, phone, goal, education, message, calculator) VALUES (?, ?, ?, ?, ?, ?, ?)').run(new Date().toISOString(), name, phone, goal, education, message, calculator);
      return json(response, 201, { id: Number(result.lastInsertRowid) });
    }
    if (request.method === 'GET' && path === '/api/consultations') {
      if (!authorized(request)) return json(response, 401, { error: 'Unauthorized' });
      const rows = db.prepare('SELECT id, created_at, name, phone, goal, education, message, calculator FROM consultations ORDER BY id DESC LIMIT 500').all();
      return json(response, 200, rows.map(row => ({ ...row, calculator: row.calculator ? JSON.parse(row.calculator) : null })));
    }
    if (request.method === 'GET' && path === '/api/content') {
      const rows = db.prepare('SELECT id, type, category, title, body, format, cover_image, sample, created_at, updated_at FROM content_entries ORDER BY id DESC').all();
      return json(response, 200, rows);
    }
    if (['POST','PUT','DELETE'].includes(request.method) && path.startsWith('/api/content')) {
      if (!authorized(request)) return json(response, 401, { error: 'Unauthorized' });
      if (!sameOrigin(request)) return json(response, 403, { error: 'Forbidden' });
      const id = Number(path.match(/^\/api\/content\/(\d+)$/)?.[1]);
      if (request.method === 'DELETE') {
        if (!id) return json(response, 400, { error: 'Invalid id' });
        const result = db.prepare('DELETE FROM content_entries WHERE id=?').run(id);
        return json(response, result.changes ? 200 : 404, { ok: Boolean(result.changes) });
      }
      if (request.method === 'PUT' && !id || request.method === 'POST' && path !== '/api/content') return json(response, 400, { error: 'Invalid path' });
      const data = await readBody(request);
      const type = String(data.type || ''), category = String(data.category || '').trim().slice(0, 40), title = String(data.title || '').trim().slice(0, 160), format = data.format === 'html' ? 'html' : 'text', body = (format === 'html' ? cleanHtml(String(data.body || '')) : String(data.body || '')).trim().slice(0, 60_000), coverImage = /^\/uploads\/[a-f0-9]{32}\.(?:png|jpg|webp|gif)$/.test(data.cover_image || '') ? data.cover_image : null;
      if (!['post','review'].includes(type) || !category || !title || !body || !plain({ body, format }).trim()) return json(response, 400, { error: 'Invalid content' });
      const now = new Date().toISOString();
      if (request.method === 'POST') {
        const result = db.prepare('INSERT INTO content_entries (type, category, title, body, format, cover_image, sample, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)').run(type, category, title, body, format, coverImage, now, now);
        return json(response, 201, { id: Number(result.lastInsertRowid) });
      }
      const result = db.prepare('UPDATE content_entries SET type=?, category=?, title=?, body=?, format=?, cover_image=?, sample=0, updated_at=? WHERE id=?').run(type, category, title, body, format, coverImage, now, id);
      return json(response, result.changes ? 200 : 404, { ok: Boolean(result.changes) });
    }
    if (request.method !== 'GET' || !files[path]) return json(response, 404, { error: 'Not found' });
    const [filename, type] = files[path], file = await readFile(resolve(assetDir, filename));
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': path === '/admin' ? 'no-store' : 'public, max-age=60' }); response.end(file);
  } catch (error) { console.error(error); json(response, error.message === 'Too large' ? 413 : 500, { error: 'Request failed' }); }
}).listen(Number(process.env.PORT || 8123), process.env.PORT ? '0.0.0.0' : '127.0.0.1', () => console.log(`Server listening on port ${process.env.PORT || 8123}`));

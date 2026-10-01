import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const assetDir = existsSync('dist/index.html') ? 'dist' : '.';
const dataDir = resolve(process.env.DATA_DIR || 'data');
await mkdir(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, 'consultations.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS consultations (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, goal TEXT NOT NULL, education TEXT NOT NULL, message TEXT NOT NULL, calculator TEXT)`);
const contentExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='content_entries'").get();
db.exec(`CREATE TABLE IF NOT EXISTS content_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, sample INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
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
      const rows = db.prepare('SELECT id, type, category, title, body, sample, created_at, updated_at FROM content_entries ORDER BY id DESC').all();
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
      const type = String(data.type || ''), category = String(data.category || '').trim().slice(0, 40), title = String(data.title || '').trim().slice(0, 160), body = String(data.body || '').trim().slice(0, 10_000);
      if (!['post','review'].includes(type) || !category || !title || !body) return json(response, 400, { error: 'Invalid content' });
      const now = new Date().toISOString();
      if (request.method === 'POST') {
        const result = db.prepare('INSERT INTO content_entries (type, category, title, body, sample, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)').run(type, category, title, body, now, now);
        return json(response, 201, { id: Number(result.lastInsertRowid) });
      }
      const result = db.prepare('UPDATE content_entries SET type=?, category=?, title=?, body=?, sample=0, updated_at=? WHERE id=?').run(type, category, title, body, now, id);
      return json(response, result.changes ? 200 : 404, { ok: Boolean(result.changes) });
    }
    if (request.method !== 'GET' || !files[path]) return json(response, 404, { error: 'Not found' });
    const [filename, type] = files[path], file = await readFile(resolve(assetDir, filename));
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': path === '/admin' ? 'no-store' : 'public, max-age=60' }); response.end(file);
  } catch (error) { console.error(error); json(response, error.message === 'Too large' ? 413 : 500, { error: 'Request failed' }); }
}).listen(Number(process.env.PORT || 8123), process.env.PORT ? '0.0.0.0' : '127.0.0.1', () => console.log(`Server listening on port ${process.env.PORT || 8123}`));

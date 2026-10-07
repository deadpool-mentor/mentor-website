import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@supabase/supabase-js';

function localStorage() {
  const dataDir = resolve(process.env.DATA_DIR || 'data');
  const uploadDir = join(dataDir, 'uploads');
  return (async () => {
    await mkdir(uploadDir, { recursive: true });
    const db = new DatabaseSync(join(dataDir, 'consultations.sqlite'));
    db.exec('CREATE TABLE IF NOT EXISTS consultations (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, goal TEXT NOT NULL, education TEXT NOT NULL, message TEXT NOT NULL, calculator TEXT)');
    if (!db.prepare('PRAGMA table_info(consultations)').all().some(column => column.name === 'status')) db.exec("ALTER TABLE consultations ADD COLUMN status TEXT NOT NULL DEFAULT 'new'");
    if (!db.prepare('PRAGMA table_info(consultations)').all().some(column => column.name === 'admin_note')) db.exec("ALTER TABLE consultations ADD COLUMN admin_note TEXT NOT NULL DEFAULT ''");
    if (!db.prepare('PRAGMA table_info(consultations)').all().some(column => column.name === 'status_updated_at')) db.exec('ALTER TABLE consultations ADD COLUMN status_updated_at TEXT');
    const contentExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='content_entries'").get();
    db.exec("CREATE TABLE IF NOT EXISTS content_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, sample INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    db.exec('CREATE TABLE IF NOT EXISTS analytics_page_views (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, path TEXT NOT NULL, visitor_hash TEXT NOT NULL)');
    if (!db.prepare('PRAGMA table_info(analytics_page_views)').all().some(column => column.name === 'source')) db.exec("ALTER TABLE analytics_page_views ADD COLUMN source TEXT NOT NULL DEFAULT 'unknown'");
    db.exec('CREATE INDEX IF NOT EXISTS analytics_page_views_day_path ON analytics_page_views (day, path)');
    db.exec('CREATE INDEX IF NOT EXISTS analytics_page_views_visitor ON analytics_page_views (visitor_hash)');
    db.exec('CREATE TABLE IF NOT EXISTS analytics_daily_visitors (day TEXT NOT NULL, visitor_hash TEXT NOT NULL, PRIMARY KEY (day, visitor_hash))');
    if (!db.prepare('PRAGMA table_info(content_entries)').all().some(column => column.name === 'format')) db.exec("ALTER TABLE content_entries ADD COLUMN format TEXT NOT NULL DEFAULT 'text'");
    if (!db.prepare('PRAGMA table_info(content_entries)').all().some(column => column.name === 'cover_image')) db.exec('ALTER TABLE content_entries ADD COLUMN cover_image TEXT');
    if (!contentExists) {
      const now = new Date().toISOString();
      const insert = db.prepare('INSERT INTO content_entries (type, category, title, body, sample, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)');
      insert.run('post', '학위취득', '학위 취득 안내 글 예시', '게시판 형식을 확인하기 위한 예시 글입니다. 실제 교육과정 안내로 교체해 주세요.', now, now);
      insert.run('post', '편입', '편입 준비 안내 글 예시', '편입 게시판의 예시 글입니다. 지원 대학의 실제 모집 요강을 확인한 뒤 내용을 작성해 주세요.', now, now);
      insert.run('review', '학위취득', '학생 후기 예시', '이 카드는 후기 화면을 보여주는 샘플입니다. 실제 학생의 경험담이 아닙니다.', now, now);
    }
    return {
      backend: 'sqlite',
      async getImage(name) { return readFile(join(uploadDir, name)).catch(error => { if (error.code === 'ENOENT') return null; throw error; }); },
      async putImage(name, file) { await writeFile(join(uploadDir, name), file, { flag: 'wx' }); },
      async insertConsultation(row) {
        const result = db.prepare('INSERT INTO consultations (created_at, name, phone, goal, education, message, calculator) VALUES (?, ?, ?, ?, ?, ?, ?)').run(row.created_at, row.name, row.phone, row.goal, row.education, row.message, row.calculator ? JSON.stringify(row.calculator) : null);
        return Number(result.lastInsertRowid);
      },
      async listConsultations() {
        return db.prepare('SELECT id, created_at, name, phone, goal, education, message, calculator, status, admin_note, status_updated_at FROM consultations ORDER BY id DESC LIMIT 500').all().map(row => ({ ...row, calculator: row.calculator ? JSON.parse(row.calculator) : null }));
      },
      async updateConsultation(id, { status, admin_note, status_updated_at }) { return Boolean(db.prepare('UPDATE consultations SET status=?, admin_note=?, status_updated_at=? WHERE id=?').run(status, admin_note, status_updated_at, id).changes); },
      async deleteConsultation(id) { return Boolean(db.prepare('DELETE FROM consultations WHERE id=?').run(id).changes); },
      async listContent() { return db.prepare('SELECT id, type, category, title, body, format, cover_image, sample, created_at, updated_at FROM content_entries ORDER BY id DESC').all(); },
      async listPublishedContent() { return db.prepare('SELECT id, type, category, title, body, format, created_at, updated_at FROM content_entries WHERE sample=0 ORDER BY id DESC').all(); },
      async getContent(id, type) { return db.prepare('SELECT * FROM content_entries WHERE id=? AND type=?').get(id, type); },
      async insertContent(row) {
        const result = db.prepare('INSERT INTO content_entries (type, category, title, body, format, cover_image, sample, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)').run(row.type, row.category, row.title, row.body, row.format, row.cover_image, row.created_at, row.updated_at);
        return Number(result.lastInsertRowid);
      },
      async updateContent(id, row) {
        const result = db.prepare('UPDATE content_entries SET type=?, category=?, title=?, body=?, format=?, cover_image=?, updated_at=? WHERE id=?').run(row.type, row.category, row.title, row.body, row.format, row.cover_image, row.updated_at, id);
        return Boolean(result.changes);
      },
      async deleteContent(id) { return Boolean(db.prepare('DELETE FROM content_entries WHERE id=?').run(id).changes); },
      async recordPageView({ day, path, visitor_hash, source }) {
        db.exec('BEGIN');
        try {
          db.prepare('INSERT OR IGNORE INTO analytics_daily_visitors (day, visitor_hash) VALUES (?, ?)').run(day, visitor_hash);
          db.prepare('INSERT INTO analytics_page_views (day, path, visitor_hash, source) VALUES (?, ?, ?, ?)').run(day, path, visitor_hash, source);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      },
      async removeAnalyticsVisitor(hash) {
        db.prepare('DELETE FROM analytics_page_views WHERE visitor_hash=?').run(hash);
        db.prepare('DELETE FROM analytics_daily_visitors WHERE visitor_hash=?').run(hash);
      },
      async getAnalytics(days, pages) {
        const recentStart = days.at(-7);
        const dailyViews = new Map(db.prepare('SELECT day, count(*) AS views FROM analytics_page_views WHERE day>=? GROUP BY day').all(days[0]).map(row => [row.day, row.views]));
        const dailyVisitors = new Map(db.prepare('SELECT day, count(*) AS visitors FROM analytics_daily_visitors WHERE day>=? GROUP BY day').all(days[0]).map(row => [row.day, row.visitors]));
        const pageCounts = new Map(db.prepare('SELECT path, count(*) AS total, sum(CASE WHEN day>=? THEN 1 ELSE 0 END) AS recent FROM analytics_page_views GROUP BY path').all(recentStart).map(row => [row.path, row]));
        const sources = db.prepare('SELECT source, count(*) AS views FROM analytics_page_views WHERE day>=? GROUP BY source ORDER BY views DESC').all(days[0]);
        return {
          days: days.map(day => ({ day, views: dailyViews.get(day) || 0, visitors: dailyVisitors.get(day) || 0 })),
          pages: pages.map(page => ({ ...page, views: pageCounts.get(page.path)?.recent || 0, totalViews: pageCounts.get(page.path)?.total || 0 })),
          sources,
          totalViews: db.prepare('SELECT count(*) AS total FROM analytics_page_views').get().total
        };
      }
    };
  })();
}

function result(value) { if (value.error) throw value.error; return value.data; }
async function supabaseStorage() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'mentor-images';
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set for Supabase storage');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  result(await client.from('content_entries').select('id').limit(1));
  result(await client.storage.getBucket(bucket));
  return {
    backend: 'supabase',
    async getImage(name) {
      const { data, error } = await client.storage.from(bucket).download(name);
      if (error) return null;
      return Buffer.from(await data.arrayBuffer());
    },
    async putImage(name, file, type) { result(await client.storage.from(bucket).upload(name, file, { contentType: type, upsert: false })); },
    async insertConsultation(row) { return result(await client.from('consultations').insert(row).select('id').single()).id; },
    async listConsultations() { return result(await client.from('consultations').select('id,created_at,name,phone,goal,education,message,calculator,status,admin_note,status_updated_at').order('id', { ascending: false }).limit(500)); },
    async updateConsultation(id, row) { return Boolean(result(await client.from('consultations').update(row).eq('id', id).select('id').maybeSingle())); },
    async deleteConsultation(id) { return Boolean(result(await client.from('consultations').delete().eq('id', id).select('id').maybeSingle())); },
    async listContent() { return result(await client.from('content_entries').select('id,type,category,title,body,format,cover_image,sample,created_at,updated_at').order('id', { ascending: false })); },
    async listPublishedContent() { return result(await client.from('content_entries').select('id,type,category,title,body,format,created_at,updated_at').eq('sample', false).order('id', { ascending: false })); },
    async getContent(id, type) { return result(await client.from('content_entries').select('*').eq('id', id).eq('type', type).maybeSingle()) || null; },
    async insertContent(row) { return result(await client.from('content_entries').insert({ ...row, sample: false }).select('id').single()).id; },
    async updateContent(id, row) { return Boolean(result(await client.from('content_entries').update(row).eq('id', id).select('id').maybeSingle())); },
    async deleteContent(id) { return Boolean(result(await client.from('content_entries').delete().eq('id', id).select('id').maybeSingle())); },
    async recordPageView(row) {
      const unique = await client.from('analytics_daily_visitors').insert({ day: row.day, visitor_hash: row.visitor_hash });
      if (unique.error && unique.error.code !== '23505') throw unique.error;
      result(await client.from('analytics_page_views').insert(row));
    },
    async removeAnalyticsVisitor(hash) {
      result(await client.from('analytics_page_views').delete().eq('visitor_hash', hash));
      result(await client.from('analytics_daily_visitors').delete().eq('visitor_hash', hash));
    },
    async getAnalytics(days, pages) {
      const summary = result(await client.rpc('admin_analytics_summary', { p_start_day: days[0], p_recent_day: days.at(-7) }));
      const dailyViews = new Map(summary.dailyViews.map(row => [row.day, Number(row.views)]));
      const dailyVisitors = new Map(summary.dailyVisitors.map(row => [row.day, Number(row.visitors)]));
      const pageCounts = new Map(summary.pages.map(row => [row.path, row]));
      return {
        days: days.map(day => ({ day, views: dailyViews.get(day) || 0, visitors: dailyVisitors.get(day) || 0 })),
        pages: pages.map(page => ({ ...page, views: Number(pageCounts.get(page.path)?.recent || 0), totalViews: Number(pageCounts.get(page.path)?.total || 0) })),
        sources: summary.sources.map(row => ({ source: row.source, views: Number(row.views) })),
        totalViews: Number(summary.totalViews || 0)
      };
    }
  };
}

export async function createStorage() {
  if (process.env.STORAGE_BACKEND === 'supabase') return supabaseStorage();
  if (process.env.STORAGE_BACKEND && process.env.STORAGE_BACKEND !== 'sqlite') throw new Error('STORAGE_BACKEND must be sqlite or supabase');
  if (process.env.NODE_ENV === 'production' && !process.env.DATA_DIR) console.warn('WARNING: local SQLite storage may be lost after a Render restart. Set STORAGE_BACKEND=supabase for persistent data.');
  return localStorage();
}

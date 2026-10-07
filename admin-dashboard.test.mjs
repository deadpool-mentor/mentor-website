import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('admin dashboard manages consultation progress and permits authorized deletion', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mentor-admin-'));
  const port = 29000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: import.meta.dirname,
    env: { ...process.env, DATA_DIR: dir, PORT: String(port), STORAGE_BACKEND: 'sqlite', NODE_ENV: 'production', MENTOR_ADMIN_PASSWORD: 'test-only-password', RESEND_API_KEY: '' },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${child.exitCode}`);
      try { ready = (await fetch(`${base}/robots.txt`)).ok; if (ready) break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready);
    const viewed = await fetch(`${base}/api/analytics/view`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '/', source: 'naver' }) });
    assert.equal(viewed.status, 204);
    const submitted = await fetch(`${base}/api/consultations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '테스트', phone: '01012345678', goal: '학위', education: '고졸', calculator: { summary: { earned: 3 } } }) });
    assert.equal(submitted.status, 201);
    const { id } = await submitted.json();
    const anonymousDelete = await fetch(`${base}/api/consultations/${id}`, { method: 'DELETE' });
    assert.equal(anonymousDelete.status, 401);
    const anonymousUpdate = await fetch(`${base}/api/consultations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'contacted', admin_note: '연락함' }) });
    assert.equal(anonymousUpdate.status, 401);
    const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-only-password' }) });
    assert.equal(login.status, 200);
    const session = login.headers.get('set-cookie').match(/mentor_session=[^;]+/)?.[0];
    assert.ok(session);
    const dashboard = await fetch(`${base}/api/admin/analytics`, { headers: { Cookie: session } });
    assert.equal(dashboard.status, 200);
    const analytics = await dashboard.json();
    assert.equal(analytics.totalViews, 1);
    assert.equal(analytics.sources.find(row => row.source === 'naver')?.views, 1);
    assert.equal(analytics.pages.find(row => row.path === '/')?.totalViews, 1);
    const invalidUpdate = await fetch(`${base}/api/consultations/${id}`, { method: 'PATCH', headers: { Cookie: session, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'unknown', admin_note: 'test' }) });
    assert.equal(invalidUpdate.status, 400);
    const updated = await fetch(`${base}/api/consultations/${id}`, { method: 'PATCH', headers: { Cookie: session, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'contacted', admin_note: '연락 완료, 계획표 준비 중' }) });
    assert.equal(updated.status, 200);
    const progress = await fetch(`${base}/api/consultations`, { headers: { Cookie: session } });
    const [saved] = await progress.json();
    assert.equal(saved.status, 'contacted');
    assert.equal(saved.admin_note, '연락 완료, 계획표 준비 중');
    assert.ok(saved.status_updated_at);
    const deleted = await fetch(`${base}/api/consultations/${id}`, { method: 'DELETE', headers: { Cookie: session } });
    assert.equal(deleted.status, 200);
    const remaining = await fetch(`${base}/api/consultations`, { headers: { Cookie: session } });
    assert.deepEqual(await remaining.json(), []);
  } finally {
    child.kill();
    await once(child, 'exit');
    await rm(dir, { recursive: true, force: true }).catch(error => { if (error.code !== 'EBUSY') throw error; });
  }
});

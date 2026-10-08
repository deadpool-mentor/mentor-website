import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('homepage initially renders four recent reviews while the API keeps the full list', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mentor-reviews-'));
  const port = 40000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: import.meta.dirname,
    env: { ...process.env, DATA_DIR: dir, PORT: String(port), STORAGE_BACKEND: 'sqlite', NODE_ENV: 'production', MENTOR_ADMIN_PASSWORD: 'test-only-password', RESEND_API_KEY: '' },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${child.exitCode}`);
      try { ready = (await fetch(`${base}/robots.txt`)).ok; if (ready) break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready);
    const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-only-password' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')?.match(/mentor_session=[^;]+/)?.[0];
    assert.ok(cookie);
    for (let index = 1; index <= 6; index++) {
      const saved = await fetch(`${base}/api/content`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'review', category: '학위취득', title: `테스트 후기 ${index}`, body: `<p>테스트용 후기 ${index}</p>`, format: 'html' }) });
      assert.equal(saved.status, 201);
    }
    for (let index = 1; index <= 10; index++) {
      const saved = await fetch(`${base}/api/content`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'post', category: '학위취득', title: `테스트 안내 ${index}`, body: `<p>테스트용 안내 ${index}</p>`, format: 'html' }) });
      assert.equal(saved.status, 201);
    }
    const home = await fetch(base).then(response => response.text());
    assert.equal((home.match(/class="post" href="\/posts\//g) || []).length, 8);
    assert.equal((home.match(/class="review(?: review-has-thumb)?" href="\/reviews\//g) || []).length, 4);
    assert.match(home, /테스트 후기 6/);
    assert.doesNotMatch(home, /테스트 후기 1/);
    assert.match(home, /id="reviewMore"/);
    const entries = await fetch(`${base}/api/content`).then(response => response.json());
    assert.equal(entries.filter(entry => entry.type === 'review' && !entry.sample).length, 6);
    const oldestReview = entries.find(entry => entry.title === '테스트 후기 1');
    const article = await fetch(`${base}/reviews/${oldestReview.id}`);
    assert.equal(article.status, 200);
    assert.match(await article.text(), /테스트 후기 1/);
    const sitemap = await fetch(`${base}/sitemap.xml`).then(response => response.text());
    assert.match(sitemap, new RegExp(`/reviews/${oldestReview.id}<`));
  } finally {
    child.kill();
    await once(child, 'exit');
    await rm(dir, { recursive: true, force: true });
  }
});

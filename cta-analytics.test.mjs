import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createStorage } from './storage.mjs';

test('CTA clicks are separate from page views and removed with administrator visits', async () => {
  const root = resolve('tmp-test');
  const directory = await mkdtemp(resolve(root, 'cta-'));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  let storage;
  try {
    storage = await createStorage();
    const day = '2026-11-09';
    const days = Array.from({ length: 30 }, (_, offset) => new Date(Date.UTC(2026, 10, offset - 20)).toISOString().slice(0, 10));
    await storage.recordPageView({ day, path: '/', visitor_hash: 'visitor-1', source: 'direct' });
    await storage.recordCtaClick({ day, path: '/', target: 'kakao', visitor_hash: 'visitor-1' });
    await storage.recordCtaClick({ day, path: '/', target: 'consult', visitor_hash: 'visitor-1' });
    const before = await storage.getAnalytics(days, [{ path: '/', title: '홈', category: '홈' }]);
    assert.equal(before.totalViews, 1);
    assert.deepEqual(Object.fromEntries(before.ctaClicks.map(row => [row.target, row.clicks])), { consult: 1, kakao: 1 });
    await storage.removeAnalyticsVisitor('visitor-1');
    const after = await storage.getAnalytics(days, [{ path: '/', title: '홈', category: '홈' }]);
    assert.equal(after.totalViews, 0);
    assert.deepEqual(after.ctaClicks, []);
  } finally {
    storage?.close();
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    if (directory.startsWith(root + '\\')) await rm(directory, { recursive: true, force: true });
  }
});

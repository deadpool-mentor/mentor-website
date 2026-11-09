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
    await storage.recordPageView({ day, path: '/', visitor_hash: 'visitor-1', source: 'naver', source_domain: 'search.naver.com', landing_path: '/' });
    await storage.recordPageView({ day, path: '/posts', visitor_hash: 'visitor-1', source: 'naver', source_domain: 'search.naver.com', landing_path: '/' });
    await storage.recordPageView({ day, path: '/posts/17', visitor_hash: 'visitor-1', source: 'naver', source_domain: 'search.naver.com', landing_path: '/' });
    await storage.recordCtaClick({ day, path: '/', target: 'kakao', visitor_hash: 'visitor-1' });
    await storage.recordCtaClick({ day, path: '/', target: 'consult', visitor_hash: 'visitor-1' });
    await storage.recordCtaClick({ day, path: '/posts/17', target: 'kakao', visitor_hash: 'visitor-1' });
    const pages = [{ path: '/', title: '홈', category: '홈' }, { path: '/posts', title: '목록', category: '목록' }, { path: '/posts/17', title: '글', category: '편입' }];
    const before = await storage.getAnalytics(days, pages);
    assert.equal(before.totalViews, 3);
    assert.equal(before.pages.find(page => page.path === '/posts').totalViews, 1);
    assert.equal(before.pages.find(page => page.path === '/posts/17').kakaoClicks, 1);
    assert.equal(before.pages.find(page => page.path === '/posts/17').consultClicks, 0);
    assert.deepEqual(Object.fromEntries(before.ctaClicks.map(row => [row.target, row.clicks])), { consult: 1, kakao: 2 });
    assert.equal(before.sourceDomains.find(row => row.source_domain === 'search.naver.com')?.views, 3);
    assert.equal(before.landingPages.find(row => row.path === '/')?.visitors, 1);
    await storage.insertConsultation({ created_at: '2026-11-09T00:00:00Z', name: '테스트', phone: '01000000000', goal: '편입', education: '고졸', message: '', calculator: null, source_path: '/posts/17', source_title: '편입 준비 안내' });
    const [consultation] = await storage.listConsultations();
    assert.equal(consultation.source_path, '/posts/17');
    assert.equal(consultation.source_title, '편입 준비 안내');
    await storage.removeAnalyticsVisitor('visitor-1');
    const after = await storage.getAnalytics(days, pages);
    assert.equal(after.totalViews, 0);
    assert.deepEqual(after.ctaClicks, []);
  } finally {
    storage?.close();
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    if (directory.startsWith(root + '\\')) await rm(directory, { recursive: true, force: true });
  }
});

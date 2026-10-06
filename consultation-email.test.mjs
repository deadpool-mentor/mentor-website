import test from 'node:test';
import assert from 'node:assert/strict';
import { consultationEmailText, sendConsultationEmail } from './consultation-email.mjs';

const application = {
  id: 42, created_at: '2026-10-06T03:00:00.000Z', name: '홍길동', phone: '010-1234-5678',
  goal: '학사학위', education: '고졸', message: '상담 부탁드립니다.',
  calculator: {
    goal: { category: '학위', major: '경영학', education: '고졸' },
    summary: { earned: 12, planned: 18, total: 30, targetTotal: 140, remaining: 110 },
    entries: { certificates: [{ name: '자격증 A', credit: 10, category: 'M' }], selfStudy: [], completed: [], manual: [], semesters: [{ id: '1-1', items: [{ name: '경영학개론', credit: 3, category: 'R' }] }] },
    warnings: ['인정 범위 확인']
  }
};

test('email includes applicant details and every calculator section', () => {
  const text = consultationEmailText(application);
  for (const phrase of ['홍길동', '010-1234-5678', '학사학위', '고졸', '상담 부탁드립니다.', '경영학', '자격증 A', '경영학개론', '인정 범위 확인', 'https://eduonplan.co.kr/admin']) assert.ok(text.includes(phrase), phrase);
});

test('email send uses fixed recipient, plain text, and consultation idempotency key', async () => {
  let sent;
  const id = await sendConsultationEmail(application, {
    key: 'test-key',
    fetch: async (url, request) => { sent = { url, request }; return { ok: true, json: async () => ({ id: 'email-id' }) }; }
  });
  assert.equal(id, 'email-id');
  assert.equal(sent.url, 'https://api.resend.com/emails');
  assert.equal(sent.request.headers['Idempotency-Key'], 'consultation-42');
  assert.deepEqual(JSON.parse(sent.request.body).to, ['na24101@naver.com']);
  assert.equal(JSON.parse(sent.request.body).html, undefined);
});

test('provider error is reported without leaking applicant data', async () => {
  await assert.rejects(sendConsultationEmail(application, { key: 'test-key', fetch: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
});


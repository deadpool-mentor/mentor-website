const categories = { R: '전공필수', M: '전공선택', L: '교양', O: '일반선택' };

const value = input => String(input ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
const number = input => Number.isFinite(Number(input)) ? Number(input) : 0;

function list(title, rows) {
  if (!Array.isArray(rows) || !rows.length) return `${title}: 없음`;
  return [title, ...rows.map((row, index) => {
    const name = value(row?.name) || '직접 입력';
    const category = categories[row?.category] || '일반선택';
    return `  ${index + 1}. ${name} · ${number(row?.credit)}학점 · ${category}`;
  })].join('\n');
}

export function consultationEmailText(consultation, siteUrl = 'https://eduonplan.co.kr') {
  const plan = consultation.calculator;
  const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(consultation.created_at));
  const sections = [
    `[정수멘토] 새 상담 신청 #${consultation.id}`,
    `신청 시각: ${date}`,
    `이름: ${value(consultation.name)}`,
    `연락처: ${value(consultation.phone)}`,
    `상담 목표: ${value(consultation.goal)}`,
    `최종 학력: ${value(consultation.education)}`,
    `궁금한 점:\n${value(consultation.message) || '없음'}`
  ];
  if (plan && typeof plan === 'object') {
    const goal = plan.goal || {}, summary = plan.summary || {}, entries = plan.entries || {};
    sections.push([
      '학점계산 내역',
      `계산 목표: ${[goal.category, goal.major, goal.education].map(value).filter(Boolean).join(' · ') || '미입력'}`,
      `보유·인정 예상: ${number(summary.earned)}학점 / 수강 계획: ${number(summary.planned)}학점`,
      `목표 총학점: ${number(summary.total)} / ${number(summary.targetTotal)}학점 · ${number(summary.remaining)}학점 부족`,
      `전공: ${number(summary.major)} / ${number(summary.targetMajor)}학점 · 전공필수: ${number(summary.required)} / ${number(summary.targetRequired)}학점`,
      `교양: ${number(summary.general)} / ${number(summary.targetGeneral)}학점 · 일반선택: ${number(summary.elective)} / ${number(summary.targetElective)}학점`,
      list('인정 자격증', entries.certificates),
      list('독학학위제', entries.selfStudy),
      list('이미 이수한 과목', entries.completed),
      list('직접 입력한 학점', (entries.manual || []).filter(row => row?.name || row?.credit)),
      ...(Array.isArray(entries.semesters) ? entries.semesters.map(semester => list(`${value(semester.id)}학기 수강 계획`, semester.items)) : []),
      ...(Array.isArray(plan.warnings) && plan.warnings.length ? [`확인 사항:\n${plan.warnings.map(warning => `  - ${value(warning)}`).join('\n')}`] : [])
    ].join('\n\n'));
  } else {
    sections.push('학점계산 내역: 사용하지 않음');
  }
  sections.push(`관리 화면: ${siteUrl.replace(/\/$/, '')}/admin`);
  return sections.join('\n\n');
}

export async function sendConsultationEmail(consultation, options = {}) {
  const key = options.key ?? process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  const from = options.from ?? process.env.CONSULTATION_EMAIL_FROM ?? '정수멘토 <consultations@notify.eduonplan.co.kr>';
  const to = options.to ?? process.env.CONSULTATION_EMAIL_TO ?? 'na24101@naver.com';
  const siteUrl = options.siteUrl ?? process.env.PUBLIC_SITE_URL ?? 'https://eduonplan.co.kr';
  const request = options.fetch ?? fetch;
  const response = await request('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `consultation-${consultation.id}`
    },
    body: JSON.stringify({
      from, to: [to],
      subject: `[정수멘토] 새 상담 신청 #${consultation.id}`,
      text: consultationEmailText(consultation, siteUrl)
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}`);
  const data = await response.json();
  if (!data.id) throw new Error('Resend did not confirm an email ID');
  return data.id;
}


const $ = selector => document.querySelector(selector);
let applications = [];
const item = (tag, value, className = '') => { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; };
function field(label, value) { const box = item('div', '', 'admin-field'); box.append(item('span', label), item('strong', value || '—')); return box; }
function entries(title, rows) {
  const box = item('section', '', 'admin-entry-group'); box.append(item('h3', title));
  if (!rows.length) box.append(item('p', '입력 내역 없음'));
  for (const row of rows) box.append(field(row.name || '직접 입력', `${row.credit || 0}학점 · ${({R:'전공필수',M:'전공선택',L:'교양',O:'일반선택'})[row.category] || '일반선택'}`));
  return box;
}
function show(application) {
  const detail = $('#adminDetail'); detail.replaceChildren();
  detail.append(item('span', new Date(application.created_at).toLocaleString('ko-KR'), 'admin-date'), item('h2', `${application.name}님의 상담 신청`));
  const info = item('div', '', 'admin-info'); info.append(field('연락처', application.phone), field('상담 목표', application.goal), field('최종 학력', application.education), field('궁금한 점', application.message)); detail.append(info);
  const plan = application.calculator; detail.append(item('h2', '학점계산 내역'));
  if (!plan) { detail.append(item('p', '학점계산기를 사용하지 않았습니다.')); return; }
  const summary = item('div', '', 'admin-info');
  summary.append(field('계산 목표', `${plan.goal?.category || ''} · ${plan.goal?.major || ''} · ${plan.goal?.education || ''}`), field('보유·인정 예상', `${plan.summary?.earned || 0}학점`), field('수강 계획', `${plan.summary?.planned || 0}학점`), field('목표 총학점까지', `${plan.summary?.total || 0} / ${plan.summary?.targetTotal || 0}학점 · ${plan.summary?.remaining || 0}학점 부족`), field('전공 / 교양', `${plan.summary?.major || 0} / ${plan.summary?.general || 0}학점`)); detail.append(summary);
  const data = plan.entries || {};
  detail.append(entries('인정 자격증', data.certificates || []), entries('독학학위제', data.selfStudy || []), entries('이미 이수한 과목', data.completed || []), entries('직접 입력한 학점', (data.manual || []).filter(row => row.name || row.credit)));
  for (const semester of data.semesters || []) detail.append(entries(`${semester.id}학기 수강 계획`, semester.items || []));
  if (plan.warnings?.length) { const warnings = item('section', '', 'admin-entry-group'); warnings.append(item('h3', '계산기 확인 사항')); for (const warning of plan.warnings) warnings.append(item('p', warning)); detail.append(warnings); }
}
async function refresh() {
  $('#adminStatus').textContent = '신청 내역을 불러오는 중입니다.';
  try {
    const response = await fetch('/api/consultations', { cache: 'no-store' });
    if (response.status === 401) { $('#adminMain').hidden = true; $('#adminLogin').hidden = false; return; }
    if (!response.ok) throw new Error('Load failed'); applications = await response.json();
    $('#adminLogin').hidden = true; $('#adminMain').hidden = false;
    $('#adminStatus').textContent = `총 ${applications.length}건의 신청`; $('#adminList').replaceChildren();
    for (const application of applications) {
      const button = item('button', '', 'admin-list-item'); button.type = 'button';
      button.append(item('strong', application.name), item('span', `${application.goal} · ${new Date(application.created_at).toLocaleDateString('ko-KR')}`), item('small', application.calculator ? '학점계산 내역 포함' : '계산 내역 없음'));
      button.addEventListener('click', () => { document.querySelectorAll('.admin-list-item').forEach(node => node.classList.remove('active')); button.classList.add('active'); show(application); }); $('#adminList').append(button);
    }
    if (applications[0]) $('#adminList').firstElementChild.click(); else $('#adminDetail').replaceChildren(item('p', '아직 접수된 상담 신청이 없습니다.'));
    await loadAdminContent();
  } catch { $('#adminStatus').textContent = '신청 내역을 불러오지 못했습니다. 새로고침해 주세요.'; }
}
let contentEntries = [];
function resetEditor() { $('#contentForm').reset(); $('#contentForm [name="id"]').value = ''; $('#editorHeading').textContent = '새 글 작성'; $('#contentStatus').textContent = ''; }
function editEntry(entry) {
  const form = $('#contentForm');
  for (const key of ['id','type','category','title','body']) form.elements.namedItem(key).value = key === 'category' ? entry[key].replace(/\s+/g, '') : entry[key];
  $('#editorHeading').textContent = '글 수정'; $('#contentStatus').textContent = '예시 글을 수정해 저장하면 예시 표시가 사라집니다.';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function loadAdminContent() {
  const response = await fetch('/api/content', { cache: 'no-store' }); if (!response.ok) throw new Error('Content unavailable');
  contentEntries = await response.json();
  $('#contentList').replaceChildren();
  for (const entry of contentEntries) {
    const line = item('div', '', 'admin-content-item');
    const edit = item('button', '', 'admin-content-edit'); edit.type = 'button';
    edit.append(item('strong', entry.title), item('span', `${entry.type === 'post' ? '교육과정 안내' : '학생 후기'} · ${entry.category}${entry.sample ? ' · 예시' : ''}`));
    edit.addEventListener('click', () => editEntry(entry));
    const remove = item('button', '삭제', 'admin-delete'); remove.type = 'button'; remove.setAttribute('aria-label', `${entry.title} 삭제`);
    remove.addEventListener('click', async () => {
      if (!window.confirm(`「${entry.title}」 글을 삭제할까요?`)) return;
      try {
        const result = await fetch(`/api/content/${entry.id}`, { method: 'DELETE' }); if (!result.ok) throw new Error('Delete failed');
        if (String($('#contentForm [name="id"]').value) === String(entry.id)) resetEditor();
        await loadAdminContent(); $('#contentStatus').textContent = '글을 삭제했습니다.';
      } catch { $('#contentStatus').textContent = '삭제하지 못했습니다. 다시 시도해 주세요.'; }
    });
    line.append(edit, remove); $('#contentList').append(line);
  }
  if (!contentEntries.length) $('#contentList').append(item('p', '등록된 글이 없습니다.', 'content-empty'));
}
$('#contentForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, data = new FormData(form), id = String(data.get('id') || '');
  const payload = Object.fromEntries(['type','category','title','body'].map(key => [key, String(data.get(key) || '').trim()]));
  const button = form.querySelector('button[type="submit"]'); button.disabled = true; $('#contentStatus').textContent = '저장하는 중입니다.';
  try {
    const response = await fetch(id ? `/api/content/${id}` : '/api/content', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error('Save failed'); resetEditor(); await loadAdminContent(); $('#contentStatus').textContent = '글을 저장했습니다. 홈페이지에서 새로고침하면 표시됩니다.';
  } catch { $('#contentStatus').textContent = '저장하지 못했습니다. 입력한 내용은 그대로 두었습니다.'; }
  finally { button.disabled = false; }
});
$('#resetEditor').addEventListener('click', resetEditor);
$('#adminLogin').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('button');
  button.disabled = true; $('#loginStatus').textContent = '확인 중입니다.';
  try {
    const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: form.elements.password.value }) });
    if (!response.ok) { $('#loginStatus').textContent = response.status === 429 ? '잠시 후 다시 시도해 주세요.' : '암호가 맞지 않습니다.'; return; }
    form.reset(); $('#loginStatus').textContent = ''; await refresh();
  } catch { $('#loginStatus').textContent = '로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.'; }
  finally { button.disabled = false; }
});
$('#refresh').addEventListener('click', refresh); refresh();

const $ = selector => document.querySelector(selector);
let applications = [];
const item = (tag, value, className = '') => { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; };
const isLocalPreview = ['localhost','127.0.0.1'].includes(location.hostname);
if (isLocalPreview) {
  const notice = item('p', '로컬 미리보기입니다. 여기서 저장한 글은 실제 홈페이지에 반영되지 않습니다. 실제 글은 공개 사이트의 관리 화면에서 작성해 주세요. ', 'local-preview-notice');
  const link = item('a', '실제 사이트 글쓰기 ↗'); link.href = 'https://mentor-website-lm8r.onrender.com/admin'; notice.append(link); $('#adminMain').prepend(notice);
}
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
let savedRange = null;
function htmlMode(on) {
  if (on) $('#htmlSource').value = $('#richBody').innerHTML;
  else if (!$('#htmlSource').hidden) $('#richBody').innerHTML = $('#htmlSource').value;
  $('#richBody').hidden = on; $('#htmlSource').hidden = !on;
  $('#toggleHtml').setAttribute('aria-pressed', String(on));
}
function resetEditor() { $('#contentForm').reset(); $('#contentForm [name="id"]').value = ''; htmlMode(false); $('#richBody').replaceChildren(); $('#htmlSource').value = ''; $('#coverPreview').hidden = true; $('#coverPreview').removeAttribute('src'); $('#editorHeading').textContent = '새 글 작성'; $('#contentStatus').textContent = ''; }
function editEntry(entry) {
  const form = $('#contentForm');
  for (const key of ['id','type','category','title']) form.elements.namedItem(key).value = key === 'category' ? entry[key].replace(/\s+/g, '') : entry[key];
  form.elements.cover_image.value = entry.cover_image || ''; $('#coverPreview').hidden = !entry.cover_image; if (entry.cover_image) $('#coverPreview').src = entry.cover_image;
  htmlMode(false);
  if (entry.format === 'html') $('#richBody').innerHTML = entry.body;
  else { const paragraph = document.createElement('p'); paragraph.textContent = entry.body; $('#richBody').replaceChildren(paragraph); }
  $('#editorHeading').textContent = '글 수정'; $('#contentStatus').textContent = entry.sample ? '예시 글을 수정해 저장하면 예시 표시가 사라집니다.' : '';
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
  const payload = Object.fromEntries(['type','category','title','cover_image'].map(key => [key, String(data.get(key) || '').trim()]));
  payload.body = ($('#htmlSource').hidden ? $('#richBody').innerHTML : $('#htmlSource').value).trim(); payload.format = 'html';
  const draft = new DOMParser().parseFromString(payload.body, 'text/html');
  if (!draft.body.textContent.trim() && !draft.body.querySelector('img')) { $('#contentStatus').textContent = '본문을 입력해 주세요.'; return; }
  const button = form.querySelector('button[type="submit"]'); button.disabled = true; $('#contentStatus').textContent = '저장하는 중입니다.';
  try {
    const embeddedImages = [...draft.body.querySelectorAll('img')].filter(image => /^(data:|blob:)/i.test(image.getAttribute('src') || ''));
    for (const [index, image] of embeddedImages.entries()) {
      $('#contentStatus').textContent = `붙여 넣은 이미지 업로드 중 (${index + 1}/${embeddedImages.length})`;
      const blob = await fetch(image.getAttribute('src')).then(response => response.blob());
      image.setAttribute('src', await uploadImage(blob));
    }
    if (embeddedImages.length) {
      payload.body = draft.body.innerHTML.trim();
      if ($('#htmlSource').hidden) $('#richBody').innerHTML = payload.body; else $('#htmlSource').value = payload.body;
    }
    $('#contentStatus').textContent = '저장하는 중입니다.';
    const response = await fetch(id ? `/api/content/${id}` : '/api/content', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(response.status === 401 ? '로그인이 만료되었습니다. 작성 내용을 복사한 뒤 다시 로그인해 주세요.' : response.status === 413 ? detail.error || '글이 너무 큽니다. 이미지를 줄이거나 편집기의 이미지 버튼으로 올려 주세요.' : detail.error || `저장하지 못했습니다 (${response.status}). 입력한 내용은 그대로 두었습니다.`);
    }
    resetEditor(); await loadAdminContent(); $('#contentStatus').textContent = isLocalPreview ? '로컬 미리보기에 저장했습니다. 실제 홈페이지에는 반영되지 않습니다.' : '글을 저장했습니다. 홈페이지에서 새로고침하면 표시됩니다.';
  } catch (error) { $('#contentStatus').textContent = error.message || '저장하지 못했습니다. 입력한 내용은 그대로 두었습니다.'; }
  finally { button.disabled = false; }
});
$('#resetEditor').addEventListener('click', resetEditor);
$('#richBody').addEventListener('mouseup', () => { const selection = getSelection(); if (selection.rangeCount) savedRange = selection.getRangeAt(0).cloneRange(); });
$('#richBody').addEventListener('keyup', () => { const selection = getSelection(); if (selection.rangeCount) savedRange = selection.getRangeAt(0).cloneRange(); });
function restoreRange() { $('#richBody').focus(); if (savedRange && $('#richBody').contains(savedRange.commonAncestorContainer)) { const selection = getSelection(); selection.removeAllRanges(); selection.addRange(savedRange); } }
document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => { if (!$('#htmlSource').hidden) htmlMode(false); restoreRange(); document.execCommand(button.dataset.command, false, button.dataset.value || null); $('#richBody').focus(); }));
$('#fontSize').addEventListener('change', event => {
  const size = event.target.value;
  if (!size) return;
  if (!$('#htmlSource').hidden) htmlMode(false);
  restoreRange();
  if (getSelection()?.isCollapsed) { $('#contentStatus').textContent = '크기를 바꿀 글자를 먼저 선택해 주세요.'; event.target.value = ''; return; }
  document.execCommand('fontSize', false, size);
  const classes = { '2':'text-size-small', '3':'text-size-normal', '4':'text-size-large', '5':'text-size-xlarge' };
  for (const font of $('#richBody').querySelectorAll('font[size]')) {
    const span = document.createElement('span'); span.className = classes[font.getAttribute('size')] || 'text-size-normal';
    while (font.firstChild) span.append(font.firstChild);
    font.replaceWith(span);
  }
  event.target.value = '';
  $('#richBody').focus();
});
$('#toggleHtml').addEventListener('click', () => htmlMode($('#htmlSource').hidden));
$('#insertLink').addEventListener('click', () => { const url = prompt('연결할 링크 주소를 입력해 주세요 (https://...)'); if (!url) return; try { const parsed = new URL(url); if (!['http:','https:'].includes(parsed.protocol)) throw new Error(); } catch { $('#contentStatus').textContent = 'http 또는 https 링크를 입력해 주세요.'; return; } if (!$('#htmlSource').hidden) htmlMode(false); restoreRange(); document.execCommand('createLink', false, url); });
$('#insertImage').addEventListener('click', () => { if (!$('#htmlSource').hidden) htmlMode(false); $('#imageFile').click(); });
$('#insertTable').addEventListener('click', () => { if (!$('#htmlSource').hidden) htmlMode(false); restoreRange(); document.execCommand('insertHTML', false, '<table><thead><tr><th>항목</th><th>내용</th></tr></thead><tbody><tr><td>항목 1</td><td>내용을 입력하세요</td></tr><tr><td>항목 2</td><td>내용을 입력하세요</td></tr></tbody></table><p><br></p>'); });
async function uploadImage(file) {
  if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type) || file.size > 5_000_000) throw new Error('이미지는 PNG·JPG·WEBP·GIF 파일 5MB 이하만 가능합니다.');
  const response = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
  if (!response.ok) throw new Error('이미지를 올리지 못했습니다. 다시 시도해 주세요.');
  return (await response.json()).url;
}
$('#chooseCover').addEventListener('click', () => $('#coverFile').click());
$('#removeCover').addEventListener('click', () => { $('#contentForm [name="cover_image"]').value = ''; $('#coverPreview').hidden = true; $('#coverPreview').removeAttribute('src'); });
$('#coverFile').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  $('#contentStatus').textContent = '대표 이미지를 올리는 중입니다.';
  try { const url = await uploadImage(file); $('#contentForm [name="cover_image"]').value = url; $('#coverPreview').src = url; $('#coverPreview').hidden = false; $('#contentStatus').textContent = '대표 이미지를 설정했습니다.'; }
  catch (error) { $('#contentStatus').textContent = error.message; }
  event.target.value = '';
});
$('#imageFile').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  $('#contentStatus').textContent = '이미지를 올리는 중입니다.';
  try {
    const url = await uploadImage(file);
    restoreRange(); const img = document.createElement('img'); img.src = url; img.alt = file.name.replace(/\.[^.]+$/, '');
    const selection = getSelection(); if (selection.rangeCount && $('#richBody').contains(selection.anchorNode)) { const range = selection.getRangeAt(0); range.deleteContents(); range.insertNode(img); range.setStartAfter(img); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); } else $('#richBody').append(img);
    $('#contentStatus').textContent = '이미지를 본문에 넣었습니다.';
  } catch (error) { $('#contentStatus').textContent = error.message; }
  event.target.value = '';
});
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


let posts = [];
let reviews = [];
let activePostCategory = '전체';
const $ = selector => document.querySelector(selector);
const categoryName = { R: '전공필수', M: '전공선택', L: '교양', O: '일반선택' };
const sourceName = { transfer: '전적대학', institution: '평가인정·시간제', certificate: '자격증', other: '기타' };
const state = { catalog: null, certificates: [], selfStudy: [], completed: [], manual: [], semesters: [{ id: '1-1', items: [] }, { id: '1-2', items: [] }] };
let latestSnapshot = null;

function toast(message) {
  const box = $('#toast');
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => box.classList.remove('show'), 4500);
}
function renderPosts(category = '전체') {
  activePostCategory = category;
  document.querySelectorAll('.board-tab').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.filter === category)));
  const shown = posts.flatMap(post => {
    if (category !== '전체' && post.category !== category) return [];
    const button = document.createElement('a');
    button.href = `/posts/${post.id}`; button.className = 'post';
    for (const [className, value] of [['post-tag', post.sample ? `${post.category} · 예시` : post.category], ['post-title', post.title], ['post-date', new Date(post.created_at).toLocaleDateString('ko-KR')]]) {
      const span = document.createElement('span'); span.className = className; span.textContent = value; button.append(span);
    }
    return [button];
  });
  if (!shown.length) { const empty = document.createElement('p'); empty.className = 'content-empty'; empty.textContent = '등록된 안내 글이 없습니다.'; shown.push(empty); }
  $('#postList').replaceChildren(...shown);
}
function renderReviews() {
  const cards = reviews.map(review => {
    const card = document.createElement('a'); card.className = 'review'; card.href = `/reviews/${review.id}`;
    const parsed = review.format === 'html' ? new DOMParser().parseFromString(review.body, 'text/html') : null;
    const thumbnail = review.cover_image || parsed?.querySelector('img')?.getAttribute('src');
    if (thumbnail && (/^\/uploads\/[a-f0-9]{32}\.(?:png|jpg|webp|gif)$/.test(thumbnail) || /^\/articles\/[a-z0-9-]+\.svg$/.test(thumbnail))) {
      card.classList.add('review-has-thumb');
      const frame = document.createElement('span'); frame.className = 'review-thumb';
      const image = document.createElement('img'); image.src = thumbnail; image.alt = ''; image.loading = 'lazy';
      const mark = document.createElement('span'); mark.className = 'review-thumb-watermark'; mark.setAttribute('aria-hidden', 'true');
      const logo = document.createElement('img'); logo.src = '/logo.svg'; logo.alt = ''; mark.append(logo, '정수멘토');
      frame.append(image, mark); card.append(frame);
    }
    const copy = document.createElement('span'); copy.className = 'review-copy';
    const category = document.createElement('span'); const readableCategory = review.category === '학위취득' ? '학위 취득' : review.category; category.textContent = readableCategory;
    category.className = 'review-category';
    const title = document.createElement('h3'); title.textContent = review.title;
    const body = document.createElement('p'); body.textContent = parsed ? parsed.body.textContent.slice(0, 150) : review.body;
    const note = document.createElement('small'); note.textContent = new Date(review.created_at).toLocaleDateString('ko-KR');
    copy.append(category, title); if (!card.querySelector('.review-thumb')) copy.append(body); copy.append(note); card.append(copy); return card;
  });
  if (!cards.length) { const empty = document.createElement('p'); empty.className = 'content-empty'; empty.textContent = '등록된 학생 후기가 없습니다.'; cards.push(empty); }
  $('#reviewGrid').replaceChildren(...cards);
}
async function loadContent() {
  try {
    const response = await fetch('/api/content', { cache: 'no-store' }); if (!response.ok) throw new Error('Content unavailable');
    const entries = await response.json();
    posts = entries.filter(entry => entry.type === 'post'); reviews = entries.filter(entry => entry.type === 'review' && !entry.sample);
    renderPosts(activePostCategory); renderReviews();
  } catch { $('#postList').textContent = '안내 글을 불러오지 못했습니다.'; $('#reviewGrid').textContent = '후기를 불러오지 못했습니다.'; }
}
function initNavigation() {
  loadContent();
  document.querySelectorAll('.board-tab').forEach(tab => tab.addEventListener('click', () => renderPosts(tab.dataset.filter)));
  document.querySelectorAll('[data-category]').forEach(link => link.addEventListener('click', () => renderPosts(link.dataset.category)));
  const menuToggle = $('#menuToggle'), nav = $('#nav');
  menuToggle.addEventListener('click', () => { const open = nav.classList.toggle('open'); menuToggle.setAttribute('aria-expanded', String(open)); menuToggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기'); });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { nav.classList.remove('open'); menuToggle.setAttribute('aria-expanded', 'false'); }));
  $('.calc-results .button-accent').addEventListener('click', () => {
    const goal = $('#goalCategory').value;
    $('#consultForm select[name="goal"]').value = goal === '자격증 과정' ? '자격증 과정' : '학위 취득';
    const education = { '고졸': '고등학교 졸업', '전문대졸': '전문대 졸업', '대졸': '대학교 졸업' };
    $('#consultForm select[name="education"]').value = education[$('#currentEducation').value] || '';
  });
  $('#consultForm').addEventListener('submit', submitConsultation);
}
const clean = text => String(text || '').normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g, '');
function catalogItem(kind, tuple) {
  const [name, credit, category] = tuple;
  return { name, credit: Number(credit) || 0, category, kind, group: kind === 'certificates' ? tuple[3] : '', majors: tuple.at(-1) };
}
function selectedMajorIndex() { return Number($('#goalMajor').value); }
function entriesFor(kind, query) {
  if (!state.catalog) return [];
  const needle = clean(query); if (!needle) return [];
  const major = selectedMajorIndex();
  return state.catalog[kind].map(tuple => catalogItem(kind, tuple))
    .filter(item => (item.majors.length === 0 || item.majors.includes(major)) && clean(item.name).includes(needle))
    .sort((a, b) => (clean(a.name).startsWith(needle) ? 0 : 1) - (clean(b.name).startsWith(needle) ? 0 : 1) || a.name.localeCompare(b.name, 'ko'))
    .slice(0, 35);
}
function attachLookup(root, onSelect) {
  const input = root.querySelector('input');
  const options = root.querySelector('.lookup-options');
  const kind = root.dataset.kind;
  let matches = [];
  function close() { options.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); }
  function show() {
    matches = entriesFor(kind, input.value);
    options.replaceChildren();
    if (!input.value.trim()) { close(); return; }
    if (!matches.length) {
      const empty = document.createElement('div'); empty.className = 'lookup-empty'; empty.textContent = state.catalog ? '검색 결과가 없습니다.' : '검색 목록을 불러오는 중입니다.'; options.append(empty);
    } else {
      matches.forEach((item, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'lookup-option'; button.setAttribute('role', 'option'); button.dataset.index = String(index);
        const name = document.createElement('span'); name.textContent = item.name;
        const meta = document.createElement('small'); meta.textContent = `${item.credit}학점 · ${categoryName[item.category] || '일반선택'}`;
        button.append(name, meta); options.append(button);
      });
    }
    options.classList.add('open'); input.setAttribute('aria-expanded', 'true');
  }
  input.addEventListener('input', show);
  input.addEventListener('focus', show);
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
    if (event.key === 'Enter' && matches.length && options.classList.contains('open')) { event.preventDefault(); onSelect(matches[0]); input.value = ''; close(); }
  });
  options.addEventListener('click', event => {
    const button = event.target.closest('.lookup-option'); if (!button) return;
    onSelect(matches[Number(button.dataset.index)]); input.value = ''; close(); input.focus();
  });
  document.addEventListener('click', event => { if (!root.contains(event.target)) close(); });
  return { close };
}
function addCatalogItem(target, item) {
  const key = `${item.name}|${item.credit}|${item.category}`;
  if (target.some(current => `${current.name}|${current.credit}|${current.category}` === key)) { toast('이미 추가한 항목입니다.'); return; }
  target.push({ name: item.name, credit: item.credit, category: item.category, kind: item.kind });
  renderAll();
}
function renderItemList(container, items) {
  container.replaceChildren(...items.map((item, index) => {
    const line = document.createElement('div'); line.className = 'selected-item';
    const info = document.createElement('div'); const name = document.createElement('strong'); name.textContent = item.name;
    const meta = document.createElement('small'); meta.textContent = `${item.credit}학점 · ${categoryName[item.category] || '일반선택'}`;
    info.append(name, meta);
    const remove = document.createElement('button'); remove.type = 'button'; remove.setAttribute('aria-label', `${item.name} 삭제`); remove.textContent = '×';
    remove.addEventListener('click', () => { items.splice(index, 1); renderAll(); });
    line.append(info, remove); return line;
  }));
}
function manualRow(item, index) {
  const row = document.createElement('div'); row.className = 'credit-row manual';
  row.innerHTML = `<label><span>출처</span><select class="manual-source"><option value="transfer">전적대학</option><option value="institution">평가인정·시간제</option><option value="certificate">자격증 직접 입력</option><option value="other">기타</option></select></label><label><span>학습구분</span><select class="manual-category"><option value="R">전공필수</option><option value="M">전공선택</option><option value="L">교양</option><option value="O">일반선택</option></select></label><label><span>내용</span><input class="manual-name" type="text" placeholder="예: 전적대학 이수 학점"></label><label><span>학점</span><input class="manual-credit" type="number" min="0" max="200" step="1" inputmode="numeric"></label><button type="button" class="row-remove" aria-label="직접 입력 항목 삭제">×</button>`;
  row.querySelector('.manual-source').value = item.source;
  row.querySelector('.manual-category').value = item.category;
  row.querySelector('.manual-name').value = item.name;
  row.querySelector('.manual-credit').value = item.credit;
  row.querySelectorAll('select,input').forEach(input => input.addEventListener('input', () => {
    item.source = row.querySelector('.manual-source').value;
    item.category = row.querySelector('.manual-category').value;
    item.name = row.querySelector('.manual-name').value;
    item.credit = Math.max(0, Math.min(200, Math.trunc(Number(row.querySelector('.manual-credit').value) || 0)));
    calculate();
  }));
  row.querySelector('.row-remove').addEventListener('click', () => { state.manual.splice(index, 1); renderAll(); });
  return row;
}
function renderManual() { $('#manualRows').replaceChildren(...state.manual.map(manualRow)); }
function nextSemesterId() {
  for (let year = 1; year <= 8; year++) for (let half = 1; half <= 2; half++) {
    const id = `${year}-${half}`;
    if (!state.semesters.some(semester => semester.id === id)) return id;
  }
  return null;
}
function semesterCard(semester) {
  const card = document.createElement('div'); card.className = 'semester-card';
  const title = document.createElement('div'); title.className = 'semester-head';
  const heading = document.createElement('h4'); heading.textContent = `${semester.id.replace('-', '년차 ')}학기`;
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '학기 삭제';
  remove.addEventListener('click', () => { state.semesters = state.semesters.filter(current => current !== semester); renderSemesters(); calculate(); });
  title.append(heading, remove);
  const lookup = document.createElement('div'); lookup.className = 'lookup'; lookup.dataset.kind = 'courses';
  const label = document.createElement('label'); label.textContent = '수강 과목 검색';
  const input = document.createElement('input'); input.type = 'search'; input.autocomplete = 'off'; input.placeholder = '과목명을 입력해 주세요'; input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-label', `${semester.id.replace('-', '년차 ')}학기 수강 과목 검색`);
  const options = document.createElement('div'); options.className = 'lookup-options'; options.setAttribute('role', 'listbox');
  lookup.append(label, input, options);
  const selected = document.createElement('div'); selected.className = 'selected-items';
  card.append(title, lookup, selected);
  attachLookup(lookup, item => addCatalogItem(semester.items, item));
  renderItemList(selected, semester.items);
  return card;
}
function renderSemesters() { $('#semesterCards').replaceChildren(...state.semesters.map(semesterCard)); }
function renderAll() {
  renderItemList($('#certificateItems'), state.certificates);
  renderItemList($('#selfStudyItems'), state.selfStudy);
  renderItemList($('#completedItems'), state.completed);
  renderManual(); renderSemesters(); calculate();
}
function resetItems() {
  state.certificates = []; state.selfStudy = []; state.completed = []; state.manual = [];
  state.semesters = [{ id: '1-1', items: [] }, { id: '1-2', items: [] }];
  renderAll();
}
function populateMajors() {
  const category = $('#goalCategory').value;
  const names = [...new Set(state.catalog.degrees.filter(degree => degree[0] === category).map(degree => degree[1]))];
  const select = $('#goalMajor'); select.replaceChildren(...names.map(index => {
    const option = document.createElement('option'); option.value = String(index); option.textContent = state.catalog.majors[index]; return option;
  }));
  calculate();
}
function requirement() {
  const category = $('#goalCategory').value, major = selectedMajorIndex(), education = $('#currentEducation').value;
  return state.catalog?.degrees.find(row => row[0] === category && row[1] === major && row[2] === education)
    || state.catalog?.degrees.find(row => row[0] === category && row[1] === major);
}
function deficit(current, target) { return target === 0 ? '해당 없음' : current >= target ? '기준 충족 예상' : `${target - current}학점 부족`; }
function updateMetric(summaryId, remainingId, value, target) {
  $(summaryId).textContent = `${value} / ${target}학점`;
  $(remainingId).textContent = deficit(value, target);
}
function calculate() {
  const req = requirement(); if (!req) return;
  const earned = [
    ...state.certificates.map(item => ({ ...item, source: 'certificate' })),
    ...state.selfStudy.map(item => ({ ...item, source: 'selfStudy' })),
    ...state.completed.map(item => ({ ...item, source: 'institution' })),
    ...state.manual
  ];
  const planned = state.semesters.flatMap(semester => semester.items.map(item => ({ ...item, source: 'institution', semester: semester.id })));
  const all = [...earned, ...planned];
  const sum = rows => rows.reduce((total, item) => total + (Number(item.credit) || 0), 0);
  const totalEarned = sum(earned), totalPlanned = sum(planned), total = totalEarned + totalPlanned;
  const required = sum(all.filter(item => item.category === 'R'));
  const elective = sum(all.filter(item => item.category === 'M'));
  const major = required + elective;
  const general = sum(all.filter(item => item.category === 'L'));
  const institution = sum(all.filter(item => item.source === 'institution'));
  const [, , , targetTotal, targetMajor, targetRequired, targetElective, targetGeneral] = req;
  $('#goalSummary').textContent = `${state.catalog.majors[req[1]]} · ${$('#currentEducation').value} 기준`;
  $('#totalRemaining').innerHTML = `${Math.max(0, targetTotal - total)}<small>학점 남음</small>`;
  $('#totalSummary').textContent = `${total} / ${targetTotal}학점`;
  $('#totalProgress').style.width = `${targetTotal ? Math.min(100, total / targetTotal * 100) : 0}%`;
  updateMetric('#majorSummary', '#majorRemaining', major, targetMajor);
  updateMetric('#requiredSummary', '#requiredRemaining', required, targetRequired);
  updateMetric('#electiveSummary', '#electiveRemaining', elective, targetElective);
  updateMetric('#generalSummary', '#generalRemaining', general, targetGeneral);
  const needInstitution = $('#goalCategory').value !== '자격증 과정';
  $('#institutionMetric').hidden = !needInstitution;
  if (needInstitution) updateMetric('#institutionSummary', '#institutionRemaining', institution, 18);
  $('#earnedTotal').textContent = `${totalEarned}학점`;
  $('#plannedTotal').textContent = `${totalPlanned}학점`;
  const warnings = [];
  if (total >= targetTotal && (major < targetMajor || general < targetGeneral || required < targetRequired || elective < targetElective || needInstitution && institution < 18)) warnings.push('총학점 외 전공·교양·의무 이수 요건도 확인해 주세요.');
  for (const semester of state.semesters) if (sum(semester.items) > 24) warnings.push(`${semester.id.replace('-', '년차 ')}학기 수업이 24학점을 초과합니다.`);
  for (let year = 1; year <= 8; year++) {
    const credits = sum(state.semesters.filter(semester => semester.id.startsWith(`${year}-`)).flatMap(semester => semester.items));
    if (credits > 42) warnings.push(`${year}년차 수업이 연간 42학점을 초과합니다.`);
  }
  if ($('#currentEducation').value === '대졸' && state.manual.some(item => item.source === 'transfer' && item.credit > 0)) warnings.push('4년제 대학 졸업 학점은 일반 학위과정의 전적대학 학점으로 인정되지 않습니다.');
  if (state.certificates.length > 0) warnings.push('자격증 학점은 자격별 인정 범위와 전공 연계 여부를 별도로 확인하세요.');
  $('#calcWarnings').replaceChildren(...warnings.map(message => { const p = document.createElement('p'); p.textContent = `※ ${message}`; return p; }));
  latestSnapshot = {
    goal: { category: $('#goalCategory').value, major: state.catalog.majors[req[1]], education: $('#currentEducation').value },
    summary: { earned: totalEarned, planned: totalPlanned, total, targetTotal, remaining: Math.max(0, targetTotal - total), major, targetMajor, required, targetRequired, elective, targetElective, general, targetGeneral, institution },
    entries: { certificates: state.certificates, selfStudy: state.selfStudy, completed: state.completed, manual: state.manual, semesters: state.semesters },
    warnings
  };
  renderConsultPlanSummary();
}
function calculatorSnapshot() { return latestSnapshot ? JSON.parse(JSON.stringify(latestSnapshot)) : null; }
function renderConsultPlanSummary() {
  const box = $('#consultPlanSummary');
  if (!box) return;
  const snapshot = calculatorSnapshot();
  const entries = snapshot?.entries;
  const count = entries ? entries.certificates.length + entries.selfStudy.length + entries.completed.length + entries.manual.filter(item => item.credit > 0).length + entries.semesters.reduce((sum, semester) => sum + semester.items.length, 0) : 0;
  box.replaceChildren();
  const title = document.createElement('strong'); title.textContent = count ? '학점계산 내역 함께 전달' : '학점계산 내역 없음';
  const description = document.createElement('p');
  description.textContent = count ? `${snapshot.goal.major} · 보유 ${snapshot.summary.earned}학점 · 수강 계획 ${snapshot.summary.planned}학점 · 선택 항목 ${count}개` : '선택한 학점 항목이 없으면 계산 목표만 함께 전달됩니다.';
  box.append(title, description);
}
async function submitConsultation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const status = $('#formStatus');
  const data = new FormData(form);
  const payload = { name: String(data.get('name') || '').trim(), phone: String(data.get('phone') || '').trim(), goal: String(data.get('goal') || ''), education: String(data.get('education') || ''), message: String(data.get('message') || '').trim(), calculator: calculatorSnapshot() };
  button.disabled = true; status.textContent = '신청 내용을 접수하는 중입니다.';
  try {
    const response = await fetch('/api/consultations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error('접수 실패');
    form.reset(); status.textContent = '상담 신청이 접수되었습니다. 정수멘토가 확인 후 연락드리겠습니다.';
  } catch {
    status.textContent = '접수하지 못했습니다. 입력한 내용은 그대로 두었으니 잠시 후 다시 시도해 주세요.';
  } finally { button.disabled = false; }
}
function initCalculator() {
  $('#goalCategory').addEventListener('change', () => { populateMajors(); resetItems(); });
  $('#goalMajor').addEventListener('change', () => { resetItems(); toast('전공이 바뀌어 계산 항목을 초기화했습니다.'); });
  $('#currentEducation').addEventListener('change', calculate);
  attachLookup($('.lookup[data-kind="certificates"]'), item => addCatalogItem(state.certificates, item));
  attachLookup($('.lookup[data-kind="selfStudy"]'), item => addCatalogItem(state.selfStudy, item));
  attachLookup($('.lookup[data-kind="courses"]'), item => addCatalogItem(state.completed, item));
  $('#addManual').addEventListener('click', () => { state.manual.push({ source: 'transfer', category: 'O', name: '', credit: 0 }); renderManual(); calculate(); });
  $('#addSemester').addEventListener('click', () => { const id = nextSemesterId(); if (!id) return toast('최대 8년차까지 추가할 수 있습니다.'); state.semesters.push({ id, items: [] }); renderSemesters(); calculate(); });
  $('#savePlan').addEventListener('click', () => {
    const plan = { version: 1, catalogDate: state.catalog.collected, goalCategory: $('#goalCategory').value, goalMajor: $('#goalMajor').value, education: $('#currentEducation').value, certificates: state.certificates, selfStudy: state.selfStudy, completed: state.completed, manual: state.manual, semesters: state.semesters };
    const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = '정수멘토-학점계획.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#loadPlan').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const plan = JSON.parse(await file.text());
      if (plan.version !== 1 || !Array.isArray(plan.certificates) || !Array.isArray(plan.semesters) || !state.catalog.degrees.some(row => row[0] === plan.goalCategory && String(row[1]) === String(plan.goalMajor))) throw new Error('Invalid plan');
      $('#goalCategory').value = plan.goalCategory; populateMajors(); $('#goalMajor').value = plan.goalMajor; $('#currentEducation').value = plan.education;
      const safeItem = item => ({ name: String(item.name || ''), credit: Math.max(0, Math.min(200, Math.trunc(Number(item.credit) || 0))), category: categoryName[item.category] ? item.category : 'O', kind: String(item.kind || '') });
      state.certificates = plan.certificates.slice(0, 100).map(safeItem);
      state.selfStudy = (plan.selfStudy || []).slice(0, 100).map(safeItem);
      state.completed = (plan.completed || []).slice(0, 100).map(safeItem);
      state.manual = (plan.manual || []).slice(0, 100).map(item => ({ ...safeItem(item), source: sourceName[item.source] ? item.source : 'other' }));
      state.semesters = plan.semesters.slice(0, 16).map(semester => ({ id: /^\d+-[12]$/.test(semester.id) ? semester.id : '1-1', items: (semester.items || []).slice(0, 100).map(safeItem) }));
      renderAll(); toast('저장한 계획을 불러왔습니다.');
    } catch { toast('계획 파일을 읽을 수 없습니다.'); }
    event.target.value = '';
  });
  renderAll();
  fetch('./catalog.json').then(response => { if (!response.ok) throw new Error('Catalog unavailable'); return response.json(); }).then(catalog => {
    state.catalog = catalog; populateMajors(); renderAll();
  }).catch(() => toast('검색 목록을 불러오지 못했습니다. 다시 새로고침해 주세요.'));
}
initNavigation();
initCalculator();


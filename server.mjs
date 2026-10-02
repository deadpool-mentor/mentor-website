import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import sanitizeHtml from 'sanitize-html';
import { createStorage } from './storage.mjs';

const assetDir = existsSync('dist/index.html') ? 'dist' : '.';
const storage = await createStorage();
if (process.env.NODE_ENV === 'production' && !process.env.MENTOR_ADMIN_PASSWORD) throw new Error('MENTOR_ADMIN_PASSWORD is required in production');
const password = process.env.MENTOR_ADMIN_PASSWORD || randomBytes(18).toString('base64url');
const sessionToken = randomBytes(32).toString('base64url');
const loginAttempts = new Map();
if (!process.env.MENTOR_ADMIN_PASSWORD) console.log(`관리 화면 암호: ${password}`);
const files = { '/': ['index.html','text/html; charset=utf-8'], '/index.html': ['index.html','text/html; charset=utf-8'], '/styles.css': ['styles.css','text/css; charset=utf-8'], '/app.js': ['app.js','text/javascript; charset=utf-8'], '/catalog.json': ['catalog.json','application/json; charset=utf-8'], '/logo.svg': ['logo.svg','image/svg+xml'], '/admin': ['admin.html','text/html; charset=utf-8'], '/admin.js': ['admin.js','text/javascript; charset=utf-8'], '/articles/physical-education-cover.svg': ['articles/physical-education-cover.svg','image/svg+xml'], '/articles/physical-education-checklist.svg': ['articles/physical-education-checklist.svg','image/svg+xml'], '/articles/physical-education-consult.svg': ['articles/physical-education-consult.svg','image/svg+xml'], '/articles/mechanical-manager-cover.svg': ['articles/mechanical-manager-cover.svg','image/svg+xml'], '/articles/mechanical-manager-path.svg': ['articles/mechanical-manager-path.svg','image/svg+xml'], '/articles/mechanical-manager-consult.svg': ['articles/mechanical-manager-consult.svg','image/svg+xml'], '/share/home.jpg': ['share/home.jpg','image/jpeg'], '/share/physical-education.jpg': ['share/physical-education.jpg','image/jpeg'], '/share/mechanical-manager.jpg': ['share/mechanical-manager.jpg','image/jpeg'] };
const isAllowedImage = source => /^\/uploads\/[a-f0-9]{32}\.(?:png|jpg|webp|gif)$/.test(source || '') || (source?.startsWith('/articles/') && files[source]?.[1] === 'image/svg+xml');
function json(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); }
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
function cleanHtml(value) {
  return sanitizeHtml(value.replace(/\u200b/g, ''), {
    allowedTags: ['p','br','strong','b','em','i','u','s','span','font','h2','h3','h4','ul','ol','li','blockquote','a','img','hr','div','table','thead','tbody','tr','th','td','pre','code'],
    allowedAttributes: { a: ['href','target','rel'], img: ['src','alt'], span: ['class','style'], font: ['size','color'] },
    allowedClasses: { span: ['text-size-small','text-size-normal','text-size-large','text-size-xlarge','text-size-8pt','text-size-10pt','text-size-12pt','text-size-14pt','text-size-16pt','text-size-18pt','text-size-24pt'] },
    allowedStyles: { span: { color: [/^#[0-9a-f]{6}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/], 'background-color': [/^#[0-9a-f]{6}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/] } },
    allowedSchemes: ['http','https','mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }), font: (tag, attributes) => ({ tagName: 'span', attribs: { ...(attributes.size ? { class: ({ '1':'text-size-8pt', '2':'text-size-10pt', '3':'text-size-12pt', '4':'text-size-14pt', '5':'text-size-16pt', '6':'text-size-18pt', '7':'text-size-24pt' })[attributes.size] || 'text-size-12pt' } : {}), ...(/^#[0-9a-f]{6}$/i.test(attributes.color || '') ? { style: `color:${attributes.color}` } : {}) } }) },
    exclusiveFilter: frame => frame.tag === 'img' && !isAllowedImage(frame.attribs.src)
  });
}
const plain = row => row.format === 'html' ? sanitizeHtml(row.body, { allowedTags: [], allowedAttributes: {} }) : row.body;
const contentHtml = row => row.format === 'html' ? cleanHtml(row.body) : `<p>${escapeHtml(row.body).replace(/\n/g, '<br>')}</p>`;
function reviewThumbnail(row) {
  if (isAllowedImage(row.cover_image)) return row.cover_image;
  if (row.format !== 'html') return null;
  for (const match of row.body.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)) if (isAllowedImage(match[2])) return match[2];
  return null;
}
function reviewCardImage(source) {
  return source ? `<span class="review-thumb"><img src="${escapeHtml(source)}" alt="" loading="lazy"><span class="review-thumb-watermark" aria-hidden="true"><img src="/logo.svg" alt="">정수멘토</span></span>` : '';
}
function originUrl(request) { if (process.env.PUBLIC_SITE_URL) return new URL(process.env.PUBLIC_SITE_URL).origin; const host = request.headers.host || 'localhost'; return `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${host}`; }
const shareRasters = {
  '/articles/physical-education-cover.svg': '/share/physical-education.jpg',
  '/articles/mechanical-manager-cover.svg': '/share/mechanical-manager.jpg'
};
function shareImageFor(row) {
  const images = [row.cover_image];
  if (row.format === 'html') for (const match of row.body.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)) images.push(match[2]);
  for (const source of images) {
    if (!isAllowedImage(source)) continue;
    const path = shareRasters[source] || source;
    if (files[path]?.[1] === 'image/jpeg') return { path, type: 'image/jpeg', width: 1200, height: 630 };
    const type = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[path.split('.').pop()];
    if (type) return { path, type };
  }
  return { path: '/share/home.jpg', type: 'image/jpeg', width: 1200, height: 630 };
}
function shareImageTags(origin, image, alt) {
  return `<meta property="og:image" content="${escapeHtml(origin + image.path)}"><meta property="og:image:type" content="${image.type}">${image.width ? `<meta property="og:image:width" content="${image.width}"><meta property="og:image:height" content="${image.height}">` : ''}<meta property="og:image:alt" content="${escapeHtml(alt)}"><meta name="twitter:card" content="summary_large_image">`;
}
const jsonLd = value => JSON.stringify(value).replace(/</g, '\\u003c');
async function homePage(request) {
  const origin = originUrl(request);
  const rows = await storage.listPublishedContent();
  const posts = rows.filter(row => row.type === 'post').map(row => `<a class="post" href="/posts/${row.id}"><span class="post-tag">${escapeHtml(row.category)}</span><span class="post-title">${escapeHtml(row.title)}</span><span class="post-date">${escapeHtml(row.created_at.slice(0,10))}</span></a>`).join('');
  const reviews = rows.filter(row => row.type === 'review').map(row => { const thumbnail = reviewThumbnail(row); return `<a class="review${thumbnail ? ' review-has-thumb' : ''}" href="/reviews/${row.id}">${reviewCardImage(thumbnail)}<span class="review-copy"><span class="review-category">${escapeHtml(row.category)}</span><h3>${escapeHtml(row.title)}</h3>${thumbnail ? '' : `<p>${escapeHtml(plain(row).replace(/\s+/g, ' ').slice(0,150))}</p>`}<small>${escapeHtml(row.created_at.slice(0,10))}</small></span></a>`; }).join('');
  const structured = { '@context':'https://schema.org', '@type':'WebSite', name:'정수멘토', url:`${origin}/`, inLanguage:'ko-KR', description:'학점은행제 학위·편입·자격증 안내와 학점계산기, 무료 학습계획표 상담' };
  const file = await readFile(resolve(assetDir, 'index.html'), 'utf8');
  return file.replace('</head>', `<link rel="canonical" href="${escapeHtml(origin)}/"><meta property="og:type" content="website"><meta property="og:site_name" content="정수멘토"><meta property="og:locale" content="ko_KR"><meta property="og:url" content="${escapeHtml(origin)}/"><meta property="og:title" content="정수멘토 | 나에게 맞는 학점은행제 플랜"><meta property="og:description" content="학점은행제 학위·편입·자격증 안내와 학점계산기, 무료 학습계획표 상담">${shareImageTags(origin, { path: '/share/home.jpg', type: 'image/jpeg', width: 1200, height: 630 }, '정수멘토 학점은행제 학위·편입·자격증 안내')}<script type="application/ld+json">${jsonLd(structured)}</script></head>`).replace('<div id="postList" class="post-list"></div>', `<div id="postList" class="post-list">${posts}</div>`).replace('<div class="review-grid" id="reviewGrid"></div>', `<div class="review-grid" id="reviewGrid">${reviews}</div>`);
}
function articlePage(request, row) {
  const url = `${originUrl(request)}/${row.type === 'review' ? 'reviews' : 'posts'}/${row.id}`;
  const title = `${row.title} | 정수멘토`;
  const description = plain(row).replace(/\s+/g, ' ').slice(0, 150);
  const category = row.type === 'review' ? '학생 후기' : '교육과정 안내';
  const shareImage = shareImageFor(row);
  const structured = { '@context':'https://schema.org', '@type':row.type === 'review' ? 'Article' : 'BlogPosting', headline:row.title, description, inLanguage:'ko-KR', datePublished:row.created_at, dateModified:row.updated_at, mainEntityOfPage:url, author:{ '@type':'Person', name:'정수멘토' }, publisher:{ '@type':'Organization', name:'정수멘토', url:`${originUrl(request)}/` }, image:`${originUrl(request)}${shareImage.path}` };
  const structuredDataScript = `<script type="application/ld+json">${jsonLd(structured)}</script>`;
  const bodyHtml = contentHtml(row);
  const markedBody = row.type === 'review' ? bodyHtml.replace(/<img\b[^>]*>/gi, image => `<div class="review-evidence">${image}<span class="review-watermark" aria-hidden="true"><img src="/logo.svg" alt="">정수멘토</span></div>`) : bodyHtml;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${row.sample ? 'noindex,follow' : 'index,follow'}"><link rel="canonical" href="${escapeHtml(url)}"><meta property="og:type" content="article"><meta property="og:site_name" content="정수멘토"><meta property="og:locale" content="ko_KR"><meta property="og:title" content="${escapeHtml(row.title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(url)}">${shareImageTags(originUrl(request), shareImage, row.title)}${structuredDataScript}<link rel="stylesheet" href="/styles.css"><link rel="icon" href="/logo.svg" type="image/svg+xml"></head><body class="article-page"><header class="article-header"><a class="brand" href="/"><img class="brand-mark" src="/logo.svg" alt=""><span>정수멘토<small>JUNGSOO MENTOR</small></span></a><a href="/#${row.type === 'review' ? 'reviews' : 'board'}">목록으로 ↗</a></header><main class="article-main"><span class="eyebrow">${category} · ${escapeHtml(row.category)}${row.sample ? ' · 예시' : ''}</span><h1>${escapeHtml(row.title)}</h1><time datetime="${escapeHtml(row.created_at)}">${escapeHtml(row.created_at.slice(0,10))}</time>${row.cover_image ? `<img class="article-cover" src="${escapeHtml(row.cover_image)}" alt="">` : ''}<div class="article-body">${markedBody}</div>${row.sample ? `<p class="article-sample">${row.type === 'review' ? '화면 구성 예시입니다. 실제 학생 후기가 아닙니다.' : '화면 구성 예시 글입니다. 실제 교육과정 정보로 교체해 주세요.'}</p>` : ''}<a class="button button-dark" href="/#consult">무료 학습계획표 상담 ↗</a></main><a class="kakao-float" href="https://open.kakao.com/o/sfAip6Mi" target="_blank" rel="noopener noreferrer" aria-label="카카오톡 상담하기"><span class="kakao-icon">TALK</span><span>카카오톡<br>상담하기</span></a></body></html>`;
}
async function readUpload(request) { const chunks = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > 5_000_000) throw new Error('Too large'); chunks.push(chunk); } return Buffer.concat(chunks); }
function imageExtension(data, type) {
  if (type === 'image/png' && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (type === 'image/jpeg' && data.subarray(0,3).equals(Buffer.from([255,216,255]))) return 'jpg';
  if (type === 'image/gif' && ['GIF87a','GIF89a'].includes(data.subarray(0,6).toString())) return 'gif';
  if (type === 'image/webp' && data.subarray(0,4).toString() === 'RIFF' && data.subarray(8,12).toString() === 'WEBP') return 'webp';
  return null;
}
async function storeEmbeddedImages(html) {
  let imageCount = 0;
  const imageTags = html.match(/<img\b[^>]*>/gi) || [];
  for (const tag of imageTags) {
    const source = tag.match(/\bsrc\s*=\s*(["'])(data:image\/(png|jpeg|webp|gif);base64,([a-z0-9+/=\s]+))\1/i);
    if (!source) continue;
    if (++imageCount > 8) throw Object.assign(new Error('한 글에 붙여 넣는 이미지는 최대 8개입니다. 더 많은 이미지는 편집기의 이미지 버튼으로 넣어 주세요.'), { status: 413 });
    const mime = `image/${source[3].toLowerCase()}`, encoded = source[4];
    if (encoded.length > 6_700_000) throw Object.assign(new Error('붙여 넣은 이미지 1개의 크기가 5MB를 넘습니다. 이미지를 줄여서 다시 넣어 주세요.'), { status: 413 });
    const file = Buffer.from(encoded, 'base64');
    const ext = imageExtension(file, mime);
    if (!ext || file.length > 5_000_000) throw Object.assign(new Error('붙여 넣은 이미지는 PNG·JPG·WEBP·GIF 형식, 5MB 이하만 가능합니다.'), { status: 413 });
    const name = `${randomBytes(16).toString('hex')}.${ext}`;
    await storage.putImage(name, file, mime);
    html = html.replace(tag, tag.replace(source[0], `src="/uploads/${name}"`));
  }
  return html;
}
function sameOrigin(request) { const origin = request.headers.origin; return !origin || [`http://${request.headers.host}`, `https://${request.headers.host}`].includes(origin); }
function authorized(request) {
  const cookie = (request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('mentor_session='));
  const actual = Buffer.from(cookie?.slice('mentor_session='.length) || ''), expected = Buffer.from(sessionToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function readBody(request, maxSize = 100_000) { const chunks = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > maxSize) throw new Error('Too large'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && /^\/uploads\/[a-f0-9]{32}\.(png|jpg|webp|gif)$/.test(path)) {
      const file = await storage.getImage(path.slice(9));
      if (!file) return json(response, 404, { error: 'Not found' });
      const ext = path.split('.').pop();
      response.writeHead(200, { 'Content-Type': { jpg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp' }[ext], 'X-Content-Type-Options':'nosniff', 'Cache-Control':'public, max-age=86400' }); return response.end(file);
    }
    if (request.method === 'POST' && path === '/api/uploads') {
      if (!authorized(request) || !sameOrigin(request)) return json(response, 403, { error: 'Forbidden' });
      const file = await readUpload(request), ext = imageExtension(file, String(request.headers['content-type'] || '').split(';')[0]);
      if (!ext) return json(response, 400, { error: 'PNG, JPG, GIF, WEBP 이미지만 업로드할 수 있습니다.' });
      const name = `${randomBytes(16).toString('hex')}.${ext}`;
      await storage.putImage(name, file, String(request.headers['content-type'] || '').split(';')[0]);
      return json(response, 201, { url: `/uploads/${name}` });
    }
    if (request.method === 'GET' && /^\/(posts|reviews)\/\d+$/.test(path)) {
      const [, collection, id] = path.split('/');
      const row = await storage.getContent(Number(id), collection === 'posts' ? 'post' : 'review');
      if (!row || (row.type === 'review' && row.sample)) return json(response, 404, { error: 'Not found' });
      response.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'public, max-age=60' }); return response.end(articlePage(request, row));
    }
    if (request.method === 'GET' && path === '/robots.txt') {
      response.writeHead(200, { 'Content-Type':'text/plain; charset=utf-8' }); return response.end(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${originUrl(request)}/sitemap.xml\n`);
    }
    if (request.method === 'GET' && path === '/sitemap.xml') {
      const rows = await storage.listPublishedContent();
      const pages = [{ url: `${originUrl(request)}/` }, ...rows.map(row => ({ url: `${originUrl(request)}/${row.type === 'review' ? 'reviews' : 'posts'}/${row.id}`, date: row.updated_at }))];
      response.writeHead(200, { 'Content-Type':'application/xml; charset=utf-8' }); return response.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(page => `<url><loc>${escapeHtml(page.url)}</loc>${page.date ? `<lastmod>${page.date.slice(0,10)}</lastmod>` : ''}</url>`).join('')}</urlset>`);
    }
    if (request.method === 'POST' && path === '/api/admin/login') {
      if (!sameOrigin(request)) return json(response, 403, { error: 'Forbidden' });
      const now = Date.now(), attempts = loginAttempts.get(request.socket.remoteAddress) || [];
      const recent = attempts.filter(time => now - time < 15 * 60_000);
      if (recent.length >= 5) return json(response, 429, { error: 'Too many attempts' });
      const data = await readBody(request), actual = Buffer.from(String(data.password || '')), expected = Buffer.from(password);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { recent.push(now); loginAttempts.set(request.socket.remoteAddress, recent); return json(response, 401, { error: 'Wrong password' }); }
      loginAttempts.delete(request.socket.remoteAddress);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': `mentor_session=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` });
      return response.end('{"ok":true}');
    }
    if (request.method === 'POST' && path === '/api/consultations') {
      if (!sameOrigin(request)) return json(response, 403, { error: 'Forbidden' });
      const data = await readBody(request);
      const name = String(data.name || '').trim().slice(0, 80), phone = String(data.phone || '').trim().slice(0, 40), goal = String(data.goal || '').trim().slice(0, 80), education = String(data.education || '').trim().slice(0, 80), message = String(data.message || '').trim().slice(0, 3000);
      const calculator = data.calculator == null ? null : data.calculator;
      if (!name || !/^0\d[\d\s-]{7,15}$/.test(phone) || !goal || !education || (calculator && JSON.stringify(calculator).length > 80_000)) return json(response, 400, { error: 'Invalid submission' });
      const id = await storage.insertConsultation({ created_at: new Date().toISOString(), name, phone, goal, education, message, calculator });
      return json(response, 201, { id });
    }
    if (request.method === 'GET' && path === '/api/consultations') {
      if (!authorized(request)) return json(response, 401, { error: 'Unauthorized' });
      const rows = await storage.listConsultations();
      return json(response, 200, rows);
    }
    if (request.method === 'GET' && path === '/api/content') {
      const rows = await storage.listContent();
      return json(response, 200, rows);
    }
    if (['POST','PUT','DELETE'].includes(request.method) && path.startsWith('/api/content')) {
      if (!authorized(request)) return json(response, 401, { error: 'Unauthorized' });
      if (!sameOrigin(request)) return json(response, 403, { error: 'Forbidden' });
      const id = Number(path.match(/^\/api\/content\/(\d+)$/)?.[1]);
      if (request.method === 'DELETE') {
        if (!id) return json(response, 400, { error: 'Invalid id' });
        const deleted = await storage.deleteContent(id);
        return json(response, deleted ? 200 : 404, { ok: deleted });
      }
      if (request.method === 'PUT' && !id || request.method === 'POST' && path !== '/api/content') return json(response, 400, { error: 'Invalid path' });
      const data = await readBody(request, 20_000_000);
      const type = String(data.type || ''), category = String(data.category || '').trim().slice(0, 40), title = String(data.title || '').trim().slice(0, 160), format = data.format === 'html' ? 'html' : 'text', rawBody = String(data.body || ''), body = (format === 'html' ? cleanHtml(await storeEmbeddedImages(rawBody)) : rawBody).trim(), coverImage = isAllowedImage(data.cover_image) ? data.cover_image : null;
      if (Buffer.byteLength(body, 'utf8') > 500_000) return json(response, 413, { error: '이미지를 제외한 글 본문은 500KB 이하로 작성해 주세요.' });
      if (!['post','review'].includes(type) || !category || !title || !body || (!plain({ body, format }).trim() && !/<img\b[^>]*\bsrc="\/uploads\/[a-f0-9]{32}\.(?:png|jpg|webp|gif)"/i.test(body))) return json(response, 400, { error: 'Invalid content' });
      const now = new Date().toISOString();
      if (request.method === 'POST') {
        const id = await storage.insertContent({ type, category, title, body, format, cover_image: coverImage, created_at: now, updated_at: now });
        return json(response, 201, { id });
      }
      const updated = await storage.updateContent(id, { type, category, title, body, format, cover_image: coverImage, updated_at: now });
      return json(response, updated ? 200 : 404, { ok: updated });
    }
    if (request.method !== 'GET' || !files[path]) return json(response, 404, { error: 'Not found' });
    if (path === '/' || path === '/index.html') { response.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'public, max-age=60' }); return response.end(await homePage(request)); }
    const [filename, type] = files[path], file = await readFile(resolve(assetDir, filename));
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': ['/admin','/admin.js'].includes(path) ? 'no-store' : 'public, max-age=60' }); response.end(file);
  } catch (error) { console.error(error); json(response, error.status || (error.message === 'Too large' ? 413 : 500), { error: error.status ? error.message : error.message === 'Too large' ? '요청 크기가 너무 큽니다. 이미지를 줄이거나 편집기의 이미지 버튼으로 올려 주세요.' : 'Request failed' }); }
}).listen(Number(process.env.PORT || 8123), process.env.PORT ? '0.0.0.0' : '127.0.0.1', () => console.log(`Server listening on port ${process.env.PORT || 8123}`));


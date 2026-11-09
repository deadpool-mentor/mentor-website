const trackedPath = location.pathname;
if (trackedPath === '/' || /^\/(?:posts|reviews)\/\d+$/.test(trackedPath)) {
  const classify = value => {
    const host = value.toLowerCase();
    if (/(^|\.)google\./.test(host)) return 'google';
    if (/(^|\.)naver\.com$/.test(host)) return 'naver';
    if (/(^|\.)daum\.net$/.test(host)) return 'daum';
    if (/(^|\.)bing\.com$/.test(host)) return 'bing';
    if (/(^|\.)(kakao\.com|kakaotalk\.com)$/.test(host)) return 'kakao';
    if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
    if (/(^|\.)facebook\.com$/.test(host)) return 'facebook';
    if (/(^|\.)youtube\.com$/.test(host)) return 'youtube';
    return 'other-site';
  };
  const campaign = new URLSearchParams(location.search).get('utm_source');
  const knownCampaigns = ['google','naver','daum','bing','kakao','instagram','facebook','youtube'];
  const campaignSource = campaign ? (knownCampaigns.includes(campaign.toLowerCase()) ? campaign.toLowerCase() : 'other-campaign') : null;
  let source = campaignSource;
  try {
    if (!source) source = sessionStorage.getItem('mentor_visit_source');
    if (!source) {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      source = referrer && referrer.hostname !== location.hostname ? classify(referrer.hostname) : 'direct';
    }
    sessionStorage.setItem('mentor_visit_source', source);
  } catch { source ||= 'unknown'; }
  fetch('/api/analytics/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive: true,
    body: JSON.stringify({ path: trackedPath, source })
  }).catch(() => {});

  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    let destination;
    try { destination = new URL(link.href, location.href); } catch { return; }
    const target = destination.hostname === 'open.kakao.com' && destination.pathname === '/o/sfAip6Mi'
      ? 'kakao'
      : destination.origin === location.origin && destination.hash === '#consult' ? 'consult' : null;
    if (!target) return;
    const body = JSON.stringify({ path: trackedPath, target });
    if (navigator.sendBeacon?.('/api/analytics/cta', new Blob([body], { type: 'application/json' }))) return;
    fetch('/api/analytics/cta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', keepalive: true, body }).catch(() => {});
  }, { capture: true });
}

const trackedPath = location.pathname;
if (trackedPath === '/' || /^\/(?:posts|reviews)\/\d+$/.test(trackedPath)) {
  fetch('/api/analytics/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive: true,
    body: JSON.stringify({ path: trackedPath })
  }).catch(() => {});
}


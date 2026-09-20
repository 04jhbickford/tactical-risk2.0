// Preview-only gate. Live Canvas at / stays untouched.
// Accepts ?three=1 (legacy Three preview) or ?ux=1 (this hybrid).

const ON = new Set(['1', 'true', 'yes']);
const MAX_DEMO = new Set(['max', 'fat', 'big']);

export function isUxPreviewRequested(search = typeof location !== 'undefined' ? location.search : '') {
  const params = new URLSearchParams(search);
  const three = String(params.get('three') || '').toLowerCase();
  const ux = String(params.get('ux') || '').toLowerCase();
  return ON.has(three) || ON.has(ux);
}

// Full classic solo vs AI under Three chrome. Pocket demo stays ?three=1 / ?max=1.
export function isSoloRequested(search = typeof location !== 'undefined' ? location.search : '') {
  if (!isUxPreviewRequested(search)) return false;
  const params = new URLSearchParams(search);
  return ON.has(String(params.get('solo') || '').toLowerCase());
}

export function soloHref(href = typeof location !== 'undefined' ? location.href : 'http://localhost/') {
  const url = new URL(href, 'http://localhost/');
  url.searchParams.set('three', '1');
  url.searchParams.delete('ux');
  url.searchParams.delete('max');
  url.searchParams.delete('stress');
  url.searchParams.delete('demo');
  url.searchParams.set('solo', '1');
  return url.toString();
}

// Fat Karelia → Ukraine battle. ?max=1, ?stress=1, or ?demo=max
export function isMaxBattleRequested(search = typeof location !== 'undefined' ? location.search : '') {
  const params = new URLSearchParams(search);
  const max = String(params.get('max') || '').toLowerCase();
  const stress = String(params.get('stress') || '').toLowerCase();
  const demo = String(params.get('demo') || '').toLowerCase();
  return ON.has(max) || ON.has(stress) || MAX_DEMO.has(demo);
}

export function stripPreviewParams(href = typeof location !== 'undefined' ? location.href : 'http://localhost/') {
  const url = new URL(href, 'http://localhost/');
  url.searchParams.delete('three');
  url.searchParams.delete('ux');
  url.searchParams.delete('solo');
  url.searchParams.delete('max');
  url.searchParams.delete('stress');
  url.searchParams.delete('demo');
  return url.toString();
}

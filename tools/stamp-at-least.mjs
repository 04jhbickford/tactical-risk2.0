// Old release tests asserted the exact stamp of the release they shipped with, so every later release turned them red
// (77 of 119 test files failing on unified.69, almost all on the stamp line alone). They now assert "this release or
// later": a test still fails if the build goes backwards, and the newest release's own test keeps its exact check.
import { unifiedReleaseParts } from '../src/version.js';

export function stampAtLeast(actual, wanted) {
  const a = unifiedReleaseParts(actual), w = unifiedReleaseParts(wanted);
  if (!a || !w) return actual === wanted;
  const prefix = (v) => String(v).replace(/unified\..*$/, '');
  if (prefix(actual) !== prefix(wanted)) return false;   // V2.81.57- display vs V2.82- compat never mix
  return a[0] > w[0] || (a[0] === w[0] && a[1] >= w[1]);
}

export function htmlStampAtLeast(html, wanted) {
  const m = /content="(V[\d.]+-unified\.[\d.]+)"/.exec(html);
  return !!m && stampAtLeast(m[1], wanted);
}

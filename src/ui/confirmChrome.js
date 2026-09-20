// Visual states for Confirm / primary HUD verbs.
// Grammar stays land → unit → named Confirm. Max only fills a count.

export const CONFIRM_CHROME = {
  READY: 'ready',
  HELD: 'held',
  UNAVAILABLE: 'unavailable',
  QUEUED: 'queued',
};

export const QUEUED_CONFIRM_ACTIONS = [
  'place-capital',
  'confirm-placement',
  'confirm-mobilize',
  'confirm-move',
  'confirm-purchase',
  'confirm-air-landing',
  'roll-tech',
];

export function isQueuedConfirmAction(action) {
  return QUEUED_CONFIRM_ACTIONS.includes(action);
}

// Priority: unavailable (disabled / Select-units ghost) → held → queued → ready.
// Queued means the action is staged and still needs the Confirm tap
// (Max does not skip this).
export function resolveConfirmChrome({
  disabled = false,
  held = false,
  queued = false,
  selectUnits = false,
} = {}) {
  if (disabled || selectUnits) return CONFIRM_CHROME.UNAVAILABLE;
  if (held) return CONFIRM_CHROME.HELD;
  if (queued) return CONFIRM_CHROME.QUEUED;
  return CONFIRM_CHROME.READY;
}

export function confirmChromeClass(chrome) {
  return `pp-chrome-${chrome || CONFIRM_CHROME.READY}`;
}

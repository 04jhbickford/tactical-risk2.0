// Setup-phase tutorial for Three chrome. Main has no dedicated wizard —
// this restates How to Play + deploy-wave rules in a dismissible overlay.

export const SETUP_TUTORIAL_KEY = 'tacticalRisk_threeSetupTutorial';

export const SETUP_TUTORIAL_TITLE = 'How to start';

export const SETUP_TUTORIAL_STEPS = [
  {
    kicker: 'Place Capital',
    body: 'Tap a land you own, then Confirm. Each power needs a capital before deploy.',
  },
  {
    kicker: 'Deploy 6, then Pass',
    body: 'Each placement wave: put 6 units on the map, then Pass. Leftovers wait for your next wave.',
  },
  {
    kicker: 'Turn loop',
    body: 'Tech → Buy → Combat Move → Fight → Air Land → NCM → Place → Income. Manual combat-move — no Try.',
  },
];

export function tutorialWasDismissed(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(SETUP_TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissTutorial(storage = globalThis.localStorage) {
  try {
    storage?.setItem(SETUP_TUTORIAL_KEY, '1');
  } catch {
    /* ignore quota */
  }
  return true;
}

export function resetTutorial(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(SETUP_TUTORIAL_KEY);
  } catch {
    /* ignore */
  }
  return true;
}

export function shouldShowSetupTutorial(gameState, { force = false, dismissed } = {}) {
  if (force) return true;
  if (dismissed ?? tutorialWasDismissed()) return false;
  const phase = gameState?.phase;
  return phase === 'capital_placement' || phase === 'unit_placement';
}

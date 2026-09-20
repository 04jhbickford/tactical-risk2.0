// V2.81.45 phase-guide lifecycle + one bottom surface + Combat Move copy.
// Run: node tools/test-phase-guide-lifecycle.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

if (typeof globalThis.localStorage === 'undefined') {
  const mem = {};
  globalThis.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem(k, v) { mem[k] = String(v); },
    removeItem(k) { delete mem[k]; },
  };
}

const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const {
  shouldShowPhaseGuide,
  shouldAutoShowPhaseGuide,
  isPhaseGuideAutoShowWindow,
  isPhaseGuideNever,
  dismissPhaseGuide,
  neverShowPhaseGuides,
  reopenPhaseGuide,
  resetPhaseGuides,
  resolvePhaseGuideControl,
  resolvePhaseGuideId,
  PHASE_GUIDE_IDS,
  PHASE_GUIDES,
  PHASE_GUIDE_STORAGE_KEY,
  PHASE_GUIDE_NEVER_KEY,
} = await import(pathToFileURL(join(root, 'src/ui/phaseGuide.js')));
const {
  resolveActiveBottomSurface,
  shouldCollapsePeekForSurface,
  shouldHidePhaseGuideForSurface,
  shouldKeepCtaRailForSurface,
  BOTTOM_SURFACE,
  BOTTOM_SURFACE_Z,
} = await import(pathToFileURL(join(root, 'src/ui/bottomSurface.js')));
const {
  GAME_PHASES,
  TURN_PHASES,
} = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { formatMobilePhaseWord } =
  await import(pathToFileURL(join(root, 'src/ui/mobileShell.js')));
const {
  resolvePhonePeekHint,
  PHASE_HINTS,
} = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));
const { resolveHudNextStep } =
  await import(pathToFileURL(join(root, 'src/ui/hudClarity.js')));

const css = readFileSync(join(root, 'style.css'), 'utf8');
const guideSrc = readFileSync(join(root, 'src/ui/phaseGuide.js'), 'utf8');
const method = readFileSync(join(root, 'doc/METHOD-SETTLECOAST.md'), 'utf8');

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

console.log('=== Version + schema ===');
check('GAME_VERSION is V2.81.57-dual-path.9', GAME_VERSION === 'V2.81.57-dual-path.9');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== Store / never / turn gate ===');
resetPhaseGuides();
check('storage key unchanged', PHASE_GUIDE_STORAGE_KEY === 'tacticalRisk_phaseGuides');
check('first session shows Place Capital',
  shouldShowPhaseGuide(PHASE_GUIDE_IDS.CAPITAL) === true
  && shouldAutoShowPhaseGuide(PHASE_GUIDE_IDS.CAPITAL, undefined, {
    phase: GAME_PHASES.CAPITAL_PLACEMENT, round: 1,
  }) === true);

dismissPhaseGuide(PHASE_GUIDE_IDS.CAPITAL);
check('Got it dismisses that page only',
  shouldShowPhaseGuide(PHASE_GUIDE_IDS.CAPITAL) === false
  && shouldShowPhaseGuide(PHASE_GUIDE_IDS.DEPLOY) === true);

reopenPhaseGuide(PHASE_GUIDE_IDS.CAPITAL);
check('menu reopen clears dismiss unless never',
  shouldShowPhaseGuide(PHASE_GUIDE_IDS.CAPITAL) === true);

neverShowPhaseGuides();
check('never key is persisted',
  isPhaseGuideNever() === true
  && PHASE_GUIDE_NEVER_KEY === 'never');
check('shouldShowPhaseGuide honors never',
  shouldShowPhaseGuide(PHASE_GUIDE_IDS.CAPITAL) === false
  && shouldShowPhaseGuide(PHASE_GUIDE_IDS.ATTACK) === false);
check('menu reopen is a no-op after never',
  shouldShowPhaseGuide(PHASE_GUIDE_IDS.CAPITAL, reopenPhaseGuide(PHASE_GUIDE_IDS.CAPITAL)) === false);
check('never control kind',
  resolvePhaseGuideControl({ action: 'never', currentId: 'capital' }).kind === 'never');

resetPhaseGuides();
check('setup always auto-shows',
  isPhaseGuideAutoShowWindow({ phase: GAME_PHASES.CAPITAL_PLACEMENT, round: 99 }) === true
  && isPhaseGuideAutoShowWindow({ phase: GAME_PHASES.UNIT_PLACEMENT, round: 99 }) === true);
check('PLAYING round 1 auto-shows Combat Move / Fortify',
  shouldAutoShowPhaseGuide(PHASE_GUIDE_IDS.ATTACK, {}, {
    phase: GAME_PHASES.PLAYING, round: 1,
  }) === true
  && shouldAutoShowPhaseGuide(PHASE_GUIDE_IDS.FORTIFY, {}, {
    phase: GAME_PHASES.PLAYING, round: 1,
  }) === true
  && resolvePhaseGuideId(GAME_PHASES.PLAYING, TURN_PHASES.COMBAT_MOVE) === PHASE_GUIDE_IDS.ATTACK);
check('PLAYING round > 1 stops auto-show',
  isPhaseGuideAutoShowWindow({ phase: GAME_PHASES.PLAYING, round: 2 }) === false
  && shouldAutoShowPhaseGuide(PHASE_GUIDE_IDS.ATTACK, {}, {
    phase: GAME_PHASES.PLAYING, round: 2,
  }) === false);
check('round > 1 still allows shouldShow (menu) unless never',
  shouldShowPhaseGuide(PHASE_GUIDE_IDS.ATTACK) === true);
check('auto-show rule is documented in the module',
  /round === 1/.test(guideSrc)
  && /Never show this again/.test(guideSrc)
  && /Manual — no auto-advance/.test(guideSrc));

console.log('=== Combat Move copy ===');
check('guide title is Combat Move, not Attack',
  PHASE_GUIDES.attack.title === 'Combat Move'
  && /dice/.test(PHASE_GUIDES.attack.job)
  && /highlighted land/.test(PHASE_GUIDES.attack.next));
check('Fortify names Non-Combat Move',
  /Non-Combat Move/.test(PHASE_GUIDES.fortify.job));
check('HUD chip is Combat Move',
  formatMobilePhaseWord(GAME_PHASES.PLAYING, TURN_PHASES.COMBAT_MOVE) === 'Combat Move'
  && formatMobilePhaseWord(GAME_PHASES.PLAYING, TURN_PHASES.NON_COMBAT_MOVE) === 'Fortify');
check('desktop PHASE_HINTS name the stack → units → land job',
  PHASE_HINTS[TURN_PHASES.COMBAT_MOVE] === 'Click stack → units → highlighted land → Confirm'
  && PHASE_HINTS[TURN_PHASES.NON_COMBAT_MOVE] === 'Click stack → units → your land → Confirm');
check('phone peek idle Combat Move is stack-then-units',
  resolvePhonePeekHint(GAME_PHASES.PLAYING, TURN_PHASES.COMBAT_MOVE)
    === 'Tap your stack, then each unit to move'
  && resolvePhonePeekHint(GAME_PHASES.PLAYING, TURN_PHASES.NON_COMBAT_MOVE)
    === 'Tap your stack, then each unit to fortify');
check('phone peek dest names units then Confirm',
  resolvePhonePeekHint(GAME_PHASES.PLAYING, TURN_PHASES.COMBAT_MOVE, null, {
    territoryName: 'Ukraine S.S.R.',
  }) === 'Tap each unit, then a highlighted land'
  && resolvePhonePeekHint(GAME_PHASES.PLAYING, TURN_PHASES.COMBAT_MOVE, 'infantry', {
    territoryName: 'Ukraine S.S.R.', destName: 'West Russia',
  }) === 'Tap each unit to move · West Russia');
check('deploy SILO is unchanged',
  resolvePhonePeekHint(GAME_PHASES.UNIT_PLACEMENT, null) === 'Tap land, then unit');
check('HUD next-step is honest',
  /Combat Move/.test(resolveHudNextStep({
    phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.COMBAT_MOVE,
  }) || '')
  && /Fortify/.test(resolveHudNextStep({
    phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.NON_COMBAT_MOVE,
  }) || ''));

console.log('=== One bottom surface ===');
check('menu beats sheet beats guide beats peek',
  resolveActiveBottomSurface({ menuOpen: true, sheetVisible: true, phaseGuideVisible: true })
    === BOTTOM_SURFACE.MENU
  && resolveActiveBottomSurface({ sheetVisible: true, phaseGuideVisible: true })
    === BOTTOM_SURFACE.SHEET
  && resolveActiveBottomSurface({ phaseGuideVisible: true }) === BOTTOM_SURFACE.GUIDE
  && resolveActiveBottomSurface({}) === BOTTOM_SURFACE.PEEK);
check('guide/sheet/menu collapse peek',
  shouldCollapsePeekForSurface(BOTTOM_SURFACE.GUIDE) === true
  && shouldCollapsePeekForSurface(BOTTOM_SURFACE.SHEET) === true
  && shouldCollapsePeekForSurface(BOTTOM_SURFACE.PEEK) === false);
check('sheet/menu hide the guide; CTA stays for guide',
  shouldHidePhaseGuideForSurface(BOTTOM_SURFACE.SHEET) === true
  && shouldHidePhaseGuideForSurface(BOTTOM_SURFACE.GUIDE) === false
  && shouldKeepCtaRailForSurface(BOTTOM_SURFACE.GUIDE) === true
  && shouldKeepCtaRailForSurface(BOTTOM_SURFACE.SHEET) === false);
check('documented z-index ladder',
  BOTTOM_SURFACE_Z.peekTray === 60
  && BOTTOM_SURFACE_Z.ctaRail === 65
  && BOTTOM_SURFACE_Z.phaseGuide === 75
  && BOTTOM_SURFACE_Z.sheet === 200);
check('CSS: guide inset above CTA and z 75',
  /html\.mobile-shell \.phase-guide \{[\s\S]*?bottom:\s*calc\(var\(--mobile-cta/.test(css)
  && /html\.mobile-shell \.phase-guide \{[\s\S]*?z-index:\s*75/.test(css)
  && /phase-guide-open[\s\S]*?phone-peek-row/.test(css)
  && /handoff-active[\s\S]*?\.phase-guide/.test(css)
  && /Never show this again/.test(guideSrc));
check('METHOD documents the gate, never, and ladder',
  /round === 1/.test(method)
  && /store\.never/.test(method)
  && /z-index ladder/i.test(method)
  && /Combat Move vs Attack/.test(method)
  && !/Tesla/.test(readFileSync(join(root, 'src/ui/phaseGuide.js'), 'utf8')));

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll phase-guide-lifecycle checks passed');

// Classic desktop Develop Technology green button.
// Phone and tablet keep the previous words.
// Run: node tools/test-develop-tech-label.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const { GAME_VERSION, SCHEMA_VERSION, compatClientVersion, compareGameVersions } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const { GAME_PHASES, TURN_PHASES, TURN_PHASE_NAMES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { PlayerPanel } =
  await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label);
  } else {
    console.log('ok  :', label);
  }
};

const OLD_LABEL = 'Develop technology';
const NEW_LABEL = 'End Phase - Develop Technology';

function setViewport({ width, mobile }) {
  globalThis.window = { innerWidth: width };
  globalThis.document = {
    documentElement: {
      classList: { contains: (name) => mobile && name === 'mobile-shell' },
    },
  };
}

function panel() {
  const ui = Object.create(PlayerPanel.prototype);
  ui.gameState = {
    isMultiplayer: false,
    combatQueue: [],
    raidQueue: [],
    moveHistory: [],
    undoLockMoveCount: 0,
    getPendingPurchases() { return []; },
  };
  ui.techDiceCount = 0;
  ui._looksBrokenReason = '';
  ui._ignoreUndoUntil = 0;
  ui.airLandingSelections = {};
  ui._airLandingsRemaining = () => 0;
  ui.isAirLandingActive = () => false;
  ui._techAcquisition = () => 'dice';
  ui._carriedTechTokens = () => 0;
  ui._renderPhonePeekRow = () => '';
  ui.el = { classList: { contains: () => false } };
  return ui;
}

function advanceLabel(html) {
  const match = html.match(/data-role="advance"[^>]*>([^<]+)</);
  return match ? match[1].trim() : '';
}

console.log('=== stamp ===');
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  check('display stamp is V2.81.57-unified.43', GAME_VERSION === 'V2.81.57-unified.43');
  check('schema stays 11', SCHEMA_VERSION === 11);
  check('game docs write V2.82-unified.43', compatClientVersion() === 'V2.82-unified.43');
  check('a V2.82-unified.42 doc does not prompt this tab',
    compareGameVersions('V2.82-unified.42', GAME_VERSION) < 0);
  check('a V2.82-unified.44 doc prompts this tab',
    compareGameVersions('V2.82-unified.44', GAME_VERSION) > 0);
  check('our own V2.82-unified.43 doc does not prompt',
    compareGameVersions('V2.82-unified.43', GAME_VERSION) === 0);
  check('index.html carries the display stamp',
    html.includes('content="V2.81.57-unified.43"')
    && html.includes("window.__TR_GAME_VERSION = 'V2.81.57-unified.43'")
    && html.includes("var LOCKED = 'V2.81.57-unified.43'")
    && html.includes('style.css?v=V2.81.57-unified.43')
    && html.includes('src/main.js?v=V2.81.57-unified.43'));
}

console.log('=== develop tech label ===');
{
  const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  const techLabel = panelSrc.slice(
    panelSrc.indexOf('turnPhase === TURN_PHASES.DEVELOP_TECH'),
    panelSrc.indexOf('End Phase · ${TURN_PHASE_NAMES[turnPhase]'),
  );
  check('desktop branch says End Phase - Develop Technology',
    techLabel.includes("desktop ? 'End Phase - Develop Technology'"));
  check('phone and tablet branch stays Develop technology',
    techLabel.includes(": 'Develop technology'"));
}

{
  const player = { id: 'Germans', isAI: false, name: 'Germany' };
  setViewport({ width: 1280, mobile: false });
  const desktopHtml = panel()._renderBottomActions(
    GAME_PHASES.PLAYING, TURN_PHASES.DEVELOP_TECH, player, true, true,
  );
  check('desktop side panel button says End Phase - Develop Technology',
    advanceLabel(desktopHtml) === NEW_LABEL
    && desktopHtml.includes('pp-phase-advance')
    && !desktopHtml.includes('pp-confirm-edge'));

  setViewport({ width: 390, mobile: true });
  const phoneHtml = panel()._renderBottomActions(
    GAME_PHASES.PLAYING, TURN_PHASES.DEVELOP_TECH, player, true, true,
  );
  check('phone bar keeps Develop technology',
    advanceLabel(phoneHtml) === OLD_LABEL);

  setViewport({ width: 800, mobile: false });
  const tabletHtml = panel()._renderBottomActions(
    GAME_PHASES.PLAYING, TURN_PHASES.DEVELOP_TECH, player, true, true,
  );
  check('tablet bar keeps Develop technology',
    advanceLabel(tabletHtml) === OLD_LABEL
    && tabletHtml.includes('pp-confirm-edge'));

  setViewport({ width: 1280, mobile: false });
  const purchaseHtml = panel()._renderBottomActions(
    GAME_PHASES.PLAYING, TURN_PHASES.PURCHASE, player, true, true,
  );
  check('purchase phase label is unchanged',
    advanceLabel(purchaseHtml) === `End Phase · ${TURN_PHASE_NAMES[TURN_PHASES.PURCHASE]}`);

  const combatMoveHtml = panel()._renderBottomActions(
    GAME_PHASES.PLAYING, TURN_PHASES.COMBAT_MOVE, player, true, true,
  );
  check('combat move phase label is unchanged',
    advanceLabel(combatMoveHtml) === `End Phase · ${TURN_PHASE_NAMES[TURN_PHASES.COMBAT_MOVE]}`);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall passed');

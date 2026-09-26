// V2.76 combat UI: AA result step stays visible; empty-defender rematch is skipped.
// Run: node tools/test-combat-ui.mjs

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

function makeEl() {
  const classSet = new Set();
  const el = {
    id: '',
    className: '',
    innerHTML: '',
    style: {},
    children: [],
    classList: {
      add(...names) {
        names.forEach((n) => classSet.add(n));
        el.className = [...classSet].join(' ');
      },
      remove(...names) {
        names.forEach((n) => classSet.delete(n));
        el.className = [...classSet].join(' ');
      },
      contains(name) { return classSet.has(name); },
      toggle(name, force) {
        if (force === undefined) {
          if (classSet.has(name)) this.remove(name);
          else this.add(name);
        } else if (force) this.add(name);
        else this.remove(name);
      },
    },
    appendChild(child) { this.children.push(child); return child; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  return el;
}

const documentElement = makeEl();
const body = makeEl();
globalThis.document = {
  documentElement,
  body,
  createElement() { return makeEl(); },
  getElementById() { return null; },
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const {
  CombatUI,
  AA_RESULT_PHASE,
  AA_RESULT_AUTO_PAUSE_MS,
  territoryHasEnemyCombatUnits,
  getEnemyCombatUnits,
  getFriendlyCombatUnits,
  countLivingUnits,
  territoryCombatAlreadyResolved,
  summarizeCombatForce,
  formatCombatForceLine,
  resolveCombatNextLine,
  shouldUsePhoneCombatSummary,
  phoneCombatAttackerWinPercent,
  formatPhoneCombatHeroOdds,
  resolvePhoneCombatStep,
  phoneCombatStepIndex,
  shouldCompactPhoneCombatHero,
  PHONE_COMBAT_STEPS,
} = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));

const unitDefs = {
  infantry: { cost: 3, attack: 1, defense: 2, isLand: true },
  fighter: { cost: 10, attack: 3, defense: 4, isAir: true },
  bomber: { cost: 12, attack: 4, defense: 1, isAir: true },
  aaGun: { cost: 5, attack: 0, defense: 0, isLand: true, antiAir: true },
  factory: { cost: 15, isBuilding: true },
};

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

function makeGame({
  territory = 'Anglo-Sudan Egypt',
  attackers = [{ type: 'fighter', owner: 'p1', quantity: 2 }],
  defenders = [{ type: 'infantry', owner: 'p2', quantity: 1 }, { type: 'aaGun', owner: 'p2', quantity: 1 }],
  combatQueue,
  turnPhase = 'combat',
} = {}) {
  const units = { [territory]: [...attackers, ...defenders] };
  return {
    currentPlayer: { id: 'p1', name: 'Robert007', color: '#c00' },
    combatQueue: combatQueue || [territory],
    turnPhase,
    units,
    notified: 0,
    territoryState: { [territory]: { owner: 'p2' } },
    capturedThisTurn: new Set(),
    conqueredThisTurn: {},
    getUnitsAt(name) { return this.units[name] || []; },
    areAllies() { return false; },
    getPlayer(id) {
      if (id === 'p1') return this.currentPlayer;
      return { id: 'p2', name: 'James', color: '#00c' };
    },
    getOwner(name) { return this.territoryState[name]?.owner || 'p2'; },
    awardRiskCard() { return 'infantry'; },
    handleCapitalCapture() {},
    logTerritoryCapture() {},
    hasAmphibiousAssault() { return false; },
    territoryByName: { [territory]: { isWater: false, connections: [] } },
    combatTelemetry: [],
    combatLog: [],
    recordCombatTelemetry(entry) { this.combatTelemetry.push({ ...entry }); },
    logCombat(result) { this.combatLog.push(result); },
    _notify() { this.notified += 1; },
  };
}

function makeUI(game) {
  const ui = new CombatUI();
  ui.setGameState(game);
  ui.setUnitDefs(unitDefs);
  const log = { entries: [], log(type, data) { this.entries.push({ type, data }); } };
  ui.setActionLog(log);
  return ui;
}

console.log('=== Version stamps ===');
check('GAME_VERSION is V2.81.57-unified.16', GAME_VERSION === 'V2.81.57-unified.16');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);
check('AA result auto-pause is readable (not a 150ms blip)', AA_RESULT_AUTO_PAUSE_MS >= 400);

console.log('=== Enemy combat units (factory excluded, AA counts) ===');
{
  const p1 = 'p1';
  check('infantry is an enemy combat unit',
    territoryHasEnemyCombatUnits([{ type: 'infantry', owner: 'p2', quantity: 1 }], p1) === true);
  check('AA-only is still a real fight',
    territoryHasEnemyCombatUnits([{ type: 'aaGun', owner: 'p2', quantity: 1 }], p1) === true);
  check('factory-only is not a fight',
    territoryHasEnemyCombatUnits([{ type: 'factory', owner: 'p2', quantity: 1 }], p1) === false);
  check('empty territory is not a fight',
    territoryHasEnemyCombatUnits([], p1) === false);
  check('attacker-only leftover is not a fight',
    territoryHasEnemyCombatUnits([{ type: 'fighter', owner: 'p1', quantity: 2 }], p1) === false);
  check('quantity 0 leftover is ignored',
    territoryHasEnemyCombatUnits([{ type: 'infantry', owner: 'p2', quantity: 0 }], p1) === false);
  check('getEnemyCombatUnits drops factory',
    getEnemyCombatUnits([
      { type: 'factory', owner: 'p2', quantity: 1 },
      { type: 'aaGun', owner: 'p2', quantity: 1 },
    ], p1).every((u) => u.type !== 'factory'));
}

console.log('=== AA result phase is shown (hits and 0-hits) ===');
{
  const game = makeGame();
  const ui = makeUI(game);
  ui.showNextCombat();
  check('AA present → starts on aaFire', ui.combatState.phase === 'aaFire');

  const origRandom = Math.random;
  Math.random = () => 0.9; // roll 6, miss
  ui._rollAAFire();
  Math.random = origRandom;

  check('0-hits stays on aaResults (does not skip to ready)', ui.combatState.phase === AA_RESULT_PHASE);
  check('0-hits records 0', ui.combatState.aaResults.hits === 0);
  check('0-hits paints dice + header',
    ui.el.innerHTML.includes('AA Fire Results: 0 hit(s)') && ui.el.innerHTML.includes('class="die miss"'));
  check('0-hits names the defending AA', ui.el.innerHTML.includes('James AA guns fire'));
  check('0-hits says no aircraft lost', ui.el.innerHTML.includes('No aircraft lost'));
  check('0-hits has Continue', ui.el.innerHTML.includes('Continue'));
  check('0-hits logs one action-log line',
    ui.actionLog.entries.length === 1 && ui.actionLog.entries[0].data.message.includes('0 hits'));
  check('fighters still alive after 0-hits',
    ui.combatState.attackers.find((u) => u.type === 'fighter')?.quantity === 2);

  ui._confirmAAResults();
  check('Continue after 0-hits proceeds to ready', ui.combatState.phase === 'ready');
}

{
  const game = makeGame({
    attackers: [
      { type: 'fighter', owner: 'p1', quantity: 2 },
      { type: 'bomber', owner: 'p1', quantity: 1 },
    ],
  });
  const ui = makeUI(game);
  ui.showNextCombat();

  const origRandom = Math.random;
  Math.random = () => 0; // roll 1, hit
  ui._rollAAFire();
  Math.random = origRandom;

  check('hits stay on aaResults', ui.combatState.phase === AA_RESULT_PHASE);
  check('3 aircraft → 3 hits recorded', ui.combatState.aaResults.hits === 3);
  check('hits paint dice + header',
    ui.el.innerHTML.includes('AA Fire Results: 3 hit(s)') && ui.el.innerHTML.includes('class="die hit"'));
  check('cheapest aircraft die first (fighters before bomber)',
    ui.combatState.selectedAACasualties.fighter === 2
    && ui.combatState.selectedAACasualties.bomber === 1);
  check('result names aircraft lost',
    ui.el.innerHTML.includes('Aircraft lost') && ui.el.innerHTML.includes('fighter'));
  check('no attacker casualty picker', !ui.el.innerHTML.includes('Select 3 Aircraft to Lose'));
  check('hits log names the losses',
    ui.actionLog.entries[0].data.message.includes('3 hit(s)')
    && ui.actionLog.entries[0].data.message.includes('fighter'));
}

console.log('=== showNextCombat / syncFromAuthoritativeState skip empty rematch ===');
{
  const territory = 'Anglo-Sudan Egypt';
  const game = makeGame({
    territory,
    attackers: [{ type: 'infantry', owner: 'p1', quantity: 3 }],
    defenders: [{ type: 'factory', owner: 'p2', quantity: 1 }],
    combatQueue: [territory],
  });
  const ui = makeUI(game);
  const result = ui.showNextCombat();
  check('0-defender (factory only) is not shown', result.shown === false);
  check('already-won queue head is dequeued', game.combatQueue.length === 0);
  check('popup stays hidden (no 0-enemy retry)', ui.el.classList.contains('hidden'));
  check('dequeue notifies so the queue can persist', game.notified >= 1);
  check('35RB85: land leftover flips political control on dequeue',
    game.territoryState[territory].owner === 'p1');
  check('35RB85: capturedThisTurn records the hex',
    game.capturedThisTurn.has(territory));
}

{
  const empty = 'Anglo-Sudan Egypt';
  const real = 'Libya';
  const game = makeGame({
    territory: empty,
    attackers: [{ type: 'infantry', owner: 'p1', quantity: 2 }],
    defenders: [],
    combatQueue: [empty, real],
  });
  game.units[real] = [
    { type: 'infantry', owner: 'p1', quantity: 2 },
    { type: 'infantry', owner: 'p2', quantity: 1 },
  ];
  game.territoryByName[real] = { isWater: false, connections: [] };
  const ui = makeUI(game);
  const result = ui.showNextCombat();
  check('skips empty head and opens the next real fight', result.shown === true && ui.currentTerritory === real);
  check('empty head dequeued, real fight remains',
    game.combatQueue.length === 1 && game.combatQueue[0] === real);
  check('opened fight has enemy combat units',
    ui.combatState.defenders.some((u) => u.type === 'infantry' && u.owner === 'p2'));
}

{
  const territory = 'Anglo-Sudan Egypt';
  const game = makeGame({
    territory,
    attackers: [{ type: 'fighter', owner: 'p1', quantity: 2 }],
    defenders: [{ type: 'aaGun', owner: 'p2', quantity: 1 }],
  });
  const ui = makeUI(game);
  const result = ui.showNextCombat();
  check('AA-only still opens (real fight)', result.shown === true);
  check('AA-only starts on aaFire', ui.combatState.phase === 'aaFire');
  check('AA-only stays in the queue', game.combatQueue[0] === territory);
}

{
  const territory = 'Anglo-Sudan Egypt';
  const game = makeGame({
    territory,
    attackers: [{ type: 'infantry', owner: 'p1', quantity: 3 }],
    defenders: [{ type: 'infantry', owner: 'p2', quantity: 2 }],
  });
  const ui = makeUI(game);
  const result = ui.syncFromAuthoritativeState();
  check('both sides still present → true retry', result.shown === true && ui.currentTerritory === territory);
  check('true retry keeps the queue head', game.combatQueue[0] === territory);
}

{
  const territory = 'Anglo-Sudan Egypt';
  const game = makeGame({
    territory,
    attackers: [{ type: 'infantry', owner: 'p1', quantity: 3 }],
    defenders: [],
  });
  const ui = makeUI(game);
  let completed = 0;
  ui.setOnComplete(() => { completed += 1; });
  const result = ui.syncFromAuthoritativeState();
  check('syncFromAuthoritativeState does not open a 0-defender rematch', result.shown === false);
  check('won queue head is dequeued', game.combatQueue.length === 0);
  check('popup hidden after empty rematch skip', ui.el.classList.contains('hidden'));
  check('combat complete fires so the phase can end', completed === 1);
}

console.log('=== V2.81.36 phone combat summary ===');
{
  const mix = [
    { type: 'infantry', quantity: 4 },
    { type: 'armour', quantity: 2 },
    { type: 'fighter', quantity: 1 },
    { type: 'factory', quantity: 0 },
  ];
  check('force line names types and counts',
    formatCombatForceLine(mix) === '4 infantry · 2 tank · 1 fighter');
  check('empty force is blank', formatCombatForceLine([]) === '');
  check('summarize drops zero qty',
    summarizeCombatForce(mix).every((u) => u.quantity > 0));
  check('next line is short',
    resolveCombatNextLine('ready') === 'Next: roll combat'
    && resolveCombatNextLine('selectCasualties') === 'Assign hits, then Confirm'
    && resolveCombatNextLine('resolved', { winner: 'attacker' }) === 'Attacker wins');
  check('phone summary is phone-only',
    shouldUsePhoneCombatSummary({ mobile: true }) === true
    && shouldUsePhoneCombatSummary({ mobile: false }) === false);
  const game = makeGame({
    attackers: [{ type: 'infantry', owner: 'p1', quantity: 4 }, { type: 'armour', owner: 'p1', quantity: 2 }],
    defenders: [{ type: 'infantry', owner: 'p2', quantity: 3 }],
  });
  game.combatQueue = ['Anglo-Sudan Egypt'];
  document.documentElement.classList.add('mobile-shell');
  const ui = makeUI(game);
  ui.showNextCombat();
  check('phone opening paints who-vs-who + mix, not only the desktop sheet',
    /phone-combat-summary/.test(ui.el.innerHTML)
    && /phone-combat-row/.test(ui.el.innerHTML)
    && /4 infantry/.test(ui.el.innerHTML)
    && /2 tank/.test(ui.el.innerHTML)
    && ui.el.classList.contains('combat-popup--phone'));
  const hero = formatPhoneCombatHeroOdds({
    attackerWinPercent: phoneCombatAttackerWinPercent({
      attackers: game.combatQueue ? ui.combatState.attackers : [],
      defenders: ui.combatState.defenders,
      unitDefs,
    }),
    territoryName: 'Anglo-Sudan Egypt',
    hasAttackers: true,
    hasDefenders: true,
  });
  check('phone hero odds are first and player-facing take-chance',
    /phone-combat-hero-pct/.test(ui.el.innerHTML)
    && ui.el.innerHTML.indexOf('phone-combat-hero') < ui.el.innerHTML.indexOf('phone-combat-vs')
    && ui.el.innerHTML.indexOf('phone-combat-hero') < ui.el.innerHTML.indexOf('phone-combat-row')
    && /to take Anglo-Sudan Egypt/.test(ui.el.innerHTML)
    && hero.text.endsWith('%')
    && hero.percent > 0
    && formatPhoneCombatHeroOdds({
      attackerWinPercent: 0, hasAttackers: false, hasDefenders: true,
    }).label === 'no attacking units'
    && formatPhoneCombatHeroOdds({
      phase: 'resolved', winner: 'attacker', territoryName: 'Karelia S.S.R.',
    }).text === '100%');
  document.documentElement.classList.remove('mobile-shell');
}

console.log('=== V2.81.45 phone combat sheet (odds / select / resolve) ===');
{
  check('phone steps are odds → select → resolve',
    PHONE_COMBAT_STEPS.join(',') === 'odds,select,resolve'
    && resolvePhoneCombatStep('ready') === 'odds'
    && resolvePhoneCombatStep('aaFire') === 'odds'
    && resolvePhoneCombatStep('selectCasualties') === 'select'
    && resolvePhoneCombatStep('airLanding') === 'select'
    && resolvePhoneCombatStep('rolling') === 'resolve'
    && resolvePhoneCombatStep(AA_RESULT_PHASE) === 'resolve'
    && resolvePhoneCombatStep('resolved') === 'resolve'
    && phoneCombatStepIndex('odds') === 1
    && phoneCombatStepIndex('resolve') === 3);
  check('short viewports compact the 40px hero',
    shouldCompactPhoneCombatHero({ viewportHeight: 390 }) === true
    && shouldCompactPhoneCombatHero({ viewportHeight: 844 }) === false
    && shouldCompactPhoneCombatHero({ viewportHeight: 0 }) === false);
  const game = makeGame({
    attackers: [{ type: 'infantry', owner: 'p1', quantity: 4 }, { type: 'armour', owner: 'p1', quantity: 2 }],
    defenders: [{ type: 'infantry', owner: 'p2', quantity: 3 }],
  });
  document.documentElement.classList.add('mobile-shell');
  const prevHeight = globalThis.window?.innerHeight;
  globalThis.window = { ...(globalThis.window || {}), innerHeight: 390 };
  const ui = makeUI(game);
  ui.showNextCombat();
  const readyHtml = ui.el.innerHTML;
  const ctaAt = readyHtml.indexOf('phone-combat-cta');
  const bodyAt = readyHtml.indexOf('phone-combat-body');
  const rollAt = readyHtml.indexOf('data-action="roll"');
  check('ready paints sheet chips + sticky Roll (not a packed dump)',
    /phone-combat-sheet/.test(readyHtml)
    && /data-combat-step="odds"/.test(readyHtml)
    && /data-combat-step="select"/.test(readyHtml)
    && /data-combat-step="resolve"/.test(readyHtml)
    && /phone-combat-chip is-current/.test(readyHtml)
    && bodyAt >= 0 && ctaAt > bodyAt
    && rollAt > ctaAt
    && /Confirm: Roll combat/.test(readyHtml)
    && /Auto Battle/.test(readyHtml)
    && /Retreat/.test(readyHtml)
    && ui.el.classList.contains('phone-combat-compact'));
  ui.combatState.phase = 'selectCasualties';
  ui.combatState.pendingAttackerCasualties = 1;
  ui.combatState.pendingDefenderCasualties = 1;
  ui.combatState.selectedAttackerCasualties = {};
  ui.combatState.selectedDefenderCasualties = {};
  ui._render();
  const selectHtml = ui.el.innerHTML;
  const confirmAt = selectHtml.indexOf('data-action="confirm-casualties"');
  const selectCta = selectHtml.indexOf('phone-combat-cta');
  check('select step puts Confirm Casualties in the sticky CTA',
    /Assign hits, then Confirm/.test(selectHtml)
    && /casualty-selection-split/.test(selectHtml)
    && confirmAt > selectCta
    && /Confirm: Take hits/.test(selectHtml));
  ui.combatState.phase = 'resolved';
  ui.combatState.winner = 'attacker';
  ui.combatState.totalAttackerLosses = {};
  ui.combatState.totalDefenderLosses = {};
  ui.combatState.initialAttackers = ui.combatState.attackers;
  ui.combatState.initialDefenders = ui.combatState.defenders;
  ui._render();
  const resolveHtml = ui.el.innerHTML;
  check('resolve step keeps End Combat Phase in the sticky CTA',
    /data-combat-step="resolve"/.test(resolveHtml)
    && resolveHtml.indexOf('data-action="next"') > resolveHtml.indexOf('phone-combat-cta')
    && /End Phase · Combat/.test(resolveHtml));
  if (prevHeight === undefined) delete globalThis.window.innerHeight;
  else globalThis.window.innerHeight = prevHeight;
  document.documentElement.classList.remove('mobile-shell');
}

console.log('=== V2.81.55 AA wipe fail-close + telemetry ===');
{
  check('countLivingUnits ignores qty 0 and excluded AA',
    countLivingUnits([{ type: 'fighter', quantity: 2 }, { type: 'aaGun', quantity: 1 }]) === 3
    && countLivingUnits([{ type: 'fighter', quantity: 2 }, { type: 'aaGun', quantity: 1 }], { excludeTypes: ['aaGun'] }) === 2
    && countLivingUnits([]) === 0);
  check('friendly combat units exclude factory',
    getFriendlyCombatUnits([
      { type: 'fighter', owner: 'p1', quantity: 1 },
      { type: 'factory', owner: 'p1', quantity: 1 },
    ], 'p1').every((u) => u.type !== 'factory'));
  check('0-attacker leftover is already resolved',
    territoryCombatAlreadyResolved([
      { type: 'infantry', owner: 'p2', quantity: 1 },
      { type: 'aaGun', owner: 'p2', quantity: 1 },
    ], 'p1') === true);
  check('live air vs AA is not resolved',
    territoryCombatAlreadyResolved([
      { type: 'fighter', owner: 'p1', quantity: 2 },
      { type: 'aaGun', owner: 'p2', quantity: 1 },
    ], 'p1') === false);
}

{
  const game = makeGame({
    attackers: [
      { type: 'fighter', owner: 'p1', quantity: 2 },
      { type: 'fighter', owner: 'p1', quantity: 1 },
    ],
    defenders: [{ type: 'aaGun', owner: 'p2', quantity: 1 }, { type: 'infantry', owner: 'p2', quantity: 1 }],
  });
  const ui = makeUI(game);
  ui.showNextCombat();
  const origRandom = Math.random;
  Math.random = () => 0; // every AA die is a 1
  ui._rollAAFire();
  Math.random = origRandom;

  check('AA wipe removes every aircraft stack (same type does not overwrite)',
    ui.combatState.selectedAACasualties.fighter === 3
    && countLivingUnits(ui.combatState.attackers) === 0);
  check('AA wipe stays on aaResults so the dice are readable',
    ui.combatState.phase === AA_RESULT_PHASE
    && ui.combatState.aaResults.hits === 3);
  check('AA wipe syncs dead air onto the board immediately',
    (game.units['Anglo-Sudan Egypt'] || []).every((u) => u.owner !== 'p1'));
  check('AA wipe records persisted telemetry (rolls + forces + wiped)',
    game.combatTelemetry.length === 1
    && game.combatTelemetry[0].kind === 'aa'
    && game.combatTelemetry[0].hits === 3
    && game.combatTelemetry[0].wiped === true
    && game.combatTelemetry[0].rolls.length === 3);

  ui._confirmAAResults();
  check('Continue after AA wipe resolves as defender — no Roll Dice',
    ui.combatState.phase === 'resolved'
    && ui.combatState.winner === 'defender'
    && !/data-action="roll"/.test(ui.el.innerHTML)
    && /End Combat Phase|Next Battle/.test(ui.el.innerHTML));
  check('Continue after AA wipe finalizes so reload cannot reopen the fight',
    ui.combatState._finalized === true
    && game.combatQueue.length === 0
    && game.combatLog.length === 1
    && game.combatLog[0].winner === 'defender');
}

{
  const territory = 'Anglo-Sudan Egypt';
  const game = makeGame({
    territory,
    attackers: [],
    defenders: [{ type: 'infantry', owner: 'p2', quantity: 2 }, { type: 'aaGun', owner: 'p2', quantity: 1 }],
    combatQueue: [territory],
  });
  const ui = makeUI(game);
  const result = ui.showNextCombat();
  check('0-attacker leftover is not shown (no sticky dice rematch)', result.shown === false);
  check('0-attacker queue head is dequeued', game.combatQueue.length === 0);
  check('popup stays hidden after AA-wipe rematch skip', ui.el.classList.contains('hidden'));
}

{
  const game = makeGame({
    attackers: [],
    defenders: [{ type: 'infantry', owner: 'p2', quantity: 1 }],
  });
  game.combatQueue = ['Anglo-Sudan Egypt'];
  const ui = makeUI(game);
  ui.currentTerritory = 'Anglo-Sudan Egypt';
  ui._initCombatState();
  check('init with 0 attackers is resolved, not ready/rolling',
    ui.combatState.phase === 'resolved' && ui.combatState.winner === 'defender');
  ui.combatState.phase = 'ready';
  ui.combatState.attackers = [];
  const rolled = await ui._animateDiceRoll();
  check('Roll with 0 attackers fail-closes instead of sticky rolling',
    ui.combatState.phase === 'resolved'
    && ui.combatState.winner === 'defender'
    && rolled.attackHits === 0);
}

{
  const game = makeGame({
    attackers: [{ type: 'fighter', owner: 'p1', quantity: 1 }],
    defenders: [{ type: 'infantry', owner: 'p2', quantity: 1 }],
  });
  document.documentElement.classList.add('mobile-shell');
  const ui = makeUI(game);
  ui.showNextCombat();
  ui.combatState.phase = 'rolling';
  ui.combatState.attackers = [];
  ui._render();
  check('phone rolling with 0 attackers offers End Battle (not an empty CTA)',
    /data-action="end-empty-attack"/.test(ui.el.innerHTML)
    && /End Battle/.test(ui.el.innerHTML));
  document.documentElement.classList.remove('mobile-shell');
}

console.log('=== V2.81.42 push_exhausted rematch recovery ===');
{
  const { shouldShowPushExhaustedNotice, shouldRematchCombatAfterExhaust, resolveWaitingLockAfterExhaust } =
    await import(new URL('../src/multiplayer/rematchRecovery.js', import.meta.url));
  check('exhaust toast de-dupes inside 4s',
    shouldShowPushExhaustedNotice({ lastShownAt: 10, now: 1000 }) === false
    && shouldShowPushExhaustedNotice({ lastShownAt: 10, now: 5010 }) === true);
  check('waiting lock clears after exhaust', resolveWaitingLockAfterExhaust() === false);
  check('empty combat queue does not rematch',
    shouldRematchCombatAfterExhaust({ turnPhase: 'combat', queueHasEnemy: false }) === false);
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll combat UI checks passed');

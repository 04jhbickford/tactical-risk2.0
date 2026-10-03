// Air-only wipe is a victory, and the land stays with the defender.
// Run: node tools/test-air-only-victory.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
globalThis.document = {
  documentElement,
  body: makeEl(),
  createElement() { return makeEl(); },
  getElementById() { return null; },
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const {
  CombatUI,
  AIR_ONLY_VICTORY_NOTE,
  attackerSurvivorsCaptureTerritory,
  combatVictoryClaimsCapture,
  formatPhoneCombatHeroOdds,
} = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label);
  } else console.log('ok  :', label);
};

const NOTE = 'Victory - but the territory remains under their control.';

function makeGame({
  territory = 'France',
  isWater = false,
  attackers = [{ type: 'fighter', owner: 'p1', quantity: 2 }],
  defenders = [{ type: 'infantry', owner: 'p2', quantity: 1 }],
} = {}) {
  return {
    currentPlayer: { id: 'p1', name: 'Bastion', color: '#c00' },
    combatQueue: [territory],
    turnPhase: 'combat',
    units: { [territory]: [...attackers, ...defenders] },
    territoryState: { [territory]: { owner: 'p2' } },
    capturedThisTurn: new Set(),
    conqueredThisTurn: {},
    territoryByName: { [territory]: { isWater, connections: [] } },
    getUnitsAt(name) { return this.units[name] || []; },
    areAllies() { return false; },
    getPlayer(id) {
      if (id === 'p1') return this.currentPlayer;
      return { id: 'p2', name: 'James', color: '#00c' };
    },
    getOwner(name) { return this.territoryState[name]?.owner || 'p2'; },
    awardRiskCard() { return null; },
    handleCapitalCapture() {},
    logTerritoryCapture() {},
    hasAmphibiousAssault() { return false; },
    markSeaZoneCleared() {},
    logCombat() {},
    _notify() {},
  };
}

function openResolved(game, attackers) {
  const ui = new CombatUI();
  ui.setGameState(game);
  ui.setUnitDefs(unitDefs);
  ui.setActionLog({ log() {}, logCardEarned() {} });
  const opened = ui.showNextCombat();
  ui.combatState.phase = 'resolved';
  ui.combatState.winner = 'attacker';
  ui.combatState.attackers = attackers;
  ui.combatState.defenders = [];
  ui.combatState.totalAttackerLosses = {};
  ui.combatState.totalDefenderLosses = { infantry: 1 };
  ui.combatState.initialAttackers = attackers.map((unit) => ({ ...unit }));
  ui.combatState.initialDefenders = [{ type: 'infantry', quantity: 1 }];
  ui._render();
  return { ui, opened };
}

console.log('=== air-only victory copy ===');
check('note spells control', AIR_ONLY_VICTORY_NOTE === NOTE && !/controll/.test(AIR_ONLY_VICTORY_NOTE));
check('fighters do not capture',
  attackerSurvivorsCaptureTerritory([{ type: 'fighter', quantity: 2 }, { type: 'bomber', quantity: 1 }], unitDefs) === false);
check('a land unit still captures',
  attackerSurvivorsCaptureTerritory([
    { type: 'fighter', quantity: 1 },
    { type: 'infantry', quantity: 1 },
  ], unitDefs) === true);
check('an AA gun left behind does not capture',
  attackerSurvivorsCaptureTerritory([{ type: 'aaGun', quantity: 1 }], unitDefs) === false);
check('a sea zone with ships keeps the capture line',
  combatVictoryClaimsCapture({
    winner: 'attacker',
    attackers: [{ type: 'destroyer', quantity: 1 }],
    unitDefs,
    isWater: true,
  }) === true);
check('aircraft alone do not claim a sea zone',
  combatVictoryClaimsCapture({
    winner: 'attacker',
    attackers: [{ type: 'fighter', quantity: 2 }],
    unitDefs,
    isWater: true,
  }) === false);
check('land air-only does not claim capture',
  combatVictoryClaimsCapture({
    winner: 'attacker',
    attackers: [{ type: 'fighter', quantity: 2 }],
    unitDefs,
    isWater: false,
  }) === false);
check('phone hero does not say taken when the land stays',
  formatPhoneCombatHeroOdds({
    phase: 'resolved',
    winner: 'attacker',
    territoryName: 'France',
    captured: false,
  }).label === 'Not taken · France');
check('phone hero still says taken on a real capture',
  formatPhoneCombatHeroOdds({
    phase: 'resolved',
    winner: 'attacker',
    territoryName: 'France',
  }).label === 'Taken · France');

{
  const air = openResolved(makeGame(), [{ type: 'fighter', owner: 'p1', quantity: 2 }]);
  check('desktop air-only result does not claim the territory',
    air.opened.shown === true
    && air.ui.el.innerHTML.includes(NOTE)
    && !air.ui.el.innerHTML.includes('captures '));
  document.documentElement.classList.add('mobile-shell');
  air.ui._render();
  check('phone resolve step says victory without capture',
    air.ui.el.classList.contains('combat-popup--phone')
    && air.ui.el.innerHTML.includes(NOTE)
    && !air.ui.el.innerHTML.includes('captures '));
  air.ui._phoneCombatStepPin = 'odds';
  air.ui._lastPhoneCombatPhase = 'resolved';
  air.ui._render();
  check('phone odds chip does not say the land was taken',
    air.ui.el.innerHTML.includes('Not taken · France')
    && !air.ui.el.innerHTML.includes('Taken ·'));
  document.documentElement.classList.remove('mobile-shell');
  air.ui._finalizeCombat();
  check('air-only wipe leaves the owner', air.ui.gameState.getOwner('France') === 'p2');
}

{
  document.documentElement.classList.remove('mobile-shell');
  const held = openResolved(
    makeGame({ attackers: [{ type: 'infantry', owner: 'p1', quantity: 2 }] }),
    [{ type: 'infantry', owner: 'p1', quantity: 2 }],
  );
  check('land leftover still says the territory was taken',
    held.ui.el.innerHTML.includes('Bastion')
    && held.ui.el.innerHTML.includes('captures France!')
    && !held.ui.el.innerHTML.includes(NOTE));
  document.documentElement.classList.add('mobile-shell');
  held.ui._render();
  check('phone resolve step still says the territory was taken',
    held.ui.el.innerHTML.includes('captures France!')
    && !held.ui.el.innerHTML.includes(NOTE));
  held.ui._phoneCombatStepPin = 'odds';
  held.ui._lastPhoneCombatPhase = 'resolved';
  held.ui._render();
  check('phone odds chip still says taken on a real capture',
    held.ui.el.innerHTML.includes('Taken · France')
    && !held.ui.el.innerHTML.includes('Not taken'));
  document.documentElement.classList.remove('mobile-shell');
  held.ui._finalizeCombat();
  check('infantry still takes the territory', held.ui.gameState.getOwner('France') === 'p1');
}

{
  document.documentElement.classList.remove('mobile-shell');
  const sea = openResolved(
    makeGame({
      territory: 'Baltic Sea',
      isWater: true,
      attackers: [{ type: 'destroyer', owner: 'p1', quantity: 1 }],
      defenders: [{ type: 'destroyer', owner: 'p2', quantity: 1 }],
    }),
    [{ type: 'destroyer', owner: 'p1', quantity: 1 }],
  );
  check('sea win keeps the capture line',
    sea.ui.el.innerHTML.includes('captures Baltic Sea!')
    && !sea.ui.el.innerHTML.includes(NOTE));
  const airSea = openResolved(
    makeGame({
      territory: 'Baltic Sea',
      isWater: true,
      attackers: [{ type: 'fighter', owner: 'p1', quantity: 2 }],
      defenders: [{ type: 'destroyer', owner: 'p2', quantity: 1 }],
    }),
    [{ type: 'fighter', owner: 'p1', quantity: 2 }],
  );
  check('air-only sea win does not claim the zone',
    airSea.ui.el.innerHTML.includes(NOTE)
    && !airSea.ui.el.innerHTML.includes('captures '));
  sea.ui._finalizeCombat();
  check('a sea zone is not a land capture', sea.ui.gameState.getOwner('Baltic Sea') === 'p2');
}

{
  const held = makeGame();
  const ui = new CombatUI();
  ui.setGameState(held);
  ui.setUnitDefs(unitDefs);
  ui.setActionLog({ log() {}, logCardEarned() {} });
  ui.showNextCombat();
  ui.combatState.phase = 'resolved';
  ui.combatState.winner = 'defender';
  ui.combatState.attackers = [];
  ui.combatState.defenders = [{ type: 'infantry', owner: 'p2', quantity: 1 }];
  ui.combatState.totalAttackerLosses = {};
  ui.combatState.totalDefenderLosses = {};
  ui.combatState.initialAttackers = [{ type: 'fighter', quantity: 1 }];
  ui.combatState.initialDefenders = [{ type: 'infantry', quantity: 1 }];
  ui._render();
  check('defender hold copy is unchanged',
    ui.el.innerHTML.includes('holds France!')
    && !ui.el.innerHTML.includes(NOTE)
    && !ui.el.innerHTML.includes('captures '));
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nair-only victory copy ok');

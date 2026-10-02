// V2.81.57-unified.33 — strategic bombing raids.
// AA, damage cap, placement limit, repair, the bomber-only prompt,
// save round-trip, and the online snapshot of factory damage.
// Run: node tools/test-strategic-bombing.mjs

import { gameVersionFromSource } from './game-version.mjs';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION, compatClientVersion } = await import('../src/version.js');
const { GameState, GAME_PHASES, TURN_PHASES } = await import('../src/state/gameState.js');
const {
  RAID_PROMPT,
  aiRepairChoice,
  applyFactoryDamage,
  bomberDicePerSurvivor,
  countAaHits,
  clampRepairPoints,
  factoryPlacementLabel,
  maxFactoryDamage,
  raidPromptApplies,
  renderFactoryRepairHtml,
  repairCost,
  stepRepairPoints,
  sumDice,
  undamagedPlacement,
} = await import('../src/state/strategicBombing.js');
const { destroyIllegalAir, listIllegalAir } = await import('../src/state/ncmAirCheck.js');
const {
  factoryDamageLabelOrigin,
  factoryDamageFontWorld,
} = await import('../src/map/unitRenderer.js');
const { bindGameEventLog, unbindGameEventLog } = await import('../src/multiplayer/gameEventLog.js');
const { applyTerritoryCapture } = await import('../src/state/combatFinalize.js');

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { cost: 3, attack: 1, defense: 2, movement: 1, isLand: true },
  fighter: { cost: 10, attack: 3, defense: 4, movement: 4, isAir: true },
  tacticalBomber: { cost: 11, attack: 3, defense: 3, movement: 4, isAir: true },
  bomber: { cost: 12, attack: 4, defense: 1, movement: 6, isAir: true },
  factory: { cost: 15, isBuilding: true, movement: 0 },
};

console.log('=== stamp ===');
check('display stamp is unified.21', GAME_VERSION === gameVersionFromSource());
check('compat stamp is V2.82-unified.33', compatClientVersion() === compatClientVersion(gameVersionFromSource()));
check('schema stays 11', SCHEMA_VERSION === 11);

console.log('=== pure dice and cap ===');
check('AA hits only on a 1', countAaHits([1, 6, 1, 2, 1]) === 3);
check('AA miss is not a hit', countAaHits([2, 3, 4, 5, 6]) === 0);
check('damage sum', sumDice([4, 5, 6]) === 15);
check('heavy bombers roll 2, others roll 1', bomberDicePerSurvivor(true) === 2 && bomberDicePerSurvivor(false) === 1);
check('cap is twice output', maxFactoryDamage(20) === 40 && maxFactoryDamage(5) === 10);
{
  const capped = applyFactoryDamage(35, 10, 40);
  check('cap keeps 5 and drops the excess', capped.applied === 5 && capped.excess === 5 && capped.next === 40);
  const open = applyFactoryDamage(0, 9, 40);
  check('uncapped sum is applied', open.applied === 9 && open.excess === 0 && open.next === 9);
}
check('placement 20 minus 17 is 3', undamagedPlacement(20, 17) === 3);
check('placement cannot go below 0', undamagedPlacement(5, 17) === 0);
check('repair is 1 IPC per point', repairCost(4) === 4 && repairCost(0) === 0);
check('mobilize label names the damaged limit', factoryPlacementLabel({ placed: 0, limit: 3, damage: 17 }) === '0/3 can place · 17 damage');
check('undamaged label stays the old units line', factoryPlacementLabel({ placed: 1, limit: 20, damage: 0 }) === '1/20 units');

console.log('=== prompt only for strategic bombers against a factory ===');
{
  const gs = makeState();
  const human = gs.players[0];
  const ai = gs.players[1];
  const base = { gameState: gs, isCombatMove: true, territory: 'Germany' };
  check('prompt copy', RAID_PROMPT === 'Normal attack or strategic bombing raid?');
  check('strategic bomber vs factory asks', raidPromptApplies({
    ...base, player: human, units: [{ type: 'bomber', quantity: 2 }],
  }));
  check('tactical bomber does not ask', !raidPromptApplies({
    ...base, player: human, units: [{ type: 'tacticalBomber', quantity: 1 }],
  }));
  check('fighter does not ask', !raidPromptApplies({
    ...base, player: human, units: [{ type: 'fighter', quantity: 1 }],
  }));
  check('bomber without a factory does not ask', !raidPromptApplies({
    ...base, player: human, territory: 'France', units: [{ type: 'bomber', quantity: 1 }],
  }));
  check('AI does not ask', !raidPromptApplies({
    ...base, player: ai, units: [{ type: 'bomber', quantity: 1 }],
  }));
  check('a choice already made does not ask again', !raidPromptApplies({
    ...base, player: human, units: [{ type: 'bomber', quantity: 1 }], raidChoice: false,
  }));
  const asked = gs.moveUnits('Britain', 'Germany', [{ type: 'bomber', quantity: 1 }], unitDefs, {});
  check('human move returns the prompt instead of moving', asked.needsRaidChoice === true && asked.success === false);
  check('the bomber is still in Britain', (gs.units.Britain || []).some((u) => u.type === 'bomber' && u.owner === 'usa' && u.quantity === 3)
    && !(gs.units.Germany || []).some((u) => u.type === 'bomber' && u.owner === 'usa'));
  gs.currentPlayerIndex = 1;
  const aiMove = gs.moveUnits('Berlin', 'Germany', [{ type: 'bomber', quantity: 1 }], unitDefs, {});
  check('AI does not get the prompt', aiMove.needsRaidChoice !== true);
  gs.currentPlayerIndex = 0;
}

console.log('=== factory-only territory ===');
{
  const gs = makeState();
  gs.units.France = [{ type: 'factory', quantity: 1, owner: 'germans' }];
  const asked = gs.moveUnits('Britain', 'France', [{ type: 'bomber', quantity: 1 }], unitDefs, {});
  check('factory-only still asks', asked.needsRaidChoice === true && asked.success === false);
  const normal = gs.moveUnits('Britain', 'France', [{ type: 'bomber', quantity: 1 }], unitDefs, { raid: false });
  check('normal attack cannot occupy an empty factory', normal.success === false);
  const fighter = gs.moveUnits('Britain', 'France', [{ type: 'fighter', quantity: 1 }], unitDefs, {});
  check('a fighter cannot raid an empty factory', fighter.success === false && fighter.needsRaidChoice !== true);
  const raid = gs.moveUnits('Britain', 'France', [{ type: 'bomber', quantity: 1 }], unitDefs, { raid: true });
  check('a raid can enter a factory-only territory', raid.success === true);
}

console.log('=== raid resolution ===');
{
  const gs = makeState();
  const moved = gs.moveUnits('Britain', 'Germany', [{ type: 'bomber', quantity: 3 }, { type: 'infantry', quantity: 1 }], unitDefs, { raid: true });
  check('raid move lands', moved.success === true);
  const bombers = (gs.units.Germany || []).filter((u) => u.type === 'bomber' && u.owner === 'usa');
  check('raid bombers are their own stack', bombers.length === 1 && bombers[0].raid === true && bombers[0].quantity === 3);
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs._detectCombats(unitDefs);
  check('raid and normal combat are both queued', gs.raidQueue.includes('Germany') && gs.combatQueue.includes('Germany'));
  // AA: 1, 3, 6 → one bomber lost. Survivors roll 4 and 6. No heavy bombers.
  const raidEvents = [];
  bindGameEventLog({ log(kind, fields) { raidEvents.push({ kind, fields }); } });
  const raid = gs.resolveStrategicRaid('Germany', unitDefs, { rolls: [1, 3, 6, 4, 6] });
  unbindGameEventLog();
  check('one AA hit', raid.hits === 1 && raid.aaRolls.join(',') === '1,3,6');
  check('two survivors sum to 10', raid.survivors === 2 && raid.applied === 10 && raid.next === 10);
  const raidPayload = raidEvents.find((row) => row.kind === 'combat')?.fields?.payload;
  check('raid ledger names the target, owner, damage, and victim IPCs',
    raidPayload?.territory === 'Germany'
    && raidPayload.attackerOwner === 'usa'
    && raidPayload.damageDealt === 10
    && raidPayload.victimIpcsBefore === 20
    && raidPayload.victimIpcsAfter === 20);
  const raidEvent = gs.turnEvents[gs.turnEvents.length - 1];
  check('the saved combat event keeps those raid fields',
    raidEvent?.attackerOwner === 'usa'
    && raidEvent.damageDealt === 10
    && raidEvent.victimIpcsBefore === 20
    && raidEvent.victimIpcsAfter === 20);
  check('raid bombers no longer join the normal battle', !(gs.units.Germany || []).some((u) => u.raid === true));
  check('survivors are marked raided', (gs.units.Germany || []).some((u) => u.type === 'bomber' && u.raided === true && u.quantity === 2));
  const before = (gs.units.Germany || []).filter((u) => u.type === 'bomber').reduce((n, u) => n + u.quantity, 0);
  gs.resolveCombat('Germany', unitDefs);
  const after = (gs.units.Germany || []).filter((u) => u.type === 'bomber' && u.owner === 'usa').reduce((n, u) => n + (u.quantity || 0), 0);
  check('normal combat does not consume the raiders', after === before && after === 2);
}

console.log('=== air versus air beside a raid ===');
{
  const gs = makeState();
  gs.units.Britain.push({ type: 'fighter', quantity: 1, owner: 'usa' });
  gs.units.Germany.push({ type: 'fighter', quantity: 1, owner: 'germans' });
  const moved = gs.moveUnits('Britain', 'Germany', [
    { type: 'bomber', quantity: 1 },
    { type: 'fighter', quantity: 1 },
  ], unitDefs, { raid: true });
  check('bomber raids and the fighter still attacks', moved.success === true
    && (gs.units.Germany || []).some((u) => u.type === 'bomber' && u.raid === true)
    && (gs.units.Germany || []).some((u) => u.type === 'fighter' && u.owner === 'usa' && u.raid !== true));
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.units.Germany = (gs.units.Germany || []).filter((u) => u.type !== 'infantry');
  gs.resolveStrategicRaid('Germany', unitDefs, { rolls: [6, 1] });
  gs._rollDie = () => 1;
  const battle = gs.resolveCombat('Germany', unitDefs);
  const round = (gs.combatTelemetry || []).find((row) => row.step === 'round' && row.territory === 'Germany');
  check('telemetry records the fighters before the roll',
    battle?.attackRolls?.length === 1
    && round?.attackForce?.some((u) => u.type === 'fighter' && u.quantity === 1)
    && round?.defenseForce?.some((u) => u.type === 'fighter' && u.quantity === 1));
  const left = (type, owner) => (gs.units.Germany || [])
    .filter((u) => u.type === type && u.owner === owner)
    .reduce((n, u) => n + (u.quantity || 0), 0);
  check('fighters still hit each other in the normal battle', left('fighter', 'usa') === 0 && left('fighter', 'germans') === 0);
  check('the raid does not remove the bomber', left('bomber', 'usa') === 1);
  gs.nextTurn();
  check('raided clears when that turn ends', !(gs.units.Germany || []).some((u) => u.raided));
}

console.log('=== combat screen keeps the raider ===');
{
  if (!globalThis.document) {
    const mk = () => ({
      id: '',
      className: '',
      innerHTML: '',
      style: {},
      children: [],
      classList: {
        add() {},
        remove() {},
        contains() { return false; },
        toggle() { return false; },
      },
      appendChild(child) { this.children.push(child); return child; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
      setAttribute() {},
      getAttribute() { return null; },
    });
    globalThis.document = {
      documentElement: mk(),
      body: mk(),
      createElement() { return mk(); },
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
    };
    globalThis.window ??= globalThis;
  }
  const { CombatUI } = await import('../src/ui/combatUI.js');
  const gs = makeState();
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.units.Germany = [
    { type: 'factory', quantity: 1, owner: 'germans' },
    { type: 'infantry', quantity: 1, owner: 'germans' },
    { type: 'bomber', quantity: 1, owner: 'usa', raided: true },
    { type: 'fighter', quantity: 1, owner: 'usa' },
  ];
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.currentTerritory = 'Germany';
  ui.combatState = {
    attackers: [{ type: 'fighter', quantity: 0, owner: 'usa' }],
    defenders: [{ type: 'infantry', quantity: 0, owner: 'germans' }],
    winner: 'defender',
    totalAttackerLosses: { fighter: 1 },
    totalDefenderLosses: {},
  };
  ui._syncCombatStateToGame();
  check('a mid-battle sync puts the raider back',
    (gs.units.Germany || []).some((u) => u.type === 'bomber' && u.raided === true && u.quantity === 1));
  gs.units.Germany = [
    { type: 'factory', quantity: 1, owner: 'germans' },
    { type: 'bomber', quantity: 1, owner: 'usa', raided: true },
  ];
  ui._finalizeCombat();
  check('finalizing the normal battle keeps the raider',
    (gs.units.Germany || []).some((u) => u.type === 'bomber' && u.owner === 'usa' && u.raided === true && u.quantity === 1));
}

console.log('=== heavy bombers and the cap ===');
{
  const gs = makeState();
  gs.playerTechs.usa = { unlockedTechs: ['heavyBombers'] };
  gs.factoryDamage.Germany = 36;
  gs.units.Germany.push({ type: 'bomber', quantity: 1, owner: 'usa', moved: true, raid: true });
  gs.raidQueue = ['Germany'];
  gs.turnPhase = TURN_PHASES.COMBAT;
  // AA miss (2), then two damage dice 6 and 6 = 12. Cap 40, room 4.
  const raid = gs.resolveStrategicRaid('Germany', unitDefs, { rolls: [2, 6, 6] });
  check('heavy bombers roll two damage dice', raid.damageRolls.length === 2 && raid.damageRolls.join(',') === '6,6');
  check('excess over twice output is dropped', raid.applied === 4 && raid.excess === 8 && raid.next === 40);
  check('placeable at the cap is 0 for a capital', gs.getFactoryPlacementLimit('Germany', 'germans') === 0);
}

console.log('=== placement limit ===');
{
  const gs = makeState();
  gs.factoryDamage.Germany = 17;
  gs.currentPlayerIndex = 1;
  gs.turnPhase = TURN_PHASES.MOBILIZE;
  gs.factoriesAtTurnStart = new Set(['Germany']);
  gs.pendingPurchases = [{ type: 'infantry', quantity: 5, owner: 'germans', cost: 3 }];
  let placed = 0;
  let blocked = false;
  for (let i = 0; i < 5; i += 1) {
    const result = gs.mobilizeUnit('infantry', 'Germany', unitDefs);
    if (result.success) placed += 1;
    else blocked = true;
  }
  check('a capital with 17 damage places 3', placed === 3 && blocked);
  check('the limit is output minus damage', gs.getFactoryPlacementLimit('Germany', 'germans') === 3);
}

console.log('=== repair ===');
{
  const gs = makeState();
  gs.turnPhase = TURN_PHASES.PURCHASE;
  gs.factoryDamage.Germany = 4;
  gs.playerState.germans.ipcs = 10;
  gs.currentPlayerIndex = 0;
  const denied = gs.repairFactoryDamage('Germany', 4);
  check('a non-owner cannot repair', denied.success === false);
  gs.currentPlayerIndex = 1;
  const repairEvents = [];
  bindGameEventLog({ log(kind, fields) { repairEvents.push({ kind, fields }); } });
  const paid = gs.repairFactoryDamage('Germany', 4);
  unbindGameEventLog();
  check('owner pays 1 IPC per point', paid.success === true && paid.cost === 4 && paid.repaired === 4);
  const repairPayload = repairEvents.find((row) => row.kind === 'purchase')?.fields?.payload;
  check('repair ledger names the spend and both IPC balances',
    repairPayload?.territory === 'Germany'
    && repairPayload.repairSpend === 4
    && repairPayload.ipcsBefore === 10
    && repairPayload.ipcsAfter === 6);
  check('damage is cleared and IPCs dropped', gs.getFactoryDamage('Germany') === 0 && gs.getIPCs('germans') === 6);
  gs.factoryDamage.Britain = 20;
  gs.playerState.usa.ipcs = 30;
  gs.currentPlayerIndex = 0;
  const skipped = aiRepairChoice([
    { name: 'Britain', output: 20, damage: 0, placeable: 20 },
  ], 30);
  check('AI skips repair when it can still place', skipped == null);
  const reopen = aiRepairChoice([
    { name: 'Britain', output: 20, damage: 20, placeable: 0 },
  ], 30);
  check('AI repairs one slot when it would place nothing', reopen && reopen.territory === 'Britain' && reopen.points === 1 && reopen.cost === 1);
  gs.factoryDamage.Britain = 20;
  const did = gs.repairIfNothingCanBePlaced('usa');
  check('AI repair spends that one IPC', did.success === true && did.repaired === 1 && gs.getFactoryDamage('Britain') === 19);
}

console.log('=== save, old save, capture, online snapshot ===');
{
  const gs = makeState();
  gs.factoryDamage = { Germany: 17, France: 0 };
  const json = gs.toJSON();
  check('schema version stays 11', json.version === 11);
  check('damage is on the snapshot', json.factoryDamage.Germany === 17 && json.factoryDamage.France == null);
  const snapshot = JSON.parse(JSON.stringify(json));
  const loaded = makeState();
  loaded.loadFromJSON(snapshot);
  check('online snapshot restores damage', loaded.getFactoryDamage('Germany') === 17);
  const old = { ...snapshot };
  delete old.factoryDamage;
  loaded.loadFromJSON(old);
  check('an old save loads with 0 damage', loaded.getFactoryDamage('Germany') === 0);
  loaded.factoryDamage = { Germany: 17 };
  loaded.territoryState.Germany.owner = 'usa';
  loaded.units.Germany = loaded.units.Germany.map((unit) => (
    unit.type === 'factory' ? { ...unit, owner: 'usa' } : unit
  ));
  check('captured factory keeps its damage', loaded.getFactoryDamage('Germany') === 17);
  check('the new owner places from their own output minus that damage', loaded.getFactoryPlacementLimit('Germany', 'usa') === 0);
  const round = loaded.toJSON();
  const peer = makeState();
  peer.loadFromJSON(JSON.parse(JSON.stringify(round)));
  check('a peer snapshot still has the captured damage', peer.getFactoryDamage('Germany') === 17);
}

console.log('=== raiders must land in non-combat ===');
{
  const gs = makeState();
  gs.moveUnits('Britain', 'Germany', [{ type: 'bomber', quantity: 1 }], unitDefs, { raid: true });
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs._detectCombats(unitDefs);
  gs.resolveStrategicRaid('Germany', unitDefs, { rolls: [6, 3] });
  gs.combatQueue = [];
  gs.nextPhase();
  check('non-combat releases the raider so it can fly home', gs.turnPhase === TURN_PHASES.NON_COMBAT_MOVE);
  const bomber = (gs.units.Germany || []).find((u) => u.type === 'bomber' && u.owner === 'usa');
  check('the raider is still over the factory and can move', !!bomber && bomber.moved !== true && bomber.raided === true);
  const illegal = listIllegalAir(gs, unitDefs, 'usa');
  check('the end-of-NCM check still sees it', illegal.some((row) => row.territory === 'Germany' && row.type === 'bomber'));
}

console.log('=== raider returns with movement left ===');
{
  const gs = raidAlongChain('Home');
  check('the raid flight spent 4 of 6', gs.airUnitOrigins.Factory?.bomber?.distance === 4);
  check('a fresh move would still reach the landing 3 away', gs.canAirUnitReach('Factory', 'Far', 6));
  const tooFar = gs.moveUnits('Factory', 'Far', [{ type: 'bomber', quantity: 1 }], unitDefs);
  check('2 movement left cannot reach a landing 3 away', tooFar.success === false);
  const stuck = (gs.units.Factory || []).find((u) => u.type === 'bomber' && u.owner === 'usa');
  check('the short bomber is still over the factory', !!stuck && stuck.quantity === 1 && stuck.raided === true);
  const illegal = listIllegalAir(gs, unitDefs, 'usa');
  check('the end-of-NCM check still sees the bomber that cannot land', illegal.some((row) => row.territory === 'Factory' && row.type === 'bomber'));
  const removed = destroyIllegalAir(gs, unitDefs, 'usa');
  check('that check destroys the bomber with no legal landing', removed.some((row) => row.territory === 'Factory' && row.type === 'bomber' && row.quantity === 1));
  check('the destroyed bomber is gone', !(gs.units.Factory || []).some((u) => u.type === 'bomber' && u.owner === 'usa'));

  const home = raidAlongChain('Home');
  const near = home.moveUnits('Factory', 'Near', [{ type: 'bomber', quantity: 1 }], unitDefs);
  check('the same 2 movement can reach a landing 2 away', near.success === true);
  check('that landing is no longer an illegal air unit', !listIllegalAir(home, unitDefs, 'usa').some((row) => row.type === 'bomber'));

  const longer = raidAlongChain('S2');
  check('the shorter raid spent 2', longer.airUnitOrigins.Factory?.bomber?.distance === 2);
  const far = longer.moveUnits('Factory', 'Far', [{ type: 'bomber', quantity: 1 }], unitDefs);
  check('a bomber with enough remaining movement can land 3 away', far.success === true);
  const landed = (longer.units.Far || []).find((u) => u.type === 'bomber' && u.owner === 'usa');
  check('that bomber is on the landing', !!landed && landed.quantity === 1);
  check('a legal landing is not destroyed', !listIllegalAir(longer, unitDefs, 'usa').some((row) => row.type === 'bomber'));

  const ai = raidAlongChain('Home');
  ai.players[0].isAI = true;
  const aiFar = ai.moveUnits('Factory', 'Far', [{ type: 'bomber', quantity: 1 }], unitDefs);
  check('the AI cannot give the raider a fresh full move', aiFar.success === false);
  const aiNear = ai.moveUnits('Factory', 'Near', [{ type: 'bomber', quantity: 1 }], unitDefs);
  check('the AI can land the raider inside the movement left', aiNear.success === true);
}

console.log('=== rules panel ===');
{
  const rules = readFileSync(join(root, 'src/ui/rulesPanel.js'), 'utf8');
  check('the not-yet wording is gone', !rules.includes('raids are not yet available') && !rules.includes('Strategic bombing raids are not yet available'));
  check('rules panel has the raid entry', rules.includes('<strong>Strategic bombing:</strong>'));
}

console.log('=== damage number sits on the factory icon ===');
{
  const iconX = 100;
  const iconY = 200;
  const iconSize = 20;
  const origin = factoryDamageLabelOrigin(iconX, iconY, iconSize);
  const bg = iconSize + 4;
  const left = iconX - bg / 2;
  const top = iconY - bg / 2;
  const right = iconX + bg / 2;
  const bottom = iconY + bg / 2;
  check('digits start inside the factory icon',
    origin.x > left && origin.x < iconX && origin.y > top && origin.y < iconY);
  check('digits are in the upper left, not beside the icon',
    origin.x < iconX && origin.y < iconY && origin.x < right && origin.y < bottom);
  const font = factoryDamageFontWorld(iconSize, 1);
  check('digits fit the icon at normal zoom', font > 0 && font <= bg * 0.4);
  const src = readFileSync(join(root, 'src/map/unitRenderer.js'), 'utf8');
  check('the separate damage square is gone',
    !src.includes('_drawFactoryDamageBadge')
    && !src.includes('cx + iconSize')
    && src.includes('_drawFactoryDamageOnIcon'));
}

console.log('=== repair stepper and captured factory damage ===');
{
  const html = renderFactoryRepairHtml(
    [{ name: 'Germany', output: 10, damage: 40, placeable: 0 }],
    { ipcs: 40 },
  );
  check('repair offers up and down plus repair all',
    html.includes('data-action="repair-step"')
    && html.includes('Repair all')
    && html.includes('data-points="40"')
    && html.includes('data-repair-all="1"'));
  check('the stepper moves one point at a time', stepRepairPoints(1, 1, 40, 40) === 2);
  check('repair points cannot pass the IPCs on hand', clampRepairPoints(40, 40, 12) === 12);
  const gs = makeState();
  gs.factoryDamage.Germany = 9;
  gs.units.Germany = [
    { type: 'factory', quantity: 1, owner: 'germans' },
    { type: 'infantry', quantity: 1, owner: 'usa' },
  ];
  const captured = applyTerritoryCapture(gs, 'Germany', { playerId: 'usa', unitDefs });
  check('capture gives the factory to the attacker',
    captured.captured === true
    && gs.getOwner('Germany') === 'usa'
    && gs.units.Germany.find((unit) => unit.type === 'factory')?.owner === 'usa');
  check('a captured factory keeps its damage', gs.getFactoryDamage('Germany') === 9);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll strategic bombing checks passed');

// Home–S1–S2–S3–Factory is 4. Factory–N1–Near is 2. Factory–F1–F2–Far is 3.
function raidAlongChain(start) {
  const link = (name, connections) => ({ name, isWater: false, production: 1, connections });
  const territories = [
    link('Home', ['S1']),
    link('S1', ['Home', 'S2']),
    link('S2', ['S1', 'S3']),
    link('S3', ['S2', 'Factory']),
    link('Factory', ['S3', 'N1', 'F1']),
    link('N1', ['Factory', 'Near']),
    link('Near', ['N1']),
    link('F1', ['Factory', 'F2']),
    link('F2', ['F1', 'Far']),
    link('Far', ['F2']),
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'usa', name: 'USA', isAI: false },
    { id: 'germans', name: 'Germany', isAI: true },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.territoryState = {
    Home: { owner: 'usa', isCapital: true },
    Near: { owner: 'usa', isCapital: false },
    Far: { owner: 'usa', isCapital: false },
    Factory: { owner: 'germans', isCapital: true },
  };
  gs.playerState = {
    usa: { ipcs: 30, capitalTerritory: 'Home', hasPlacedCapital: true },
    germans: { ipcs: 20, capitalTerritory: 'Factory', hasPlacedCapital: true },
  };
  gs.playerTechs = { usa: { unlockedTechs: [] }, germans: { unlockedTechs: [] } };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Home', 'Near', 'Far']);
  gs.factoriesAtTurnStart = new Set(['Home', 'Factory']);
  gs.units = {
    Factory: [{ type: 'factory', quantity: 1, owner: 'germans' }],
  };
  gs.units[start] = [{ type: 'bomber', quantity: 1, owner: 'usa' }];
  gs.factoryDamage = {};
  gs.raidQueue = [];
  const raid = gs.moveUnits(start, 'Factory', [{ type: 'bomber', quantity: 1 }], unitDefs, { raid: true });
  if (!raid.success) throw new Error(`chain raid from ${start} failed: ${raid.error || 'unknown'}`);
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs._detectCombats(unitDefs);
  gs.resolveStrategicRaid('Factory', unitDefs, { rolls: [6, 3] });
  gs.combatQueue = [];
  gs.nextPhase();
  if (gs.turnPhase !== TURN_PHASES.NON_COMBAT_MOVE) {
    throw new Error(`expected non-combat after the raid, got ${gs.turnPhase}`);
  }
  return gs;
}

function makeState() {
  const territories = [
    { name: 'Britain', isWater: false, production: 2, connections: ['Germany', 'France'] },
    { name: 'Germany', isWater: false, production: 1, connections: ['Britain', 'France', 'Berlin'] },
    { name: 'France', isWater: false, production: 2, connections: ['Britain', 'Germany'] },
    { name: 'Berlin', isWater: false, production: 1, connections: ['Germany'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'usa', name: 'USA', isAI: false },
    { id: 'germans', name: 'Germany', isAI: true },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.territoryState = {
    Britain: { owner: 'usa', isCapital: true },
    Germany: { owner: 'germans', isCapital: true },
    France: { owner: 'germans', isCapital: false },
    Berlin: { owner: 'germans', isCapital: false },
  };
  gs.playerState = {
    usa: { ipcs: 30, capitalTerritory: 'Britain', hasPlacedCapital: true },
    germans: { ipcs: 20, capitalTerritory: 'Germany', hasPlacedCapital: true },
  };
  gs.playerTechs = { usa: { unlockedTechs: [] }, germans: { unlockedTechs: [] } };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Britain']);
  gs.factoriesAtTurnStart = new Set(['Britain', 'Germany']);
  gs.units = {
    Britain: [
      { type: 'bomber', quantity: 3, owner: 'usa' },
      { type: 'infantry', quantity: 2, owner: 'usa' },
      { type: 'factory', quantity: 1, owner: 'usa' },
    ],
    Germany: [
      { type: 'factory', quantity: 1, owner: 'germans' },
      { type: 'infantry', quantity: 1, owner: 'germans' },
    ],
    France: [
      { type: 'infantry', quantity: 1, owner: 'germans' },
    ],
    Berlin: [
      { type: 'bomber', quantity: 1, owner: 'germans' },
    ],
  };
  gs.factoryDamage = {};
  gs.raidQueue = [];
  return gs;
}

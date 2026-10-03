// Expanded tech. Off unless the host picks Expanded tech.
// Radio Deception Networks stores one optional object on the save.
// Old saves omit it. Schema stays 11. Illusions are not written into
// `units`, so they cannot move, attack, or defend. Obfuscated units stay
// real and still fight.
// Wasserfall is the other expanded research id. It is not a save field.
// An unlocked id on the player is enough. Classic research omits both.

export const RADIO_DECEPTION = 'radioDeception';
export const WASSERFALL = 'wasserfall';
export const AA_GUN_DEFEND = 1;
export const WASSERFALL_DEFEND = 2;
export const TECH_SET_CLASSIC = 'classic';
export const TECH_SET_EXPANDED = 'expanded';
export const TECH_SET_VALUES = Object.freeze([TECH_SET_CLASSIC, TECH_SET_EXPANDED]);
export const DECEPTION_OBFUSCATE = 'obfuscate';
export const DECEPTION_ILLUSION = 'illusion';
export const DECEPTION_UNIT_CAP = 2;

export const RADIO_DECEPTION_TECH = Object.freeze({
  name: 'Radio Deception Networks',
  description: 'On one territory you control, hide up to two real units from enemies, or show up to two illusory land units. One placement. You and allies see it in grey.',
});

export const WASSERFALL_TECH = Object.freeze({
  name: 'Wasserfall',
  description: 'AA guns become guided missile batteries and defend at 2.',
});

const EXPANDED_TECH = Object.freeze({
  [RADIO_DECEPTION]: RADIO_DECEPTION_TECH,
  [WASSERFALL]: WASSERFALL_TECH,
});

// Land units a player may fake. Buildings and the optional garrison are not.
export const ILLUSION_LAND_TYPES = Object.freeze([
  'infantry',
  'mechanizedInfantry',
  'armour',
  'artillery',
  'aaGun',
]);

export function expandedTechEnabled(gameOptions) {
  return gameOptions?.techSet === TECH_SET_EXPANDED;
}

export function techSetLabel(value) {
  return value === TECH_SET_EXPANDED ? 'Expanded tech' : 'Classic tech';
}

export function researchableTechIds(classicIds, gameOptions) {
  const extra = Object.keys(EXPANDED_TECH);
  const ids = (classicIds || []).filter((id) => id && !extra.includes(id));
  if (expandedTechEnabled(gameOptions)) {
    for (const id of extra) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

export function resolveTechInfo(techId, classicTable, gameOptions) {
  if (classicTable && classicTable[techId]) return classicTable[techId];
  if (expandedTechEnabled(gameOptions) && EXPANDED_TECH[techId]) return EXPANDED_TECH[techId];
  return null;
}

// AA guns hit on 1. Wasserfall, researched under Expanded tech, hits on 2.
// Classic, and Expanded without the tech, stay at 1. Attack is untouched.
export function aaGunDefendValue(state, ownerId) {
  if (!ownerId || !expandedTechEnabled(state?.gameOptions)) return AA_GUN_DEFEND;
  const unlocked = state?.playerTechs?.[ownerId]?.unlockedTechs || [];
  return unlocked.includes(WASSERFALL) ? WASSERFALL_DEFEND : AA_GUN_DEFEND;
}

// One volley for every defending AA gun. The best battery sets the number.
export function defendingAaNeed(state, defenders) {
  let need = AA_GUN_DEFEND;
  for (const unit of defenders || []) {
    if (unit?.type !== 'aaGun' || (Number(unit.quantity) || 0) <= 0) continue;
    const value = aaGunDefendValue(state, unit.owner);
    if (value > need) need = value;
  }
  return need;
}

function territoryOwner(state, name) {
  if (!name) return null;
  if (typeof state?.getOwner === 'function') return state.getOwner(name) || null;
  return state?.territoryState?.[name]?.owner || null;
}

function hasRadioTech(state, playerId) {
  const unlocked = state?.playerTechs?.[playerId]?.unlockedTechs || [];
  return unlocked.includes(RADIO_DECEPTION);
}

export function deceptionViewerId(state) {
  if (state?.localSeatId) return state.localSeatId;
  if (state?.isMultiplayer) return null;
  return state?.currentPlayer?.id || null;
}

export function viewerIsFriendly(state, viewerId, ownerId) {
  if (!viewerId || !ownerId) return false;
  if (viewerId === ownerId) return true;
  if (typeof state?.areAllies === 'function') return !!state.areAllies(viewerId, ownerId);
  return false;
}

function cleanPicks(units, mode) {
  const list = Array.isArray(units) ? units : [];
  const out = [];
  let total = 0;
  for (const row of list) {
    const type = String(row?.type || '');
    if (!type) continue;
    if (mode === DECEPTION_ILLUSION && !ILLUSION_LAND_TYPES.includes(type)) continue;
    let qty = Math.floor(Number(row.quantity) || 0);
    if (qty <= 0) continue;
    if (total >= DECEPTION_UNIT_CAP) break;
    if (total + qty > DECEPTION_UNIT_CAP) qty = DECEPTION_UNIT_CAP - total;
    total += qty;
    const pick = { type, quantity: qty };
    if (row.owner) pick.owner = String(row.owner);
    out.push(pick);
  }
  return out;
}

export function normalizeRadioBook(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [playerId, row] of Object.entries(raw)) {
    if (!playerId || !row || typeof row !== 'object') continue;
    const territory = typeof row.territory === 'string' ? row.territory : '';
    const mode = row.mode === DECEPTION_ILLUSION
      ? DECEPTION_ILLUSION
      : (row.mode === DECEPTION_OBFUSCATE ? DECEPTION_OBFUSCATE : '');
    if (!territory || !mode) continue;
    const units = cleanPicks(row.units, mode);
    if (!units.length) continue;
    out[playerId] = { territory, mode, units };
  }
  return out;
}

/** Drop a placement whose territory is no longer that player's. */
export function sweepRadioDeception(state) {
  if (!state || typeof state !== 'object') return state;
  const book = state.radioDeception;
  if (!book || typeof book !== 'object') return state;
  const next = {};
  let changed = false;
  for (const [playerId, row] of Object.entries(book)) {
    if (row?.territory && territoryOwner(state, row.territory) === playerId) {
      next[playerId] = row;
    } else {
      changed = true;
    }
  }
  if (changed) state.radioDeception = next;
  return state;
}

export function activePlacement(state, playerId) {
  if (!expandedTechEnabled(state?.gameOptions)) return null;
  if (!hasRadioTech(state, playerId)) return null;
  const row = state?.radioDeception?.[playerId];
  if (!row?.territory || !row.mode) return null;
  if (territoryOwner(state, row.territory) !== playerId) return null;
  return row;
}

export function placementOnTerritory(state, territory) {
  const book = state?.radioDeception || {};
  for (const playerId of Object.keys(book)) {
    const row = activePlacement(state, playerId);
    if (row?.territory === territory) return { playerId, ...row };
  }
  return null;
}

function countPresent(placements, type, owner) {
  let total = 0;
  for (const row of placements || []) {
    if (!row || row.deceptionTone) continue;
    if (row.type !== type) continue;
    if (owner && row.owner !== owner) continue;
    total += Math.max(0, Number(row.quantity) || 0);
  }
  return total;
}

function presentObfuscation(real, active, friendly) {
  const hidden = [];
  for (const pick of active.units || []) {
    let left = Math.max(0, Number(pick.quantity) || 0);
    const owner = pick.owner || active.playerId;
    for (const row of real) {
      if (left <= 0) break;
      if (row.deceptionTone || row.type !== pick.type) continue;
      if (owner && row.owner !== owner) continue;
      const qty = Math.max(0, Number(row.quantity) || 0);
      const take = Math.min(qty, left);
      row.quantity = qty - take;
      left -= take;
    }
    const taken = Math.max(0, Number(pick.quantity) || 0) - left;
    if (taken > 0 && friendly) {
      hidden.push({
        type: pick.type,
        owner,
        quantity: taken,
        deceptionTone: 'hidden',
      });
    }
  }
  const units = real.filter((row) => (Number(row.quantity) || 0) > 0);
  if (friendly) units.push(...hidden);
  return { units, showMark: !!friendly };
}

function presentIllusion(real, active, friendly) {
  const units = real.filter((row) => (Number(row.quantity) || 0) > 0);
  for (const pick of active.units || []) {
    const qty = Math.max(0, Number(pick.quantity) || 0);
    if (qty <= 0 || !ILLUSION_LAND_TYPES.includes(pick.type)) continue;
    const stack = {
      type: pick.type,
      owner: active.playerId,
      quantity: qty,
    };
    if (friendly) stack.deceptionTone = 'illusion';
    units.push(stack);
  }
  return { units, showMark: !!friendly };
}

/**
 * What one viewer draws on a territory.
 * Friendly: obfuscated units and illusions are separate greyscale stacks.
 * Enemy: obfuscated units are omitted; illusions look like normal units.
 * `units` on the state are not changed.
 */
export function presentTerritoryUnits(state, territory, placements, viewerId) {
  const real = (placements || []).map((row) => ({ ...row }));
  const active = placementOnTerritory(state, territory);
  if (!active) return { units: real.filter((row) => (Number(row.quantity) || 0) > 0), showMark: false };
  const viewer = viewerId === undefined ? deceptionViewerId(state) : viewerId;
  const friendly = viewerIsFriendly(state, viewer, active.playerId);
  if (active.mode === DECEPTION_OBFUSCATE) return presentObfuscation(real, active, friendly);
  if (active.mode === DECEPTION_ILLUSION) return presentIllusion(real, active, friendly);
  return { units: real.filter((row) => (Number(row.quantity) || 0) > 0), showMark: false };
}

export function validateRadioPlacement(state, playerId, territory, mode, units) {
  if (!playerId) return { ok: false, error: 'No player' };
  if (!expandedTechEnabled(state?.gameOptions)) return { ok: false, error: 'Expanded tech is off' };
  if (!hasRadioTech(state, playerId)) return { ok: false, error: 'Radio Deception Networks is not researched' };
  if (state?.phase && state.phase !== 'playing') return { ok: false, error: 'Not during play' };
  if (state?.currentPlayer && state.currentPlayer.id !== playerId) {
    return { ok: false, error: 'Not your turn' };
  }
  const zone = state?.territoryByName?.[territory];
  const water = zone ? !!zone.isWater : !!state?.isWater?.(territory);
  if (!territory || water) return { ok: false, error: 'Choose a land territory you control' };
  if (territoryOwner(state, territory) !== playerId) {
    return { ok: false, error: 'Choose a territory you control' };
  }
  if (mode !== DECEPTION_OBFUSCATE && mode !== DECEPTION_ILLUSION) {
    return { ok: false, error: 'Choose obfuscate or illusion' };
  }
  const requested = (Array.isArray(units) ? units : []).reduce((sum, row) => {
    const qty = Math.floor(Number(row?.quantity) || 0);
    return sum + (qty > 0 ? qty : 0);
  }, 0);
  if (requested > DECEPTION_UNIT_CAP) return { ok: false, error: 'Choose one or two units' };
  const picks = cleanPicks(units, mode);
  const total = picks.reduce((sum, row) => sum + row.quantity, 0);
  if (total < 1 || total > DECEPTION_UNIT_CAP) return { ok: false, error: 'Choose one or two units' };
  if (mode === DECEPTION_OBFUSCATE) {
    const present = state?.units?.[territory] || [];
    for (const pick of picks) {
      if (!pick.owner) return { ok: false, error: 'Choose units in that territory' };
      if (countPresent(present, pick.type, pick.owner) < pick.quantity) {
        return { ok: false, error: 'Those units are not in that territory' };
      }
    }
  }
  return {
    ok: true,
    placement: { territory, mode, units: picks },
  };
}

// Observe-only dice statistics. No randomness, no I/O.
// Face totals, hit-rate moments, within-batch runs, and 6×6 transitions
// are additive so a Firestore batch can increment() them. Longest streak
// is a max, not a sum. Runs and transitions do not cross raw-batch
// boundaries (see tools/recompute-dice-stats.mjs).

export const FACE_COUNT = 6;
export const FAIR_FACE_P = 1 / 6;
export const CHI_DF = 5;
export const UNUSUAL_MIN_ROLLS = 300;
export const SKEW_DETECT_ROLLS = 4500;
export const VERDICT_FAIR = 'Looks fair';
export const VERDICT_WATCH = 'Worth watching';
export const VERDICT_UNUSUAL = 'Unusual';

const CONTEXTS = new Set(['combat', 'aa', 'bombard', 'sub', 'rocket', 'tech']);

export function emptyTotals() {
  return {
    n: 0,
    faces: [0, 0, 0, 0, 0, 0],
    hlLow: 0,
    hlHigh: 0,
    hlRuns: 0,
    trans: Array.from({ length: FACE_COUNT }, () => Array(FACE_COUNT).fill(0)),
    longestStreak: 0,
    units: {},
    seats: {},
  };
}

export function formatInt(n) {
  const s = String(Math.max(0, Math.floor(Number(n) || 0)));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function skewProgressLabel(n) {
  return `${formatInt(n)} / ${formatInt(SKEW_DETECT_ROLLS)} rolls to detect a 2-point skew`;
}

export function safeIdPart(value, fallback = 'x') {
  const out = String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  return out || fallback;
}

export function safeDisplayName(name) {
  const s = String(name ?? '').trim().slice(0, 40);
  if (!s || s.includes('@')) return null;
  return s;
}

export function normalizeRollContext(input, face, gameState) {
  let context = 'combat';
  let side = null;
  let unit = '';
  let need = null;
  let playerSeat = null;

  if (typeof input === 'string') {
    const raw = input;
    if (raw === 'aa' || raw.startsWith('aa')) context = 'aa';
    else if (raw === 'bombard' || raw.startsWith('bombard')) context = 'bombard';
    else if (raw === 'sub' || raw.startsWith('sub')) context = 'sub';
    else if (raw === 'rocket' || raw.startsWith('rocket')) context = 'rocket';
    else if (raw === 'tech' || raw.startsWith('tech')) context = 'tech';
    else context = 'combat';
    if (raw === 'attack' || raw.endsWith(':attack') || raw.endsWith(':attacker')) side = 'attacker';
    else if (raw === 'defense' || raw.endsWith(':defense') || raw.endsWith(':defender')) side = 'defender';
    if (context === 'aa') need = 1;
    else if (context === 'tech') need = 6;
    else if (context === 'rocket') need = null;
  } else if (input && typeof input === 'object') {
    context = CONTEXTS.has(input.context) ? input.context : 'combat';
    if (input.side === 'defender' || input.side === 'attacker') side = input.side;
    unit = input.unit == null ? '' : String(input.unit).slice(0, 40);
    playerSeat = input.playerSeat ?? null;
    if (context === 'rocket') need = null;
    else if (input.need == null || input.need === '') {
      if (context === 'aa') need = 1;
      else if (context === 'tech') need = 6;
      else need = null;
    } else {
      const n = Number(input.need);
      need = Number.isFinite(n) ? n : null;
    }
  }

  if (!side) {
    if (context === 'aa') side = 'defender';
    else side = 'attacker';
  }

  const seat = playerSeat || gameState?.currentPlayer?.id || '';
  const player = (gameState?.players || []).find((p) => p && (p.id === seat || p.oderId === seat)) || null;
  const faceN = Number(face);
  return {
    context,
    side,
    unit,
    need,
    face: faceN,
    playerSeat: seat ? String(seat) : '',
    isAI: !!(player?.isAI),
    playerName: safeDisplayName(player?.name),
  };
}

// null = this die counts toward faces only (rocket, or no threshold).
export function dieHitModel(context, need, face) {
  if (context === 'rocket') return null;
  if (need == null || need === '') return null;
  const n = Number(need);
  const f = Number(face);
  if (!Number.isFinite(n) || !Number.isFinite(f)) return null;
  if (context === 'tech') return { hit: f === 6 ? 1 : 0, p: 1 / 6 };
  const p = Math.max(0, Math.min(FACE_COUNT, n)) / FACE_COUNT;
  return { hit: f <= n ? 1 : 0, p };
}

function unitBucket(totals, unit, side) {
  const key = `${unit || 'unit'}|${side || 'attacker'}`;
  if (!totals.units[key]) {
    totals.units[key] = { unit: unit || 'unit', side: side || 'attacker', dice: 0, hits: 0, sumP: 0, sumVar: 0 };
  }
  return totals.units[key];
}

function seatBucket(totals, die) {
  const id = die.playerSeat || 'seat';
  if (!totals.seats[id]) {
    totals.seats[id] = {
      id,
      name: die.playerName || null,
      isAI: !!die.isAI,
      atk: { dice: 0, hits: 0, sumP: 0, sumVar: 0 },
      def: { dice: 0, hits: 0, sumP: 0, sumVar: 0 },
    };
  }
  const seat = totals.seats[id];
  if (die.playerName) seat.name = die.playerName;
  if (die.isAI) seat.isAI = true;
  return seat;
}

function sequenceShape(faces) {
  let hlLow = 0;
  let hlHigh = 0;
  let hlRuns = 0;
  let prevHigh = null;
  let streak = 0;
  let best = 0;
  let prevFace = null;
  const trans = Array.from({ length: FACE_COUNT }, () => Array(FACE_COUNT).fill(0));
  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    const high = face >= 4;
    if (high) hlHigh += 1;
    else hlLow += 1;
    if (prevHigh === null || prevHigh !== high) hlRuns += 1;
    prevHigh = high;
    if (face === prevFace) streak += 1;
    else streak = 1;
    if (streak > best) best = streak;
    prevFace = face;
    if (i > 0) {
      const from = faces[i - 1];
      if (from >= 1 && from <= 6 && face >= 1 && face <= 6) {
        trans[from - 1][face - 1] += 1;
      }
    }
  }
  return { hlLow, hlHigh, hlRuns, trans, longestStreak: best };
}

// One raw batch (one context/side slice). Mutates totals.
export function applyDiceBatch(totals, dice, meta = {}) {
  const list = Array.isArray(dice) ? dice : [];
  const faces = [];
  for (const die of list) {
    const face = Number(die?.face);
    if (!Number.isInteger(face) || face < 1 || face > 6) continue;
    faces.push(face);
    totals.n += 1;
    totals.faces[face - 1] += 1;
    const context = meta.context || die.context || 'combat';
    const side = meta.side || die.side || 'attacker';
    const model = dieHitModel(context, die.need, face);
    if (model) {
      const bucket = unitBucket(totals, die.unit, side);
      bucket.dice += 1;
      bucket.hits += model.hit;
      bucket.sumP += model.p;
      bucket.sumVar += model.p * (1 - model.p);
      const attackish = side === 'attacker' && context !== 'tech' && context !== 'rocket';
      const defenseish = side === 'defender' && context !== 'tech' && context !== 'rocket';
      if (attackish || defenseish) {
        const seat = seatBucket(totals, {
          playerSeat: meta.playerSeat || die.playerSeat,
          playerName: meta.playerName || die.playerName,
          isAI: meta.isAI ?? die.isAI,
        });
        const block = attackish ? seat.atk : seat.def;
        block.dice += 1;
        block.hits += model.hit;
        block.sumP += model.p;
        block.sumVar += model.p * (1 - model.p);
      }
    } else if (meta.playerSeat || die.playerSeat) {
      seatBucket(totals, {
        playerSeat: meta.playerSeat || die.playerSeat,
        playerName: meta.playerName || die.playerName,
        isAI: meta.isAI ?? die.isAI,
      });
    }
  }
  const shape = sequenceShape(faces);
  totals.hlLow += shape.hlLow;
  totals.hlHigh += shape.hlHigh;
  totals.hlRuns += shape.hlRuns;
  for (let a = 0; a < FACE_COUNT; a++) {
    for (let b = 0; b < FACE_COUNT; b++) totals.trans[a][b] += shape.trans[a][b];
  }
  if (shape.longestStreak > totals.longestStreak) totals.longestStreak = shape.longestStreak;
  return totals;
}

export function batchDocId({ gameId, round, seq, uid }) {
  return `${safeIdPart(gameId, 'solo')}_${Number(round) || 0}_${Number(seq) || 0}_${safeIdPart(uid, 'uid')}`;
}

export function groupDiceForBatches(dice) {
  const groups = [];
  for (const die of dice || []) {
    const context = die.context || 'combat';
    const side = die.side || 'attacker';
    const playerSeat = die.playerSeat || '';
    const isAI = !!die.isAI;
    const key = `${context}|${side}|${playerSeat}|${isAI ? 1 : 0}`;
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) {
      groups.push({
        key,
        context,
        side,
        playerSeat,
        isAI,
        playerName: die.playerName || null,
        dice: [],
      });
    }
    groups[groups.length - 1].dice.push({
      unit: die.unit || '',
      need: die.need == null ? null : die.need,
      face: die.face,
    });
    if (die.playerName) groups[groups.length - 1].playerName = die.playerName;
  }
  return groups;
}

// Lanczos log-gamma (Numerical Recipes / Wikipedia coefficients).
function logGamma(z) {
  const p = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  let x = 0.99999999999980993;
  z -= 1;
  for (let i = 0; i < p.length; i++) x += p[i] / (z + i + 1);
  const t = z + p.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// Upper regularized gamma Q(s, x) = Γ(s, x) / Γ(s).
function gammaQ(s, x) {
  if (x <= 0) return 1;
  if (s <= 0) return NaN;
  if (x < s + 1) {
    let term = 1 / s;
    let sum = term;
    for (let k = 1; k < 400; k++) {
      term *= x / (s + k);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    const lower = sum * Math.exp(-x + s * Math.log(x) - logGamma(s));
    const p = 1 - lower;
    if (p < 0) return 0;
    if (p > 1) return 1;
    return p;
  }
  let b = x + 1 - s;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 400; i++) {
    const an = -i * (i - s);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  const upper = Math.exp(-x + s * Math.log(x) - logGamma(s)) * h;
  if (upper < 0) return 0;
  if (upper > 1) return 1;
  return upper;
}

export function chiSquarePValue(chi2, df = CHI_DF) {
  const x = Number(chi2);
  const k = Number(df) || CHI_DF;
  if (!Number.isFinite(x) || x < 0) return null;
  if (x === 0) return 1;
  return gammaQ(k / 2, x / 2);
}

export function chiSquareFaces(faces, n = null) {
  const counts = (faces || []).slice(0, FACE_COUNT).map((v) => Number(v) || 0);
  while (counts.length < FACE_COUNT) counts.push(0);
  const total = n == null ? counts.reduce((s, v) => s + v, 0) : Number(n) || 0;
  if (total <= 0) return { chi2: 0, p: null, n: 0, df: CHI_DF, verdict: null };
  const expected = total / FACE_COUNT;
  let chi2 = 0;
  for (const o of counts) {
    const d = o - expected;
    chi2 += (d * d) / expected;
  }
  const p = chiSquarePValue(chi2, CHI_DF);
  return { chi2, p, n: total, df: CHI_DF, verdict: faceVerdict(p, total) };
}

export function faceVerdict(p, n) {
  const rolls = Number(n) || 0;
  if (!Number.isFinite(p) || rolls <= 0) return null;
  if (p > 0.05) return VERDICT_FAIR;
  if (p > 0.01) return VERDICT_WATCH;
  if (rolls >= UNUSUAL_MIN_ROLLS) return VERDICT_UNUSUAL;
  return VERDICT_WATCH;
}

export function hitRateZ({ hits = 0, dice = 0, sumP = 0, sumVar = 0 } = {}) {
  const n = Number(dice) || 0;
  if (n <= 0) return { z: null, observed: null, expected: null, margin: null };
  const h = Number(hits) || 0;
  const mean = Number(sumP) || 0;
  const variance = Math.max(0, Number(sumVar) || 0);
  const se = Math.sqrt(variance);
  const z = se === 0 ? 0 : (h - mean) / se;
  return {
    z,
    observed: h / n,
    expected: mean / n,
    margin: (1.96 * se) / n,
  };
}

export function runsTestFromSums({ hlLow = 0, hlHigh = 0, hlRuns = 0 } = {}) {
  const n1 = Number(hlLow) || 0;
  const n2 = Number(hlHigh) || 0;
  const runs = Number(hlRuns) || 0;
  const N = n1 + n2;
  if (n1 === 0 || n2 === 0 || N < 2) {
    return { n1, n2, runs, expected: null, variance: null, z: null };
  }
  const expected = (2 * n1 * n2) / N + 1;
  const variance = (2 * n1 * n2 * (2 * n1 * n2 - N)) / (N * N * (N - 1));
  const z = variance > 0 ? (runs - expected) / Math.sqrt(variance) : 0;
  return { n1, n2, runs, expected, variance, z };
}

export function runsTestFaces(faces) {
  const shape = sequenceShape((faces || []).map(Number).filter((f) => f >= 1 && f <= 6));
  return runsTestFromSums(shape);
}

export function flattenTotals(totals, { includeSeats = true, includeUnits = true, names = true } = {}) {
  const inc = {};
  inc.n = totals.n;
  for (let i = 0; i < FACE_COUNT; i++) inc[`face_${i + 1}`] = totals.faces[i];
  inc.hl_low = totals.hlLow;
  inc.hl_high = totals.hlHigh;
  inc.hl_runs = totals.hlRuns;
  for (let a = 0; a < FACE_COUNT; a++) {
    for (let b = 0; b < FACE_COUNT; b++) {
      const v = totals.trans[a][b];
      if (v) inc[`trans_${a + 1}_${b + 1}`] = v;
    }
  }
  if (includeUnits) {
    for (const bucket of Object.values(totals.units)) {
      const u = safeIdPart(bucket.unit, 'unit');
      const side = bucket.side === 'defender' ? 'defender' : 'attacker';
      const prefix = `u_${u}_${side}`;
      inc[`${prefix}_dice`] = bucket.dice;
      inc[`${prefix}_hits`] = bucket.hits;
      inc[`${prefix}_sumP`] = bucket.sumP;
      inc[`${prefix}_sumVar`] = bucket.sumVar;
    }
  }
  const nameMap = {};
  const flags = {};
  if (includeSeats) {
    for (const seat of Object.values(totals.seats)) {
      const id = safeIdPart(seat.id, 'seat');
      const put = (side, block) => {
        if (!block.dice && !block.hits) return;
        inc[`seat_${id}_${side}_dice`] = block.dice;
        inc[`seat_${id}_${side}_hits`] = block.hits;
        inc[`seat_${id}_${side}_sumP`] = block.sumP;
        inc[`seat_${id}_${side}_sumVar`] = block.sumVar;
      };
      put('atk', seat.atk);
      put('def', seat.def);
      if (seat.isAI) flags[`seat_${id}_ai`] = true;
      if (names && seat.name) nameMap[`name_${id}`] = seat.name;
    }
  }
  return { inc, longestStreak: totals.longestStreak, names: nameMap, flags };
}

export function totalsFromFlat(doc) {
  const totals = emptyTotals();
  if (!doc || typeof doc !== 'object') return totals;
  if (Array.isArray(doc.faces) && doc.faces.length >= 6 && doc.units) {
    return doc;
  }
  totals.n = Number(doc.n) || 0;
  for (let i = 1; i <= 6; i++) totals.faces[i - 1] = Number(doc[`face_${i}`]) || 0;
  if (!totals.n) totals.n = totals.faces.reduce((s, v) => s + v, 0);
  totals.hlLow = Number(doc.hl_low) || 0;
  totals.hlHigh = Number(doc.hl_high) || 0;
  totals.hlRuns = Number(doc.hl_runs) || 0;
  totals.longestStreak = Number(doc.longestStreak) || 0;
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) totals.trans[a - 1][b - 1] = Number(doc[`trans_${a}_${b}`]) || 0;
  }
  const seats = {};
  for (const [key, value] of Object.entries(doc)) {
    const unit = /^u_([A-Za-z0-9]+|unit)_(attacker|defender)_(dice|hits|sumP|sumVar)$/.exec(key);
    if (unit) {
      const id = `${unit[1]}|${unit[2]}`;
      if (!totals.units[id]) {
        totals.units[id] = { unit: unit[1], side: unit[2], dice: 0, hits: 0, sumP: 0, sumVar: 0 };
      }
      totals.units[id][unit[3] === 'sumP' ? 'sumP' : unit[3] === 'sumVar' ? 'sumVar' : unit[3]] = Number(value) || 0;
      continue;
    }
    const seat = /^seat_([A-Za-z0-9]+)_(atk|def)_(dice|hits|sumP|sumVar)$/.exec(key);
    if (seat) {
      if (!seats[seat[1]]) {
        seats[seat[1]] = {
          id: seat[1],
          name: null,
          isAI: false,
          atk: { dice: 0, hits: 0, sumP: 0, sumVar: 0 },
          def: { dice: 0, hits: 0, sumP: 0, sumVar: 0 },
        };
      }
      const block = seat[2] === 'atk' ? seats[seat[1]].atk : seats[seat[1]].def;
      const field = seat[3] === 'sumP' ? 'sumP' : seat[3] === 'sumVar' ? 'sumVar' : seat[3];
      block[field] = Number(value) || 0;
      continue;
    }
    const ai = /^seat_([A-Za-z0-9]+)_ai$/.exec(key);
    if (ai) {
      if (!seats[ai[1]]) {
        seats[ai[1]] = {
          id: ai[1],
          name: null,
          isAI: true,
          atk: { dice: 0, hits: 0, sumP: 0, sumVar: 0 },
          def: { dice: 0, hits: 0, sumP: 0, sumVar: 0 },
        };
      }
      seats[ai[1]].isAI = true;
      continue;
    }
    const name = /^name_([A-Za-z0-9]+)$/.exec(key);
    if (name && typeof value === 'string') {
      if (!seats[name[1]]) {
        seats[name[1]] = {
          id: name[1],
          name: safeDisplayName(value),
          isAI: false,
          atk: { dice: 0, hits: 0, sumP: 0, sumVar: 0 },
          def: { dice: 0, hits: 0, sumP: 0, sumVar: 0 },
        };
      } else seats[name[1]].name = safeDisplayName(value);
    }
  }
  totals.seats = seats;
  return totals;
}

export function formatHitRate(block) {
  const z = hitRateZ(block || {});
  if (z.observed == null) return '—';
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  return `${pct(z.observed)} vs ${pct(z.expected)} ± ${pct(z.margin)}`;
}

export function formatP(p) {
  if (!Number.isFinite(p)) return '—';
  if (p < 0.001) return '< 0.001';
  if (p > 0.999) return '> 0.999';
  return p.toFixed(3);
}

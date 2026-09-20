// James lock — HUD copy. If a player could mistake the game for broken,
// the strip must say whose turn, what last landed, and that the match lives.
// No Firebase. HUD and harnesses share this.

import { GAME_PHASES, TURN_PHASES } from '../state/gameState.js';
import { formatMobilePhaseLabel } from './mobileShell.js';
import { resolveTurnChrome } from './playerPanel.js';
import { placementBudgetCopy } from '../state/placeQueue.js';
import { resolveHostReconnectCopy } from '../multiplayer/lastMatch.js';

export function resolveHudPhaseLabel({ phase, turnPhase } = {}) {
  if (phase === GAME_PHASES.CAPITAL_PLACEMENT) return 'Place Capital';
  if (phase === GAME_PHASES.UNIT_PLACEMENT) return 'Initial Deployment';
  return formatMobilePhaseLabel(phase, turnPhase) || 'Setup';
}

// Combat Move ≠ Combat (dice). Fortify = Non-Combat Move. Copy only.
export function resolveHudNextStep({ phase, turnPhase } = {}) {
  if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.COMBAT_MOVE) {
    return 'Combat Move: tap stack → units → highlighted land → Confirm. Dice are next.';
  }
  if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.NON_COMBAT_MOVE) {
    return 'Fortify: tap stack → units → your land → Confirm. No attacks this step.';
  }
  return null;
}

// One live AI beat — never YOUR TURN on an AI seat.
export function formatAiTurnLine({ name, phase, status } = {}) {
  if (status) return String(status);
  const who = name || 'AI';
  if (phase === GAME_PHASES.CAPITAL_PLACEMENT) return `${who} placing capital…`;
  if (phase === GAME_PHASES.UNIT_PLACEMENT) return `${who} deploying…`;
  return `${who} thinking…`;
}

export function resolveHudWhoseTurn({
  isMultiplayer = false,
  localUserId = null,
  currentPlayerOderId = null,
  currentPlayerName = null,
  currentPlayerIsAI = false,
  aiStatus = null,
  phase = null,
} = {}) {
  const chrome = resolveTurnChrome({
    isMultiplayer,
    localUserId,
    currentPlayerOderId,
    currentPlayerName,
  });
  const name = currentPlayerName || chrome.currentPlayerName;
  if (currentPlayerIsAI) {
    return {
      ownSeat: false,
      badge: null,
      line: formatAiTurnLine({ name, phase, status: aiStatus }),
    };
  }
  return {
    ownSeat: chrome.ownSeat,
    badge: chrome.badge,
    line: chrome.ownSeat
      ? `YOUR TURN · ${name}`
      : (isMultiplayer ? `WAITING · ${name}` : name),
  };
}

export function formatHudLastAction(entry) {
  if (!entry) return 'Last action: none yet this session';
  const msg = entry.data?.message || entry.type;
  return `Last action: ${msg}`;
}

// Phone HUD is one phase chip. Desktop keeps the James-lock ticker.
export function shouldShowHudTicker({ mobile = false } = {}) {
  return !mobile;
}

// "X's turn begins" is the previous seat's banner. Do not keep it as
// "Last action" while the current seat is placing a capital.
export function shouldShowHudLastAction({ phase, lastActionEntry } = {}) {
  const msg = lastActionEntry?.data?.message || lastActionEntry?.type || '';
  if (phase === GAME_PHASES.CAPITAL_PLACEMENT && /turn begins/i.test(String(msg))) {
    return false;
  }
  return true;
}

export function formatHudClickLanded(lastClick, { mobile = false } = {}) {
  const verb = mobile ? 'Tap' : 'Click';
  if (!lastClick) {
    return mobile
      ? 'Tap the map — this line updates when it lands'
      : 'Click: tap the map — this line updates when it lands';
  }
  if (lastClick.landed === false) {
    return `${verb} missed${lastClick.label ? ` (${lastClick.label})` : ''} — try the territory again`;
  }
  return `${verb} landed: ${lastClick.label || 'map'}`;
}

export function resolveHudDeployBudget({
  phase,
  deployedThisRound = 0,
  limit = 6,
  poolRemaining = 0,
} = {}) {
  if (phase !== GAME_PHASES.UNIT_PLACEMENT) return null;
  const copy = placementBudgetCopy({ deployedThisRound, limit, poolRemaining });
  return `${copy.deployedLabel} ${copy.deployedText} · ${copy.remainingLabel} ${copy.remainingText}`;
}

export function resolveHudMatchStatus({
  gameCode = null,
  justResumed = false,
  sessionLost = false,
  hostPresence = null,
  hostName = 'Host',
  isHost = false,
} = {}) {
  const code = gameCode || null;
  if (sessionLost) {
    return code
      ? `You were away — still in ${code}. Sign in and rejoin.`
      : 'You were away — the match is still there. Open My Games.';
  }
  if (justResumed && code) {
    return `Still in ${code} — you were away.`;
  }
  if (!isHost && shouldShowAway(hostPresence)) {
    return resolveHostReconnectCopy({ hostPresence, hostName, gameCode: code });
  }
  return code ? `In ${code}` : null;
}

function shouldShowAway(hostPresence) {
  return hostPresence === 'idle' || hostPresence === 'offline';
}

export function resolveHudClarity({
  isMultiplayer = false,
  localUserId = null,
  currentPlayerOderId = null,
  currentPlayerName = null,
  phase = null,
  turnPhase = null,
  lastActionEntry = null,
  lastClick = null,
  deployedThisRound = 0,
  limit = 6,
  poolRemaining = 0,
  gameCode = null,
  justResumed = false,
  sessionLost = false,
  hostPresence = null,
  hostName = 'Host',
  isHost = false,
  mobile = false,
  currentPlayerIsAI = false,
  aiStatus = null,
} = {}) {
  const whose = resolveHudWhoseTurn({
    isMultiplayer,
    localUserId,
    currentPlayerOderId,
    currentPlayerName,
    currentPlayerIsAI,
    aiStatus,
    phase,
  });
  return {
    whoseTurn: whose.line,
    ownSeat: whose.ownSeat,
    badge: whose.badge,
    phase: resolveHudPhaseLabel({ phase, turnPhase }),
    next: resolveHudNextStep({ phase, turnPhase }),
    budget: resolveHudDeployBudget({
      phase, deployedThisRound, limit, poolRemaining,
    }),
    lastAction: shouldShowHudLastAction({ phase, lastActionEntry })
      ? formatHudLastAction(lastActionEntry)
      : '',
    click: formatHudClickLanded(lastClick, { mobile }),
    match: resolveHudMatchStatus({
      gameCode, justResumed, sessionLost, hostPresence, hostName, isHost,
    }),
  };
}

export function resolveHostAwayBanner({ lobbyCode = null } = {}) {
  const code = lobbyCode || 'the match';
  return `You were away — still in ${code}. The other player is still there. Rejoin.`;
}

// V2.81.50: stale lobby `players` write must not replace a just-joined human
// with Easy Bot (live Benson / Robert / Bastion table).
// Run: node tools/test-lobby-seats.mjs

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const {
  addLobbyAISeat,
  humanSeatPreserved,
  joinLobbySeat,
  lobbySeatIds,
  patchLobbySeat,
  removeLobbyAISeat,
  removeLobbyHumanSeat,
  seatNamesForOpenGameCard,
  startGameRoster,
  transferLobbyHost,
} = await import(pathToFileURL(join(root, 'src/multiplayer/lobbySeats.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const robert = { oderId: 'robert', displayName: 'Robert007', factionId: 'Germans', isHost: true };
const bastion = { oderId: 'bastion', displayName: 'Bastion', factionId: 'Russians' };
const benson = { oderId: 'benson', displayName: 'Sean Benson', factionId: 'Americans' };
const easy1 = { oderId: 'ai_1', displayName: 'Easy Bot', isAI: true, aiDifficulty: 'easy', factionId: 'British' };
const easy2 = { oderId: 'ai_2', displayName: 'Easy Bot', isAI: true, aiDifficulty: 'easy', factionId: 'Japanese' };

console.log('=== V2.81.50 version ===');
check('GAME_VERSION is V2.81.57-dual-path.15', GAME_VERSION === 'V2.81.57-dual-path.15');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== Live race: stale Add AI drops Benson ===');
{
  const latest = [robert, easy1, bastion, benson];
  const staleHostCache = [robert, easy1, bastion];
  const naiveWrite = [...staleHostCache, easy2];
  const liveCard = [robert, easy1, easy2, bastion];
  check('stale full-array write matches the live Open Games card',
    liveCard.map((p) => p.displayName).join(', ') === 'Robert007, Easy Bot, Easy Bot, Bastion'
    && naiveWrite.filter((p) => p.displayName === 'Easy Bot').length === 2
    && !naiveWrite.some((p) => p.oderId === 'benson'));
  check('stale Add AI drops Benson',
    !naiveWrite.some((p) => p.oderId === 'benson')
    && humanSeatPreserved({
      latestPlayers: latest,
      nextPlayers: naiveWrite,
      humanId: 'benson',
    }) === false);

  const full = addLobbyAISeat({
    players: latest,
    aiPlayer: easy2,
    maxPlayers: 4,
  });
  check('fresh 4/4 Add AI fails instead of replacing Benson',
    full.ok === false
    && full.error === 'Lobby is full'
    && latest.some((p) => p.oderId === 'benson' && !p.isAI));

  const appended = addLobbyAISeat({
    players: latest,
    aiPlayer: easy2,
    maxPlayers: 5,
  });
  check('fresh 5-max Add AI keeps Benson and adds the bot',
    appended.ok
    && humanSeatPreserved({
      latestPlayers: latest,
      nextPlayers: appended.players,
      humanId: 'benson',
    })
    && appended.players.some((p) => p.oderId === 'ai_2'));
}

console.log('=== Join / patch / start from latest seats ===');
{
  const before = [robert, easy1, bastion];
  const joined = joinLobbySeat({
    players: before,
    newPlayer: benson,
    maxPlayers: 4,
  });
  check('join seats Benson on the latest roster',
    joined.ok && joined.alreadySeated === false && lobbySeatIds(joined.players).includes('benson'));

  const again = joinLobbySeat({
    players: joined.players,
    newPlayer: { ...benson, displayName: 'Sean Benson' },
    maxPlayers: 4,
  });
  check('re-join is already seated, not a duplicate',
    again.ok && again.alreadySeated && again.players.filter((p) => p.oderId === 'benson').length === 1);

  const fullJoin = joinLobbySeat({
    players: joined.players,
    newPlayer: { oderId: 'late', displayName: 'Late' },
    maxPlayers: 4,
  });
  check('join into a full lobby fails without dropping anyone',
    fullJoin.ok === false
    && lobbySeatIds(joined.players).join(',') === 'robert,ai_1,bastion,benson');

  const patched = patchLobbySeat({
    players: joined.players,
    userId: 'robert',
    updates: { factionId: 'Japanese', color: '#FF8C00' },
  });
  check('host faction patch keeps Benson',
    patched.ok
    && patched.players.find((p) => p.oderId === 'robert').factionId === 'Japanese'
    && humanSeatPreserved({
      latestPlayers: joined.players,
      nextPlayers: patched.players,
      humanId: 'benson',
    }));

  const roster = startGameRoster(joined.players);
  check('startGame roster / playerUserIds include Benson',
    roster.players.some((p) => p.oderId === 'benson')
    && roster.playerUserIds.includes('benson')
    && roster.playerUserIds.includes('robert')
    && roster.playerUserIds.includes('bastion'));
}

console.log('=== Leave / host transfer / remove AI ===');
{
  const four = [robert, easy1, bastion, benson];
  const guestLeft = removeLobbyHumanSeat({ players: four, userId: 'benson' });
  check('guest leave removes only that human',
    guestLeft.ok
    && !lobbySeatIds(guestLeft.players).includes('benson')
    && lobbySeatIds(guestLeft.players).includes('bastion'));

  const hostLeft = transferLobbyHost({ players: four, leavingUserId: 'robert' });
  check('host leave keeps Benson and hands host to next human',
    hostLeft.nextHost?.oderId === 'bastion'
    && humanSeatPreserved({
      latestPlayers: four,
      nextPlayers: hostLeft.players,
      humanId: 'benson',
    })
    && hostLeft.players.find((p) => p.oderId === 'bastion').isHost === true);

  const removed = removeLobbyAISeat({ players: four, oderId: 'ai_1' });
  check('remove AI by oderId does not shift Benson off the roster',
    removed.ok
    && !removed.players.some((p) => p.oderId === 'ai_1')
    && removed.players.some((p) => p.oderId === 'benson'));
}

console.log('=== Open Games card prefers live state seats ===');
{
  const clobberedLobby = [robert, easy1, easy2, bastion];
  const liveState = [
    { oderId: 'robert', name: 'Robert007' },
    { oderId: 'benson', name: 'Sean Benson' },
    { oderId: 'ai_1', name: 'Easy Bot' },
    { oderId: 'bastion', name: 'Bastion' },
  ];
  check('card uses state names when lobbyData lost Benson',
    seatNamesForOpenGameCard({
      lobbyPlayers: clobberedLobby,
      statePlayers: liveState,
    }).join(', ') === 'Robert007, Sean Benson, Easy Bot, Bastion');
  check('card falls back to lobbyData before state exists',
    seatNamesForOpenGameCard({
      lobbyPlayers: clobberedLobby,
      statePlayers: [],
    }).join(', ') === 'Robert007, Easy Bot, Easy Bot, Bastion');
}

console.log('=== lobbyManager writes latest seats inside a transaction ===');
{
  const src = readFileSync(join(root, 'src/multiplayer/lobbyManager.js'), 'utf8');
  check('join / addAI / update / start use runTransaction',
    src.includes('runTransaction')
    && src.includes('joinLobbySeat')
    && src.includes('addLobbyAISeat')
    && src.includes('patchLobbySeat')
    && src.includes('startGameRoster'));
  check('startGame no longer snapshots this.currentLobby.players onto the game doc',
    !/lobbyData:\s*\{\s*players:\s*this\.currentLobby\.players/.test(src)
    && src.includes('players: roster.players'));
  check('Add AI no longer writes [...this.currentLobby.players, aiPlayer]',
    !src.includes('[...this.currentLobby.players, aiPlayer]'));
}

console.log(failures === 0 ? '\nALL LOBBY-SEAT CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

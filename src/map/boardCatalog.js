// Loaded territory boards, keyed by map id. main.js registers each board
// after its JSON is fetched. GameState adopts the registered board when a
// game starts or a save loads, so a Classic save cannot keep Pacific geometry.

const boards = new Map();

export function registerBoard(mapId, board) {
  if (!mapId || !board?.territories) return null;
  boards.set(mapId, board);
  return board;
}

export function getBoard(mapId) {
  if (mapId == null || mapId === '') return null;
  return boards.get(mapId) || null;
}

export function clearBoards() {
  boards.clear();
}

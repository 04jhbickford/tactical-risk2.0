// English possessive for faction / player names in HUD and turn copy.
// Naive `name + "'s Turn"` produced "Germans's Turn" on V2.61.

const SIBILANT = /[sxz]$/i;
// Adjectival demonyms (British, Japanese) do not take 's — "British Turn".
const ADJECTIVAL = /(?:ish|ese)$/i;

/**
 * Possessive form of a faction or player name.
 * Germans → Germans' | Alice → Alice's | British → British
 */
export function possessiveName(name) {
  const n = String(name ?? '').trim();
  if (!n) return '';
  if (SIBILANT.test(n)) return `${n}'`;
  if (ADJECTIVAL.test(n)) return n;
  return `${n}'s`;
}

/**
 * Possessive phrase: "Germans' Turn", "Alice's Turn", "British Turn".
 */
export function possessivePhrase(name, noun) {
  const poss = possessiveName(name);
  const word = String(noun ?? '').trim();
  if (!poss) return word;
  if (!word) return poss;
  return `${poss} ${word}`;
}

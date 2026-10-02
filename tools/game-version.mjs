// Live display stamp, read from src/version.js. Tests use this so a
// stamp bump does not rewrite every file that only checks the stamp.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function gameVersionFromSource() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const src = readFileSync(join(root, 'src/version.js'), 'utf8');
  const match = /export const GAME_VERSION = '([^']+)'/.exec(src);
  if (!match) throw new Error('src/version.js has no GAME_VERSION');
  return match[1];
}

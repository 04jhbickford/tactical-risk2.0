// V2.81.57-unified.2 — Classic mobile UX borrow from Experimental.
// Static checks only: stamp, SCHEMA freeze, mobile-gated CSS, peek tiles.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));

assert.equal(GAME_VERSION, 'V2.81.57-unified.2', 'stamp is unified.2');
assert.equal(SCHEMA_VERSION, 11, 'SCHEMA stays 11');

const html = readFileSync(join(root, 'index.html'), 'utf8');
assert.match(html, /tr-game-version" content="V2\.81\.57-unified\.2"/);
assert.match(html, /style\.css\?v=V2\.81\.57-unified\.2/);
assert.match(html, /__TR_GAME_VERSION = 'V2\.81\.57-unified\.2'/);

const css = readFileSync(join(root, 'style.css'), 'utf8');
assert.match(css, /\.phone-peek-tile\s*\{/);
assert.match(css, /\.phone-peek-step\s*\{/);
assert.match(css, /touch-action:\s*manipulation/);
assert.match(css, /touch-action:\s*pan-y/);
assert.match(css, /@media \(max-width:\s*430px\)/);
// Peek row must not swallow map taps under the tile gaps.
assert.match(css, /\.phone-peek-row\s*\{[\s\S]*?pointer-events:\s*none/);

const panel = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
assert.match(panel, /_phonePeekTileHtml/);
assert.match(panel, /phone-peek-tile-steps/);
assert.match(panel, /data-action="\$\{stepAction\}"/);
assert.match(panel, /phone-peek-step, \.phone-peek-tile-steps/);
assert.match(panel, /isMobileShell\(\) && this\._phoneDeployDest/);

// Desktop Classic chrome outside the phone shell media must keep rail width rules.
assert.match(css, /@media \(max-width:\s*640px\)/);
assert.doesNotMatch(
  panel,
  /classList\.add\(['"]three-spike['"]\)/,
  'Classic panel must not flip Experimental root class',
);

console.log('classic-mobile-ux-18 checks passed');

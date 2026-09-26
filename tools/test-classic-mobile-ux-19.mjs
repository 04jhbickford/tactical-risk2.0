// V2.81.57-unified.16.1 — Classic mobile chrome parity with Experimental.
// Static checks: stamp, SCHEMA freeze, Must-port chrome under mobile-shell.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));

assert.equal(GAME_VERSION, 'V2.81.57-unified.16.1', 'stamp is unified.2');
assert.equal(SCHEMA_VERSION, 11, 'SCHEMA stays 11');

const html = readFileSync(join(root, 'index.html'), 'utf8');
assert.match(html, /tr-game-version" content="V2\.81\.57-unified\.16\.1"/);
assert.match(html, /style\.css\?v=V2\.81\.57-unified\.16\.1/);
assert.match(html, /__TR_GAME_VERSION = 'V2\.81\.57-unified\.16\.1'/);

const css = readFileSync(join(root, 'style.css'), 'utf8');
assert.match(css, /html\.mobile-shell\.has-lobby/);
assert.match(css, /backdrop-filter:\s*saturate\(1\.2\)\s*blur\(18px\)/);
assert.match(css, /\.hud-mobile-chip/);
assert.match(css, /\.hud-mobile-ipc/);
assert.match(css, /#c4a35a/);
assert.match(css, /bottom:\s*calc\(88px \+ env\(safe-area-inset-bottom/);
assert.match(css, /\.lobby-phone-footer-opts/);
assert.match(css, /\.hud-map-tools-btn\s*\{[\s\S]*?display:\s*none\s*!important/);

const panel = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
assert.match(panel, /Confirm Attack/);
assert.match(panel, /Confirm: Move to \$\{destName\}/);
assert.match(panel, /Confirm: Capital in \$\{name\}/);
assert.match(panel, /Confirm: Deploy in \$\{landName\}/);
assert.match(panel, /End Phase · \$\{/);
assert.match(panel, /Confirm: Roll/);

const hud = readFileSync(join(root, 'src/ui/hud.js'), 'utf8');
assert.match(hud, /hud-mobile-ipc/);
assert.match(hud, /hud-help-btn/);
assert.match(hud, /How to start/);
assert.doesNotMatch(hud, /hud-map-tools-btn/);

const lobby = readFileSync(join(root, 'src/ui/lobby.js'), 'utf8');
assert.match(lobby, /lobby-phone-footer-opts/);
assert.match(lobby, /has-lobby/);
assert.match(lobby, /teams-enabled/);

const combat = readFileSync(join(root, 'src/ui/combatUI.js'), 'utf8');
assert.match(combat, /Confirm: Fire AA/);
assert.match(combat, /Confirm: Roll combat/);
assert.match(combat, /Confirm: Take hits/);

assert.doesNotMatch(
  panel,
  /classList\.add\(['"]three-spike['"]\)/,
  'Classic panel must not flip Experimental root class',
);

const gap = readFileSync(join(root, 'docs/GAP-classic-mobile-parity.md'), 'utf8');
assert.match(gap, /Must-port/);
assert.match(gap, /Never \(gameplay\)/);

console.log('classic-mobile-ux-19 checks passed');

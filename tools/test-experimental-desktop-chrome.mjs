// Experimental desktop chrome (.11). Viz craft SoT LOCKED.
// TWO layouts one product: ≤767 sheets · ≥1024 grow-frame dual rails.
// Classic Canvas path is not rewritten. Rules / dual-fork stay .10.
// Run: node tools/test-experimental-desktop-chrome.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_VERSION } from '../src/version.js';
import { UX_LABEL_EXPERIMENTAL, resolveUxMode, UX_CLASSIC, UX_THREE } from '../src/map/presentationMode.js';
import { injectThreeChrome, syncThreeShellWidth, resizeThreeMapCanvas } from '../src/map/threeMapChrome.js';

assert.equal(GAME_VERSION, 'V2.81.57-dual-path.19', 'stamp is dual-path.19');
assert.equal(UX_LABEL_EXPERIMENTAL, 'Experimental UX');
assert.equal(resolveUxMode(''), UX_THREE, 'queryless is Experimental');
assert.equal(resolveUxMode('?ux=classic'), UX_CLASSIC, 'classic remains a deep link');
assert.equal(resolveUxMode('?ux=three'), UX_THREE);

const chromeSrc = readFileSync(new URL('../src/map/threeMapChrome.js', import.meta.url), 'utf8');
const classicLobby = readFileSync(new URL('../src/ui/lobby.js', import.meta.url), 'utf8');
const classicCanvas = readFileSync(new URL('../src/map/mapRenderer.js', import.meta.url), 'utf8');
const classicMain = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const classicStyle = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const playSrc = readFileSync(new URL('../src/map/threeSoloPlay.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const brief = readFileSync(new URL('../briefs/2026-09-20-main-art-three-ux/DESKTOP-EXPERIMENTAL-CHROME-BRIEF.md', import.meta.url), 'utf8');
const checklist = readFileSync(new URL('../briefs/2026-09-20-main-art-three-ux/ADAPTIVE-LOBBY-CHECKLIST.md', import.meta.url), 'utf8');

assert.match(html, /tr-game-version" content="V2\.81\.57-dual-path\.19"/);
assert.match(html, /style\.css\?v=V2\.81\.57-dual-path\.19/);
assert.match(html, /src\/main\.js\?v=V2\.81\.57-dual-path\.19/);

assert.match(brief, /map center \+ left context rail \+ right actions rail/);
assert.match(brief, /fixed map scale grow frame/);
assert.match(checklist, /D1/);
assert.match(checklist, /D5/);

assert.match(chromeSrc, /#three-context/);
assert.match(chromeSrc, /--three-top:52px/);
assert.match(chromeSrc, /--three-left:220px/);
assert.match(chromeSrc, /--three-right:300px/);
assert.match(chromeSrc, /html\.three-spike #mapCanvas \{[\s\S]*left:var\(--three-left\)/);
assert.match(chromeSrc, /width:calc\(100% - var\(--three-left\) - var\(--three-right\)\)/);
assert.match(chromeSrc, /height:calc\(100% - var\(--three-top\)\)/);
assert.doesNotMatch(chromeSrc, /html\.three-spike #mapCanvas \{[^}]*width:auto/);
assert.match(chromeSrc, /#three-bottom \{[\s\S]*left:auto; bottom:0;/);
assert.match(chromeSrc, /resizeThreeMapCanvas/);
assert.match(chromeSrc, /Experimental UX|UX_LABEL_EXPERIMENTAL/);
assert.doesNotMatch(chromeSrc, /New UX \(Three\.js\)/);

assert.match(chromeSrc, /@media \(min-width: 768px\)/, 'tablet lobby multi-col');
assert.match(chromeSrc, /@media \(min-width: 1024px\)/, 'desktop rail breakpoint');
assert.match(chromeSrc, /#three-lobby \.three-lobby-actions \{[\s\S]*grid-template-columns:repeat\(3/);
assert.match(chromeSrc, /@media \(hover: hover\) and \(pointer: fine\)/);

assert.match(chromeSrc, /@media \(max-width:430px\)/, 'phone density tree stays');
assert.match(chromeSrc, /#three-lobby \.three-lobby-seat \{ min-height:44px/);
assert.match(chromeSrc, /#three-confirm, #three-confirm\.is-idle, #three-confirm:disabled \{[\s\S]*min-height:56px/);
assert.match(chromeSrc, /#three-sheet-stack \{[\s\S]*pointer-events:none/);
assert.match(chromeSrc, /compactLocalSeatHtml/);

assert.match(classicLobby, /data-action="ux-classic"/);
assert.match(classicLobby, /data-action="ux-three"/);
assert.match(chromeSrc, /data-lobby="ux"/);
assert.doesNotMatch(classicLobby, /--three-left/);
assert.doesNotMatch(classicCanvas, /--three-left/);
assert.doesNotMatch(classicStyle, /--three-left/);
assert.doesNotMatch(classicMain, /resizeThreeMapCanvas/, 'Classic window resize untouched');
assert.equal(classicCanvas.includes('Experimental UX'), false);

assert.match(playSrc, /applyTerritoryCapture|applyHits/, '.10 combat fork still in ship');
assert.match(playSrc, /legalPlaceDests/, '.10 mobilize dests still in ship');

const sized = resizeThreeMapCanvas({
  getBoundingClientRect() { return { width: 760, height: 748 }; },
  width: 0,
  height: 0,
});
assert.equal(sized.cssW, 760);
assert.equal(sized.cssH, 748);

console.log('test-experimental-desktop-chrome: PASS');

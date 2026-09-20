// Unit checks for V2.61 tablet chrome (tooltip clamp predicate)
// plus V2.63/V2.81 phone-shell predicates. iPhone shell is ≤640px, or
// landscape phone (min side ≤640 and long side <1024). The 641–900
// tablet band (no height) and desktop windows stay on their existing trees.
// Run: node tools/test-tablet-chrome.mjs

import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const {
  clampTooltipToMapArea,
  clampTooltipToViewport,
  resolveMapRightEdge,
  shouldHidePhoneTooltipOn,
  shouldToggleOffPhoneTooltip,
  shouldShowPhoneTooltipOnTap,
  shouldShowPhoneTooltipOnHover,
  shouldInspectPhoneHold,
  shouldCommitPhoneSetupTap,
  shouldApplyPhoneSetupLandTap,
  resolvePhoneCapitalPeekAction,
  applyCapitalPlacementPeek,
  PHONE_CAPITAL_PEEK_CONFIRM,
  PHONE_CAPITAL_PEEK_INSPECT,
  PHONE_CAPITAL_PEEK_IGNORE,
  shouldApplyPhoneSetupTapOnPointerDown,
  shouldCommitPhoneSetupPeekAfterGesture,
  PHONE_SETUP_PAN_SLOP_PX,
  shouldRefitPhoneSetupHit,
  isPhoneCapitalCtaTarget,
  isPhoneHudChromeTarget,
  isPhoneHandoffChromeTarget,
  pointHitsPhoneHandoffChrome,
  isPhoneMapToolsChromeTarget,
  pointHitsPhoneMapToolsChrome,
  isPhoneTrayChromeTarget,
  shouldIgnorePanelBoxForPhoneCapitalPeek,
  clampTooltipToPhoneEdge,
  PHONE_TOOLTIP_Z_INDEX,
  PHONE_INSPECT_HOLD_MS,
} = await import(pathToFileURL(join(root, 'src/ui/territoryTooltip.js')));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const {
  MOBILE_SHELL_MAX_WIDTH,
  TABLET_CHROME_MAX_WIDTH,
  DESKTOP_MIN_WIDTH,
  PHONE_MAX_LONG_SIDE,
  shouldUseMobileShell,
  applyMobileShellClass,
  pickMobilePrimaryButtons,
  shouldHideAllGameChrome,
  shouldHideTurnActionChrome,
  formatMobilePhaseLabel,
  formatMobilePhaseWord,
  shouldHidePhoneMapLabel,
  formatMobilePlayerMeta,
  shouldCollapseMobileTray,
  shouldPeekPhoneTray,
  shouldShowPhonePeekUnitRow,
  readableFactionTextColor,
  shouldShowPhoneChromeTabs,
  shouldUsePhonePlacementTray,
  shouldShowPhonePanelBody,
  shouldShowPhoneDetentTabs,
  shouldShowPhoneTrayToggle,
  shouldShowPhoneMenuPlayerRoster,
  phoneMenuHomeActions,
  isPhoneMenuResignFirst,
  PHONE_MENU_RESIGN_LABEL,
  PHONE_MENU_RESIGN_META,
  shouldShowPhonePlaceMeta,
  shouldParkPhoneMapTools,
  shouldHidePhoneSetupMinimap,
  shouldShowPhoneDeployQty,
  shouldAutoStagePhoneDeployPair,
  shouldIncrementPhonePairIcon,
  nextStagedCount,
  remainingEligibleOfType,
  shouldCommitPhoneIconTap,
  shouldClearPhoneIconAfterExhausted,
  shouldHidePhonePairConfirm,
  shouldStagePhoneMoveIcon,
  remainingUnstagedOfType,
  phoneIconCommitCount,
  canNamePhoneMoveDest,
  shouldUsePhonePairGrammar,
  shouldShowPhonePeekMax,
  phonePointerHint,
  PHONE_PEEK_EXPANDED_MAX_DVH,
  phoneUnitIconSize,
  phoneMapStackOffsets,
  shouldHideUnitsAtZoom,
  boundsFromPoints,
  phoneProblemBounds,
  phoneFitZoom,
  phoneFitLetterboxesMap,
  territoryFitPoint,
  PHONE_MIN_ZOOM_FLOOR,
  shouldHighlightPhoneLegalTerritories,
  collectPhoneLegalTerritoryNames,
  phoneLegalOutlineWidth,
  phoneLegalDashPattern,
  phoneLegalUsesSolidStroke,
  phoneCountryOutlineWidth,
  phoneSeaOutlineWidth,
  PHONE_COUNTRY_HAIRLINE_CSS_PX,
  PHONE_COUNTRY_HAIRLINE_WORLD_MAX,
  PHONE_COUNTRY_HAIRLINE_COLOR,
  PHONE_SEA_HAIRLINE_CSS_PX,
  PHONE_SEA_HAIRLINE_WORLD_MAX,
  PHONE_SEA_HAIRLINE_COLOR,
  shouldDrawPhoneOwnershipFlags,
  phoneOwnershipFlagSize,
  phoneOwnershipSeamWidth,
  shouldStrokePhoneLegalHairline,
  shouldSkipPhoneMapArt,
  shouldSkipPhoneWaterMask,
  shouldStrokePhoneSeaDashes,
  isPhoneCapitalInspectOnlyLand,
  isPhoneSetupPhase,
  shouldWidenPhoneUserFit,
  PHONE_COUNTRY_OUTLINE_CLOSE_ZOOM,
  PHONE_LEGAL_FILL_ALPHA,
  PHONE_LEGAL_OUTLINE_CSS_PX,
  PHONE_LEGAL_OUTLINE_WORLD_MAX,
  PHONE_LEGAL_EDGE_INK,
  PHONE_LEGAL_EDGE_COLOR,
  PHONE_LEGAL_FILL_RGB,
  PHONE_LEGAL_CHROME_CREAM,
  phoneLegalDashColor,
  shouldDrawPhoneCapitalStar,
  shouldDrawPhoneCapitalGlow,
  shouldShowPhoneDeployChip,
  isPhoneLegalSetupSeaDest,
  unwrapFitX,
  PHONE_SELECT_PULSE_MS,
  PHONE_CONFIRM_PULSE_MS,
  PHONE_MAP_LABEL_MIN_ZOOM,
  collectPhoneFitFocusNames,
  expandPhoneFitRegionNames,
  resolvePhoneFitRegionNames,
  pickPhoneFitOwnedCluster,
  phoneHomeTerritoryName,
  phoneFitSelectedName,
  ensurePhoneFitRegionBounds,
  PHONE_FIT_MIN_REGION_W,
  PHONE_FIT_MIN_REGION_H,
} = await import(pathToFileURL(join(root, 'src/ui/mobileShell.js')));
const { Camera, MAP_WIDTH, MAP_HEIGHT } =
  await import(pathToFileURL(join(root, 'src/map/camera.js')));
const {
  resolvePhaseHint,
  resolvePhonePeekHint,
  resolvePhoneDeployLandName,
  resolvePhoneDeployCtaLabel,
  formatPhoneMoveSelectionSummary,
  resolvePhoneTechCta,
  resolvePhoneMoveCta,
  shouldKeepPhonePairLand,
  shouldShowPhoneSetupPeekHint,
  resolvePhoneStickyUnitType,
  shouldAutoCommitPhoneCapital,
  resolvePhoneCapitalCta,
  resolvePhoneCapitalCommitLand,
  isCapitalPlacementCommitted,
  shouldShowPhoneSetupUndo,
  shouldShowSelectUnitsCta,
  PHASE_HINTS,
} = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));
const { GAME_PHASES, TURN_PHASES, orderRiskSetupSeats } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { TerritoryMap } =
  await import(pathToFileURL(join(root, 'src/map/territoryMap.js')));
const { mergedTerritoryOutlineEdges } =
  await import(pathToFileURL(join(root, 'src/map/territoryRenderer.js')));
const { formatAiTurnLine, resolveHudWhoseTurn } =
  await import(pathToFileURL(join(root, 'src/ui/hudClarity.js')));
const { shouldIgnoreFactionCardToggle, shouldSeatFactionOnPointerDown, LOBBY_SELECT_TOGGLE_GUARD_MS } =
  await import(pathToFileURL(join(root, 'src/ui/lobby.js')));
const { shouldShowTurnSummary } =
  await import(pathToFileURL(join(root, 'src/ui/turnSummaryModal.js')));

const PHONE_CSS_MARKER = 'V2.81 phone chrome tree';
function phoneCssParts(css) {
  const idx = css.indexOf(PHONE_CSS_MARKER);
  return {
    beforePhone: idx >= 0 ? css.slice(0, idx) : css,
    phoneBlock: idx >= 0 ? css.slice(idx) : '',
  };
}

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

console.log('=== Version stamps ===');
check('GAME_VERSION is V2.81.57-dual-path.5', GAME_VERSION === 'V2.81.57-dual-path.5');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== resolveMapRightEdge ===');
check('missing sidebar → full viewport', resolveMapRightEdge(null, 772) === 772);
check('zero-width sidebar → full viewport', resolveMapRightEdge({ left: 492, width: 0 }, 772) === 772);
check('visible 280px panel at 772 → map right 492',
  resolveMapRightEdge({ left: 492, width: 280 }, 772) === 492);
check('off-screen left → full viewport',
  resolveMapRightEdge({ left: -280, width: 280 }, 772) === 772);

console.log('=== clampTooltipToMapArea: 772×635 with 280px sidebar ===');
{
  const pos = clampTooltipToMapArea({
    cursorX: 400,
    cursorY: 200,
    width: 280,
    height: 220,
    viewportWidth: 772,
    viewportHeight: 635,
    mapRight: 492,
  });
  check('fits in the map', !!pos);
  check('does not cross sidebar', pos.left + 280 <= 492 - 15);
  check('stays on-screen left', pos.left >= 15);
}

console.log('=== clampTooltipToMapArea: cursor on the sidebar edge ===');
{
  const pos = clampTooltipToMapArea({
    cursorX: 480,
    cursorY: 180,
    width: 280,
    height: 200,
    viewportWidth: 772,
    viewportHeight: 635,
    mapRight: 492,
  });
  check('flips left of the panel', !!pos && pos.left + 280 <= 492 - 15);
}

console.log('=== clampTooltipToMapArea: map too narrow to fit ===');
{
  const pos = clampTooltipToMapArea({
    cursorX: 80,
    cursorY: 80,
    width: 280,
    height: 200,
    viewportWidth: 400,
    viewportHeight: 635,
    mapRight: 200,
  });
  check('returns null so the tooltip is dismissed', pos === null);
}

console.log('=== V2.81 mobile shell breakpoint (640 iPhone+500 / 641–900 tablet / ≥901 desktop) ===');
check('breakpoint is 640', MOBILE_SHELL_MAX_WIDTH === 640);
check('tablet band still ends at 900', TABLET_CHROME_MAX_WIDTH === 900);
check('desktop floor is 901', DESKTOP_MIN_WIDTH === 901);
check('phone long-side ceiling is below iPad 1024', PHONE_MAX_LONG_SIDE === 1024);
check('390px iPhone → mobile shell', shouldUseMobileShell(390) === true);
check('480px → mobile shell', shouldUseMobileShell(480) === true);
check('500px Chrome box → mobile shell (no 280px rail)', shouldUseMobileShell(500) === true);
check('520px floor → mobile shell', shouldUseMobileShell(520) === true);
check('640px → mobile shell', shouldUseMobileShell(640) === true);
check('641px tablet band → no mobile shell', shouldUseMobileShell(641) === false);
check('772px V2.61 tablet → no mobile shell', shouldUseMobileShell(772) === false);
check('900px tablet ceiling → no mobile shell', shouldUseMobileShell(900) === false);
check('901px desktop → no mobile shell', shouldUseMobileShell(901) === false);
check('1280×800 desktop → no mobile shell', shouldUseMobileShell(1280) === false);
check('390/480 still phone', shouldUseMobileShell(390, 480) === true);
check('500 with no height is phone, not tablet split', shouldUseMobileShell(500) === true);
check('641 with no height still tablet', shouldUseMobileShell(641) === false);
check('772 with no height still tablet', shouldUseMobileShell(772) === false);
check('900 with no height still tablet', shouldUseMobileShell(900) === false);
check('iPhone landscape 844×390 → phone', shouldUseMobileShell(844, 390) === true);
check('iPhone landscape 667×375 → phone', shouldUseMobileShell(667, 375) === true);
check('772×390 with height is landscape-phone, not tablet', shouldUseMobileShell(772, 390) === true);
check('900×390 with height is landscape-phone', shouldUseMobileShell(900, 390) === true);
check('iPhone landscape 932×430 → phone', shouldUseMobileShell(932, 430) === true);
check('iPhone 14 Plus landscape 926×428 → phone', shouldUseMobileShell(926, 428) === true);
check('iPhone Pro Max landscape 956×440 → phone', shouldUseMobileShell(956, 440) === true);
check('desktop 1280×400 stays desktop', shouldUseMobileShell(1280, 400) === false);
check('desktop 1280×800 stays desktop', shouldUseMobileShell(1280, 800) === false);
check('iPad portrait 768×1024 not phone', shouldUseMobileShell(768, 1024) === false);
check('iPad landscape 1024×768 not phone', shouldUseMobileShell(1024, 768) === false);
{
  const root = { classList: { on: new Set(), toggle(name, force) {
    if (force) this.on.add(name); else this.on.delete(name);
  }, contains(name) { return this.on.has(name); } } };
  applyMobileShellClass(390, root);
  check('apply at 390 sets mobile-shell', root.classList.contains('mobile-shell'));
  applyMobileShellClass(500, root);
  check('apply at 500 sets mobile-shell (no tablet rail)', root.classList.contains('mobile-shell'));
  applyMobileShellClass(640, root);
  check('apply at 640 sets mobile-shell', root.classList.contains('mobile-shell'));
  applyMobileShellClass(641, root);
  check('apply at 641 clears mobile-shell (tablet band)', !root.classList.contains('mobile-shell'));
  applyMobileShellClass(772, root);
  check('apply at 772 clears mobile-shell (tablet band)', !root.classList.contains('mobile-shell'));
  applyMobileShellClass(1280, root);
  check('apply at 1280 clears mobile-shell', !root.classList.contains('mobile-shell'));
  applyMobileShellClass(844, root, 390);
  check('apply landscape iPhone 844×390 sets mobile-shell', root.classList.contains('mobile-shell'));
  applyMobileShellClass(932, root, 430);
  check('apply landscape iPhone 932×430 sets mobile-shell', root.classList.contains('mobile-shell'));
  applyMobileShellClass(956, root, 440);
  check('apply Pro Max landscape 956×440 sets mobile-shell', root.classList.contains('mobile-shell'));
  applyMobileShellClass(1280, root, 400);
  check('apply short desktop 1280×400 clears mobile-shell', !root.classList.contains('mobile-shell'));
  applyMobileShellClass(768, root, 1024);
  check('apply iPad portrait clears mobile-shell', !root.classList.contains('mobile-shell'));
}

console.log('=== V2.63 phase identity (not the tablet 9px / hidden-dots path) ===');
check('3/7 Combat Movement',
  formatMobilePhaseLabel(GAME_PHASES.PLAYING, TURN_PHASES.COMBAT_MOVE) === '3/7 Combat Movement');
check('HUD phase chip is honest Combat Move',
  formatMobilePhaseWord(GAME_PHASES.UNIT_PLACEMENT, null) === 'Deploy'
  && formatMobilePhaseWord(GAME_PHASES.PLAYING, TURN_PHASES.COMBAT_MOVE) === 'Combat Move');
check('peeked tile hides its map label',
  shouldHidePhoneMapLabel({ mobile: true, name: 'Novosibirsk', peekedName: 'Novosibirsk' }) === true
  && shouldHidePhoneMapLabel({ mobile: true, name: 'China', peekedName: 'Novosibirsk' }) === false
  && shouldHidePhoneMapLabel({ mobile: false, name: 'Novosibirsk', peekedName: 'Novosibirsk' }) === false);
check('1/7 Develop Tech',
  formatMobilePhaseLabel(GAME_PHASES.PLAYING, TURN_PHASES.DEVELOP_TECH) === '1/7 Develop Tech');
check('7/7 Collect Income',
  formatMobilePhaseLabel(GAME_PHASES.PLAYING, TURN_PHASES.COLLECT_INCOME) === '7/7 Collect Income');
check('setup phase keeps its name',
  formatMobilePhaseLabel(GAME_PHASES.UNIT_PLACEMENT, null) === 'Initial Deployment');

console.log('=== V2.63 tray peek PHASE_HINTS + visible IPC/OUT ===');
check('combat-move hint is the existing PHASE_HINTS line',
  resolvePhaseHint(GAME_PHASES.PLAYING, TURN_PHASES.COMBAT_MOVE) === PHASE_HINTS[TURN_PHASES.COMBAT_MOVE]);
check('hint text is stack → units → highlighted land → Confirm',
  resolvePhaseHint(GAME_PHASES.PLAYING, TURN_PHASES.COMBAT_MOVE) === 'Click stack → units → highlighted land → Confirm');
check('purchase phase hint may be empty (still a legal peek)',
  resolvePhaseHint(GAME_PHASES.PLAYING, TURN_PHASES.PURCHASE) === '');
check('IPC is visible, not title-only',
  formatMobilePlayerMeta({ ipcs: 24, surrendered: false }) === '24$');
check('Surrendered is visible OUT',
  formatMobilePlayerMeta({ ipcs: 0, surrendered: true }) === '0$ · OUT');

console.log('=== V2.63 one primary CTA; End Turn and Done never coexist ===');
{
  const both = pickMobilePrimaryButtons([
    { action: 'finish-placement', label: 'Done', primary: true },
    { action: 'next-phase', label: 'End Turn', primary: true },
  ]);
  check('Done wins over End Turn', both.length === 1 && both[0].action === 'finish-placement');

  const greyed = pickMobilePrimaryButtons([
    { action: 'confirm-move', label: 'Confirm Move', primary: true },
    { action: 'next-phase', label: 'End Combat', primary: true, disabled: true },
  ]);
  check('disabled End Turn is hidden, not greyed',
    greyed.length === 1 && greyed[0].action === 'confirm-move');

  const onlyIllegal = pickMobilePrimaryButtons([
    { action: 'next-phase', label: 'End Mobilize', primary: true, disabled: true },
  ]);
  check('only-disabled CTA → no button', onlyIllegal.length === 0);
}

console.log('=== V2.63 handoff / auto-battle chrome flags ===');
check('handoff hides all game chrome', shouldHideAllGameChrome({ handoffVisible: true }) === true);
check('no handoff → chrome stays', shouldHideAllGameChrome({ handoffVisible: false }) === false);
check('combat hides End Turn / Done / Max', shouldHideTurnActionChrome({ combatVisible: true }) === true);
check('no combat → turn chrome stays', shouldHideTurnActionChrome({ combatVisible: false }) === false);

console.log('=== V2.63 CSS is phone-scoped; tablet 481–900 and desktop ≥901 stay ===');
{
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  const unscopedHud = css.match(/^#hud \{[\s\S]*?^\}/m);
  check('unscoped #hud is still 48px', !!unscopedHud && /height:\s*48px/.test(unscopedHud[0]));
  check('phone layout is inside max-width: 640px',
    /@media \(max-width:\s*640px\)/.test(css) && css.includes(PHONE_CSS_MARKER));
  check('no leftover max-width: 767px phone gate',
    !/@media \(max-width:\s*767px\)/.test(css));
  check('unscoped zoom still parks left of the 320px panel',
    /#zoom-controls \{[\s\S]*?right:\s*calc\(320px \+ 12px\)/.test(css));
  const { beforePhone } = phoneCssParts(css);
  check('phone 100dvh is not unscoped on html/body',
    !/html,\s*body \{[^}]*100dvh/.test(beforePhone));
  check('V2.61 tablet 900px block still hides the legend',
    /@media \(max-width: 900px\)[\s\S]*\.hud-legend \{\s*display:\s*none/.test(beforePhone));
  check('V2.61 tablet 900px block still uses 9px phase name',
    /@media \(max-width: 900px\)[\s\S]*\.hud-phase-name \{\s*font-size:\s*9px/.test(beforePhone));
  check('V2.61 tablet 900px block still slims the rail to 280px',
    /@media \(max-width: 900px\)[\s\S]*\.player-panel \{\s*width:\s*280px/.test(beforePhone));
  const { phoneBlock } = phoneCssParts(css);
  check('phone phase identity is ≥11px',
    /\.hud-mobile-phase \{[\s\S]*?font-size:\s*(1[1-9]|[2-9]\d)px/.test(phoneBlock));
  check('phone tray peek class is in the 640 block',
    /pp-tray-peek/.test(phoneBlock) && /pp-tray-hint/.test(phoneBlock));
  check('phone peek tray is height:auto, not a 42/50dvh sheet',
    /#sidebar\.player-panel--peek[\s\S]*?max-height:\s*none/.test(phoneBlock)
    && /#sidebar\.player-panel--peek[\s\S]*?top:\s*auto/.test(phoneBlock)
    && /#sidebar\.player-panel--peek[\s\S]*?overflow:\s*hidden/.test(phoneBlock));
  check('phone expanded detent is 36dvh, not a 280px column',
    /#sidebar\.player-panel--expanded[\s\S]*?max-height:\s*36dvh/.test(phoneBlock)
    && PHONE_PEEK_EXPANDED_MAX_DVH === 36);
  check('phone peek hides the tray body until expand',
    /\.player-panel--peek \.phone-tray-body[\s\S]*?display:\s*none/.test(phoneBlock));
  check('phone peek chips and toggle are ≥44px',
    /\.phone-peek-chip \{[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px/.test(phoneBlock)
    && /\.phone-tray-toggle \{[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px/.test(phoneBlock));
  check('phone peek stacks hint above the CTA (hint not crushed)',
    /\.pp-tray-peek \{[\s\S]*?flex-direction:\s*column/.test(phoneBlock));
  check('phone peek CTA clears the home indicator',
    /\.pp-tray-peek \{[\s\S]*?env\(safe-area-inset-bottom/.test(phoneBlock));
  check('phone ☰ / overflow is a 44px target',
    /\.hud-menu-btn \{[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px/.test(phoneBlock));
  check('phone menu rows are ≥44px',
    /\.hud-menu-item \{[\s\S]*?min-height:\s*44px/.test(phoneBlock));
  check('phone Turn Summary ✕ is a 44px target',
    /\.turn-summary-close \{[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px/.test(phoneBlock));
  check('phone Players tab is a 2-col grid, not 5-col',
    /\.pp-player-stats \{[\s\S]*?grid-template-columns:\s*1fr 1fr/.test(phoneBlock));
  check('phone setup pins START GAME above the fold',
    /\.setup-footer \{[\s\S]*?position:\s*sticky[\s\S]*?bottom:\s*0/.test(phoneBlock)
    && /\.start-game-btn \{[\s\S]*?min-height:\s*48px/.test(phoneBlock));
  check('phone tabs are ≥44px tall',
    /\.pp-tab \{[\s\S]*?min-height:\s*44px[\s\S]*?height:\s*44px/.test(phoneBlock));
  check('phone hides compact phase header (one hint)',
    /\.pp-phase\.compact \{[\s\S]*?display:\s*none/.test(phoneBlock));
  check('Fit button is hidden outside the phone block',
    /\.zoom-btn-fit \{\s*display:\s*none/.test(beforePhone));
  check('phone shows a ≥44px Fit control',
    /\.zoom-btn-fit \{[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px/.test(phoneBlock));
  check('phone menu is a full-screen sheet, not only a dropdown',
    /phone-menu-sheet/.test(phoneBlock) && /phone-menu-row/.test(phoneBlock));
  check('phone menu rows are ≥44px',
    /\.phone-menu-row[\s\S]*?min-height:\s*44px/.test(phoneBlock));
  {
    const hudSrc = readFileSync(join(root, 'src/ui/hud.js'), 'utf8');
    check('⋯ rows are mark → label → trailing meta, not emoji posters',
      /phone-menu-mark/.test(hudSrc)
      && /phone-menu-label/.test(hudSrc)
      && /phone-menu-meta/.test(hudSrc)
      && !/📊|🗺|📜|📖|💾/.test(hudSrc.slice(hudSrc.indexOf('_renderMobile() {'), hudSrc.indexOf('_clarityModel() {'))));
  }
  check('phone placement tray rows are ≥44px',
    /\.phone-place-row \{[\s\S]*?min-height:\s*44px/.test(phoneBlock));
  check('phone lobby is a full-width tree, not the 50% desktop column',
    /lobby-phone[\s\S]*?width:\s*100%/.test(phoneBlock)
    && /\.lobby-phone-card \{/.test(phoneBlock));
  check('phone hides the permanent tab bar',
    /\.pp-tabs \{\s*display:\s*none/.test(phoneBlock));
  check('unscoped territory tooltip stays z-index 100',
    /\.territory-tooltip \{[\s\S]*?z-index:\s*100/.test(beforePhone));
  check('phone tooltip z-index is under the HUD / menu sheet',
    /html\.mobile-shell \.territory-tooltip[\s\S]*?z-index:\s*40/.test(phoneBlock)
    && PHONE_TOOLTIP_Z_INDEX === 40
    && PHONE_TOOLTIP_Z_INDEX < 70);
  check('phone tooltip text is lifted off the dark card',
    /html\.mobile-shell \.territory-tooltip \.tt-header[\s\S]*?color:\s*#f8fafc/.test(phoneBlock));
}

console.log('=== V2.64 phone chrome tree (not desktop restack) ===');
check('desktop Place Capital does not collapse the sheet',
  shouldCollapseMobileTray({ mobile: false, phase: GAME_PHASES.CAPITAL_PLACEMENT }) === false);
check('phone Place Capital collapses to peek (one hint)',
  shouldCollapseMobileTray({ mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT }) === true);
check('phone unit-placement peeks like Place Capital (chips + Deploy)',
  shouldPeekPhoneTray({ mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT }) === true
  && shouldCollapseMobileTray({ mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT }) === true
  && shouldUsePhonePlacementTray({ mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT }) === true
  && shouldPeekPhoneTray({
    mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, expanded: true,
  }) === false);
check('desktop unit-placement does not use the phone tray',
  shouldUsePhonePlacementTray({ mobile: false, phase: GAME_PHASES.UNIT_PLACEMENT }) === false);
check('phone purchase keeps a body region (no permanent tabs)',
  shouldShowPhonePanelBody({ mobile: true, phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.PURCHASE }) === true
  && shouldShowPhoneChromeTabs({ mobile: true }) === false);
check('phone idle collect-income is peek only',
  shouldCollapseMobileTray({ mobile: true, phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.COLLECT_INCOME }) === true);
check('desktop still shows chrome tabs',
  shouldShowPhoneChromeTabs({ mobile: false }) === true);
check('peek hint is the single PHASE_HINTS line',
  resolvePhaseHint(GAME_PHASES.CAPITAL_PLACEMENT, null) === 'Click your territory');
check('dark grey faction text is lifted for contrast',
  readableFactionTextColor('#4A4A4A') !== '#4a4a4a'
  && readableFactionTextColor('#4A4A4A').startsWith('#'));
check('already-bright faction color is kept',
  readableFactionTextColor('#1E90FF') === '#1e90ff');
check('End Turn and Done still never coexist',
  pickMobilePrimaryButtons([
    { action: 'finish-placement', label: 'Done', primary: true },
    { action: 'next-phase', label: 'End Turn', primary: true },
  ]).length === 1);
check('phone min zoom floor is below desktop 0.4',
  PHONE_MIN_ZOOM_FLOOR < 0.4 && PHONE_MIN_ZOOM_FLOOR <= 0.12);
check('phone units stay visible at world-fit zoom',
  shouldHideUnitsAtZoom(0.11, { mobile: true }) === false
  && phoneUnitIconSize(0.11, { mobile: true }) >= 20);
check('desktop units still hide below 0.35',
  shouldHideUnitsAtZoom(0.11, { mobile: false }) === true
  && phoneUnitIconSize(0.5, { mobile: false }) === Math.max(14, Math.min(24, 20 * 0.5)));
check('owned-land bbox is used; worldwide span falls back',
  !!boundsFromPoints([{ x: 100, y: 100 }, { x: 200, y: 180 }])
  && boundsFromPoints([{ x: 10, y: 10 }, { x: 3000, y: 20 }]) === null);
check('territory.center is preferred for fit points',
  territoryFitPoint({ center: [120, 80], polygons: [[[0, 0], [10, 0]]] }).x === 120);

console.log('=== V2.65 phone tooltip dismiss + legal-land highlight ===');
check('phone hides tooltip on menu open',
  shouldHidePhoneTooltipOn({ mobile: true, reason: 'menu-open' }) === true);
check('phone hides tooltip on tap-away / fit / phase / turn / commit',
  shouldHidePhoneTooltipOn({ mobile: true, reason: 'tap-away' })
  && shouldHidePhoneTooltipOn({ mobile: true, reason: 'fit' })
  && shouldHidePhoneTooltipOn({ mobile: true, reason: 'phase-change' })
  && shouldHidePhoneTooltipOn({ mobile: true, reason: 'turn-change' })
  && shouldHidePhoneTooltipOn({ mobile: true, reason: 'commit' }));
check('desktop does not auto-hide tooltip on menu open',
  shouldHidePhoneTooltipOn({ mobile: false, reason: 'menu-open' }) === false);
check('phone second tap on the same territory toggles off',
  shouldToggleOffPhoneTooltip({
    mobile: true, fromTouch: true, visibleName: 'Germany', tappedName: 'Germany',
  }) === true);
check('phone tap on a different territory does not toggle off',
  shouldToggleOffPhoneTooltip({
    mobile: true, fromTouch: true, visibleName: 'Germany', tappedName: 'France',
  }) === false);
check('desktop mouse does not use tap-to-toggle',
  shouldToggleOffPhoneTooltip({
    mobile: false, fromTouch: false, visibleName: 'Germany', tappedName: 'Germany',
  }) === false);
check('phone Place Capital highlights current player owned land',
  shouldHighlightPhoneLegalTerritories({ mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT }) === true);
check('phone Initial Deployment highlights current player owned land',
  shouldHighlightPhoneLegalTerritories({ mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT }) === true);
check('desktop setup does not add the phone legal highlight',
  shouldHighlightPhoneLegalTerritories({ mobile: false, phase: GAME_PHASES.CAPITAL_PLACEMENT }) === false);
check('legal names are the current player\'s land only',
  JSON.stringify(collectPhoneLegalTerritoryNames({
    mobile: true,
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    playerId: 'germans',
    territories: [
      { name: 'Germany', isWater: false },
      { name: 'France', isWater: false },
      { name: 'Baltic Sea Zone', isWater: true },
    ],
    getOwner: (n) => (n === 'Germany' ? 'germans' : 'british'),
  })) === JSON.stringify(['Germany']));

console.log('=== V2.66 leftover sidebar must not re-hide the phone tooltip ===');
{
  const leftoverRail = { left: 110, width: 280 };
  check('desktop leftover 280px rail still shrinks mapRight',
    resolveMapRightEdge(leftoverRail, 390) === 110);
  check('phone ignores leftover sidebar rect (full 390)',
    resolveMapRightEdge(leftoverRail, 390, { mobile: true }) === 390);
  const eaten = clampTooltipToMapArea({
    cursorX: 200,
    cursorY: 200,
    width: 280,
    height: 160,
    viewportWidth: 390,
    viewportHeight: 720,
    mapRight: 110,
  });
  check('desktop clamp-to-sidebar still returns null when the rail eats the card',
    eaten === null);
  const phonePos = clampTooltipToViewport({
    cursorX: 200,
    cursorY: 200,
    width: 280,
    height: 160,
    viewportWidth: 390,
    viewportHeight: 720,
  });
  check('phone viewport clamp always returns a visible box',
    !!phonePos && phonePos.left >= 0 && phonePos.left + 280 <= 390 + 1);
  check('phone second tap still toggles without fromTouch (DevTools)',
    shouldToggleOffPhoneTooltip({
      mobile: true, visibleName: 'Germany', tappedName: 'Germany',
    }) === true);
  check('gold outline is a ≥3 CSS px tile edge at Fit, capped (not a 45px continent hull)',
    PHONE_LEGAL_OUTLINE_CSS_PX >= 3
    && phoneLegalOutlineWidth(0.11) <= PHONE_LEGAL_OUTLINE_WORLD_MAX
    && phoneLegalOutlineWidth(0.11) >= 2.5
    && phoneLegalOutlineWidth(0.11) < 20);
  check('owned-land fill is fill-lite, not a 55% flood',
    PHONE_LEGAL_FILL_ALPHA >= 0.26
    && PHONE_LEGAL_FILL_ALPHA <= 0.4);
  check('owned edge is Civ gold, not cream map chrome',
    PHONE_LEGAL_EDGE_INK === '#3d2800'
    && PHONE_LEGAL_EDGE_COLOR === '#f5c518'
    && PHONE_LEGAL_EDGE_COLOR !== PHONE_LEGAL_CHROME_CREAM
    && PHONE_LEGAL_EDGE_COLOR !== PHONE_LEGAL_EDGE_INK
    && PHONE_LEGAL_FILL_RGB === '255, 208, 32');
  check('legal dash uses faction color, never cream chrome',
    phoneLegalDashColor('#B22222') === '#b22222'
    && phoneLegalDashColor('#4A4A4A') === '#4a4a4a'
    && phoneLegalDashColor(null) === PHONE_LEGAL_EDGE_COLOR
    && phoneLegalDashColor('#B22222') !== PHONE_LEGAL_CHROME_CREAM);
  check('legal dash is solid at world Fit (no sparkle / continent dashes)',
    phoneLegalUsesSolidStroke(0.11) === true
    && phoneLegalDashPattern(0.11).length === 0);
  check('legal hairline stays solid through dest-cluster Fit',
    phoneLegalUsesSolidStroke(0.5) === true
    && phoneLegalUsesSolidStroke(0.7) === true
    && phoneLegalDashPattern(0.5).length === 0);
  check('legal dash returns when zoomed in close',
    phoneLegalUsesSolidStroke(0.9) === false
    && phoneLegalDashPattern(0.9)[0] > phoneLegalDashPattern(0.9)[1]);
  check('dest-cluster legal edge is a hairline; close zoom uses the CSS-px stroke',
    phoneLegalOutlineWidth(0.5) >= 2.5
    && phoneLegalOutlineWidth(0.5) <= 5
    && Math.abs(phoneLegalOutlineWidth(0.9) - PHONE_LEGAL_OUTLINE_CSS_PX / 0.9) < 1e-9);
  check('phone draws a capped CSS-px country hairline at Fit / world / setup',
    phoneCountryOutlineWidth(0.11, { mobile: true }) > 0
    && phoneCountryOutlineWidth(0.11, { mobile: true }) <= PHONE_COUNTRY_HAIRLINE_WORLD_MAX
    && phoneCountryOutlineWidth(0.316, { mobile: true }) > 0
    && phoneCountryOutlineWidth(0.5, { mobile: true }) > 0
    && phoneCountryOutlineWidth(0.7, { mobile: true }) > 0
    && Math.abs(phoneCountryOutlineWidth(0.9, { mobile: true }) - PHONE_COUNTRY_HAIRLINE_CSS_PX / 0.9) < 1e-9
    && phoneCountryOutlineWidth(0.5, { mobile: false }) === 1
    && phoneCountryOutlineWidth(0.3, { mobile: false }) === 0
    && PHONE_COUNTRY_OUTLINE_CLOSE_ZOOM === 0.85);
  check('phone ownership seam stays thin so world Fit is not choppy dark strokes',
    phoneOwnershipSeamWidth(0.35, { mobile: true }) <= 3
    && phoneOwnershipSeamWidth(0.11, { mobile: true }) <= 3
    && phoneOwnershipSeamWidth(0.9, { mobile: true }) <= 3
    && phoneOwnershipSeamWidth(0.11, { mobile: true, setup: true }) === 3
    && phoneOwnershipSeamWidth(0.5, { mobile: true, setup: true }) === 3);
  check('phone skips baked map art below close zoom so PNG borders cannot show',
    shouldSkipPhoneMapArt(0.11, { mobile: true }) === true
    && shouldSkipPhoneMapArt(0.5, { mobile: true }) === true
    && shouldSkipPhoneMapArt(0.7, { mobile: true }) === true
    && shouldSkipPhoneMapArt(0.9, { mobile: true }) === false
    && shouldSkipPhoneMapArt(0.5, { mobile: false }) === false);
  check('phone setup skips map art; CSS-px hairline still draws at dest zoom',
    shouldSkipPhoneMapArt(1.2, { mobile: true, setup: true }) === true
    && phoneCountryOutlineWidth(1.2, { mobile: true, setup: true }) > 0
    && phoneCountryOutlineWidth(1.2, { mobile: true, setup: true }) <= PHONE_COUNTRY_HAIRLINE_WORLD_MAX
    && isPhoneSetupPhase(GAME_PHASES.CAPITAL_PLACEMENT) === true
    && isPhoneSetupPhase(GAME_PHASES.UNIT_PLACEMENT) === true);
  check('world Fit legal edge is a visible owned-tile hairline, not a 9px double hull',
    phoneLegalOutlineWidth(0.11) <= PHONE_LEGAL_OUTLINE_WORLD_MAX
    && phoneLegalOutlineWidth(0.11) >= 2.5
    && phoneLegalOutlineWidth(0.11) * 0.11 >= 1.5);
  check('legal hairline is off — owned mark is fill-lite, not a worldwide gold grid',
    shouldStrokePhoneLegalHairline(0.11, { mobile: true }) === false
    && shouldStrokePhoneLegalHairline(0.5, { mobile: true }) === false
    && shouldStrokePhoneLegalHairline(0.9, { mobile: true }) === false);
}

console.log('=== V2.68 Fit fills the phone frame; gold is an edge ===');
{
  const worldZoom = phoneFitZoom({
    cssW: 366, cssH: 636, canvasH: 844, bw: MAP_WIDTH, bh: MAP_HEIGHT,
  });
  check('390 Fit of the world is height-fill, not a letterboxed poster',
    worldZoom >= 844 / MAP_HEIGHT - 0.001
    && phoneFitLetterboxesMap({ canvasH: 844, zoom: worldZoom }) === false);
  const containWorld = Math.min(366 / MAP_WIDTH, 636 / MAP_HEIGHT);
  check('old contain-the-world zoom letterboxed on 390×844',
    phoneFitLetterboxesMap({ canvasH: 844, zoom: containWorld }) === true);
  const germany = phoneFitZoom({
    cssW: 366, cssH: 636, canvasH: 844, bw: 600, bh: 400,
  });
  check('compact owned land still contains the problem and fills height',
    germany >= 844 / MAP_HEIGHT - 0.001
    && germany >= Math.min(366 / 600, 636 / 400) - 0.001
    && phoneFitLetterboxesMap({ canvasH: 844, zoom: germany }) === false);
  check('worldwide owned land still gets a regional window, not null',
    !!phoneProblemBounds([{ x: 10, y: 10 }, { x: 3000, y: 20 }])
    && boundsFromPoints([{ x: 10, y: 10 }, { x: 3000, y: 20 }]) === null);
  const prevDpr = globalThis.devicePixelRatio;
  globalThis.devicePixelRatio = 1;
  try {
    const cam = new Camera({ width: 390, height: 844 });
    cam.usePhoneMinZoom = true;
    cam.fitBounds(
      { minX: 0, minY: 0, maxX: MAP_WIDTH, maxY: MAP_HEIGHT },
      { padding: 12, padTop: 64, padBottom: 120, fillFrame: true },
    );
    check('Camera.fitBounds(fillFrame) on 390×844 does not letterbox the map',
      844 / cam.zoom <= MAP_HEIGHT + 1);
  } finally {
    if (prevDpr === undefined) delete globalThis.devicePixelRatio;
    else globalThis.devicePixelRatio = prevDpr;
  }
  const rendererSrc = readFileSync(join(root, 'src/map/territoryRenderer.js'), 'utf8');
  const highlight = rendererSrc.match(/renderPhoneLegalHighlights\([\s\S]*?\n  \}/);
  check('phone legal highlight has no 55% wash and no glow',
    !!highlight
    && !/0\.55/.test(highlight[0])
    && !/shadowBlur/.test(highlight[0]));
  check('phone legal highlight is gold fill-lite on first paint, not peek-only',
    !!highlight
    && /phoneLegalNames\.size/.test(highlight[0])
    && /PHONE_LEGAL_FILL_RGB/.test(highlight[0])
    && /PHONE_LEGAL_EDGE_COLOR/.test(highlight[0])
    && !/#fff3b0/.test(highlight[0])
    && !/selectedTerritory/.test(highlight[0]));
  check('legal marks fill each owned tile, not a continent hull',
    !!highlight
    && /_fillPoly/.test(highlight[0])
    && /phoneLegalNames\.has/.test(highlight[0])
    && !/_getExternalEdgesWithTolerance/.test(highlight[0]));
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  const { beforePhone } = phoneCssParts(css);
  check('tablet 481–900 rail is still 280px after V2.68',
    /@media \(max-width: 900px\)[\s\S]*\.player-panel \{\s*width:\s*280px/.test(beforePhone));
  check('unscoped tooltip z-index stays 100 (V2.66 visibility path untouched)',
    /\.territory-tooltip \{[\s\S]*?z-index:\s*100/.test(beforePhone));
  check('Fit seed is owned + dests — selected chip does not replace owned',
    JSON.stringify(collectPhoneFitFocusNames({
      ownedNames: ['Germany', 'Poland'],
      selectedName: 'France',
      destinationNames: ['Belgium', 'France'],
    })) === JSON.stringify(['Germany', 'Poland', 'Belgium', 'France'])
    && JSON.stringify(collectPhoneFitFocusNames({
      ownedNames: ['Germany', 'Poland'],
    })) === JSON.stringify(['Germany', 'Poland']));
  check('phone legal highlight uses gold fill-lite, not a worldwide gold edge',
    /PHONE_LEGAL_FILL_RGB/.test(rendererSrc)
    && /shouldStrokePhoneLegalHairline/.test(rendererSrc)
    && !/PHONE_LEGAL_EDGE_INK/.test(rendererSrc));
}

console.log('=== V2.67 phone peek tray (map-first; no persistent unit sheet) ===');
check('desktop never peeks',
  shouldPeekPhoneTray({ mobile: false, expanded: false }) === false
  && shouldCollapseMobileTray({ mobile: false, phase: GAME_PHASES.UNIT_PLACEMENT }) === false);
check('phone purchase / deploy / mobilize peek unless expanded',
  shouldPeekPhoneTray({ mobile: true, expanded: false }) === true
  && shouldPeekPhoneTray({ mobile: true, expanded: true }) === false
  && shouldShowPhonePeekUnitRow({ mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT }) === true
  && shouldShowPhonePeekUnitRow({ mobile: true, phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.PURCHASE }) === true
  && shouldShowPhonePeekUnitRow({ mobile: true, phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.MOBILIZE }) === true
  && shouldShowPhonePeekUnitRow({ mobile: true, phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.COMBAT_MOVE }) === true
  && shouldShowPhonePeekUnitRow({ mobile: true, phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.NON_COMBAT_MOVE }) === true);
check('phone air-landing keeps the body up; dest-pending combat stays peeked',
  shouldPeekPhoneTray({ mobile: true, airLanding: true }) === false
  && shouldPeekPhoneTray({ mobile: true, movePending: true }) === true);
check('desktop purchase hint stays empty (PHASE_HINTS frozen)',
  resolvePhaseHint(GAME_PHASES.PLAYING, TURN_PHASES.PURCHASE) === '');
check('phone peek hint keeps deploy SILO; Combat Move is stack-then-units',
  resolvePhonePeekHint(GAME_PHASES.PLAYING, TURN_PHASES.PURCHASE) === 'Tap a unit to buy'
  && resolvePhonePeekHint(GAME_PHASES.PLAYING, TURN_PHASES.MOBILIZE) === 'Tap land, then unit'
  && resolvePhonePeekHint(GAME_PHASES.PLAYING, TURN_PHASES.COMBAT_MOVE) === 'Tap your stack, then each unit to move'
  && resolvePhonePeekHint(GAME_PHASES.PLAYING, TURN_PHASES.NON_COMBAT_MOVE) === 'Tap your stack, then each unit to fortify');
{
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  const { beforePhone } = phoneCssParts(css);
  check('V2.67 peek classes are not in the tablet 900 / desktop tree',
    !/#sidebar\.player-panel--peek/.test(beforePhone)
    && !/\.phone-peek-chip \{/.test(beforePhone)
    && !/\.phone-tray-body \{/.test(beforePhone));
  check('tablet 481–900 rail is still 280px after V2.67',
    /@media \(max-width: 900px\)[\s\S]*\.player-panel \{\s*width:\s*280px/.test(beforePhone));
}

console.log('=== V2.69 phone setup tap places; inspect is long-press edge card ===');
check('phone setup tap does not open the tooltip',
  shouldShowPhoneTooltipOnTap({ mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT }) === false
  && shouldShowPhoneTooltipOnTap({ mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT }) === false);
check('phone playing tap still can show the tooltip',
  shouldShowPhoneTooltipOnTap({ mobile: true, phase: GAME_PHASES.PLAYING }) === true);
check('desktop tap predicate is off (hover path unchanged)',
  shouldShowPhoneTooltipOnTap({ mobile: false, phase: GAME_PHASES.UNIT_PLACEMENT }) === false);
check('phone hover does not open the tooltip',
  shouldShowPhoneTooltipOnHover({ mobile: true }) === false
  && shouldShowPhoneTooltipOnHover({ mobile: false }) === true);
check('long-press on setup is inspect, not a tap',
  shouldInspectPhoneHold({
    mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, heldMs: PHONE_INSPECT_HOLD_MS, movedPx: 0,
  }) === true
  && shouldInspectPhoneHold({
    mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, heldMs: 100, movedPx: 0,
  }) === false
  && shouldInspectPhoneHold({
    mobile: false, phase: GAME_PHASES.UNIT_PLACEMENT, heldMs: PHONE_INSPECT_HOLD_MS, movedPx: 0,
  }) === false);
check('inspect hold does not commit a setup tap',
  shouldCommitPhoneSetupTap({
    mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, inspected: true,
  }) === false
  && shouldCommitPhoneSetupTap({
    mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, inspected: false,
  }) === true);
check('phone deploy hint is Tap land, then unit',
  resolvePhonePeekHint(GAME_PHASES.UNIT_PLACEMENT, null) === 'Tap land, then unit');
check('land-then-unit names the territory; unit-then-land asks for land',
  resolvePhonePeekHint(GAME_PHASES.UNIT_PLACEMENT, null, null, { territoryName: 'Yakut S.S.R.' })
    === 'Tap a unit · Yakut S.S.R.'
  && resolvePhonePeekHint(GAME_PHASES.UNIT_PLACEMENT, null, 'tank', { territoryName: 'Yakut S.S.R.' })
    === 'To Yakut S.S.R.'
  && resolvePhonePeekHint(GAME_PHASES.UNIT_PLACEMENT, null, 'tank')
    === 'Tap land, then unit');
check('phone capital hint is Tap your land, then Confirm',
  resolvePhonePeekHint(GAME_PHASES.CAPITAL_PLACEMENT, null) === 'Tap your land, then Confirm'
  && shouldShowPhoneSetupPeekHint({
    phase: GAME_PHASES.CAPITAL_PLACEMENT, hasPrimaryCta: false,
  }) === true
  && shouldShowPhoneSetupPeekHint({
    phase: GAME_PHASES.CAPITAL_PLACEMENT, hasPrimaryCta: true,
  }) === false
  && shouldShowPhoneSetupPeekHint({
    phase: GAME_PHASES.UNIT_PLACEMENT, hasPrimaryCta: false,
  }) === true
  && shouldShowPhoneSetupPeekHint({
    phase: GAME_PHASES.UNIT_PLACEMENT, hasPrimaryCta: true,
  }) === false);
check('desktop deploy PHASE_HINTS stay Click to place units',
  resolvePhaseHint(GAME_PHASES.UNIT_PLACEMENT, null) === PHASE_HINTS[GAME_PHASES.UNIT_PLACEMENT]);
check('desktop capital PHASE_HINTS stay Click your territory',
  resolvePhaseHint(GAME_PHASES.CAPITAL_PLACEMENT, null) === PHASE_HINTS[GAME_PHASES.CAPITAL_PLACEMENT]);
check('own-land tap selects even without a peeked unit',
  shouldApplyPhoneSetupLandTap({
    mobile: true,
    phase: GAME_PHASES.UNIT_PLACEMENT,
    selectedUnitType: null,
    tappedIsOwnedLand: true,
    hasHit: true,
  }) === true
  && shouldApplyPhoneSetupLandTap({
    mobile: true,
    phase: GAME_PHASES.UNIT_PLACEMENT,
    selectedUnitType: 'infantry',
    tappedIsOwnedLand: true,
    hasHit: true,
  }) === true);
check('Place Capital owned land peeks Confirm; unowned/sea inspect; miss ignores',
  shouldApplyPhoneSetupLandTap({
    mobile: true,
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    tappedIsOwnedLand: true,
    tappedIsLand: true,
    hasHit: true,
  }) === true
  && shouldApplyPhoneSetupLandTap({
    mobile: true,
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    tappedIsOwnedLand: false,
    tappedIsLand: true,
    hasHit: true,
  }) === true
  && shouldApplyPhoneSetupLandTap({
    mobile: true,
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    tappedIsOwnedLand: false,
    tappedIsLand: false,
    tappedIsWater: true,
    hasHit: true,
  }) === true
  && shouldApplyPhoneSetupLandTap({
    mobile: true,
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    tappedIsOwnedLand: false,
    tappedIsLand: false,
    hasHit: false,
  }) === false);
check('desktop setup land tap still applies',
  shouldApplyPhoneSetupLandTap({
    mobile: false,
    phase: GAME_PHASES.UNIT_PLACEMENT,
    selectedUnitType: null,
    hasHit: true,
  }) === true);
{
  const edge = clampTooltipToPhoneEdge({ width: 180, viewportWidth: 390, padTop: 56 });
  check('inspect chip parks under the HUD, not on the tap',
    edge.top >= 56 && edge.left >= 0 && edge.left + 180 <= 390 + 1);
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  const { phoneBlock } = phoneCssParts(css);
  const { beforePhone } = phoneCssParts(css);
  check('phone inspect edge card is in the 480 block only',
    /territory-tooltip--edge/.test(phoneBlock)
    && /max-height:\s*88px/.test(phoneBlock)
    && !/territory-tooltip--edge/.test(beforePhone));
}

console.log('=== V2.70 phone Fit is a regional window (never one chip, never poster) ===');
{
  const fake = [
    { name: 'Germany', isCapital: true, connections: ['Baltic Sea Zone', 'Poland', 'West Europe'], center: [1000, 450] },
    { name: 'Poland', connections: ['Germany', 'Baltic Sea Zone'], center: [1100, 440] },
    { name: 'West Europe', connections: ['Germany', 'West Europe Sea Zone'], center: [900, 480] },
    { name: 'Baltic Sea Zone', isWater: true, connections: ['Germany', 'Poland'], center: [1050, 380] },
    { name: 'West Europe Sea Zone', isWater: true, connections: ['West Europe'], center: [820, 500] },
    { name: 'United Kingdom', isCapital: true, connections: ['North Sea Zone', 'Eire'], center: [200, 340] },
    { name: 'Eire', connections: ['United Kingdom', 'North Sea Zone'], center: [150, 360] },
    { name: 'North Sea Zone', isWater: true, connections: ['United Kingdom', 'Eire'], center: [220, 300] },
    { name: 'India', connections: ['India Sea Zone', 'Burma'], center: [3000, 700] },
    { name: 'Burma', connections: ['India'], center: [3100, 720] },
    { name: 'India Sea Zone', isWater: true, connections: ['India'], center: [2980, 780] },
  ];
  check('owned ≤ 1 seed keeps dests / the name — not an empty chip',
    JSON.stringify(collectPhoneFitFocusNames({
      ownedNames: ['Germany'],
      selectedName: 'Germany',
    })) === JSON.stringify(['Germany'])
    && JSON.stringify(collectPhoneFitFocusNames({
      ownedNames: ['Germany'],
      destinationNames: ['Germany', 'Poland'],
    })) === JSON.stringify(['Germany', 'Poland']));
  const one = resolvePhoneFitRegionNames({
    ownedNames: ['Germany'],
    selectedName: 'Germany',
    territories: fake,
  });
  check('owned ≤ 1 expands to neighbors, including coastline sea',
    one.includes('Germany')
    && one.includes('Poland')
    && one.includes('West Europe')
    && one.includes('Baltic Sea Zone')
    && one.length > 1);
  check('selected chip does not shrink a multi-owned seed',
    JSON.stringify(collectPhoneFitFocusNames({
      ownedNames: ['Germany', 'Poland'],
      selectedName: 'Germany',
    })) === JSON.stringify(['Germany', 'Poland']));
  const worldOwned = ['United Kingdom', 'Eire', 'India', 'Burma'];
  const cluster = pickPhoneFitOwnedCluster(worldOwned, fake);
  check('worldwide owned picks the capital cluster, not India+UK poster',
    cluster.includes('United Kingdom')
    && !cluster.includes('India')
    && !cluster.includes('Burma'));
  const ukRegion = resolvePhoneFitRegionNames({
    ownedNames: worldOwned,
    territories: fake,
  });
  check('worldwide Fit is the UK starting region with coastline, not the poster',
    ukRegion.includes('United Kingdom')
    && ukRegion.includes('North Sea Zone')
    && !ukRegion.includes('India')
    && !ukRegion.includes('Burma'));
  const indiaFight = resolvePhoneFitRegionNames({
    ownedNames: worldOwned,
    selectedName: 'India',
    destinationNames: ['Burma'],
    territories: fake,
  });
  check('worldwide + selected stack frames that region, not the UK poster',
    indiaFight.includes('India')
    && indiaFight.includes('Burma')
    && indiaFight.includes('India Sea Zone')
    && !indiaFight.includes('United Kingdom'));
  const padded = ensurePhoneFitRegionBounds({ minX: 1000, maxX: 1010, minY: 450, maxY: 455 });
  check('tiny bbox is padded to a region, not a one-tile chip',
    padded.maxX - padded.minX >= PHONE_FIT_MIN_REGION_W - 0.01
    && padded.maxY - padded.minY >= PHONE_FIT_MIN_REGION_H - 0.01);
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  const { beforePhone } = phoneCssParts(css);
  check('tablet 481–900 rail is still 280px after V2.70',
    /@media \(max-width: 900px\)[\s\S]*\.player-panel \{\s*width:\s*280px/.test(beforePhone));
  check('unscoped tooltip z-index stays 100 after V2.70',
    /\.territory-tooltip \{[\s\S]*?z-index:\s*100/.test(beforePhone));
}

console.log('=== V2.71 default-first + sticky place; one-tap capital; undo ===');
check('null selection does not sticky-pick another type',
  resolvePhoneStickyUnitType(null, [
    { type: 'infantry', quantity: 3 },
    { type: 'tank', quantity: 1 },
  ]) === null);
check('sticky keeps the selected type while it remains',
  resolvePhoneStickyUnitType('tank', [
    { type: 'infantry', quantity: 3 },
    { type: 'tank', quantity: 2 },
  ]) === 'tank');
check('exhausted type does not convert leftover taps to another type',
  resolvePhoneStickyUnitType('infantry', [
    { type: 'infantry', quantity: 0 },
    { type: 'artillery', quantity: 1 },
  ]) === null);
check('no remaining units → null',
  resolvePhoneStickyUnitType('infantry', []) === null);
check('unknown leftover is not sticky-selected when defs are passed',
  resolvePhoneStickyUnitType(null, [
    { type: 'tacticalBomber', quantity: 1 },
    { type: 'infantry', quantity: 2 },
  ], { infantry: { isLand: true } }) === null);
check('phone capital tap selects only — Confirm is the verb',
  shouldAutoCommitPhoneCapital({
    mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT, tappedIsOwnedLand: true,
  }) === false
  && shouldAutoCommitPhoneCapital({
    mobile: false, phase: GAME_PHASES.CAPITAL_PLACEMENT, tappedIsOwnedLand: true,
  }) === false
  && shouldAutoCommitPhoneCapital({
    mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT, tappedIsOwnedLand: false,
  }) === false);
check('phone setup undo is required for place and last capital',
  shouldShowPhoneSetupUndo({
    mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, canUndoPlacement: true,
  }) === true
  && shouldShowPhoneSetupUndo({
    mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT, canUndoCapital: true,
  }) === true
  && shouldShowPhoneSetupUndo({
    mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT, canUndoCapital: false,
  }) === true
  && shouldShowPhoneSetupUndo({
    mobile: false, phase: GAME_PHASES.UNIT_PLACEMENT, canUndoPlacement: true,
  }) === false);
check('deploy peek hint is pair-aware',
  resolvePhonePeekHint(GAME_PHASES.UNIT_PLACEMENT, null, 'infantry') === 'Tap land, then unit'
  && resolvePhonePeekHint(GAME_PHASES.UNIT_PLACEMENT, null) === 'Tap land, then unit');
check('place-tap still does not inspect (V2.69 split stays)',
  shouldShowPhoneTooltipOnTap({ mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT }) === false
  && shouldInspectPhoneHold({
    mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, heldMs: 500, movedPx: 0,
  }) === true);
{
  const src = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  check('drag-from-chip is not the place verb',
    !/drag-place|peek-drag|chip-drag/.test(src)
    && /shouldAutoCommitPhoneCapital/.test(src)
    && /resolvePhoneStickyUnitType/.test(src));
}

console.log('=== V2.81 iPhone polish holds ===');
check('phone ticker is off — HUD is one phase chip',
  shouldParkPhoneMapTools({ mobile: true }) === true
  && shouldParkPhoneMapTools({ mobile: false }) === false);
check('Place Capital does not expand an empty Units tab bar',
  shouldShowPhoneDetentTabs({
    mobile: true, expanded: true, phase: GAME_PHASES.CAPITAL_PLACEMENT,
  }) === false
  && shouldShowPhoneTrayToggle({
    mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT,
  }) === false
  && shouldShowPhoneDetentTabs({
    mobile: true, expanded: true, phase: GAME_PHASES.UNIT_PLACEMENT,
  }) === false
  && shouldShowPhoneTrayToggle({
    mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT,
  }) === false);
check('desktop still has no phone detent tabs',
  shouldShowPhoneDetentTabs({
    mobile: false, expanded: true, phase: GAME_PHASES.UNIT_PLACEMENT,
  }) === false);
check('phone placement hints say Tap, desktop stay Click',
  phonePointerHint('Click a territory you own to place units', { mobile: true }) === 'Tap a territory you own to place units'
  && phonePointerHint('Click a territory you own to place units', { mobile: false }) === 'Click a territory you own to place units');
{
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  const { phoneBlock } = phoneCssParts(css);
{
  const lobbySrc = readFileSync(join(root, 'src/ui/lobby.js'), 'utf8');
  check('occupant sits on the same roster row',
    /lobby-phone-occupant/.test(lobbySrc)
    && /lobby-phone-faction-meta/.test(lobbySrc)
    && /lobby-phone-pip/.test(lobbySrc));
}
  check('occupant Human/AI select is 44pt on the seated row',
    /\.lobby-phone-occupant \.ai-select\.modern \{[\s\S]*?min-height:\s*44px/.test(phoneBlock));
  check('color is an 8–12pt pip, not a 28pt square',
    /\.lobby-phone-pip \{[\s\S]*?width:\s*10px/.test(phoneBlock));
  check('DEPLOYED chip is not covered by the Units hint',
    /html\.mobile-shell \.phone-tray-body \.pp-budget-bar/.test(phoneBlock)
    && /display:\s*none/.test(phoneBlock.match(/html\.mobile-shell \.phone-tray-body \.pp-budget-bar[\s\S]*?\}/)?.[0] || ''));
  check('seated cards keep the 44pt occupant on the same row',
    /\.lobby-phone-seat \{[\s\S]*?flex-shrink:\s*0/.test(phoneBlock)
    && /\.lobby-phone-occupant \{[\s\S]*?min-height:\s*44px/.test(phoneBlock));
  check('hidden turn-summary overlay cannot steal phone taps',
    /\.turn-summary-overlay\.hidden[\s\S]*?display:\s*none !important[\s\S]*?pointer-events:\s*none !important/.test(phoneBlock)
    || /\.turn-summary-overlay\.hidden[\s\S]*?pointer-events:\s*none !important/.test(css));
  check('Starting IPCs control is a 44pt target',
    /\.lobby-phone-option #starting-ipcs \{[\s\S]*?min-height:\s*44px/.test(phoneBlock)
    || /\.lobby-phone-option \.modern-select[\s\S]*?min-height:\s*44px/.test(phoneBlock));
  check('Teams is a 114×44 labeled control, not a bare checkbox',
    /\.lobby-phone-teams-toggle \{[\s\S]*?min-width:\s*114px[\s\S]*?min-height:\s*44px/.test(phoneBlock)
    && /lobby-phone-teams-toggle/.test(readFileSync(join(root, 'src/ui/lobby.js'), 'utf8')));
  check('Teams toggle sits in the mark→name→meta options row',
    /\.lobby-phone-options \{[\s\S]*?overflow:\s*hidden/.test(phoneBlock)
    && /lobby-phone-teams-name/.test(phoneBlock));
  {
    const lobbySrc = readFileSync(join(root, 'src/ui/lobby.js'), 'utf8');
    const mobileCard = lobbySrc.slice(
      lobbySrc.indexOf('_renderMobileFactionCard(faction'),
      lobbySrc.indexOf('_renderMainMenu() {'),
    );
    const mainRule = phoneBlock.match(/\.lobby-phone-faction-main \{[\s\S]*?\}/)?.[0] || '';
    const logoRule = phoneBlock.match(/\.lobby-phone-faction-logo \{[\s\S]*?\}/)?.[0] || '';
    check('phone seats drop desktop player-card.modern',
      /lobby-phone-faction/.test(mobileCard)
      && !/player-card modern/.test(mobileCard)
      && !/player-avatar/.test(mobileCard)
      && /querySelectorAll\('\.player-card\.modern, \.lobby-phone-faction'\)/.test(lobbySrc));
    check('setup spine is mark → name → occupant/meta on one row',
      /lobby-phone-faction-logo/.test(lobbySrc)
      && /lobby-phone-occupant/.test(mobileCard)
      && /flex-direction:\s*row/.test(mainRule)
      && /flex-wrap:\s*nowrap/.test(mainRule)
      && /justify-content:\s*flex-start/.test(mainRule)
      && /flex:\s*0 0 var\(--phone-mark/.test(logoRule)
      && /margin:\s*0/.test(logoRule));
    check('4/8 rhythm tokens',
      /--phone-mark:\s*44px/.test(phoneBlock)
      && /--phone-inset:\s*16px/.test(phoneBlock)
      && /--phone-row-gap:\s*8px/.test(phoneBlock)
      && /--phone-type-meta:\s*13px/.test(phoneBlock));
    check('390 home verbs have a leading mark',
      /lobby-phone-card-mark/.test(lobbySrc));
  }
  check('Teams label stays off the control',
    /\.lobby-phone-teams \{[\s\S]*?gap:\s*8px/.test(phoneBlock)
    && /\.lobby-phone-teams-name[\s\S]*?white-space:\s*nowrap/.test(phoneBlock));
  check('setup seat gutter is 8 (no 8+8 padding that made a 26px gap)',
    /\.lobby-phone-seat \{[\s\S]*?padding:\s*0/.test(phoneBlock)
    && /\.lobby-phone-factions \{[\s\S]*?gap:\s*8px/.test(phoneBlock)
    && /gap:\s*4px/.test(phoneBlock.match(/\.lobby-phone-faction-main \{[\s\S]*?\}/)?.[0] || ''));
  check('deploy chips wrap inside the 500 frame',
    /\.phone-peek-row \{[\s\S]*?flex-wrap:\s*wrap/.test(phoneBlock)
    && /\.phone-peek-row \{[\s\S]*?overflow-x:\s*hidden/.test(phoneBlock));
  check('in-game labels ellipsize instead of overlapping',
    /\.phone-menu-title \{[\s\S]*?text-overflow:\s*ellipsis/.test(phoneBlock)
    && /\.territory-tooltip \.tt-header[\s\S]*?text-overflow:\s*ellipsis/.test(phoneBlock)
    && /\.combat-title \{[\s\S]*?text-overflow:\s*ellipsis/.test(phoneBlock)
    && /\.phone-peek-pair-hint \{[\s\S]*?text-overflow:\s*ellipsis/.test(phoneBlock));
  check('phone HUD ticker is collapsed',
    /html\.mobile-shell #hud-clarity \{[\s\S]*?display:\s*none/.test(phoneBlock));
  check('phone peek CTA is a row so Confirm is not under Undo',
    /\.pp-tray-peek \.pp-bottom-buttons \{[\s\S]*?flex-direction:\s*row/.test(phoneBlock)
    && /\.pp-undo-ghost/.test(phoneBlock));
  check('empty peek tray does not eat named-land taps',
    /player-panel--peek \.pp-bottom-actions[\s\S]*?pointer-events:\s*none/.test(phoneBlock)
    && /player-panel--peek \.pp-bottom-actions \[data-action\][\s\S]*?pointer-events:\s*auto/.test(phoneBlock));
  check('phone zoom/minimap stay off the art until Map is open',
    /#zoom-controls,\s*#minimap \{\s*display:\s*none/.test(phoneBlock)
    && /html\.mobile-shell\.map-tools-open #zoom-controls/.test(phoneBlock));
  check('deploy peek keeps +/−/Max beside chips, not a covering sheet',
    /\.phone-peek-qty-btn \{[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px/.test(phoneBlock)
    && /html\.mobile-shell #sidebarClose[\s\S]*?display:\s*none/.test(phoneBlock));
  check('circular list puck is not painted on setup, map, or ⋯',
    /vercel-live-feedback/.test(css)
    && /html\.mobile-shell #sidebarClose[\s\S]*?display:\s*none !important/.test(phoneBlock));
  {
    const land = { name: 'Yakut S.S.R.', isWater: false };
    const water = { name: 'SZ 5', isWater: true };
    check('qty stepper waits for a unit+land pair',
      shouldShowPhoneDeployQty({
        mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, unitType: 'tank', territory: land,
      }) === true
      && shouldShowPhoneDeployQty({
        mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, unitType: 'tank', territory: null,
      }) === false
      && shouldShowPhoneDeployQty({
        mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, unitType: null, territory: land,
      }) === false
      && shouldShowPhoneDeployQty({
        mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, unitType: 'transport', territory: water,
      }) === true
      && shouldShowPhoneDeployQty({
        mobile: false, phase: GAME_PHASES.UNIT_PLACEMENT, unitType: 'tank', territory: land,
      }) === false);
    check('named land + icon tap commits that type until it is exhausted',
      shouldAutoStagePhoneDeployPair({
        mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, unitType: 'tank', territory: land,
        queuedForType: 0, canAdd: true,
      }) === true
      && shouldAutoStagePhoneDeployPair({
        mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, unitType: 'tank', territory: land,
        queuedForType: 1, canAdd: true,
      }) === true
      && shouldAutoStagePhoneDeployPair({
        mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, unitType: 'tank', territory: land,
        queuedForType: 3, canAdd: false,
      }) === false
      && shouldIncrementPhonePairIcon({
        hasNamedLand: true, unitType: 'infantry', canAdd: true,
      }) === true
      && shouldIncrementPhonePairIcon({
        hasNamedLand: false, unitType: 'infantry', canAdd: true,
      }) === false
      && shouldCommitPhoneIconTap({
        hasNamedDest: true, unitType: 'bomber', remainingOfType: 1,
      }) === true
      && shouldCommitPhoneIconTap({
        hasNamedDest: true, unitType: 'bomber', remainingOfType: 0,
      }) === false
      && shouldClearPhoneIconAfterExhausted({
        unitType: 'bomber', remainingOfType: 0,
      }) === true
      && remainingEligibleOfType({ available: 1 }) === 1
      && phoneIconCommitCount({ remainingOfType: 1 }) === 1
      && phoneIconCommitCount({ remainingOfType: 1, dumpRemaining: true, slotsRemaining: 6 }) === 1
      && phoneIconCommitCount({ remainingOfType: 4, dumpRemaining: true, slotsRemaining: 6 }) === 4
      && phoneIconCommitCount({ remainingOfType: 0 }) === 0
      && nextStagedCount({ current: 2, available: 5 }) === 3
      && nextStagedCount({ current: 5, available: 5 }) === 5);
  }
  {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const vercel = readFileSync(join(root, 'vercel.json'), 'utf8');
    const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
    check('preview toolbar / comment puck is opted out',
      /name="vercel-toolbar" content="disable"/.test(html)
      && /x-vercel-skip-toolbar/.test(vercel));
    check('Deploy icon path commits immediately; Confirm is not required',
      /_commitPhoneIconDeploy/.test(panelSrc)
      && /shouldHidePhonePairConfirm/.test(panelSrc)
      && /phone-peek-pair-hint/.test(panelSrc)
      && !/label: 'Deploy',\s*disabled: true/.test(panelSrc));
  }
  check('⋯ is a short sheet, not a second lobby',
    /phone-menu-sheet\.open \{[\s\S]*?max-height:\s*52dvh/.test(phoneBlock)
    && /phone-menu-open \.player-panel--peek/.test(phoneBlock)
    && shouldShowPhoneMenuPlayerRoster({ mobile: true }) === false
    && shouldShowPhonePlaceMeta({
      mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, peek: true,
    }) === false
    && shouldShowPhonePlaceMeta({
      mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, peek: false,
    }) === true);
  check('phone body Deploy is hidden so the peek CTA is the on-screen verb',
    /html\.mobile-shell \.pp-placement-actions \{\s*display:\s*none/.test(phoneBlock));
  check('Deploy at 0 is a visible ghost Select units, not a live blue',
    /pp-select-units/.test(phoneBlock));
}
check('inspect≠commit still holds — tap never auto-places capital',
  shouldAutoCommitPhoneCapital({
    mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT, tappedIsOwnedLand: true,
  }) === false);
{
  const land = { name: 'Novosibirsk', isWater: false };
  const cta = resolvePhoneCapitalCta({
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    territory: land,
    isOwnedLand: true,
  });
  check('owned-land peek resolves Place Capital Confirm',
    cta?.action === 'place-capital'
    && cta?.label === 'Place Capital: Novosibirsk'
    && cta?.territory === 'Novosibirsk'
    && cta?.disabled === false);
  check('peeked land name mounts Confirm even if selectedTerritory dropped',
    resolvePhoneCapitalCta({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      landName: 'Novosibirsk',
      isOwnedLand: true,
    })?.label === 'Place Capital: Novosibirsk');
  check('water or missing land does not mount Confirm',
    resolvePhoneCapitalCta({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      territory: { name: 'SZ 5', isWater: true },
      isOwnedLand: true,
    }) === null
    && resolvePhoneCapitalCta({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
    }) === null
    && resolvePhoneCapitalCta({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      territory: land,
    }) === null);
  check('enemy / unowned land never mints Place Capital Confirm',
    resolvePhoneCapitalCta({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      territory: { name: 'Wake Island', isWater: false },
      isOwnedLand: false,
    }) === null
    && resolvePhoneCapitalCta({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      landName: 'Japan',
      isOwnedLand: false,
    }) === null);
  check('Confirm CTA hides the Place Capital hint',
    shouldShowPhoneSetupPeekHint({
      phase: GAME_PHASES.CAPITAL_PLACEMENT, hasPrimaryCta: true,
    }) === false
    && shouldShowPhoneSetupPeekHint({
      phase: GAME_PHASES.CAPITAL_PLACEMENT, hasPrimaryCta: false,
    }) === true);
}
{
  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  check('peek stores the land name and paints the 22d4b13 Confirm tray',
    /_phoneCapitalLandName = capitalLandName/.test(mainSrc)
    && /applyCapitalPlacementPeek/.test(mainSrc)
    && /setSelectedTerritory\(hit\)/.test(mainSrc)
    && /setSelectedTerritory\(selectedTerritory\)/.test(mainSrc)
    && /resolvePhoneCapitalCta\(/.test(panelSrc)
    && /landName: peekName/.test(panelSrc)
    && /shouldIgnorePanelBoxForPhoneCapitalPeek/.test(mainSrc)
    && /document\.addEventListener\('pointerdown'/.test(mainSrc)
    && /camera\.onMouseDown\(e\)/.test(mainSrc)
    && !/_capitalCtaArmed/.test(panelSrc)
    && !/shouldIgnorePhoneSetupCtaAfterPeek/.test(panelSrc));
}
check('Place Capital peek ignores the leftover-tall panel box',
  shouldIgnorePanelBoxForPhoneCapitalPeek({
    mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT,
  }) === true
  && shouldIgnorePanelBoxForPhoneCapitalPeek({
    mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT,
  }) === false
  && shouldIgnorePanelBoxForPhoneCapitalPeek({
    mobile: false, phase: GAME_PHASES.CAPITAL_PLACEMENT,
  }) === false);
{
  const cta = { closest: (sel) => (sel === '[data-action]' ? { dataset: { action: 'place-capital' } } : null) };
  const map = { closest: () => null };
  check('only Confirm / Undo are Place Capital panel hits',
    isPhoneCapitalCtaTarget(cta) === true
    && isPhoneCapitalCtaTarget(map) === false);
}
{
  const deploy = { closest: (sel) => (sel === '[data-action]' ? { dataset: { action: 'confirm-placement' }, closest: () => ({}) } : null) };
  const map = { closest: () => null };
  check('Deploy / tray chrome is not a setup land peek',
    isPhoneTrayChromeTarget(deploy) === true
    && isPhoneTrayChromeTarget(map) === false);
}
{
  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  const peekFn = mainSrc.slice(
    mainSrc.indexOf('const applyPhoneSetupPeekFromPointer'),
    mainSrc.indexOf('// Mouse events'),
  );
  check('setup peek skips Deploy and honors the tray box',
    /isPhoneTrayChromeTarget/.test(peekFn)
    && /containsPoint/.test(peekFn)
    && /_phonePairFrozenAt/.test(peekFn)
    && /shouldBlockMapSelect/.test(peekFn)
    && !/shouldIgnorePanelBoxForPhoneCapitalPeek/.test(peekFn));
  check('thumb Deploy commits the staged land on this pointer',
    /_phoneDeployLandName/.test(panelSrc)
    && /_phoneDeployCommittedAt/.test(panelSrc)
    && /_commitStagedPlacement/.test(panelSrc)
    && /confirm-placement/.test(panelSrc)
    && /player-panel--peek/.test(panelSrc));
}
check('staged land name survives without a queue',
  resolvePhoneDeployLandName({
    stagedLandName: 'Ukraine S.S.R.',
    selectedTerritory: null,
  }) === 'Ukraine S.S.R.'
  && resolvePhoneDeployLandName({
    stagedLandName: 'Ukraine S.S.R.',
    selectedTerritory: { name: 'East Indies', isWater: false },
  }) === 'Ukraine S.S.R.');
check('Confirm names the pair',
  resolvePhoneDeployCtaLabel({
    count: 1, unitType: 'infantry', landName: 'Ukraine S.S.R.',
  }) === 'Deploy 1 infantry to Ukraine S.S.R.');
{
  const { formatUnitName } = await import(pathToFileURL(join(root, 'src/utils/unitNames.js')));
  check('unit ids are human words, never camelCase',
    formatUnitName('tacticalBomber') === 'Tactical bomber'
    && formatUnitName('aaGun') === 'AA Gun'
    && formatUnitName('armour') === 'Tank');
}
{
  const phone = phoneMapStackOffsets(0.4, { mobile: true });
  const desk = phoneMapStackOffsets(0.4, { mobile: false });
  check('phone map chips sit below the territory name',
    phone.unitDy > 25
    && phone.nameDy < 0
    && desk.unitDy === 25
    && desk.nameDy === 0);
}
{
  const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  check('peek hit-test is tray verbs + peek row, not the leftover-tall footer box',
    /\[data-action="confirm-placement"\]/.test(panelSrc)
    && /\[data-action="phone-select-unit"\]/.test(panelSrc)
    && /\.phone-peek-row/.test(panelSrc)
    && /\.phone-peek-pair-hint/.test(panelSrc)
    && /\.pp-peek-cta-row/.test(panelSrc)
    && !/\.pp-bottom-actions, \.pp-seat-chip/.test(panelSrc));
}
{
  const hud = { closest: (sel) => (sel === '#hud' ? {} : null) };
  const sheet = { closest: (sel) => (sel === '.phone-menu-sheet' ? {} : null) };
  const tip = { closest: (sel) => (sel === '#phase-guide' || sel === '.phase-guide-card' ? {} : null) };
  const map = { closest: () => null };
  const zoomBtn = { closest: (sel) => (sel === '#zoom-controls' ? {} : null) };
  check('⋯ / Map / HUD chrome are not setup land peeks',
    isPhoneHudChromeTarget(hud) === true
    && isPhoneHudChromeTarget(sheet) === true
    && isPhoneHudChromeTarget(tip) === true
    && isPhoneHudChromeTarget(map) === false);
  check('Map +/−/Fit chrome is not a land peek',
    isPhoneMapToolsChromeTarget(zoomBtn) === true
    && isPhoneHudChromeTarget(zoomBtn) === true
    && pointHitsPhoneMapToolsChrome(NaN, 0) === false);
  const handoffBtn = { closest: (sel) => (sel === '.handoff-start-btn' || sel === '#handoffScreen' ? {} : null) };
  check('Start Turn overlay is not a land peek',
    isPhoneHandoffChromeTarget(handoffBtn) === true
    && isPhoneHudChromeTarget(handoffBtn) === true
    && pointHitsPhoneHandoffChrome(NaN, 0) === false);
}
{
  const hudSrc = readFileSync(join(root, 'src/ui/hud.js'), 'utf8');
  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  check('header ⋯ opens the short sheet on this pointer',
    /_toggleMenu\(/.test(hudSrc)
    && /data-action="toggle-menu"/.test(hudSrc)
    && /Players/.test(hudSrc)
    && /Territory/.test(hudSrc)
    && /Game Rules/.test(hudSrc)
    && /Save & Exit/.test(hudSrc)
    && /isPhoneHudChromeTarget\(e\.target\)/.test(mainSrc)
    && /if \(!isMobileShell\(\)\) return;/.test(hudSrc));
}
check('phone setup peek does not apply on pointerdown (pan ≠ inspect)',
  shouldApplyPhoneSetupTapOnPointerDown({
    mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT,
  }) === false
  && shouldApplyPhoneSetupTapOnPointerDown({
    mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT,
  }) === false
  && shouldApplyPhoneSetupTapOnPointerDown({
    mobile: false, phase: GAME_PHASES.CAPITAL_PLACEMENT,
  }) === false);
check('phone setup peek commits on tap-up, not on a drag',
  shouldCommitPhoneSetupPeekAfterGesture({
    mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT, movedPx: 0,
  }) === true
  && shouldCommitPhoneSetupPeekAfterGesture({
    mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, movedPx: 4,
  }) === true
  && shouldCommitPhoneSetupPeekAfterGesture({
    mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT, movedPx: PHONE_SETUP_PAN_SLOP_PX,
  }) === false
  && shouldCommitPhoneSetupPeekAfterGesture({
    mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT, movedPx: 40,
  }) === false
  && shouldCommitPhoneSetupPeekAfterGesture({
    mobile: false, phase: GAME_PHASES.CAPITAL_PLACEMENT, movedPx: 0,
  }) === false);
check('first setup miss refits the camera on this pointer',
  shouldRefitPhoneSetupHit({
    mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT, hasHit: false,
  }) === true
  && shouldRefitPhoneSetupHit({
    mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT, hasHit: true,
  }) === false
  && shouldRefitPhoneSetupHit({
    mobile: false, phase: GAME_PHASES.CAPITAL_PLACEMENT, hasHit: false,
  }) === false);
check('phone seats a faction on pointerdown so the leftover click cannot unseat',
  shouldSeatFactionOnPointerDown({ mobile: true }) === true
  && shouldSeatFactionOnPointerDown({ mobile: false }) === false);
check('own-land Place Capital tap applies (peek + Confirm), miss does not clear',
  shouldApplyPhoneSetupLandTap({
    mobile: true,
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    inspected: false,
    tappedIsOwnedLand: true,
    tappedIsLand: true,
    hasHit: true,
  }) === true
  && shouldApplyPhoneSetupLandTap({
    mobile: true,
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    inspected: false,
    tappedIsOwnedLand: false,
    tappedIsLand: false,
    hasHit: false,
  }) === false
  && shouldApplyPhoneSetupLandTap({
    mobile: true,
    phase: GAME_PHASES.UNIT_PLACEMENT,
    inspected: false,
    tappedIsOwnedLand: true,
    hasHit: true,
  }) === true
  && shouldApplyPhoneSetupLandTap({
    mobile: true,
    phase: GAME_PHASES.UNIT_PLACEMENT,
    inspected: false,
    tappedIsOwnedLand: false,
    hasHit: true,
  }) === false);
check('turn summary never covers local Place Capital',
  shouldShowTurnSummary({
    events: [{ type: 'combat' }],
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    isMultiplayer: false,
  }) === false
  && shouldShowTurnSummary({
    events: [{ type: 'combat' }],
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    isMultiplayer: true,
  }) === false
  && shouldShowTurnSummary({
    events: [{ type: 'combat' }],
    phase: GAME_PHASES.PLAYING,
    isMultiplayer: true,
  }) === true);
check('Select units ghost is not the peek Deploy verb',
  shouldShowSelectUnitsCta({
    mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, totalQueued: 0, showDone: false,
  }) === false
  && shouldShowSelectUnitsCta({
    mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, totalQueued: 2, showDone: false,
  }) === false);
check('phone tooltip hides on capital commit',
  shouldHidePhoneTooltipOn({ mobile: true, reason: 'commit' }) === true);
check('AI seat is not YOUR TURN',
  formatAiTurnLine({ name: 'Germans', phase: GAME_PHASES.CAPITAL_PLACEMENT })
    === 'Germans placing capital…'
  && !/YOUR TURN/.test(resolveHudWhoseTurn({
    currentPlayerName: 'Germans',
    currentPlayerIsAI: true,
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
  }).line));
check('native AI option click does not toggle the seated card',
  shouldIgnoreFactionCardToggle({ now: 1000, ignoreUntil: 1000 + LOBBY_SELECT_TOGGLE_GUARD_MS }) === true
  && shouldIgnoreFactionCardToggle({ now: 2000, ignoreUntil: 1000 }) === false
  && shouldIgnoreFactionCardToggle({
    now: 1000,
    ignoreUntil: 1000 + LOBBY_SELECT_TOGGLE_GUARD_MS,
    playerId: 'germans',
    lockedPlayerId: 'ussr',
  }) === false);
{
  if (typeof globalThis.devicePixelRatio !== 'number') globalThis.devicePixelRatio = 1;
  const cam = new Camera({ width: 500, height: 844 });
  cam.usePhoneMinZoom = true;
  cam.zoom = 0.5;
  cam.dirty = false;
  const before = cam.zoom;
  cam.zoomBy('out');
  check('minus-zoom paints on this call, not the next pointer',
    cam.zoom < before && cam.dirty === true);
}

console.log('=== V2.81.17 James lock — one grammar across land+unit phases ===');
{
  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  const { phoneBlock } = phoneCssParts(css);
  const placeCapital = mainSrc.slice(
    mainSrc.indexOf("case 'place-capital'"),
    mainSrc.indexOf("case 'open-purchase'"),
  );
  check('opening legal marks paint without a selected land',
    /setPhoneLegalTerritories\(collectPhoneLegalTerritoryNames/.test(mainSrc)
    && /currentPlayer\?\.color/.test(mainSrc)
    && /renderPhoneLegalHighlights\(ctx, camera\.zoom\)/.test(mainSrc)
    && !/if \(selectedTerritory\)[\s\S]{0,80}renderPhoneLegalHighlights/.test(mainSrc));
  check('setup peek finishes on pointerup after a tap, not pointerdown',
    /finishPhoneSetupGesture/.test(mainSrc)
    && /beginPhoneSetupGesture/.test(mainSrc)
    && /shouldCommitPhoneSetupPeekAfterGesture/.test(mainSrc)
    && /addEventListener\('pointerup'/.test(mainSrc)
    && !/addEventListener\('pointerdown'[\s\S]{0,220}applyPhoneSetupPeekFromPointer/.test(mainSrc));
  check('capital Confirm does not auto-Fit',
    /placeCapital\(capitalLand\)/.test(placeCapital)
    && /resolvePhoneCapitalCommitLand/.test(placeCapital)
    && /checkAI\(\)/.test(placeCapital)
    && !/fitPhoneCamera/.test(placeCapital));
  check('unit-chip pointerdown freezes the named land',
    /_selectPhonePairUnit/.test(panelSrc)
    && /_phonePairFrozenAt/.test(panelSrc)
    && /data-action="phone-select-unit"/.test(panelSrc));
  check('null territory does not wipe a staged land name',
    shouldKeepPhonePairLand({
      incomingTerritory: null, stagedLandName: 'Ukraine S.S.R.',
    }) === true
    && shouldKeepPhonePairLand({
      incomingTerritory: { name: 'Ukraine S.S.R.' }, stagedLandName: 'Ukraine S.S.R.',
    }) === true
    && shouldKeepPhonePairLand({
      incomingTerritory: null, stagedLandName: '',
    }) === false);
  check('Max is in the thumb; pair Max dumps that type now',
    /phone-pair-max/.test(panelSrc)
    && /_applyPhonePairMax/.test(panelSrc)
    && /_commitStagedPlacement/.test(panelSrc)
    && panelSrc.indexOf('_applyPhonePairMax') > 0
    && !/_applyPhonePairMax[\s\S]{0,200}_commitStagedPlacement/.test(
      panelSrc.slice(panelSrc.indexOf('_applyPhonePairMax')),
    ));
  {
    const maxRule = phoneBlock.match(/\.pp-peek-max \{[\s\S]*?\}/)?.[0] || '';
    const confirmRule = phoneBlock.match(/\.pp-peek-primary-slot \.pp-confirm-btn \{[\s\S]*?\}/)?.[0] || '';
    check('Max is a compact secondary; Confirm stays the wide primary',
      /class="pp-peek-max"/.test(panelSrc)
      && !/class="pp-confirm-btn pp-peek-max"/.test(panelSrc)
      && /max-width:\s*56px/.test(maxRule)
      && /flex:\s*0 0 44px/.test(maxRule)
      && /flex:\s*1 1 auto/.test(confirmRule)
      && /width:\s*auto/.test(confirmRule)
      && !/(?<!max-)width:\s*100%/.test(confirmRule));
  }
  check('pair grammar covers deploy / mobilize / attack / fortify',
    shouldUsePhonePairGrammar({
      mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT,
    }) === true
    && shouldUsePhonePairGrammar({
      mobile: true, phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.MOBILIZE,
    }) === true
    && shouldUsePhonePairGrammar({
      mobile: true, phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.COMBAT_MOVE,
    }) === true
    && shouldUsePhonePairGrammar({
      mobile: true, phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.NON_COMBAT_MOVE,
    }) === true
    && shouldUsePhonePairGrammar({
      mobile: true, phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.PURCHASE,
    }) === false
    && shouldUsePhonePairGrammar({
      mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT,
    }) === false);
  check('Max waits for a named land except purchase',
    shouldShowPhonePeekMax({
      mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT,
      hasNamedLand: true, hasUnitType: true,
    }) === true
    && shouldShowPhonePeekMax({
      mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT,
      hasNamedLand: false, hasUnitType: true,
    }) === false
    && shouldShowPhonePeekMax({
      mobile: true, phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.PURCHASE,
      hasNamedLand: false, hasUnitType: true,
    }) === true
    && shouldShowPhonePeekMax({
      mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT,
      hasNamedLand: true, hasUnitType: false,
    }) === false);
  check('mobilize / move share land-then-unit hint; move Confirm is named',
    resolvePhonePeekHint(GAME_PHASES.PLAYING, TURN_PHASES.MOBILIZE, null, {
      territoryName: 'Ukraine S.S.R.',
    }) === 'Tap a unit · Ukraine S.S.R.'
    && resolvePhonePeekHint(GAME_PHASES.PLAYING, TURN_PHASES.MOBILIZE, 'infantry', {
      territoryName: 'Ukraine S.S.R.',
    }) === 'To Ukraine S.S.R.'
    && resolvePhonePeekHint(GAME_PHASES.PLAYING, TURN_PHASES.COMBAT_MOVE, 'infantry', {
      territoryName: 'Ukraine S.S.R.', destName: 'West Russia',
    }) === 'Tap each unit to move · West Russia'
    && /_commitPhoneIconMobilize/.test(panelSrc)
    && /_commitPhoneIconMove/.test(panelSrc)
    && /shouldHidePhonePairConfirm/.test(panelSrc)
    && /shouldStagePhoneMoveIcon/.test(panelSrc));
  check('peek row / hint / CTA accept touch without eating named-land taps',
    /player-panel--peek \.phone-peek-row[\s\S]*?pointer-events:\s*auto/.test(phoneBlock)
    && /player-panel--peek \.phone-peek-pair-hint[\s\S]*?pointer-events:\s*auto/.test(phoneBlock)
    && /player-panel--peek \.pp-peek-cta-row[\s\S]*?pointer-events:\s*auto/.test(phoneBlock)
    && /player-panel--peek \.pp-bottom-actions[\s\S]*?pointer-events:\s*none/.test(phoneBlock));
  check('SCHEMA_VERSION stays 11 after the grammar sweep',
    SCHEMA_VERSION === 11);
}

console.log('=== V2.81.26 capital star / sea dest / Fit dest / pulses ===');
{
  const openingGs = {
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    isCapital: () => true,
    playerState: {},
  };
  const confirmedGs = {
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    isCapital: (n) => n === 'Mongolia',
    playerState: { ussr: { capitalTerritory: 'Mongolia' } },
  };
  check('opening Place Capital draws no capital star even if isCapital leaked',
    shouldDrawPhoneCapitalStar('French Indo China', openingGs) === false
    && shouldDrawPhoneCapitalGlow(openingGs) === false);
  check('Place Capital draws the confirmed star and hides leaked flags',
    shouldDrawPhoneCapitalStar('Mongolia', confirmedGs) === true
    && shouldDrawPhoneCapitalStar('French Indo China', confirmedGs) === false
    && shouldDrawPhoneCapitalGlow(confirmedGs) === false);
  check('Deploy may show a confirmed capital star',
    shouldDrawPhoneCapitalStar('Mongolia', {
      phase: GAME_PHASES.UNIT_PLACEMENT,
      isCapital: (n) => n === 'Mongolia',
    }) === true);
  check('glow may return after both capitals (deploy+)',
    shouldDrawPhoneCapitalGlow({ phase: GAME_PHASES.UNIT_PLACEMENT }) === true);
  check('select / confirm pulses stay on the tile, not chrome bounce',
    PHONE_SELECT_PULSE_MS === 150
    && PHONE_CONFIRM_PULSE_MS === 250);
  const seas = [
    { name: 'Coast', isWater: false, connections: ['Open Sea'] },
    { name: 'Open Sea', isWater: true, connections: ['Coast'] },
    { name: 'Enemy Sea', isWater: true, connections: ['Coast'] },
  ];
  const farSeas = [
    ...seas,
    { name: 'Indian Ocean', isWater: true, connections: [] },
  ];
  check('legal setup sea is any empty/friendly existing ocean',
    isPhoneLegalSetupSeaDest({
      seaName: 'Open Sea',
      playerId: 'ussr',
      territories: farSeas,
      getOwner: (n) => (n === 'Coast' ? 'ussr' : null),
      getUnits: () => [],
    }) === true
    && isPhoneLegalSetupSeaDest({
      seaName: 'Indian Ocean',
      playerId: 'ussr',
      territories: farSeas,
      getOwner: (n) => (n === 'Coast' ? 'ussr' : null),
      getUnits: () => [],
    }) === true
    && isPhoneLegalSetupSeaDest({
      seaName: 'Enemy Sea',
      playerId: 'ussr',
      territories: farSeas,
      getOwner: (n) => (n === 'Coast' ? 'ussr' : null),
      getUnits: () => [{ owner: 'ger' }],
    }) === false
    && isPhoneLegalSetupSeaDest({
      seaName: 'Coast',
      playerId: 'ussr',
      territories: farSeas,
      getOwner: (n) => (n === 'Coast' ? 'ussr' : null),
      getUnits: () => [],
    }) === false);
  check('legal collect is owned land only — not every sea zone',
    collectPhoneLegalTerritoryNames({
      mobile: true,
      phase: GAME_PHASES.UNIT_PLACEMENT,
      playerId: 'ussr',
      territories: farSeas,
      getOwner: (n) => (n === 'Coast' ? 'ussr' : null),
      getUnits: () => [],
    }).join() === 'Coast'
    && collectPhoneLegalTerritoryNames({
      mobile: true,
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      playerId: 'ussr',
      territories: farSeas,
      getOwner: (n) => (n === 'Coast' ? 'ussr' : null),
      getUnits: () => [],
    }).includes('Indian Ocean') === false);
  check('legal collect is owned tiles only — not UK/Spain/Italy/Scandinavia',
    (() => {
      const names = collectPhoneLegalTerritoryNames({
        mobile: true,
        phase: GAME_PHASES.CAPITAL_PLACEMENT,
        playerId: 'ussr',
        territories: [
          { name: 'Ukraine S.S.R.', isWater: false },
          { name: 'United Kingdom', isWater: false },
          { name: 'Spain', isWater: false },
          { name: 'Italy', isWater: false },
          { name: 'Norway', isWater: false },
          { name: 'Sweden', isWater: false },
        ],
        getOwner: (n) => (n === 'Ukraine S.S.R.' ? 'ussr' : n === 'United Kingdom' ? 'uk' : null),
      });
      return names.length === 1
        && names[0] === 'Ukraine S.S.R.'
        && !names.includes('United Kingdom')
        && !names.includes('Spain')
        && !names.includes('Italy')
        && !names.includes('Norway');
    })());
  check('land dest hides sea chips; sea dest hides land-only chips',
    shouldShowPhoneDeployChip({
      destName: 'Ukraine S.S.R.', destIsWater: false,
      unitDef: { isSea: true },
    }) === false
    && shouldShowPhoneDeployChip({
      destName: 'Ukraine S.S.R.', destIsWater: false,
      unitDef: { isLand: true },
    }) === true
    && shouldShowPhoneDeployChip({
      destName: 'Black Sea Zone', destIsWater: true,
      unitDef: { isSea: true },
    }) === true
    && shouldShowPhoneDeployChip({
      destName: 'Black Sea Zone', destIsWater: true,
      unitDef: { isLand: true },
    }) === false
    && shouldShowPhoneDeployChip({
      destName: '', destIsWater: false,
      unitDef: { isSea: true },
    }) === true);
  check('legal sea tap applies on Deploy; unowned land still does not',
    shouldApplyPhoneSetupLandTap({
      mobile: true,
      phase: GAME_PHASES.UNIT_PLACEMENT,
      tappedIsOwnedLand: false,
      tappedIsLegalSea: true,
      hasHit: true,
    }) === true
    && shouldApplyPhoneSetupLandTap({
      mobile: true,
      phase: GAME_PHASES.UNIT_PLACEMENT,
      tappedIsOwnedLand: false,
      tappedIsLegalSea: false,
      hasHit: true,
    }) === false
    && shouldApplyPhoneSetupLandTap({
      mobile: true,
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      tappedIsOwnedLand: false,
      tappedIsLegalSea: true,
      tappedIsLand: false,
      tappedIsWater: true,
      hasHit: true,
    }) === true
    && shouldApplyPhoneSetupLandTap({
      mobile: true,
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      tappedIsOwnedLand: false,
      tappedIsLand: true,
      hasHit: true,
    }) === true);
  check('unwrap pulls the far copy onto the dest seed (no Pacific centroid)',
    Math.abs(unwrapFitX(3000, 200) - (3000 - 3500)) < 0.01
    && Math.abs(unwrapFitX(80, 2800) - (80 + 3500)) < 0.01);
  const worldRussians = [
    { name: 'Ukraine S.S.R.', connections: ['West Russia'], center: [1300, 400] },
    { name: 'West Russia', connections: ['Ukraine S.S.R.'], center: [1400, 380] },
    { name: 'Mongolia', connections: ['Buryatia S.S.R.'], center: [2800, 420] },
    { name: 'Buryatia S.S.R.', connections: ['Mongolia'], center: [2750, 380] },
    { name: 'Alaska', connections: [], center: [80, 280] },
  ];
  const mongolFit = resolvePhoneFitRegionNames({
    ownedNames: ['Ukraine S.S.R.', 'West Russia', 'Mongolia', 'Buryatia S.S.R.', 'Alaska'],
    capitalName: 'Mongolia',
    territories: worldRussians,
  });
  check('worldwide + capital Mongolia frames that cluster, not UK/Pacific',
    mongolFit.includes('Mongolia')
    && mongolFit.includes('Buryatia S.S.R.')
    && !mongolFit.includes('Ukraine S.S.R.')
    && !mongolFit.includes('Alaska'));
  check('phone hides names at world Fit so stacks are the read',
    PHONE_MAP_LABEL_MIN_ZOOM === 0.45
    && shouldHidePhoneMapLabel({ mobile: true, name: 'Germany', zoom: 0.11 }) === true
    && shouldHidePhoneMapLabel({ mobile: true, name: 'Germany', zoom: 0.6 }) === false);
  const rendererSrc = readFileSync(join(root, 'src/map/territoryRenderer.js'), 'utf8');
  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  const placeCapital = mainSrc.slice(
    mainSrc.indexOf("case 'place-capital'"),
    mainSrc.indexOf("case 'open-purchase'"),
  );
  check('renderer gates capital stars and pulses the confirmed tile',
    /shouldDrawPhoneCapitalStar/.test(rendererSrc)
    && /shouldDrawPhoneCapitalGlow/.test(rendererSrc)
    && /setPhoneTilePulse/.test(rendererSrc)
    && /renderPhoneTilePulse/.test(mainSrc)
    && /PHONE_CONFIRM_PULSE_MS/.test(placeCapital)
    && !/fitPhoneCamera/.test(placeCapital));
  check('country outlines take zoom so world Fit is not a 1px hairline',
    /renderTerritoryOutlines\(ctx, zoom/.test(rendererSrc)
    && /renderTerritoryOutlines\(ctx, camera\.zoom\)/.test(mainSrc));
  check('ownership fill seals seams with same-color hairline, not dark Fit strokes',
    /renderOwnershipOverlays\(ctx, zoom/.test(rendererSrc)
    && /renderOwnershipOverlays\(ctx, camera\.zoom\)/.test(mainSrc)
    && /strokeStyle = color/.test(rendererSrc)
    && /phoneOwnershipSeamWidth/.test(rendererSrc));
  check('phone Fit skips baked map tiles so PNG country ink cannot show',
    /flatOcean/.test(readFileSync(join(root, 'src/map/mapRenderer.js'), 'utf8'))
    && /shouldSkipPhoneMapArt/.test(mainSrc)
    && /isPhoneSetupPhase/.test(rendererSrc));
  check('Fit / opening do not stroke a worldwide gold hairline',
    /shouldStrokePhoneLegalHairline/.test(rendererSrc)
    && /PHONE_LEGAL_FILL_RGB/.test(rendererSrc)
    && !/PHONE_LEGAL_EDGE_INK/.test(rendererSrc));
  check('Start Turn / handoff is chrome, not a Place Capital peek',
    /isPhoneHandoffChromeTarget/.test(readFileSync(join(root, 'src/ui/territoryTooltip.js'), 'utf8'))
    && /pointHitsPhoneHandoffChrome/.test(mainSrc)
    && /_phoneCapitalLandName = null/.test(
      mainSrc.slice(mainSrc.indexOf('handoff-hidden'), mainSrc.indexOf('handoff-hidden') + 800),
    ));
  check('user Fit that does not move the camera widens to world',
    shouldWidenPhoneUserFit({
      beforeZoom: 0.32, afterZoom: 0.32, beforeX: 1800, afterX: 1800, beforeY: 900, afterY: 900,
    }) === true
    && shouldWidenPhoneUserFit({
      beforeZoom: 0.32, afterZoom: 0.11, beforeX: 1800, afterX: 1750, beforeY: 900, afterY: 1000,
    }) === false
    && /userTapped: true/.test(mainSrc)
    && /userTapped/.test(readFileSync(join(root, 'src/ui/mobileShell.js'), 'utf8')));
  check('map-tool punch-through is blocked on document-capture peek',
    /pointHitsPhoneMapToolsChrome/.test(mainSrc)
    && /isPhoneMapToolsChromeTarget/.test(readFileSync(join(root, 'src/ui/territoryTooltip.js'), 'utf8')));
  check('Place Capital peek kinds: owned Confirm, enemy/sea inspect, miss ignore',
    resolvePhoneCapitalPeekAction({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      tappedIsOwnedLand: true, tappedIsLand: true, hasHit: true,
      landName: 'Russia', currentPlayerId: 'Russians',
    }) === PHONE_CAPITAL_PEEK_CONFIRM
    && resolvePhoneCapitalPeekAction({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      tappedIsOwnedLand: false, tappedIsLand: true, hasHit: true,
    }) === PHONE_CAPITAL_PEEK_INSPECT
    && resolvePhoneCapitalPeekAction({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      tappedIsWater: true, hasHit: true,
    }) === PHONE_CAPITAL_PEEK_INSPECT
    && resolvePhoneCapitalPeekAction({
      phase: GAME_PHASES.CAPITAL_PLACEMENT, hasHit: false,
    }) === PHONE_CAPITAL_PEEK_IGNORE);
  check('Fit ignores enemy selected and seeds the faction home land',
    phoneHomeTerritoryName('Russians', ['Russia', 'Novosibirsk', 'Soviet Far East']) === 'Russia'
    && phoneFitSelectedName({
      selectedName: 'Wake Island',
      ownedNames: ['Russia', 'Ukraine S.S.R.'],
      capitalName: 'Russia',
    }) === 'Russia'
    && phoneFitSelectedName({
      selectedName: 'Ukraine S.S.R.',
      ownedNames: ['Russia', 'Ukraine S.S.R.'],
    }) === 'Ukraine S.S.R.');
  check('AI placeCapital refits the current human; Confirm does not auto-Fit',
    /action === 'placeCapital' && isMobileShell/.test(mainSrc)
    && !/fitPhoneCamera/.test(placeCapital)
    && /applyPhoneSetupPeekHit/.test(mainSrc)
    && /shouldParkPhoneMapTools/.test(readFileSync(join(root, 'src/ui/mobileShell.js'), 'utf8')));
}

console.log('=== V2.81.33 Skeptic HOLD — inspect, commit, opening, Fit ===');
{
  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  const { phoneBlock } = phoneCssParts(css);
  const placeCapital = mainSrc.slice(
    mainSrc.indexOf("case 'place-capital'"),
    mainSrc.indexOf("case 'open-purchase'"),
  );
  const owner = {
    Russians: ['Russia', 'Novosibirsk', 'Ukraine S.S.R.'],
    Germans: ['Germany', 'Poland'],
  };
  check('inspect selected land never mints Confirm without an owned peek name',
    resolvePhoneCapitalCta({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      territory: { name: 'China', isWater: false },
      landName: null,
      isOwnedLand: false,
    }) === null
    && resolvePhoneCapitalCta({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      territory: { name: 'Novosibirsk', isWater: false },
      isOwnedLand: true,
      landName: null,
      currentPlayerId: 'Russians',
    })?.label === 'Place Capital: Novosibirsk'
    && resolvePhoneCapitalCta({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      landName: null,
      isOwnedLand: true,
    }) === null);
  check('Confirm commit uses peeked/dataset land and never silent-no-ops',
    resolvePhoneCapitalCommitLand({
      dataTerritory: null,
      peekedLandName: 'Novosibirsk',
      selectedName: 'China',
      currentPlayerId: 'Russians',
      getOwner: (n) => (owner.Russians.includes(n) ? 'Russians' : 'Germans'),
    }) === 'Novosibirsk'
    && resolvePhoneCapitalCommitLand({
      dataTerritory: 'China',
      peekedLandName: 'Novosibirsk',
      currentPlayerId: 'Russians',
      getOwner: (n) => (owner.Russians.includes(n) ? 'Russians' : 'Germans'),
    }) === 'Novosibirsk'
    && resolvePhoneCapitalCommitLand({
      dataTerritory: 'Germany',
      peekedLandName: 'Germany',
      currentPlayerId: 'Russians',
      getOwner: (n) => (owner.Russians.includes(n) ? 'Russians' : 'Germans'),
    }) === null
    && /resolvePhoneCapitalCommitLand/.test(placeCapital)
    && /_phoneCapitalLandName = null/.test(placeCapital)
    && /checkAI\(\)/.test(placeCapital)
    && !/fitPhoneCamera/.test(placeCapital)
    && /action === 'place-capital'/.test(panelSrc)
    && /resolvePhoneCapitalCommitLand/.test(panelSrc));
  check('enemy / sea inspect does not toast-stack or leftover-hover Confirm',
    !/Not yours/.test(mainSrc)
    && !/hoverTerritory && !hoverTerritory.isWater/.test(mainSrc)
    && /isPhoneSetupPlacementPhase\(gameState\.phase\)/.test(
      mainSrc.slice(mainSrc.indexOf('alreadyPeeked'), mainSrc.indexOf('alreadyPeeked') + 600),
    )
    && /landName: peekName/.test(panelSrc)
    && /_phoneCapitalLandName = null/.test(mainSrc));
  check('local 1-human + AI seats the human first; MP still shuffles',
    orderRiskSetupSeats([
      { id: 'Germans', isAI: true },
      { id: 'Russians', isAI: false },
    ], { isMultiplayer: false, shuffle: (arr) => arr })[0].id === 'Russians'
    && orderRiskSetupSeats([
      { id: 'Germans', isAI: true },
      { id: 'Russians', isAI: false },
    ], { isMultiplayer: true, shuffle: (arr) => arr })[0].id === 'Germans'
    && /orderRiskSetupSeats/.test(readFileSync(join(root, 'src/state/gameState.js'), 'utf8')));
  check('AI capital has no theatrical delay so Confirm reaches DEPLOY',
    !/_getActionDelay\(\)/.test(
      readFileSync(join(root, 'src/ai/aiController.js'), 'utf8')
        .slice(
          readFileSync(join(root, 'src/ai/aiController.js'), 'utf8').indexOf('_handleCapitalPlacement'),
          readFileSync(join(root, 'src/ai/aiController.js'), 'utf8').indexOf('_handleInitialPlacement'),
        ),
    ));
  check('setup Fit keeps minimap off the art',
    shouldHidePhoneSetupMinimap({
      mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT,
    }) === true
    && shouldHidePhoneSetupMinimap({
      mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT,
    }) === true
    && shouldHidePhoneSetupMinimap({
      mobile: true, phase: GAME_PHASES.PLAYING,
    }) === false
    && /phone-setup\.map-tools-open #minimap/.test(phoneBlock)
    && /setShellFlag\('phone-setup'/.test(readFileSync(join(root, 'src/ui/hud.js'), 'utf8')));
  check('CTA only from owned peek name, never selected inspect land',
    /const peekName = this\._phoneCapitalLandName/.test(panelSrc)
    && !/selectedTerritory && !this\.selectedTerritory\.isWater/.test(
      panelSrc.slice(
        panelSrc.indexOf('else if (phase === GAME_PHASES.CAPITAL_PLACEMENT)'),
        panelSrc.indexOf('else if (phase === GAME_PHASES.CAPITAL_PLACEMENT)') + 500,
      ),
    ));
}

console.log('=== V2.81.34 Fit fills-only + China inspect ===');
{
  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  const rendererSrc = readFileSync(join(root, 'src/map/territoryRenderer.js'), 'utf8');
  check('China / Wake / Germany / Japan are inspect-only even if the deal assigned them',
    isPhoneCapitalInspectOnlyLand('China', 'Russians') === true
    && isPhoneCapitalInspectOnlyLand('Wake Island', 'Russians') === true
    && isPhoneCapitalInspectOnlyLand('Germany', 'Russians') === true
    && isPhoneCapitalInspectOnlyLand('Japan', 'Russians') === true
    && isPhoneCapitalInspectOnlyLand('Germany', 'Germans') === false
    && isPhoneCapitalInspectOnlyLand('Russia', 'Russians') === false
    && resolvePhoneCapitalPeekAction({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      tappedIsOwnedLand: true, tappedIsLand: true, hasHit: true,
      landName: 'China', currentPlayerId: 'Russians',
    }) === PHONE_CAPITAL_PEEK_INSPECT
    && resolvePhoneCapitalCta({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      landName: 'China',
      isOwnedLand: true,
      currentPlayerId: 'Russians',
    }) === null
    && resolvePhoneCapitalCommitLand({
      dataTerritory: 'China',
      peekedLandName: 'China',
      currentPlayerId: 'Russians',
      getOwner: () => 'Russians',
    }) === null
    && resolvePhoneCapitalCta({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      landName: 'Russia',
      isOwnedLand: true,
      currentPlayerId: 'Russians',
    })?.label === 'Place Capital: Russia');
  check('phone setup skips water-mask stroke and sea dashes; keeps land-bridge lanes',
    shouldSkipPhoneWaterMask({ mobile: true, setup: true }) === true
    && shouldSkipPhoneWaterMask({ mobile: true, setup: false }) === false
    && shouldStrokePhoneSeaDashes(0.5, { mobile: true, setup: true }) === false
    && shouldStrokePhoneSeaDashes(0.5, { mobile: true, setup: false }) === true
    && /shouldSkipPhoneWaterMask/.test(mainSrc)
    && /renderCrossWaterConnections/.test(mainSrc)
    && /shouldStrokePhoneSeaDashes/.test(rendererSrc)
    && /LAND_BRIDGES/.test(rendererSrc));
}

console.log('=== V2.81.38 auto-place icon + type cap + Resign ===');
{
  const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  const hudSrc = readFileSync(join(root, 'src/ui/hud.js'), 'utf8');
  const surrenderSrc = readFileSync(join(root, 'src/multiplayer/surrender.js'), 'utf8');
  check('icon tap commits one of that type; leftover exhausted taps clear',
    shouldCommitPhoneIconTap({
      hasNamedDest: true, unitType: 'bomber', remainingOfType: 1,
    }) === true
    && shouldClearPhoneIconAfterExhausted({
      unitType: 'bomber', remainingOfType: 0,
    }) === true
    && phoneIconCommitCount({ remainingOfType: 1, dumpRemaining: false, slotsRemaining: 6 }) === 1
    && phoneIconCommitCount({ remainingOfType: 1, dumpRemaining: true, slotsRemaining: 6 }) === 1
    && remainingEligibleOfType({ available: 1 }) === 1
    && canNamePhoneMoveDest({ hasSource: true, destIsLegal: true }) === true
    && canNamePhoneMoveDest({ hasSource: true, destIsLegal: false }) === false
    && shouldHidePhonePairConfirm({
      mobile: true, pairGrammar: true, phase: GAME_PHASES.UNIT_PLACEMENT,
    }) === true
    && /Land tap names the eligible tile only/.test(panelSrc)
    && /_commitPhoneIconDeploy/.test(panelSrc)
    && /keepPhonePair/.test(panelSrc)
    && /movePendingDest/.test(panelSrc));
  check('Games menu has Resign; all-resign deletes the game doc',
    /data-action="resign"/.test(hudSrc)
    && /Resign/.test(hudSrc)
    && /If no seated humans remain, the game is deleted/.test(hudSrc)
    && /shouldDelete/.test(surrenderSrc)
    && /deleteDoc/.test(surrenderSrc));
}

console.log('=== V2.81.39 all-resign deleteDoc ===');
{
  const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
  check('seated player may deleteDoc a finished game; admin still can',
    /allow delete: if isAdmin\(\)/.test(rules)
    && /resource\.data\.status == 'finished'/.test(rules)
    && /request\.auth\.uid in resource\.data\.playerUserIds/.test(rules));
}

console.log('=== V2.81.40 phone battle odds hero ===');
{
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  const { phoneBlock } = phoneCssParts(css);
  check('phone combat hero is large and first; compact bar stays hidden',
    /\.phone-combat-hero-pct \{[\s\S]*?font-size:\s*40px/.test(phoneBlock)
    && /combat-popup--phone \.probability-bar-compact,/.test(phoneBlock)
    && /combat-popup--phone \.combat-header \{/.test(phoneBlock));
}

console.log('=== V2.81.45 phone combat sheet (no 42dvh clip) ===');
{
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  const { phoneBlock } = phoneCssParts(css);
  const combatRule = phoneBlock.match(/html\.mobile-shell \.combat-popup\.combat-popup--phone \{[^}]+\}/);
  check('phone combat sheet is full-height flex, not a 42dvh clip',
    !!combatRule
    && !/max-height:\s*42dvh/.test(combatRule[0])
    && /overflow:\s*hidden/.test(combatRule[0])
    && /phone-combat-sheet/.test(phoneBlock)
    && /phone-combat-cta/.test(phoneBlock)
    && /safe-area-inset-bottom/.test(phoneBlock)
    && /max-height:\s*500px/.test(phoneBlock));
}

console.log('=== V2.81.36 sea hairline + tech Confirm + mixed-stack select ===');
{
  const rendererSrc = readFileSync(join(root, 'src/map/territoryRenderer.js'), 'utf8');
  const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  check('phone sea hairline is ~1 CSS px, capped, reads on teal',
    phoneSeaOutlineWidth(0.11, { mobile: true, setup: true }) === PHONE_SEA_HAIRLINE_WORLD_MAX
    && phoneSeaOutlineWidth(0.11, { mobile: true, setup: true }) * 0.11 < 1.1
    && Math.abs(phoneSeaOutlineWidth(1, { mobile: true }) - PHONE_SEA_HAIRLINE_CSS_PX) < 1e-9
    && phoneSeaOutlineWidth(0.5, { mobile: false }) === 0
    && PHONE_SEA_HAIRLINE_COLOR === 'rgba(6, 36, 42, 0.55)'
    && /PHONE_SEA_HAIRLINE_COLOR/.test(rendererSrc)
    && /phoneSeaOutlineWidth/.test(rendererSrc)
    && shouldSkipPhoneWaterMask({ mobile: true, setup: true }) === true
    && shouldStrokePhoneSeaDashes(0.11, { mobile: true, setup: true }) === false);
  check('land hairline from 35 is unchanged',
    phoneCountryOutlineWidth(0.11, { mobile: true, setup: true }) === PHONE_COUNTRY_HAIRLINE_WORLD_MAX
    && PHONE_COUNTRY_HAIRLINE_COLOR === 'rgba(0, 0, 0, 0.35)');
  check('tech Max + named Confirm; tap does not spend',
    shouldShowPhonePeekMax({
      mobile: true, phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.DEVELOP_TECH,
    }) === true
    && resolvePhoneTechCta({ diceCount: 0 }) === null
    && resolvePhoneTechCta({ diceCount: 3 })?.label === 'Confirm 3 research dice'
    && resolvePhonePeekHint(GAME_PHASES.PLAYING, TURN_PHASES.DEVELOP_TECH, null, {
      techDiceCount: 3,
    }) === 'Research 3 dice'
    && resolvePhonePeekHint(GAME_PHASES.PLAYING, TURN_PHASES.DEVELOP_TECH) === 'Tap + or Max, then Confirm'
    && /phone-peek-tech-count/.test(panelSrc)
    && !/phone-peek-chip-wide" data-action="roll-tech"/.test(panelSrc));
  check('mixed-stack attack shows types + counts before Confirm',
    formatPhoneMoveSelectionSummary({
      infantry: 4, armour: 2, fighter: 1,
    }) === '4 infantry · 2 tank · 1 fighter'
    && resolvePhoneMoveCta({
      destName: 'West Russia',
      isAttack: true,
      selectedSummary: '4 infantry · 2 tank · 1 fighter',
    })?.label === 'Attack West Russia'
    && resolvePhonePeekHint(GAME_PHASES.PLAYING, TURN_PHASES.COMBAT_MOVE, 'infantry', {
      territoryName: 'Ukraine S.S.R.',
      destName: 'West Russia',
      selectedSummary: '4 infantry · 2 tank',
    }) === 'Ukraine S.S.R. → West Russia · 4 infantry · 2 tank'
    && /pp-move-selected-summary/.test(panelSrc)
    && /remainingEligibleOfType/.test(panelSrc)
    && shouldHidePhonePairConfirm({
      mobile: true, pairGrammar: true, phase: GAME_PHASES.UNIT_PLACEMENT,
    }) === true
    && shouldHidePhonePairConfirm({ mobile: false, pairGrammar: true }) === false);
}

console.log('=== V2.81.35 CSS-px territory hairline + Fit ownership ===');
{
  const rendererSrc = readFileSync(join(root, 'src/map/territoryRenderer.js'), 'utf8');
  check('Fit / world / setup hairline is ~1 CSS px, capped so it cannot stair-step',
    phoneCountryOutlineWidth(0.11, { mobile: true, setup: true }) === PHONE_COUNTRY_HAIRLINE_WORLD_MAX
    && phoneCountryOutlineWidth(0.11, { mobile: true, setup: true })
      * 0.11 < 1.1
    && Math.abs(phoneCountryOutlineWidth(1, { mobile: true }) - PHONE_COUNTRY_HAIRLINE_CSS_PX) < 1e-9
    && PHONE_COUNTRY_HAIRLINE_COLOR === 'rgba(0, 0, 0, 0.35)'
    && /PHONE_COUNTRY_HAIRLINE_COLOR/.test(rendererSrc)
    && shouldStrokePhoneLegalHairline(0.11, { mobile: true }) === false
    && shouldSkipPhoneWaterMask({ mobile: true, setup: true }) === true
    && shouldStrokePhoneSeaDashes(0.11, { mobile: true, setup: true }) === false);
  check('phone Fit still shows stacks and ownership flags',
    shouldHideUnitsAtZoom(0.11, { mobile: true }) === false
    && phoneUnitIconSize(0.11, { mobile: true }) >= 16
    && shouldDrawPhoneOwnershipFlags(0.11, { mobile: true }) === true
    && shouldDrawPhoneOwnershipFlags(0.2, { mobile: false }) === false
    && phoneOwnershipFlagSize(0.11, { mobile: true }) >= 10
    && /shouldDrawPhoneOwnershipFlags/.test(rendererSrc)
    && /phoneOwnershipFlagSize/.test(rendererSrc));
}

console.log('=== V2.81.41 capital Confirm + merged outline seams ===');
{
  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  const rendererSrc = readFileSync(join(root, 'src/map/territoryRenderer.js'), 'utf8');
  const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
  const map = new TerritoryMap(territories);
  const byName = Object.fromEntries(territories.map((t) => [t.name, t]));
  const rawEdgeCount = (polys) => (polys || []).reduce((n, ring) => {
    let c = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (a[0] !== b[0] || a[1] !== b[1]) c += 1;
    }
    return n + c;
  }, 0);
  const peekOwned = applyCapitalPlacementPeek({
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    hit: { name: 'Ukraine S.S.R.', isWater: false },
    currentPlayerId: 'Russians',
    getOwner: () => 'Russians',
  });
  const peekChina = applyCapitalPlacementPeek({
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    hit: { name: 'China', isWater: false },
    currentPlayerId: 'Russians',
    getOwner: () => 'Russians',
  });
  check('desktop/phone owned peek names Confirm; China inspect does not',
    peekOwned.capitalLandName === 'Ukraine S.S.R.'
    && peekOwned.peek === PHONE_CAPITAL_PEEK_CONFIRM
    && peekChina.capitalLandName === null
    && peekChina.peek === PHONE_CAPITAL_PEEK_INSPECT
    && isCapitalPlacementCommitted(true) === true
    && isCapitalPlacementCommitted({ success: false }) === false
    && isCapitalPlacementCommitted(false) === false
    && /isCapitalPlacementCommitted\(gameState\.placeCapital/.test(mainSrc)
    && (mainSrc.match(/applyCapitalPlacementPeek/g) || []).length >= 2);
  check('China stays one territory; merged outline drops the old internal seam',
    !!byName.China && !byName.Sinkiang
    && byName.China.polygons.length >= 2
    && map.hitTest(byName.China.center[0], byName.China.center[1])?.name === 'China'
    && map.hitTest(byName.Manchuria.center[0], byName.Manchuria.center[1])?.name === 'Manchuria'
    && mergedTerritoryOutlineEdges(byName.China.polygons).length
      < rawEdgeCount(byName.China.polygons)
    && /_strokeEdges\(ctx, this\._getExternalEdgesWithTolerance/.test(rendererSrc)
    && !/territoryPolygonLabelAnchors/.test(rendererSrc));
  check('ASE stays one merged Africa land; Libya is not restored',
    !byName.Libya
    && byName['Anglo Sudan Egypt'].polygons.length >= 2
    && map.hitTest(1064, 998)?.name === 'Anglo Sudan Egypt'
    && mergedTerritoryOutlineEdges(byName['Anglo Sudan Egypt'].polygons).length
      < rawEdgeCount(byName['Anglo Sudan Egypt'].polygons));
}

console.log('=== V2.81.42 peek flush + thumb CTA safe-area ===');
{
  const { shouldFlushPeekOnPhaseOrSeatChange, flushPeekState, LOOKS_BROKEN_CONFIRM_COPY } =
    await import(pathToFileURL(join(root, 'src/ui/peekFlush.js')));
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  const { phoneBlock } = phoneCssParts(css);
  check('phase or seat change flushes; first paint does not',
    shouldFlushPeekOnPhaseOrSeatChange({
      prevPhase: 'capital_placement', nextPhase: 'unit_placement',
      prevSeatId: 'p1', nextSeatId: 'p1',
    }) === true
    && shouldFlushPeekOnPhaseOrSeatChange({
      prevPhase: 'capital_placement', nextPhase: 'capital_placement',
      prevSeatId: 'p1', nextSeatId: 'p2',
    }) === true
    && shouldFlushPeekOnPhaseOrSeatChange({}) === false);
  const flushed = flushPeekState({
    hadCapitalPeekName: true, capitalPeekStillLegal: false, hadSelectedTerritory: true,
  });
  check('flush clears peek names and raises the looks-broken bar',
    flushed.phoneCapitalLandName === null
    && flushed.selectedTerritory === null
    && flushed.looksBroken === true
    && flushed.looksBrokenReason === LOOKS_BROKEN_CONFIRM_COPY);
  check('phone chrome query includes landscape short-side ≤640',
    /@media \(max-width:\s*640px\),\s*\(max-height:\s*640px\) and \(max-width:\s*1023px\)/.test(css));
  check('Confirm/Done padding clears home indicator at 390/500',
    /\.pp-tray-peek \{[\s\S]*?calc\(28px \+ env\(safe-area-inset-bottom/.test(phoneBlock)
    && /#sidebar,[\s\S]*?\.player-panel \{[\s\S]*?calc\(28px \+ env\(safe-area-inset-bottom/.test(phoneBlock));
  check('Undo stays a ghost slot beside the primary CTA',
    /\.pp-peek-undo-slot \{[\s\S]*?flex:\s*0 0 auto/.test(phoneBlock)
    && /\.pp-peek-cta-row \{[\s\S]*?flex-direction:\s*row|\.pp-tray-peek \.pp-bottom-buttons \{[\s\S]*?flex-direction:\s*row/.test(phoneBlock));
  check('looks-broken bar is in the phone tray',
    /\.pp-looks-broken-bar \{/.test(phoneBlock));
  const menu = phoneMenuHomeActions();
  const hudSrc = readFileSync(join(root, 'src/ui/hud.js'), 'utf8');
  check('phone ⋯ sheet pins Resign first-viewport, labeled Leave this game',
    isPhoneMenuResignFirst(menu) === true
    && menu[0].label === PHONE_MENU_RESIGN_LABEL
    && menu[0].meta === PHONE_MENU_RESIGN_META
    && /phoneMenuHomeActions/.test(hudSrc)
    && /phone-menu-resign/.test(hudSrc)
    && /phone-menu-first/.test(hudSrc)
    && hudSrc.indexOf('phone-menu-resign') < hudSrc.indexOf('phone-menu-list'));
  check('phone ⋯ Resign stays pinned above the scrolling list',
    /\.phone-menu-home \.phone-menu-resign \{[\s\S]*?flex:\s*0 0 auto/.test(phoneBlock)
    && /\.phone-menu-list \{[\s\S]*?overflow-y:\s*auto/.test(phoneBlock));
}

console.log('=== V2.81.51 combat / fortify purchase-class Confirm ===');
{
  const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  check('Deploy / mobilize still hide Confirm; combat / fortify do not',
    shouldHidePhonePairConfirm({
      mobile: true, pairGrammar: true, phase: GAME_PHASES.UNIT_PLACEMENT,
    }) === true
    && shouldHidePhonePairConfirm({
      mobile: true, pairGrammar: true,
      phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.MOBILIZE,
    }) === true
    && shouldHidePhonePairConfirm({
      mobile: true, pairGrammar: true,
      phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.COMBAT_MOVE,
    }) === false
    && shouldHidePhonePairConfirm({
      mobile: true, pairGrammar: true,
      phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.NON_COMBAT_MOVE,
    }) === false
    && shouldHidePhonePairConfirm({ mobile: false, pairGrammar: true }) === false);
  check('unit taps stage leftover of that type; dest is not required',
    shouldStagePhoneMoveIcon({
      hasSource: true, unitType: 'infantry', remainingOfType: 3,
    }) === true
    && shouldStagePhoneMoveIcon({
      hasSource: true, unitType: 'infantry', remainingOfType: 0,
    }) === false
    && shouldStagePhoneMoveIcon({
      hasSource: false, unitType: 'infantry', remainingOfType: 2,
    }) === false
    && remainingUnstagedOfType({ available: 4, staged: 1 }) === 3
    && remainingUnstagedOfType({ available: 2, staged: 2 }) === 0
    && nextStagedCount({ current: 0, available: 3 }) === 1
    && nextStagedCount({ current: 2, available: 3 }) === 3);
  check('named Confirm is Move to / Attack dest; ghost until units stage',
    resolvePhoneMoveCta({ destName: 'West Russia' })?.label === 'Move to West Russia'
    && resolvePhoneMoveCta({ destName: 'West Russia' })?.selectUnits === true
    && resolvePhoneMoveCta({ destName: 'West Russia' })?.disabled === true
    && resolvePhoneMoveCta({
      destName: 'West Russia',
      selectedSummary: '2 infantry',
    })?.label === 'Move to West Russia'
    && resolvePhoneMoveCta({
      destName: 'West Russia',
      selectedSummary: '2 infantry',
    })?.disabled === false
    && resolvePhoneMoveCta({
      destName: 'West Russia',
      isAttack: true,
      selectedSummary: '2 infantry · 1 tank',
    })?.label === 'Attack West Russia'
    && resolvePhoneMoveCta({}) === null);
  check('phone move icon path stages instead of execute-move',
    /shouldStagePhoneMoveIcon/.test(panelSrc)
    && /remainingUnstagedOfType/.test(panelSrc)
    && /Move to \$\{destName\}/.test(panelSrc)
    && /Attack \$\{destName\}/.test(panelSrc));
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll tablet-chrome checks passed');

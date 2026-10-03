// Game options card. Desktop (≥1024) is a collapsed summary.
// Tablet is one column of 44px controls. Phone is one row that opens a sheet.
// Joiners get the same sheet with the controls disabled.

import {
  DEFAULT_GAME_OPTIONS,
  STARTING_IPC_VALUES,
  DIRECT_TECH_IPC_COST,
  clampMaxPlayers,
  describe,
  draftModeSource,
  maxPlayerChoices,
  normalizeGameOptions,
  PACIFIC_HISTORICAL_SETUP,
  phoneOptionsLabel,
  techAcquisitionLabel,
  territorySetupLabel,
} from '../gameOptions.js';
import { CLASSIC_MAP_ID, getMap, listPickerMaps } from '../map/mapRegistry.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function selectHtml(name, values, selected, { editable, label }) {
  const options = values.map((n) => (
    `<option value="${n}" ${Number(selected) === n ? 'selected' : ''}>${n}</option>`
  )).join('');
  return `<select class="go-control modern-select" data-go="${name}" id="${name === 'startingIPCs' ? 'starting-ipcs' : `go-${name}`}" aria-label="${esc(label)}" ${editable ? '' : 'disabled'}>${options}</select>`;
}

function enumSelect(name, choices, selected, { editable, label, title = '' }) {
  const options = choices.map(([id, text]) => (
    `<option value="${esc(id)}" ${selected === id ? 'selected' : ''}>${esc(text)}</option>`
  )).join('');
  const tip = title ? ` title="${esc(title)}"` : '';
  return `<select class="go-control modern-select" data-go="${name}" id="go-${name}" aria-label="${esc(label)}"${tip} ${editable ? '' : 'disabled'}>${options}</select>`;
}

function armySelect(selected, editable) {
  const choices = [
    ['standard', 'Standard'],
    ['light', 'Light'],
    ['heavy', 'Heavy'],
  ];
  const options = choices.map(([id, name]) => (
    `<option value="${id}" ${selected === id ? 'selected' : ''}>${name}</option>`
  )).join('');
  return `<select class="go-control modern-select" data-go="startingArmy" id="go-starting-army" aria-label="Starting army" title="Light is one third fewer, Heavy one third more" ${editable ? '' : 'disabled'}>${options}</select>`;
}

function toggleHtml(name, on, { editable, onLabel = 'On', offLabel = 'Off', extraClass = '', id = '', pressed = false }) {
  const attr = pressed ? 'aria-pressed' : 'aria-checked';
  const role = pressed ? 'button' : 'switch';
  return `<button type="button" class="go-toggle ${extraClass}" data-go="${name}" ${id ? `id="${id}"` : ''} role="${role}" ${attr}="${on ? 'true' : 'false'}" ${editable ? '' : 'disabled'}>${on ? onLabel : offLabel}</button>`;
}

function stepperHtml(value, editable) {
  return `
    <span class="go-stepper">
      <button type="button" class="go-step" data-go-step="-1" aria-label="Fewer units per round" ${editable ? '' : 'disabled'}>−</button>
      <span class="go-step-value" data-go="unitsPerRound" data-value="${value}">${value}</span>
      <button type="button" class="go-step" data-go-step="1" aria-label="More units per round" ${editable ? '' : 'disabled'}>+</button>
    </span>`;
}

function shownValue(editable, controlHtml, text) {
  if (editable) return controlHtml;
  return `<span class="go-readonly">${esc(text)}</span>`;
}

function mapSelectHtml(mapId, editable) {
  const choices = listPickerMaps();
  const selected = getMap(mapId)?.id || CLASSIC_MAP_ID;
  const options = choices.map((map) => {
    const disabled = map.playable ? '' : ' disabled';
    const label = map.playable ? map.name : `${map.name} (not in this build)`;
    return `<option value="${esc(map.id)}" ${selected === map.id ? 'selected' : ''}${disabled}>${esc(label)}</option>`;
  }).join('');
  return `<select class="go-control modern-select" data-go="mapId" id="go-mapId" aria-label="Map" ${editable ? '' : 'disabled'}>${options}</select>`;
}

function rowsHtml(options, { editable, teamsToggleId, teamsToggleClass, draftMode, seatedCount, mapId }) {
  const o = normalizeGameOptions(options);
  const draft = draftMode || draftModeSource(null);
  const seatCeiling = mapId === 'pacific' ? 5 : undefined;
  const maxChoices = maxPlayerChoices(seatedCount, seatCeiling);
  const maxSelected = clampMaxPlayers(o.maxPlayers, seatedCount, seatCeiling);
  const territoryChoices = [
    ['random', 'Random deal'],
    ['draft', draft.name || 'Draft'],
  ];
  if (mapId === 'pacific') territoryChoices.push([PACIFIC_HISTORICAL_SETUP, 'Pacific 1940 (historical)']);
  const territoryTitle = mapId === 'pacific'
    ? 'Random deal, draft, or the 1940 historical setup.'
    : `${draft.name}: ${draft.description}. Random deal is today's setup.`;
  const techTitle = `Dice tokens cost 5 IPCs and are spent on the roll. Keep tokens until success leaves them in place on a miss and spends them on a breakthrough. Buy directly pays ${DIRECT_TECH_IPC_COST} IPCs for one technology during Purchase, with no dice.`;
  return `
    <div class="go-group">
      <h3 class="go-group-label">Setup</h3>
      <div class="go-row" title="${esc(territoryTitle)}">
        <span class="go-label">Territories</span>
        ${shownValue(editable, enumSelect('territorySetup', territoryChoices, o.territorySetup, { editable, label: 'Territories', title: territoryTitle }), territorySetupLabel(o.territorySetup, draft.name))}
      </div>
      <div class="go-row" title="IPCs each power starts with">
        <span class="go-label" id="go-label-ipcs">Starting IPCs</span>
        ${shownValue(editable, selectHtml('startingIPCs', STARTING_IPC_VALUES, o.startingIPCs, { editable, label: 'Starting IPCs' }), String(o.startingIPCs))}
      </div>
      <div class="go-row" title="How many units each power places in a setup round">
        <span class="go-label">Units per round</span>
        ${shownValue(editable, stepperHtml(o.unitsPerRound, editable), String(o.unitsPerRound))}
      </div>
      <div class="go-row" title="Light is one third fewer starting units. Heavy is one third more.">
        <span class="go-label">Starting army</span>
        ${shownValue(editable, armySelect(o.startingArmy, editable), o.startingArmy === 'light' ? 'Light' : o.startingArmy === 'heavy' ? 'Heavy' : 'Standard')}
      </div>
    </div>
    <div class="go-group">
      <h3 class="go-group-label">Tech</h3>
      <div class="go-row" title="${esc(techTitle)}">
        <span class="go-label">How tech is acquired</span>
        ${shownValue(editable, enumSelect('techAcquisition', [
          ['dice', 'Dice tokens'],
          ['keep', 'Keep tokens until success'],
          ['buy', techAcquisitionLabel('buy')],
        ], o.techAcquisition, { editable, label: 'How tech is acquired', title: techTitle }), techAcquisitionLabel(o.techAcquisition))}
      </div>
      <div class="go-row" title="When on, each 6 is its own breakthrough">
        <span class="go-label">Multiple breakthroughs</span>
        ${shownValue(editable, toggleHtml('multipleTech', o.multipleTech, { editable }), o.multipleTech ? 'On' : 'Off')}
      </div>
    </div>
    <div class="go-group">
      <h3 class="go-group-label">Map</h3>
      <div class="go-row" title="Which board this game uses">
        <span class="go-label">Map</span>
        ${shownValue(editable, mapSelectHtml(mapId, editable), getMap(mapId)?.name || 'Classic')}
      </div>
      <div class="go-row" title="Cross-water land connections such as Alaska to Soviet Far East">
        <span class="go-label">Land bridges</span>
        ${shownValue(editable, toggleHtml('landBridges', o.landBridges, { editable }), o.landBridges ? 'On' : 'Off')}
      </div>
      ${mapId === 'pacific' ? '' : `
      <div class="go-row" title="Classic only. Adds the Pacific land crossings that exist on this map, one step each, the same as Land bridges. Off leaves Classic movement unchanged.">
        <span class="go-label">Extra Pacific bridges</span>
        ${shownValue(editable, toggleHtml('extraPacificBridges', o.extraPacificBridges, { editable }), o.extraPacificBridges ? 'On' : 'Off')}
      </div>`}
    </div>
    <div class="go-group">
      <h3 class="go-group-label">Units</h3>
      <div class="go-row" title="Tactical bombers can be purchased. They attack at 4 when paired with a fighter or tank, and they can land on a carrier.">
        <span class="go-label">Tactical bombers</span>
        ${shownValue(editable, toggleHtml('tacticalBombers', o.tacticalBombers, { editable }), o.tacticalBombers ? 'On' : 'Off')}
      </div>
      <div class="go-row" title="Mechanized infantry can be purchased. Attack 1, or 2 with artillery. Move 2. Blitzes with a tank.">
        <span class="go-label">Mechanized infantry</span>
        ${shownValue(editable, toggleHtml('mechanizedInfantry', o.mechanizedInfantry, { editable }), o.mechanizedInfantry ? 'On' : 'Off')}
      </div>
      <div class="go-row" title="Places one garrison on each power's original capital as soon as that power places the capital. It cannot move or be bought. It defends like infantry and is lost last. If it is missing and the original owner still holds that capital at the end of their turn, it comes back for free.">
        <span class="go-label">Garrisons</span>
        ${shownValue(editable, toggleHtml('garrisons', o.garrisons, { editable }), o.garrisons ? 'On' : 'Off')}
      </div>
    </div>
    <div class="go-group">
      <h3 class="go-group-label">Players</h3>
      <div class="go-row lobby-phone-teams" title="Powers on the same team do not fight">
        <span class="go-label lobby-phone-teams-name">Teams</span>
        ${shownValue(editable, toggleHtml('teams', o.teams, {
          editable,
          extraClass: teamsToggleClass || '',
          id: teamsToggleId || 'teams-enabled',
          pressed: true,
        }), o.teams ? 'On' : 'Off')}
      </div>
      <div class="go-row" title="Seat cap. Default is 5. Classic can seat 7.">
        <span class="go-label">Max players</span>
        ${shownValue(editable, selectHtml('maxPlayers', maxChoices, maxSelected, { editable, label: 'Max players' }), String(maxSelected))}
      </div>
    </div>
    ${editable ? '<button type="button" class="go-reset" data-action="go-reset">Reset to standard</button>' : ''}
  `;
}

export function renderGameOptionsPanel(raw, {
  editable = true,
  open = false,
  sheet = false,
  teamsToggleId = 'teams-enabled',
  teamsToggleClass = 'lobby-phone-teams-toggle',
  draftMode = null,
  seatedCount = 0,
  mapId = CLASSIC_MAP_ID,
  chrome = 'options',
} = {}) {
  const options = normalizeGameOptions(raw);
  const summary = describe(options);
  const phone = phoneOptionsLabel(options);
  const rows = rowsHtml(options, { editable, teamsToggleId, teamsToggleClass, draftMode, seatedCount, mapId });
  if (chrome === 'more') {
    return `
    <section class="go-panel go-panel--more${open ? ' is-open' : ''}" data-game-options="1" data-editable="${editable ? '1' : '0'}" data-kept-extra="${options.extraPacificBridges ? '1' : '0'}">
      <button type="button" class="go-more" data-action="go-toggle" aria-expanded="${open ? 'true' : 'false'}">
        <span>More</span>
        <span class="go-summary-text">${esc(summary)}</span>
      </button>
      ${editable ? '' : '<p class="go-host-note">Set by host</p>'}
      <div class="go-anchor">
        <div class="go-body">
          ${rows}
        </div>
      </div>
    </section>
  `;
  }
  return `
    <section class="go-panel${open ? ' is-open' : ''}${sheet ? ' is-sheet' : ''}" data-game-options="1" data-editable="${editable ? '1' : '0'}" data-kept-extra="${options.extraPacificBridges ? '1' : '0'}">
      <button type="button" class="go-collapsed" data-action="go-toggle" aria-expanded="${open ? 'true' : 'false'}">
        <span>Game options</span>
        <span class="go-dot" aria-hidden="true">·</span>
        <span class="go-summary-text">${esc(summary)}</span>
        <span class="go-dot" aria-hidden="true">·</span>
        <span class="go-customize">${open ? 'Hide' : (editable ? 'Customize' : 'View')}</span>
      </button>
      <button type="button" class="go-phone-launch" data-action="go-open-sheet">
        <span>Game options</span>
        <span class="go-dot" aria-hidden="true">·</span>
        <span class="go-summary-text">${esc(phone)}</span>
        <span class="go-chevron" aria-hidden="true">›</span>
      </button>
      ${editable ? '' : '<p class="go-host-note">Set by host</p>'}
      <div class="go-anchor">
        <div class="go-body">
          ${rows}
        </div>
      </div>
      <div class="go-sheet" ${sheet ? '' : 'hidden'}>
        <div class="go-sheet-card" role="dialog" aria-label="Game options">
          <div class="go-sheet-slot"></div>
          <button type="button" class="go-done" data-action="go-close-sheet">Done</button>
        </div>
      </div>
    </section>
  `;
}

export function readGameOptionsFrom(root) {
  const panel = root?.querySelector?.('[data-game-options]') || root;
  if (!panel) return normalizeGameOptions(null);
  const valueOf = (name) => panel.querySelector(`[data-go="${name}"]`);
  const ipc = valueOf('startingIPCs');
  const army = valueOf('startingArmy');
  const max = valueOf('maxPlayers');
  const per = valueOf('unitsPerRound');
  const flag = (name) => {
    const el = valueOf(name);
    if (!el) return undefined;
    if (el.hasAttribute('aria-pressed')) return el.getAttribute('aria-pressed') === 'true';
    return el.getAttribute('aria-checked') === 'true';
  };
  // Classic shows the switch. Pacific hides it and keeps the stored value
  // so a map change does not turn the Classic option off.
  const keptFlag = (name, dataKey) => {
    const live = flag(name);
    if (live !== undefined) return live;
    const kept = panel?.dataset?.[dataKey];
    if (kept === '1') return true;
    if (kept === '0') return false;
    return undefined;
  };
  return normalizeGameOptions({
    startingIPCs: ipc ? Number(ipc.value) : undefined,
    startingArmy: army ? army.value : undefined,
    maxPlayers: max ? Number(max.value) : undefined,
    unitsPerRound: per ? Number(per.dataset.value || per.textContent) : undefined,
    multipleTech: flag('multipleTech'),
    landBridges: flag('landBridges'),
    teams: flag('teams'),
    tacticalBombers: flag('tacticalBombers'),
    mechanizedInfantry: flag('mechanizedInfantry'),
    extraPacificBridges: keptFlag('extraPacificBridges', 'keptExtra'),
    garrisons: flag('garrisons'),
    territorySetup: valueOf('territorySetup')?.value,
    techAcquisition: valueOf('techAcquisition')?.value,
  });
}

function placeBody(panel) {
  const body = panel.querySelector('.go-body');
  const slot = panel.querySelector('.go-sheet-slot');
  const anchor = panel.querySelector('.go-anchor');
  if (!body || !slot || !anchor) return;
  if (panel.classList.contains('is-sheet')) slot.appendChild(body);
  else anchor.appendChild(body);
}

function paintSummary(panel, options) {
  const summary = describe(options);
  const phone = phoneOptionsLabel(options);
  const collapsed = panel.querySelector('.go-collapsed .go-summary-text');
  const launch = panel.querySelector('.go-phone-launch .go-summary-text');
  const more = panel.querySelector('.go-more .go-summary-text');
  if (collapsed) collapsed.textContent = summary;
  if (launch) launch.textContent = phone;
  if (more) more.textContent = summary;
  const per = panel.querySelector('[data-go="unitsPerRound"]');
  if (per) {
    per.dataset.value = String(options.unitsPerRound);
    per.textContent = String(options.unitsPerRound);
  }
  panel.querySelectorAll('.go-live-mirror').forEach((el) => {
    el.textContent = summary;
  });
}

export function readMapIdFrom(root) {
  const select = root?.querySelector?.('[data-go="mapId"]');
  return select?.value || CLASSIC_MAP_ID;
}

export function bindGameOptions(root, { onChange, onToggle, onMapChange } = {}) {
  const panel = root?.querySelector?.('[data-game-options]');
  if (!panel || panel.dataset.bound === '1') return;
  panel.dataset.bound = '1';
  placeBody(panel);

  const onResize = () => {
    const phone = window.matchMedia('(max-width: 640px)').matches
      || document.documentElement.classList.contains('mobile-shell');
    if (!phone && panel.classList.contains('is-sheet')) {
      panel.classList.remove('is-sheet');
      const sheet = panel.querySelector('.go-sheet');
      if (sheet) sheet.hidden = true;
      placeBody(panel);
    }
  };
  if (root._goResize) window.removeEventListener('resize', root._goResize);
  root._goResize = onResize;
  window.addEventListener('resize', onResize);

  const editable = panel.dataset.editable !== '0';
  const emit = (next) => {
    paintSummary(panel, next);
    if (typeof onChange === 'function') onChange(next);
  };
  const tellToggle = () => {
    if (typeof onToggle === 'function') {
      onToggle({
        open: panel.classList.contains('is-open'),
        sheet: panel.classList.contains('is-sheet'),
      });
    }
  };

  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  panel.addEventListener('click', (e) => {
    const action = e.target?.closest?.('[data-action]')?.dataset?.action;
    if (action === 'go-toggle') {
      e.preventDefault();
      panel.classList.toggle('is-open');
      const expanded = panel.classList.contains('is-open');
      panel.querySelector('.go-collapsed')?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      panel.querySelector('.go-more')?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      const label = panel.querySelector('.go-customize');
      if (label) label.textContent = expanded ? 'Hide' : 'Customize';
      tellToggle();
      return;
    }
    if (action === 'go-open-sheet') {
      e.preventDefault();
      panel.classList.add('is-sheet');
      const sheet = panel.querySelector('.go-sheet');
      if (sheet) sheet.hidden = false;
      placeBody(panel);
      tellToggle();
      return;
    }
    if (action === 'go-close-sheet') {
      e.preventDefault();
      panel.classList.remove('is-sheet');
      const sheet = panel.querySelector('.go-sheet');
      if (sheet) sheet.hidden = true;
      placeBody(panel);
      tellToggle();
      return;
    }
    if (action === 'go-reset') {
      e.preventDefault();
      if (!editable) return;
      const next = normalizeGameOptions(DEFAULT_GAME_OPTIONS);
      const ipc = panel.querySelector('[data-go="startingIPCs"]');
      const army = panel.querySelector('[data-go="startingArmy"]');
      const max = panel.querySelector('[data-go="maxPlayers"]');
      const territories = panel.querySelector('[data-go="territorySetup"]');
      const tech = panel.querySelector('[data-go="techAcquisition"]');
      if (ipc) ipc.value = String(next.startingIPCs);
      if (army) army.value = next.startingArmy;
      if (max) max.value = String(next.maxPlayers);
      if (territories) territories.value = next.territorySetup;
      if (tech) tech.value = next.techAcquisition;
      const mapSelect = panel.querySelector('[data-go="mapId"]');
      if (mapSelect) {
        mapSelect.value = CLASSIC_MAP_ID;
        if (typeof onMapChange === 'function') onMapChange(CLASSIC_MAP_ID);
      }
      for (const name of ['multipleTech', 'landBridges', 'teams', 'tacticalBombers', 'mechanizedInfantry', 'extraPacificBridges', 'garrisons']) {
        const el = panel.querySelector(`[data-go="${name}"]`);
        if (!el) continue;
        const on = !!next[name];
        if (el.hasAttribute('aria-pressed')) el.setAttribute('aria-pressed', on ? 'true' : 'false');
        else el.setAttribute('aria-checked', on ? 'true' : 'false');
        el.textContent = on ? 'On' : 'Off';
      }
      emit(next);
    }
  });

  panel.querySelectorAll('[data-go-step]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!editable) return;
      const current = readGameOptionsFrom(panel);
      const delta = Number(btn.dataset.goStep) || 0;
      const nextValue = current.unitsPerRound + delta;
      if (nextValue < 3 || nextValue > 10) return;
      emit(normalizeGameOptions({ ...current, unitsPerRound: nextValue }));
    });
  });

  panel.querySelectorAll('.go-toggle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!editable) return;
      const name = btn.dataset.go;
      const current = readGameOptionsFrom(panel);
      const on = !current[name];
      if (btn.hasAttribute('aria-pressed')) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      else btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.textContent = on ? 'On' : 'Off';
      emit(normalizeGameOptions({ ...current, [name]: on }));
    });
  });

  panel.querySelectorAll('select[data-go]').forEach((select) => {
    select.addEventListener('change', (e) => {
      e.stopPropagation();
      if (!editable) return;
      if (select.dataset.go === 'mapId') {
        if (typeof onMapChange === 'function') onMapChange(select.value);
        return;
      }
      emit(readGameOptionsFrom(panel));
    });
    select.addEventListener('click', (e) => e.stopPropagation());
    select.addEventListener('pointerdown', (e) => e.stopPropagation());
  });
}

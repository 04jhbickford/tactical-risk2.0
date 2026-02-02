# Tactical Risk - Game Design Specification

## Overview

Tactical Risk is a hybrid board game combining the **economic engine, unit diversity, and combat system of Axis & Allies** with the **territory control and continent bonus mechanics of Risk**. It is built as a web application (HTML/CSS/JavaScript) designed for local play initially, with architecture supporting future online multiplayer.

---

## 1. Platform & Architecture

### Tech Stack
- **Frontend**: HTML5 Canvas (map rendering) + DOM (UI panels), CSS, vanilla JavaScript
- **State Management**: Single `GameState` object, serializable to JSON for save/load
- **Networking (future)**: WebSocket server (Node.js) for multiplayer; client-server model where server is authoritative
- **Local Mode**: All logic runs client-side; hot-seat multiplayer (players take turns on the same machine)

### Project Structure
```
/tactical-risk
  /assets
    /map          -- TripleA tile images (baseTiles, reliefTiles)
    /units        -- Unit sprite icons (per faction color)
    /ui           -- UI icons, buttons, dice sprites
  /data
    territories.json    -- Territory definitions, connections, production values
    continents.json     -- Risk-style continent groupings and bonuses
    units.json          -- Unit type definitions (stats, costs)
    setup.json          -- Default game setup (ownership, unit placements, starting PUs)
  /src
    /core
      gameState.js      -- Central game state object
      turnManager.js    -- Turn phase sequencing
      economy.js        -- Income calculation, purchasing
      combat.js         -- Battle resolution engine
      movement.js       -- Movement validation and execution
    /map
      mapRenderer.js    -- Canvas-based map tile rendering
      territoryMap.js   -- Polygon hit-testing, territory highlighting
      camera.js         -- Pan, zoom, minimap
    /ui
      hud.js            -- Top bar (current player, phase, PUs)
      sidebar.js        -- Territory info panel, unit lists
      purchasePanel.js  -- Unit buying interface
      battleDialog.js   -- Combat resolution display
      setupScreen.js    -- Game setup / lobby
    /net              -- (Future) WebSocket client
    main.js           -- Entry point, game loop
  index.html
  style.css
```

---

## 2. Map & Territories

### 2.1 Map Source
Use the TripleA **World War II Classic** map assets:
- **Base tiles** from `map/baseTiles/` rendered onto an HTML5 Canvas
- **Relief tiles** from `map/reliefTiles/` overlaid for visual depth
- **Map dimensions**: 3500 x 2000 pixels (scrollable/zoomable)
- **Territory polygons** from `map/polygons.txt` for click detection and highlighting
- **Territory centers** from `map/centers.txt` for unit icon and label placement

### 2.2 Territory Data
**70 land territories** and **58 sea zones** (128 total), loaded from the TripleA data.

Each land territory has:
| Field | Description |
|-------|------------|
| `name` | Territory name (e.g., "Germany") |
| `production` | IPC (Industrial Production Certificate) value (0-12) |
| `continent` | Risk-style continent grouping (see 2.3) |
| `connections` | Array of adjacent territory names (land and sea) |
| `isWater` | false |
| `isCapital` | true/false |
| `capitalOf` | Faction name if capital |
| `hasFactory` | true/false (starting state) |
| `originalOwner` | Starting faction |

Each sea zone has:
| Field | Description |
|-------|------------|
| `name` | Sea zone name |
| `connections` | Adjacent sea zones and coastal land territories |
| `isWater` | true |

### 2.3 Risk-Style Continent Groupings & Bonuses

Territories are grouped into continents. Controlling **all** land territories in a continent grants a bonus IPC income per turn (added on top of individual territory production values).

| Continent | Territories | Bonus IPCs |
|-----------|-------------|------------|
| **North America** | East US, West US, East Canada, West Canada, Mexico, Alaska, Cuba, Panama | +10 |
| **South America** | Brazil, Argentina-Chile, Peru, Columbia | +4 |
| **Europe** | United Kingdom, West Europe, Germany, South Europe, East Europe, Eire, Gibraltar, Spain, Sweden, Switzerland, Finland Norway | +8 |
| **Soviet Union** | Russia, Karelia S.S.R., Caucasus, Ukraine S.S.R., Kazakh S.S.R., Novosibirsk, Evenki National Okrug, Yakut S.S.R., Soviet Far East | +7 |
| **Middle East** | Turkey, Syria Jordan, Saudi Arabia, Persia, Afghanistan | +3 |
| **North Africa** | Algeria, Libya, Rio del Oro, French West Africa, Anglo Sudan Egypt | +3 |
| **Sub-Saharan Africa** | French Equatorial Africa, Congo, Angola, Kenya-Rhodesia, Mozambique, South Africa, Italian East Africa, Madagascar | +4 |
| **Central Asia** | Sinkiang, Mongolia, Manchuria, China, Kwangtung | +5 |
| **Southeast Asia & Pacific Islands** | French Indo China, India, Borneo Celebes, East Indies, Philippines, New Guinea, Solomon Islands, Caroline Islands, Okinawa | +6 |
| **Japan & Pacific** | Japan, Hawaiian Islands, Midway, Wake Island, Australia, New Zealand | +5 |

### 2.4 Canals
- **Suez Canal**: Naval movement between East Mediterranean Sea Zone and Red Sea Zone requires control of both Anglo Sudan Egypt and Syria Jordan.
- **Panama Canal**: Naval movement between Caribbean Sea Zone and West Panama Sea Zone requires control of Panama.

---

## 3. Factions & Players

### 3.1 Factions (5)
| Faction | Color (hex) | Alliance | Capital | Starting PUs |
|---------|------------|----------|---------|-------------|
| Russians | #993300 | Allies | Russia | 24 |
| Germans | #9C9C9C | Axis | Germany | 32 |
| British | #996600 | Allies | United Kingdom | 30 |
| Japanese | #FF9900 | Axis | Japan | 25 |
| Americans | #666600 | Allies | East US | 36 |

### 3.2 Player Modes (2-6 players)
- **Classic (5 players)**: Each player controls one faction.
- **Team Mode (2-3 players)**: Players control multiple factions per side (e.g., 1 Axis player controls Germans + Japanese).
- **Free-for-all (2-6)**: Alliances are optional/breakable. Each player picks or is assigned factions.

### 3.3 Turn Order
Russians -> Germans -> British -> Japanese -> Americans (repeating)

---

## 4. Units

### 4.1 Unit Types & Stats

| Unit | Cost | Attack | Defense | Move | Type | Special |
|------|------|--------|---------|------|------|---------|
| Infantry | 3 | 1 | 2 | 1 | Land | +1 attack when paired with Artillery |
| Artillery | 4 | 2 | 2 | 1 | Land | Supports 1 Infantry (+1 attack) |
| Armour (Tank) | 5 | 3 | 2 | 2 | Land | Can blitz through empty territories |
| Fighter | 12 | 3 | 4 | 4 | Air | Must land on friendly territory/carrier after combat move |
| Bomber | 15 | 4 | 1 | 6 | Air | Can perform strategic bombing raids on factories |
| Transport | 8 | 0 | 1 | 2 | Sea | Carries 2 land units (infantry=1 slot, armour/artillery=2 slots, AA gun=2 slots) |
| Submarine | 8 | 2 | 2 | 2 | Sea | First strike; can submerge instead of fighting |
| Destroyer | 12 | 3 | 3 | 2 | Sea | Negates submarine first strike |
| Carrier | 18 | 1 | 3 | 2 | Sea | Carries up to 2 fighters |
| Battleship | 24 | 4 | 4 | 2 | Sea | Shore bombardment during amphibious assaults |
| AA Gun | 5 | 0 | 0 | 1 | Land | Fires at each enemy air unit (1 die per plane, hits on 1); does not participate in regular combat |
| Factory | 15 | - | - | - | Structure | Allows unit placement; produces up to territory IPC value in units per turn |

### 4.2 Unit Transport Rules
- **Transport capacity**: 2 transport cost points
- Infantry/Artillery = 1 transport cost each
- Armour/AA Gun = 2 transport cost each
- Loading happens during combat move or non-combat move
- Unloading into enemy territory = amphibious assault (combat move only)

---

## 5. Turn Phases

Each faction's turn follows this sequence:

### Phase 1: Purchase Units
- Player spends IPCs to buy units from the unit roster
- Purchased units are set aside (placed later in Phase 5)
- Cannot spend more IPCs than currently available

### Phase 2: Combat Move
- Move units into enemy-occupied territories or sea zones
- Air units must have enough remaining movement to return to a friendly territory/carrier
- Tanks may "blitz" through an unoccupied enemy territory (costs 1 movement)
- Naval units may move through friendly sea zones into enemy-occupied ones
- Transports can load units and move toward hostile shores (amphibious assault)

### Phase 3: Combat Resolution
- All battles resolve simultaneously (each contested territory is a separate battle)
- See Section 6 for combat rules

### Phase 4: Non-Combat Move
- Move units that did NOT participate in combat this turn
- Land units in newly captured territories may NOT move again
- Air units that participated in combat must land (this is part of combat move resolution)
- Transports may ferry units between friendly territories

### Phase 5: Place New Units
- Place purchased units in territories with factories you controlled at the **start** of your turn
- Maximum units placed per factory = IPC production value of that territory
- Land/air units placed in the territory; naval units placed in an adjacent sea zone

### Phase 6: Collect Income
- Earn IPCs equal to the sum of:
  - Production values of all controlled territories
  - Continent bonuses for any fully controlled continents (Risk mechanic)
- If your capital is enemy-controlled, you collect 0 income

---

## 6. Combat System

### 6.1 Land Combat
1. **AA Gun Fire** (if defending territory has AA guns): Roll 1 die per attacking air unit. Hit on 1. Casualties removed immediately (attacker chooses which planes are hit).
2. **Attack Round**:
   - Attacker rolls 1 die per unit. Each die that rolls ≤ the unit's attack value = 1 hit.
   - Defender rolls 1 die per unit. Each die that rolls ≤ the unit's defense value = 1 hit.
   - Both sides roll simultaneously.
3. **Assign Casualties**: Each side removes units equal to hits taken. Owner chooses which units to remove (cheapest first is typical but not enforced).
4. **Retreat or Continue**: Attacker may retreat all surviving units to a single adjacent friendly territory, or press the attack. Defender cannot retreat.
5. Repeat rounds 2-4 until one side is eliminated or attacker retreats.
6. **Territory Capture**: If all defenders are eliminated, attacker takes control. Surviving attacking units occupy the territory.

### 6.2 Naval Combat
- Same as land combat but at sea.
- **Submarine first strike**: Submarines roll before other units. Hits are removed before the enemy fires back (unless enemy has a Destroyer, which negates this).
- **Submarine submerge**: Instead of fighting, submarines may choose to submerge (exit combat) before any round.
- Transports are chosen last as casualties and cannot fire.

### 6.3 Amphibious Assault
1. Ships in adjacent sea zone may provide **shore bombardment** (Battleships only): Roll attack dice, hits apply to defenders before land combat begins.
2. Units unload from transports into the contested territory.
3. Land combat proceeds normally.
4. Attacking units in an amphibious assault **cannot retreat**.

### 6.4 Strategic Bombing Raids
- Bombers may target an enemy factory instead of normal combat.
- Defending AA guns fire first (hit on 1 per bomber).
- Surviving bombers each roll 1d6: the total is the number of IPCs the defender loses from their treasury.
- Damage cannot exceed the territory's production value.

---

## 7. Economy

### 7.1 Income Calculation
```
Turn Income = Sum(controlled territory production values) + Sum(continent bonuses)
```

### 7.2 Continent Bonus (Risk Mechanic)
- If a player controls **every land territory** in a continent at the start of their Collect Income phase, they receive the continent's bonus IPCs.
- Continent bonuses stack (controlling multiple continents = multiple bonuses).
- This is the primary Risk mechanic layered on top of the A&A economy.

### 7.3 Capital Capture
- If a player's capital is captured, their treasury (current IPCs) is transferred to the captor.
- The captured faction collects 0 income until their capital is liberated.
- If liberated by an ally, the original owner regains control but starts with 0 IPCs.

### 7.4 Factories
- Units can only be placed in territories with factories.
- Each territory starts with factories as defined in setup data.
- Players may purchase and place new factories (cost: 15 IPCs) on any controlled territory with production value ≥ 1.
- Max 1 factory per territory.
- Factory production limit = territory's IPC production value per turn.

---

## 8. Victory Conditions

### 8.1 Alliance Victory (Team Mode)
- **Axis Victory**: At the end of a full round, Axis controls 2 out of 3 Allied capitals (Russia, United Kingdom, East US) while still holding both Axis capitals (Germany, Japan).
- **Allied Victory**: At the end of a full round, Allies control both Axis capitals (Germany, Japan) while still holding all 3 Allied capitals.

### 8.2 Economic Victory (Optional)
- **Axis**: Control territories with total production ≥ 84 IPCs at end of round.
- **Allies**: Control territories with total production ≥ 140 IPCs at end of round.

### 8.3 Free-for-all Victory
- A player wins by controlling a configurable number of capitals (default: 3 out of 5) at the end of a full round.

---

## 9. Game Modes

| Mode | Players | Description |
|------|---------|-------------|
| **Classic WWII** | 2-5 | Fixed Axis vs Allies setup from the TripleA 3rd Edition data. Standard A&A starting positions. |
| **Draft** | 2-6 | Players draft factions in turn order. Alliances declared before start. |
| **Free-for-all** | 2-6 | No fixed alliances. Temporary alliances allowed but not enforced. Victory by capital control. |

---

## 10. Development Milestones

### Milestone 1: Interactive Map & Navigation
**Goal**: Render the game board with pan/zoom and territory interaction.

**Deliverables**:
- [ ] Load and render TripleA base map tiles on HTML5 Canvas
- [ ] Implement camera controls: click-drag to pan, scroll wheel to zoom
- [ ] Parse `polygons.txt` into territory polygon data
- [ ] Mouse hover: highlight territory under cursor with semi-transparent overlay
- [ ] Mouse click: select territory, display name and basic info in a sidebar panel
- [ ] Parse `centers.txt` for label placement; render territory names on the map
- [ ] Minimap in corner showing viewport position on the full map
- [ ] Color territories by owner (using faction colors from `map.properties`)
- [ ] Render continent boundaries with subtle border styling
- [ ] Responsive layout: map canvas fills viewport, sidebar overlays on the right

**Data files created**:
- `territories.json` (parsed from XML: names, connections, production, water flag)
- `continents.json` (new: continent groupings and bonus values)

---

### Milestone 2: Setup Phase
**Goal**: Configure game settings, assign factions to players, and place initial units.

**Deliverables**:
- [ ] Game lobby screen: choose game mode (Classic / Draft / Free-for-all)
- [ ] Player setup: assign human players to factions (name entry, faction selection)
- [ ] For Classic mode: auto-load starting positions from `setup.json`
- [ ] Parse and display initial unit placements on the map (unit icons at territory centers)
- [ ] Unit stack display: show unit count badges when multiple units in a territory
- [ ] Click territory to see detailed unit breakdown in sidebar
- [ ] Starting IPC display per player in HUD
- [ ] "Start Game" button transitions to turn 1
- [ ] Game state serialization: save/load game to JSON file

**Data files created**:
- `setup.json` (parsed from XML: territory ownership, unit placements, starting PUs)
- `units.json` (unit type definitions with stats and costs)

---

### Milestone 3: Turn Structure & Purchase Phase
**Goal**: Implement the turn cycle and unit purchasing.

**Deliverables**:
- [ ] Turn manager: cycle through factions in order (Russians -> Germans -> British -> Japanese -> Americans)
- [ ] Phase indicator in HUD showing current phase (Purchase / Combat Move / Combat / Non-Combat Move / Place / Collect Income)
- [ ] Purchase panel UI: grid of unit types with cost, current IPC balance, quantity selectors
- [ ] Purchase validation: cannot exceed IPC balance
- [ ] Purchased units shown in a "pending placement" area
- [ ] "End Phase" button to advance to next phase
- [ ] Collect Income phase: calculate territory income + continent bonuses, display breakdown
- [ ] Continent bonus notification when a player controls an entire continent
- [ ] IPC treasury tracking per player across turns
- [ ] Turn counter and round counter in HUD

---

### Milestone 4: Movement Mechanics
**Goal**: Implement combat move and non-combat move phases with full movement rules.

**Deliverables**:
- [ ] Click a friendly territory/sea zone to select units for movement
- [ ] Unit selection UI: choose which units to move from the selected territory
- [ ] Valid destination highlighting: show reachable territories based on unit movement points
- [ ] Path visualization: draw movement path on the map
- [ ] Movement validation rules:
  - Land units: move through connected friendly land territories up to movement value
  - Armour blitz: pass through one empty enemy territory (2 movement)
  - Air units: move up to movement value, must have enough remaining to return to friendly territory/carrier
  - Naval units: move through connected sea zones up to movement value
  - Canal restrictions (Suez, Panama)
- [ ] Transport loading/unloading: select land units, load onto transport, move transport, unload
- [ ] Distinguish combat move (into enemy territory) vs non-combat move (friendly only)
- [ ] Movement history: undo last move within current phase
- [ ] Place units phase: click factory territories to place purchased units (respecting production limits)
- [ ] Non-combat movement for air units returning from combat

---

### Milestone 5: Combat & Battle Resolution
**Goal**: Implement the full combat system including land, naval, amphibious, and strategic bombing.

**Deliverables**:
- [ ] Battle dialog: modal showing attacking and defending forces
- [ ] Dice rolling animation with visual results
- [ ] AA gun pre-combat fire against air units
- [ ] Attack round: simultaneous dice rolls for attacker and defender
- [ ] Casualty selection: player chooses which units to remove (auto-suggest cheapest first)
- [ ] Retreat option for attacker after each round (choose retreat destination)
- [ ] Battle continues until one side eliminated or attacker retreats
- [ ] Territory capture: update ownership, flag change on map
- [ ] Naval combat with submarine first strike and submerge mechanics
- [ ] Destroyer negating submarine first strike
- [ ] Amphibious assault: shore bombardment + land combat (no retreat)
- [ ] Strategic bombing raids: bomber vs AA gun, IPC damage
- [ ] Multiple simultaneous battles: resolve one at a time with player input
- [ ] Combat log: scrollable history of all battle results
- [ ] Victory condition checking at end of each round
- [ ] Capital capture: IPC transfer, income halt
- [ ] Game over screen with winner announcement

---

### Milestone 6: Polish & Multiplayer Prep (Future)
**Goal**: Refine the experience and prepare for online play.

**Deliverables**:
- [ ] Sound effects (dice rolls, combat, purchase, territory capture)
- [ ] Turn summary screen at end of each player's turn
- [ ] AI opponent (basic: random valid moves; advanced: territory value heuristics)
- [ ] WebSocket server for online multiplayer
- [ ] Game room creation and joining
- [ ] Synchronized game state across clients
- [ ] Chat system
- [ ] Spectator mode
- [ ] Fog of war (optional rule: only see units in adjacent territories)

---

## 11. Data Schemas

### territories.json
```json
{
  "territories": [
    {
      "name": "Germany",
      "isWater": false,
      "production": 10,
      "continent": "Europe",
      "connections": ["West Europe", "South Europe", "East Europe", "Switzerland", "Baltic Sea Zone"],
      "isCapital": true,
      "capitalOf": "Germans",
      "hasFactory": true,
      "center": [1072, 509],
      "polygons": [[975,523], [969,473], ...]
    }
  ]
}
```

### continents.json
```json
{
  "continents": [
    {
      "name": "North America",
      "bonus": 10,
      "territories": ["East US", "West US", "East Canada", "West Canada", "Mexico", "Alaska", "Cuba", "Panama"],
      "color": "#2255AA"
    }
  ]
}
```

### units.json
```json
{
  "unitTypes": [
    {
      "id": "infantry",
      "name": "Infantry",
      "cost": 3,
      "attack": 1,
      "defense": 2,
      "movement": 1,
      "type": "land",
      "transportCost": 1,
      "special": ["artillerySupportable"]
    }
  ]
}
```

### setup.json
```json
{
  "factions": [
    {
      "name": "Germans",
      "alliance": "Axis",
      "capital": "Germany",
      "startingPUs": 32,
      "color": "#9C9C9C",
      "territories": ["Germany", "West Europe", "East Europe", ...],
      "units": [
        {"territory": "Germany", "units": {"infantry": 4, "armour": 2, "fighter": 1, "bomber": 1, "factory": 1, "aaGun": 1}},
        ...
      ]
    }
  ],
  "turnOrder": ["Russians", "Germans", "British", "Japanese", "Americans"]
}
```

---

## 12. Key Differences from Source Games

| Feature | Risk | Axis & Allies | Tactical Risk |
|---------|------|--------------|---------------|
| Territory income | None (card trade-in) | IPC per territory | IPC per territory **+ continent bonus** |
| Continent bonuses | Yes (bonus armies) | No | Yes (bonus IPCs) |
| Unit types | 1 (armies) | 12 | 12 (full A&A set) |
| Combat | Attacker/defender dice, simple | Multi-round, unit-specific | Multi-round, unit-specific (A&A style) |
| Economy | None | IPC purchase system | IPC purchase + continent bonuses |
| Factories | N/A | Yes | Yes |
| Naval combat | No | Yes | Yes |
| Air units | No | Yes | Yes |
| Victory | Eliminate all players | Capital capture / economic | Capital capture / economic / configurable |

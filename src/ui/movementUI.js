// Movement UI for selecting and moving units between territories

import { TURN_PHASES } from '../state/gameState.js';
import { getUnitIconPath } from '../utils/unitIcons.js';

export class MovementUI {
  constructor() {
    this.gameState = null;
    this.unitDefs = null;
    this.territoryByName = null;
    this.onMoveComplete = null;
    this.onCancel = null; // Callback when cancel button is pressed
    this.onHighlightTerritory = null; // Callback for hover highlighting

    // Movement state
    this.selectedFrom = null;
    this.selectedUnits = {}; // { unitType: quantity }
    this.selectedCargoUnits = {}; // { transportIndex: { unitType: quantity } } for unloading
    this.selectedShipIds = new Set(); // Track which specific ships are selected to move
    this.unloadMode = false; // True when unloading cargo from transports
    this.shipSelectionMode = false; // True when selecting individual ships to move
    this.loadingTargetShipId = null; // Ship selected to load cargo onto
    this.pendingDestination = null; // Selected destination awaiting confirmation

    // Drag state
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };

    this._create();
  }

  setOnHighlightTerritory(callback) {
    this.onHighlightTerritory = callback;
  }

  _create() {
    // Movement panel (shows when territory selected in movement phase)
    this.el = document.createElement('div');
    this.el.id = 'movementPanel';
    this.el.className = 'movement-panel hidden';
    document.body.appendChild(this.el);

    // Initialize drag functionality
    this._initDrag();
  }

  _initDrag() {
    let startX, startY, startLeft, startTop;

    const onMouseDown = (e) => {
      if (!e.target.classList.contains('mp-drag-handle')) return;

      this.isDragging = true;
      this.el.classList.add('dragging');

      const rect = this.el.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!this.isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      this.el.style.left = `${startLeft + dx}px`;
      this.el.style.top = `${startTop + dy}px`;
      this.el.style.right = 'auto';
      this.el.style.bottom = 'auto';
    };

    const onMouseUp = () => {
      this.isDragging = false;
      this.el.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    this.el.addEventListener('mousedown', onMouseDown);
  }

  setGameState(gameState) {
    this.gameState = gameState;
  }

  setUnitDefs(unitDefs) {
    this.unitDefs = unitDefs;
  }

  setTerritories(territories) {
    this.territoryByName = {};
    for (const t of territories) {
      this.territoryByName[t.name] = t;
    }
  }

  setOnMoveComplete(callback) {
    this.onMoveComplete = callback;
  }

  isMovementPhase() {
    return this.gameState &&
      (this.gameState.turnPhase === TURN_PHASES.COMBAT_MOVE ||
       this.gameState.turnPhase === TURN_PHASES.NON_COMBAT_MOVE);
  }

  // Called when user clicks a territory during movement phase
  selectTerritory(territory) {
    if (!this.isMovementPhase()) return false;

    const player = this.gameState.currentPlayer;
    if (!player) return false;

    // If we have a source selected, this might be a destination
    if (this.selectedFrom) {
      // Check if clicking same territory - deselect
      if (territory.name === this.selectedFrom.name) {
        this.cancel();
        return true;
      }

      // Check if valid destination
      if (this.canMoveTo(territory)) {
        // Set as pending destination (user must click Confirm Move button)
        this.pendingDestination = territory.name;
        this._render();
        return true;
      } else {
        // Try selecting this territory as new source
        if (this._hasMovableUnits(territory)) {
          this.selectSource(territory);
          return true;
        }
      }
    } else {
      // Select as source if we have units there
      if (this._hasMovableUnits(territory)) {
        this.selectSource(territory);
        return true;
      }
    }

    return false;
  }

  _hasMovableUnits(territory) {
    const player = this.gameState.currentPlayer;
    const units = this.gameState.getUnitsAt(territory.name);

    // Check for movable units
    const hasMovable = units.some(u => u.owner === player.id && this._hasRemainingMovement(u) && this._canUnitMove(u.type));
    if (hasMovable) return true;

    // Also check for transports with cargo to unload (for amphibious assaults)
    if (territory.isWater) {
      const transportCargo = this.gameState.getTransportCargo(territory.name, player.id);
      return transportCargo.some(t => t.cargo.length > 0);
    }

    return false;
  }

  _canUnitMove(unitType) {
    const def = this.unitDefs?.[unitType];
    return def && def.movement > 0 && !def.isBuilding;
  }

  // Check if a unit has remaining movement this turn
  _hasRemainingMovement(unit) {
    const def = this.unitDefs?.[unit.type];
    if (!def) return false;

    // Units with moved=true are done moving
    if (unit.moved) return false;

    // For ships (individual or grouped), check movementUsed for multi-hop capability
    if (def.isSea || unit.id) {
      const maxMove = def.movement || 2;
      const used = unit.movementUsed || 0;
      return used < maxMove;
    }

    // For other grouped units, having no moved flag means they can move
    return true;
  }

  selectSource(territory) {
    this.selectedFrom = territory;
    this.selectedUnits = {};
    this.selectedCargoUnits = {};
    this.unloadMode = false;

    // Check if this is a sea zone with transports carrying cargo
    if (territory.isWater) {
      const player = this.gameState.currentPlayer;
      const transportCargo = this.gameState.getTransportCargo(territory.name, player.id);
      const hasCargoToUnload = transportCargo.some(t => t.cargo.length > 0);
      if (hasCargoToUnload) {
        this.unloadMode = true;
      }
    }

    this._render();
    this.el.classList.remove('hidden');
  }

  canMoveTo(territory) {
    if (!this.selectedFrom) return false;

    const player = this.gameState.currentPlayer;
    const toOwner = this.gameState.getOwner(territory.name);
    const isEnemy = toOwner && toOwner !== player.id &&
      !this.gameState.areAllies(player.id, toOwner);
    const isFriendly = toOwner === player.id || this.gameState.areAllies(player.id, toOwner);
    const isCombatMove = this.gameState.turnPhase === TURN_PHASES.COMBAT_MOVE;

    // Non-combat move cannot enter enemy territory
    if (!isCombatMove && isEnemy) {
      return false;
    }

    // Combat move: land units can only move to enemy territory or sea zones (for loading)
    // They cannot move to friendly territories during combat move
    if (isCombatMove && !territory.isWater && isFriendly) {
      // Exception: Allow if moving to load onto transports in adjacent sea zone
      // For now, don't allow friendly land territories during combat move
      return false;
    }

    // Check terrain compatibility based on selected units
    const hasLandSelected = Object.keys(this.selectedUnits).some(type => {
      const def = this.unitDefs[type];
      return def && def.isLand && this.selectedUnits[type] > 0;
    });

    const hasSeaSelected = Object.keys(this.selectedUnits).some(type => {
      const def = this.unitDefs[type];
      return def && def.isSea && this.selectedUnits[type] > 0;
    });

    const hasAirSelected = Object.keys(this.selectedUnits).some(type => {
      const def = this.unitDefs[type];
      return def && def.isAir && this.selectedUnits[type] > 0;
    });

    // Get max movement ranges
    const airMovementRange = this._getMaxAirMovementRange();
    const landMovementRange = this._getMaxLandMovementRange();

    // Check adjacency - use getConnections() to include land bridges
    const connections = this.gameState.getConnections(this.selectedFrom.name);
    const isAdjacent = connections.includes(territory.name);

    // Air units can fly anywhere within their movement range
    if (hasAirSelected && !hasLandSelected && !hasSeaSelected) {
      const canReach = this.gameState.canAirUnitReach(this.selectedFrom.name, territory.name, airMovementRange);
      if (!canReach) return false;

      // Air units can land on water only if there's a carrier with capacity
      // EXCEPTION: During combat move, air can attack enemy sea zones (landing resolved after combat)
      if (territory.isWater) {
        // During combat move, check if there are enemy units to attack
        if (isCombatMove) {
          const seaUnits = this.gameState.getUnitsAt(territory.name);
          const hasEnemy = seaUnits.some(u => {
            if (u.owner === player.id) return false;
            if (this.gameState.areAllies(player.id, u.owner)) return false;
            return true;
          });
          // Can attack enemy sea zones - landing will be resolved after combat
          if (hasEnemy) return true;
        }

        // Non-combat move or no enemies: need a carrier with capacity
        const seaUnits = this.gameState.getUnitsAt(territory.name);
        const carriers = seaUnits.filter(u => u.type === 'carrier' && u.owner === player.id);
        const carrierDef = this.unitDefs.carrier;
        if (!carrierDef) return false;

        // Calculate total capacity
        let capacity = 0;
        for (const carrier of carriers) {
          const currentAircraft = carrier.aircraft || [];
          capacity += Math.max(0, (carrierDef.aircraftCapacity || 2) - currentAircraft.length);
        }

        // Check if selected air units fit on carriers
        const selectedAirCount = Object.entries(this.selectedUnits)
          .filter(([type, qty]) => qty > 0 && this.unitDefs[type]?.isAir && carrierDef.canCarry?.includes(type))
          .reduce((sum, [_, qty]) => sum + qty, 0);

        return capacity >= selectedAirCount;
      }
      return true;
    }

    // Land units with movement > 1 can blitz through friendly territory
    if (hasLandSelected && !hasSeaSelected && landMovementRange > 1) {
      // Allow water destination if there's a transport (for amphibious assault or non-combat)
      if (territory.isWater) {
        if (isAdjacent) {
          return this._canLoadOntoTransport(territory.name, player.id);
        }
        return false;
      }
      return this.gameState.canLandUnitReach(
        this.selectedFrom.name,
        territory.name,
        landMovementRange,
        player.id,
        isCombatMove
      );
    }

    // Sea units with movement > 1 - use multi-hop pathfinding
    const hasOnlySeaSelected = Object.entries(this.selectedUnits).every(([type, qty]) => {
      if (qty <= 0) return true;
      return this.unitDefs[type]?.isSea;
    }) && Object.values(this.selectedUnits).some(q => q > 0);

    if (hasOnlySeaSelected) {
      const seaMovementRange = this._getMaxSeaMovementRange();
      if (!territory.isWater) return false;
      return this.gameState.canSeaUnitReach(
        this.selectedFrom.name,
        territory.name,
        seaMovementRange,
        player.id,
        isCombatMove
      );
    }

    // For basic movement (movement=1 or mixed), require adjacency
    if (!isAdjacent) {
      return false;
    }

    // Land units entering water can load onto transports (both combat and non-combat)
    // Combat move loading is for amphibious assaults
    if (hasLandSelected && territory.isWater) {
      return this._canLoadOntoTransport(territory.name, player.id);
    }

    if (hasSeaSelected && !territory.isWater) return false;

    return true;
  }

  // Check if selected land units can load onto transports in a sea zone
  _canLoadOntoTransport(seaZoneName, playerId) {
    const seaUnits = this.gameState.getUnitsAt(seaZoneName);
    const transports = seaUnits.filter(u => u.type === 'transport' && u.owner === playerId);
    const transportDef = this.unitDefs.transport;
    if (!transportDef) return false;

    // Calculate total capacity
    let capacity = 0;
    for (const transport of transports) {
      const currentCargo = transport.cargo || [];
      // Transport can hold 2 infantry or 1 infantry + 1 other or 1 non-infantry
      const infantryCount = currentCargo.filter(c => c.type === 'infantry').length;
      const otherCount = currentCargo.filter(c => c.type !== 'infantry').length;
      if (otherCount === 0 && infantryCount < 2) {
        capacity += 2 - infantryCount;
      } else if (infantryCount === 1 && otherCount === 0) {
        capacity += 1;
      }
    }

    // Check if any selected land units can be carried
    const selectedLandTypes = Object.entries(this.selectedUnits)
      .filter(([type, qty]) => qty > 0 && this.unitDefs[type]?.isLand)
      .map(([type, qty]) => ({ type, qty }));

    if (selectedLandTypes.length === 0) return false;

    // At least one transport must be able to carry the unit types
    const canCarryAny = selectedLandTypes.some(({ type }) =>
      transportDef.canCarry?.includes(type)
    );

    return canCarryAny && capacity > 0;
  }

  // Get the maximum movement range of selected air units
  _getMaxAirMovementRange() {
    let maxRange = 0;
    for (const [type, qty] of Object.entries(this.selectedUnits)) {
      if (qty <= 0) continue;
      const def = this.unitDefs[type];
      if (def?.isAir && def.movement > maxRange) {
        maxRange = def.movement;
      }
    }
    return maxRange || 4;
  }

  // Get the maximum movement range of selected land units
  _getMaxLandMovementRange() {
    let maxRange = 0;
    for (const [type, qty] of Object.entries(this.selectedUnits)) {
      if (qty <= 0) continue;
      const def = this.unitDefs[type];
      if (def?.isLand && def.movement > maxRange) {
        maxRange = def.movement;
      }
    }
    return maxRange || 1;
  }

  // Get the maximum movement range of selected sea units
  _getMaxSeaMovementRange() {
    let maxRange = 0;
    for (const [type, qty] of Object.entries(this.selectedUnits)) {
      if (qty <= 0) continue;
      const def = this.unitDefs[type];
      if (def?.isSea && def.movement > maxRange) {
        maxRange = def.movement;
      }
    }
    return maxRange || 2;
  }

  getValidDestinations() {
    if (!this.selectedFrom || !this.gameState) return [];

    const player = this.gameState.currentPlayer;
    const isCombatMove = this.gameState.turnPhase === TURN_PHASES.COMBAT_MOVE;
    const isNonCombat = !isCombatMove;

    // Check if specific ships are selected (carriers/transports with cargo)
    const hasShipsSelected = this.selectedShipIds.size > 0;

    // If ships are selected via ID, get destinations for those ships
    if (hasShipsSelected) {
      // Get the minimum remaining movement of selected ships
      const fromUnits = this.gameState.getUnitsAt(this.selectedFrom.name);
      let minRemainingMove = Infinity;

      for (const shipId of this.selectedShipIds) {
        const ship = fromUnits.find(u => u.id === shipId);
        if (ship) {
          const shipDef = this.unitDefs[ship.type];
          const maxMove = shipDef?.movement || 2;
          const movementUsed = ship.movementUsed || 0;
          const remaining = maxMove - movementUsed;
          minRemainingMove = Math.min(minRemainingMove, remaining);
        }
      }

      // Use the minimum remaining movement (all ships must be able to reach destination)
      const maxSeaMovement = minRemainingMove === Infinity ? 2 : minRemainingMove;
      if (maxSeaMovement <= 0) return []; // No movement remaining

      const reachable = this.gameState.getReachableTerritoriesForSea(
        this.selectedFrom.name,
        maxSeaMovement,
        player?.id,
        isCombatMove
      );

      return Array.from(reachable.keys()).filter(destName => {
        const t = this.territoryByName[destName];
        return t?.isWater; // Ships can only move to water
      });
    }

    // Check unit types selected
    const hasOnlyAirSelected = Object.entries(this.selectedUnits).every(([type, qty]) => {
      if (qty <= 0) return true;
      return this.unitDefs[type]?.isAir;
    }) && Object.values(this.selectedUnits).some(q => q > 0);

    const hasLandSelected = Object.entries(this.selectedUnits).some(([type, qty]) => {
      return qty > 0 && this.unitDefs[type]?.isLand;
    });

    const hasSeaSelected = Object.entries(this.selectedUnits).some(([type, qty]) => {
      return qty > 0 && this.unitDefs[type]?.isSea;
    });

    // Pure air movement - show all reachable territories (don't list, highlight on map)
    if (hasOnlyAirSelected) {
      const airMovementRange = this._getMaxAirMovementRange();
      const reachable = this.gameState.getReachableTerritoriesForAir(
        this.selectedFrom.name,
        airMovementRange,
        player?.id,
        isCombatMove
      );

      return Array.from(reachable.keys()).filter(destName => {
        const toOwner = this.gameState.getOwner(destName);
        const isEnemy = toOwner && toOwner !== player.id &&
          !this.gameState.areAllies(player.id, toOwner);
        if (isNonCombat && isEnemy) return false;

        // Check if water - needs carrier with capacity (unless combat move attacking enemies)
        const territory = this.territoryByName[destName];
        if (territory?.isWater) {
          // During combat move, allow attacking enemy sea zones (landing resolved after combat)
          if (isCombatMove) {
            const seaUnits = this.gameState.getUnitsAt(destName);
            const hasEnemyUnits = seaUnits.some(u => {
              if (u.owner === player.id) return false;
              if (this.gameState.areAllies(player.id, u.owner)) return false;
              return true;
            });
            if (hasEnemyUnits) return true;
          }

          // Non-combat or no enemies: need carrier with capacity
          const seaUnits = this.gameState.getUnitsAt(destName);
          const carriers = seaUnits.filter(u => u.type === 'carrier' && u.owner === player.id);
          const carrierDef = this.unitDefs.carrier;
          if (!carrierDef || carriers.length === 0) return false;

          // Calculate capacity
          let capacity = 0;
          for (const carrier of carriers) {
            const currentAircraft = carrier.aircraft || [];
            capacity += Math.max(0, (carrierDef.aircraftCapacity || 2) - currentAircraft.length);
          }

          const selectedAirCount = Object.entries(this.selectedUnits)
            .filter(([type, qty]) => qty > 0 && this.unitDefs[type]?.isAir && carrierDef.canCarry?.includes(type))
            .reduce((sum, [_, qty]) => sum + qty, 0);

          return capacity >= selectedAirCount;
        }
        return true;
      });
    }

    // Land units with movement > 1 (like tanks) - use blitzing pathfinding
    const landMovementRange = this._getMaxLandMovementRange();
    if (hasLandSelected && !hasSeaSelected && landMovementRange > 1) {
      const reachable = this.gameState.getReachableTerritoriesForLand(
        this.selectedFrom.name,
        landMovementRange,
        player?.id,
        isCombatMove
      );

      const landDestinations = Array.from(reachable.keys()).filter(destName => {
        const toOwner = this.gameState.getOwner(destName);
        const isEnemy = toOwner && toOwner !== player.id &&
          !this.gameState.areAllies(player.id, toOwner);
        if (isNonCombat && isEnemy) return false;
        return true;
      });

      // Include adjacent sea zones with transports (for amphibious assault or non-combat)
      const connections = this.gameState.getConnections(this.selectedFrom.name);
      for (const connName of connections) {
        const t = this.territoryByName[connName];
        if (t?.isWater && this._canLoadOntoTransport(connName, player.id)) {
          if (!landDestinations.includes(connName)) {
            landDestinations.push(connName);
          }
        }
      }

      return landDestinations;
    }

    // Sea units with movement > 1 - use multi-hop pathfinding
    const seaMovementRange = this._getMaxSeaMovementRange();
    if (hasSeaSelected && !hasLandSelected && seaMovementRange > 1) {
      const reachable = this.gameState.getReachableTerritoriesForSea(
        this.selectedFrom.name,
        seaMovementRange,
        player?.id,
        isCombatMove
      );

      return Array.from(reachable.keys()).filter(destName => {
        const t = this.territoryByName[destName];
        return t?.isWater; // Sea units can only move to water
      });
    }

    // For basic movement (movement=1 or mixed units), use adjacent connections
    const connections = this.gameState.getConnections(this.selectedFrom.name);

    return connections.filter(connName => {
      const t = this.territoryByName[connName];
      return t && this.canMoveTo(t);
    });
  }

  // Get destinations with enemy flags for highlighting
  getDestinationsWithEnemyFlags() {
    if (!this.selectedFrom || !this.gameState) return { destinations: [], isEnemy: {} };

    const destinations = this.getValidDestinations();
    const player = this.gameState.currentPlayer;
    const isEnemy = {};

    for (const dest of destinations) {
      const owner = this.gameState.getOwner(dest);
      isEnemy[dest] = owner && owner !== player.id && !this.gameState.areAllies(player.id, owner);
    }

    return { destinations, isEnemy };
  }

  hasUnitsSelected() {
    return Object.values(this.selectedUnits).some(q => q > 0) ||
           this.selectedShipIds.size > 0;
  }

  getSelectedSource() {
    return this.selectedFrom;
  }

  _showMoveConfirm(destination) {
    // Execute the move
    const unitsToMove = Object.entries(this.selectedUnits)
      .filter(([_, qty]) => qty > 0)
      .map(([type, quantity]) => ({ type, quantity }));

    // Build options for move
    const options = {};

    // If specific ships are selected, pass their IDs
    if (this.selectedShipIds.size > 0) {
      options.shipIds = Array.from(this.selectedShipIds);
    }

    // If a loading target ship is specified
    if (this.loadingTargetShipId) {
      options.targetShipId = this.loadingTargetShipId;
    }

    // Must have either units or ships selected
    if (unitsToMove.length === 0 && (!options.shipIds || options.shipIds.length === 0)) {
      return;
    }

    const result = this.gameState.moveUnits(
      this.selectedFrom.name,
      destination.name,
      unitsToMove,
      this.unitDefs,
      options
    );

    if (result.success) {
      const moveInfo = {
        from: this.selectedFrom.name,
        to: destination.name,
        units: unitsToMove,
        shipIds: options.shipIds,
        captured: result.captured,
        isAttack: result.isAttack,
      };
      this.cancel();
      if (this.onMoveComplete) {
        this.onMoveComplete(moveInfo);
      }
    } else {
      // Show error
      console.warn('Move failed:', result.error);
    }
  }

  cancel() {
    this.selectedFrom = null;
    this.selectedUnits = {};
    this.selectedCargoUnits = {};
    this.selectedShipIds = new Set();
    this.unloadMode = false;
    this.shipSelectionMode = false;
    this.loadingTargetShipId = null;
    this.pendingDestination = null;
    this.el.classList.add('hidden');
    // Notify main.js to deselect territory
    if (this.onCancel) {
      this.onCancel();
    }
  }

  // Get ships that need individual selection (carriers/transports with cargo)
  _getShipsWithCargo(territory, playerId) {
    if (!this.gameState) return [];
    return this.gameState.getShipsWithCargo(territory, playerId);
  }

  // Check if we need to show ship selection UI
  _needsShipSelection(territory, playerId) {
    const ships = this._getShipsWithCargo(territory, playerId);
    // Need selection if there are multiple ships with cargo
    const shipsWithCargo = ships.filter(s =>
      (s.cargo && s.cargo.length > 0) || (s.aircraft && s.aircraft.length > 0)
    );
    return shipsWithCargo.length > 1;
  }

  // Render ship selection panel
  _renderShipSelection(ships, player) {
    let html = `
      <div class="mp-ship-selection">
        <div class="mp-ship-header">Select Ships to Move</div>
        <div class="mp-ship-desc">Ships with cargo must be selected individually</div>
        <div class="mp-ship-list">
    `;

    ships.forEach((ship, idx) => {
      const imageSrc = getUnitIconPath(ship.type, player.id);
      const isSelected = ship.id ? this.selectedShipIds.has(ship.id) : false;

      // Build cargo description
      let cargoDesc = 'Empty';
      if (ship.type === 'carrier' && ship.aircraft && ship.aircraft.length > 0) {
        const aircraftByType = {};
        ship.aircraft.forEach(a => {
          aircraftByType[a.type] = (aircraftByType[a.type] || 0) + 1;
        });
        cargoDesc = Object.entries(aircraftByType)
          .map(([type, qty]) => `${qty}x ${type}`)
          .join(', ');
      } else if (ship.type === 'transport' && ship.cargo && ship.cargo.length > 0) {
        const cargoByType = {};
        ship.cargo.forEach(c => {
          cargoByType[c.type] = (cargoByType[c.type] || 0) + 1;
        });
        cargoDesc = Object.entries(cargoByType)
          .map(([type, qty]) => `${qty}x ${type}`)
          .join(', ');
      }

      const hasCargo = cargoDesc !== 'Empty';
      // Check remaining movement for ships
      const shipDef = this.unitDefs[ship.type];
      const maxMove = shipDef?.movement || 2;
      const movementUsed = ship.movementUsed || 0;
      const remainingMove = maxMove - movementUsed;
      const canSelect = ship.id && remainingMove > 0;
      const moveStatus = !ship.id ? 'Group' : (remainingMove <= 0 ? 'Moved' : `${remainingMove}/${maxMove} MP`);

      html += `
        <div class="mp-ship-option ${isSelected ? 'selected' : ''} ${!canSelect ? 'disabled' : ''}"
             data-ship-id="${ship.id || ''}"
             data-ship-type="${ship.type}">
          <div class="mp-ship-info">
            ${imageSrc ? `<img src="${imageSrc}" class="mp-ship-icon" alt="${ship.type}">` : ''}
            <span class="mp-ship-name">${ship.type} #${idx + 1}</span>
          </div>
          <div class="mp-ship-cargo ${hasCargo ? 'has-cargo' : ''}">
            ${cargoDesc}
          </div>
          ${canSelect ? `
            <input type="checkbox" class="mp-ship-cb"
                   data-ship-id="${ship.id}"
                   ${isSelected ? 'checked' : ''}>
          ` : `
            <span class="mp-ship-moved">${moveStatus}</span>
          `}
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    return html;
  }

  // Render aircraft on carriers that can be launched during combat move
  _renderCarrierAircraftLaunch(carrierAircraft, player) {
    let html = `
      <div class="mp-carrier-aircraft">
        <div class="mp-carrier-header">Launch Aircraft</div>
        <div class="mp-carrier-desc">Launch aircraft from carriers to attack targets</div>
        <div class="mp-carrier-list">
    `;

    carrierAircraft.forEach((carrier, carrierIdx) => {
      if (carrier.aircraft.length === 0) return;

      const carrierImageSrc = getUnitIconPath('carrier', player.id);

      html += `
        <div class="mp-carrier-item">
          <div class="mp-carrier-label">
            ${carrierImageSrc ? `<img src="${carrierImageSrc}" class="mp-carrier-icon" alt="carrier">` : ''}
            <span>Carrier #${carrierIdx + 1}</span>
            ${carrier.damaged ? '<span class="mp-carrier-damaged">(Damaged)</span>' : ''}
          </div>
          <div class="mp-carrier-aircraft-list">
      `;

      // Group aircraft by type for display
      const aircraftByType = {};
      carrier.aircraft.forEach((ac, acIdx) => {
        const key = ac.type;
        if (!aircraftByType[key]) {
          aircraftByType[key] = { type: ac.type, owner: ac.owner, indices: [] };
        }
        aircraftByType[key].indices.push(acIdx);
      });

      for (const [type, data] of Object.entries(aircraftByType)) {
        const acImageSrc = getUnitIconPath(type, data.owner);
        const count = data.indices.length;

        html += `
          <div class="mp-aircraft-row">
            <div class="mp-aircraft-info">
              ${acImageSrc ? `<img src="${acImageSrc}" class="mp-aircraft-icon" alt="${type}">` : ''}
              <span class="mp-aircraft-name">${type}</span>
              <span class="mp-aircraft-count">×${count}</span>
            </div>
            <div class="mp-aircraft-actions">
              <button class="mp-launch-btn"
                      data-carrier="${carrierIdx}"
                      data-aircraft-type="${type}"
                      data-aircraft-idx="${data.indices[0]}">
                Launch 1
              </button>
              ${count > 1 ? `
                <button class="mp-launch-all-btn"
                        data-carrier="${carrierIdx}"
                        data-aircraft-type="${type}"
                        data-aircraft-indices="${data.indices.join(',')}">
                  All (${count})
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    return html;
  }

  // Render loading target selection (choose which ship to load cargo onto)
  _renderLoadingTargetSelection(destination, unitType, unitQty, player) {
    const ships = this.gameState.getShipsWithCargo(destination, player.id);

    // Calculate capacity for each ship
    const availableShips = ships.map((ship, idx) => {
      let remainingCapacity = 0;
      let cargoDesc = 'Empty';

      if (ship.type === 'transport') {
        const cargo = ship.cargo || [];
        // Transport capacity: 2 slots, infantry=1, others=2
        const used = cargo.reduce((sum, c) => {
          return sum + (c.type === 'infantry' ? 1 : 2);
        }, 0);
        remainingCapacity = 2 - used;

        if (cargo.length > 0) {
          const cargoByType = {};
          cargo.forEach(c => {
            cargoByType[c.type] = (cargoByType[c.type] || 0) + 1;
          });
          cargoDesc = Object.entries(cargoByType)
            .map(([type, qty]) => `${qty}x ${type}`)
            .join(', ');
        }
      } else if (ship.type === 'carrier') {
        const aircraft = ship.aircraft || [];
        remainingCapacity = 2 - aircraft.length;

        if (aircraft.length > 0) {
          const byType = {};
          aircraft.forEach(a => {
            byType[a.type] = (byType[a.type] || 0) + 1;
          });
          cargoDesc = Object.entries(byType)
            .map(([type, qty]) => `${qty}x ${type}`)
            .join(', ');
        }
      }

      return {
        ...ship,
        index: idx,
        remainingCapacity,
        cargoDesc
      };
    }).filter(ship =>
      ship.remainingCapacity > 0 &&
      ((ship.type === 'transport' && this.unitDefs[unitType]?.isLand) ||
       (ship.type === 'carrier' && this.unitDefs[unitType]?.isAir))
    );

    if (availableShips.length <= 1) {
      return ''; // No selection needed, only one option
    }

    let html = `
      <div class="mp-loading-target">
        <div class="mp-loading-header">Load ${unitQty}x ${unitType} onto:</div>
        <div class="mp-loading-list">
    `;

    availableShips.forEach((ship, idx) => {
      const imageSrc = getUnitIconPath(ship.type, player.id);
      const isSelected = this.loadingTargetShipId === ship.id;

      html += `
        <div class="mp-loading-option ${isSelected ? 'selected' : ''}"
             data-ship-id="${ship.id || ''}"
             data-ship-type="${ship.type}">
          <div class="mp-loading-info">
            ${imageSrc ? `<img src="${imageSrc}" class="mp-loading-icon" alt="${ship.type}">` : ''}
            <span class="mp-loading-name">${ship.type} #${idx + 1}</span>
          </div>
          <div class="mp-loading-capacity">
            Capacity: ${ship.remainingCapacity}
          </div>
          <div class="mp-loading-cargo">
            ${ship.cargoDesc}
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    return html;
  }

  // Render cargo unload UI for amphibious assaults
  _renderCargoUnloadUI(player, isCombatMove, canUndo) {
    const transportCargo = this.gameState.getTransportCargo(this.selectedFrom.name, player.id);
    const phaseLabel = isCombatMove ? 'Amphibious Assault' : 'Unload Units';

    let html = `
      <div class="mp-drag-handle"></div>
      <div class="mp-header">
        <div class="mp-title">${phaseLabel}</div>
        <div class="mp-phase">${isCombatMove ? 'Combat Move' : 'Non-Combat Move (Fortify)'}</div>
      </div>

      <div class="mp-from">
        <span class="mp-label">From:</span>
        <span class="mp-territory">${this.selectedFrom.name}</span>
      </div>

      <div class="mp-cargo-section">
        <div class="mp-cargo-header">Transport Cargo</div>
    `;

    // Show each transport and its cargo
    let totalCargoSelected = 0;
    for (const transport of transportCargo) {
      if (transport.cargo.length === 0) continue;

      html += `<div class="mp-transport" data-transport="${transport.index}">`;
      html += `<div class="mp-transport-label">Transport ${transport.index + 1}</div>`;

      // Group cargo by type
      const cargoByType = {};
      for (const c of transport.cargo) {
        cargoByType[c.type] = (cargoByType[c.type] || 0) + 1;
      }

      for (const [unitType, qty] of Object.entries(cargoByType)) {
        const def = this.unitDefs[unitType];
        const imageSrc = player ? getUnitIconPath(unitType, player.id) : null;
        const selected = this.selectedCargoUnits[transport.index]?.[unitType] || 0;
        totalCargoSelected += selected;

        html += `
          <div class="mp-cargo-unit">
            <div class="mp-unit-info">
              ${imageSrc ? `<img src="${imageSrc}" class="mp-unit-icon" alt="${unitType}">` : ''}
              <span class="mp-unit-name">${unitType}</span>
              <span class="mp-unit-avail">(${qty})</span>
            </div>
            <div class="mp-unit-select">
              <button class="mp-cargo-btn" data-transport="${transport.index}" data-unit="${unitType}" data-delta="-1">−</button>
              <span class="mp-qty">${selected}</span>
              <button class="mp-cargo-btn" data-transport="${transport.index}" data-unit="${unitType}" data-delta="1">+</button>
              <button class="mp-cargo-all-btn" data-transport="${transport.index}" data-unit="${unitType}" data-qty="${qty}">All</button>
            </div>
          </div>
        `;
      }
      html += `</div>`;
    }

    html += `</div>`;

    // Show valid coastal destinations
    const coastalDestinations = this._getCoastalDestinations(isCombatMove);

    if (totalCargoSelected > 0 && coastalDestinations.length > 0) {
      html += `
        <div class="mp-destinations">
          <span class="mp-label">${isCombatMove ? 'Assault:' : 'Unload to:'}</span>
          <select class="mp-dest-select" data-action="unload-dest">
            <option value="">-- Select destination --</option>
            ${coastalDestinations.map(dest => {
              const owner = this.gameState.getOwner(dest);
              const isEnemy = owner && owner !== player.id && !this.gameState.areAllies(player.id, owner);
              return `<option value="${dest}" data-territory="${dest}" class="${isEnemy ? 'enemy' : ''}">${dest}${isEnemy ? ' (Enemy)' : ''}</option>`;
            }).join('')}
          </select>
        </div>
      `;
    } else if (totalCargoSelected > 0) {
      html += `<div class="mp-no-dest">No valid destinations</div>`;
    }

    // Switch to normal movement if there are also movable ships
    const units = this.gameState.getUnitsAt(this.selectedFrom.name);
    const movableShips = units.filter(u =>
      u.owner === player.id && this._hasRemainingMovement(u) && this._canUnitMove(u.type) && this.unitDefs[u.type]?.isSea
    );

    if (movableShips.length > 0) {
      html += `
        <div class="mp-mode-switch">
          <button class="mp-switch-btn" data-action="switch-to-move">Move Ships Instead</button>
        </div>
      `;
    }

    html += `
      <div class="mp-actions">
        ${canUndo ? `<button class="mp-undo-btn">Undo Last Move</button>` : ''}
        <button class="mp-cancel-btn">Cancel</button>
      </div>
    `;

    this.el.innerHTML = html;
    this._bindCargoEvents();
  }

  // Get valid coastal territories for unloading
  _getCoastalDestinations(isCombatMove) {
    const player = this.gameState.currentPlayer;
    const connections = this.gameState.getConnections(this.selectedFrom.name);

    return connections.filter(connName => {
      const t = this.territoryByName[connName];
      if (!t || t.isWater) return false; // Must be land

      const owner = this.gameState.getOwner(connName);
      const isEnemy = owner && owner !== player.id && !this.gameState.areAllies(player.id, owner);

      // During non-combat, can only unload to friendly territory
      if (!isCombatMove && isEnemy) return false;

      return true;
    });
  }

  _bindCargoEvents() {
    // Cargo quantity buttons
    this.el.querySelectorAll('.mp-cargo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const transportIdx = parseInt(btn.dataset.transport);
        const unitType = btn.dataset.unit;
        const delta = parseInt(btn.dataset.delta);
        this._updateCargoSelection(transportIdx, unitType, delta);
      });
    });

    // Cargo all buttons
    this.el.querySelectorAll('.mp-cargo-all-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const transportIdx = parseInt(btn.dataset.transport);
        const unitType = btn.dataset.unit;
        const qty = parseInt(btn.dataset.qty);
        if (!this.selectedCargoUnits[transportIdx]) {
          this.selectedCargoUnits[transportIdx] = {};
        }
        this.selectedCargoUnits[transportIdx][unitType] = qty;
        this._render();
      });
    });

    // Unload destination dropdown
    const unloadSelect = this.el.querySelector('[data-action="unload-dest"]');
    if (unloadSelect) {
      unloadSelect.addEventListener('change', () => {
        const destName = unloadSelect.value;
        if (destName) {
          this._executeUnload(destName);
        }
      });

      // Hover events for highlighting
      unloadSelect.addEventListener('mouseover', (e) => {
        if (e.target.tagName === 'OPTION' && e.target.value) {
          if (this.onHighlightTerritory) {
            this.onHighlightTerritory(e.target.value, true);
          }
        }
      });

      unloadSelect.addEventListener('mouseout', () => {
        if (this.onHighlightTerritory) {
          this.onHighlightTerritory(null, false);
        }
      });
    }

    // Switch to move mode
    this.el.querySelector('[data-action="switch-to-move"]')?.addEventListener('click', () => {
      this.unloadMode = false;
      this._render();
    });

    // Cancel
    this.el.querySelector('.mp-cancel-btn')?.addEventListener('click', () => {
      this.cancel();
    });

    // Undo
    this.el.querySelector('.mp-undo-btn')?.addEventListener('click', () => {
      const result = this.gameState.undoLastMove();
      if (result.success && this.onMoveComplete) {
        this.onMoveComplete();
      }
      this._render();
    });
  }

  _updateCargoSelection(transportIdx, unitType, delta) {
    const player = this.gameState.currentPlayer;
    const transportCargo = this.gameState.getTransportCargo(this.selectedFrom.name, player.id);
    const transport = transportCargo.find(t => t.index === transportIdx);
    if (!transport) return;

    // Count available of this type
    const available = transport.cargo.filter(c => c.type === unitType).length;

    if (!this.selectedCargoUnits[transportIdx]) {
      this.selectedCargoUnits[transportIdx] = {};
    }

    const current = this.selectedCargoUnits[transportIdx][unitType] || 0;
    const newValue = Math.max(0, Math.min(available, current + delta));
    this.selectedCargoUnits[transportIdx][unitType] = newValue;

    this._render();
  }

  _executeUnload(destName) {
    const player = this.gameState.currentPlayer;
    const isCombatMove = this.gameState.turnPhase === TURN_PHASES.COMBAT_MOVE;

    // Unload selected cargo from each transport
    const unloadedUnits = [];

    for (const [transportIdxStr, unitSelections] of Object.entries(this.selectedCargoUnits)) {
      const transportIdx = parseInt(transportIdxStr);

      for (const [unitType, qty] of Object.entries(unitSelections)) {
        if (qty <= 0) continue;

        // Unload this many units of this type from this transport
        for (let i = 0; i < qty; i++) {
          const result = this.gameState.unloadSingleUnit(
            this.selectedFrom.name,
            transportIdx,
            unitType,
            destName
          );
          if (result.success) {
            unloadedUnits.push({ type: unitType, quantity: 1 });
          } else {
            console.warn('Unload failed:', result.error);
            break;
          }
        }
      }
    }

    if (unloadedUnits.length > 0) {
      // Check if this is an enemy territory (amphibious assault)
      const owner = this.gameState.getOwner(destName);
      const isEnemy = owner && owner !== player.id && !this.gameState.areAllies(player.id, owner);

      if (isCombatMove && isEnemy) {
        // Add to combat queue
        if (!this.gameState.combatQueue.includes(destName)) {
          this.gameState.combatQueue.push(destName);
        }
      }

      const moveInfo = {
        from: this.selectedFrom.name,
        to: destName,
        units: unloadedUnits,
        isAmphibious: isCombatMove && isEnemy,
        isAttack: isCombatMove && isEnemy,
      };

      this.cancel();
      if (this.onMoveComplete) {
        this.onMoveComplete(moveInfo);
      }
    }
  }

  _render() {
    if (!this.selectedFrom || !this.gameState) {
      this.el.classList.add('hidden');
      return;
    }

    const player = this.gameState.currentPlayer;
    const isCombatMove = this.gameState.turnPhase === TURN_PHASES.COMBAT_MOVE;
    const isNonCombatMove = this.gameState.turnPhase === TURN_PHASES.NON_COMBAT_MOVE;
    const phaseLabel = isCombatMove ? 'Combat Move' : 'Non-Combat Move (Fortify)';
    // Allow undo during both combat and non-combat move phases
    const canUndo = (isCombatMove || isNonCombatMove) && this.gameState.moveHistory && this.gameState.moveHistory.length > 0;

    // Check if we should show cargo unload UI
    if (this.unloadMode && this.selectedFrom.isWater) {
      this._renderCargoUnloadUI(player, isCombatMove, canUndo);
      return;
    }

    const units = this.gameState.getUnitsAt(this.selectedFrom.name);
    const movableUnits = units.filter(u =>
      u.owner === player.id &&
      this._hasRemainingMovement(u) &&
      this._canUnitMove(u.type)
    );

    // Aggregate movable units by type (handles multiple stacks with different movementUsed)
    const aggregatedUnits = {};
    for (const unit of movableUnits) {
      // Skip individual ships (those with IDs) - they're shown in ship selection
      if (unit.id) continue;

      if (!aggregatedUnits[unit.type]) {
        aggregatedUnits[unit.type] = {
          type: unit.type,
          owner: unit.owner,
          totalQuantity: 0
        };
      }
      aggregatedUnits[unit.type].totalQuantity += unit.quantity;
    }

    // Check for ships with cargo that need individual selection
    const shipsWithCargo = this._getShipsWithCargo(this.selectedFrom.name, player.id);
    const hasMultipleShipsWithCargo = shipsWithCargo.filter(s =>
      (s.cargo && s.cargo.length > 0) || (s.aircraft && s.aircraft.length > 0)
    ).length > 1;

    // Build confirm section HTML if destination is pending (will show at top)
    let confirmHtml = '';
    if (this.pendingDestination) {
      const destOwner = this.gameState.getOwner(this.pendingDestination);
      const isEnemyDest = destOwner && destOwner !== player.id && !this.gameState.areAllies(player.id, destOwner);
      const confirmBtnText = isEnemyDest ? 'Confirm Attack' : 'Confirm Move';
      confirmHtml = `
        <div class="mp-confirm-section sticky">
          <div class="mp-confirm-info">
            Moving to: <strong>${this.pendingDestination}</strong>
            ${isEnemyDest ? '<span class="mp-enemy-tag">ATTACK</span>' : ''}
          </div>
          <button class="mp-confirm-btn primary ${isEnemyDest ? 'attack' : ''}" data-action="confirm-move">${confirmBtnText}</button>
        </div>
      `;
    }

    let html = `
      <div class="mp-drag-handle"></div>
      <div class="mp-header">
        <div class="mp-title">Move Units</div>
        <div class="mp-phase">${phaseLabel}</div>
      </div>

      ${confirmHtml}

      <div class="mp-from">
        <span class="mp-label">From:</span>
        <span class="mp-territory">${this.selectedFrom.name}</span>
      </div>

      <div class="mp-units">
    `;

    // Display aggregated units (grouped units without IDs)
    for (const [unitType, unitData] of Object.entries(aggregatedUnits)) {
      const def = this.unitDefs[unitType];
      const selected = this.selectedUnits[unitType] || 0;
      // Use faction-specific icon
      const imageSrc = unitData.owner ? getUnitIconPath(unitType, unitData.owner) : (def?.image ? `assets/units/${def.image}` : null);

      // Build detailed tooltip
      const tooltipParts = [
        `Attack: ${def?.attack || 0}`,
        `Defense: ${def?.defense || 0}`,
        `Movement: ${def?.movement || 1}`,
        `Cost: $${def?.cost || 0}`
      ];
      if (def?.isAir) tooltipParts.push('Air unit');
      if (def?.isLand) tooltipParts.push('Land unit');
      if (def?.isSea) tooltipParts.push('Naval unit');
      const tooltipText = tooltipParts.join(' | ');

      html += `
        <div class="mp-unit-row">
          <div class="mp-unit-info">
            ${imageSrc ? `<img src="${imageSrc}" class="mp-unit-icon" alt="${unitType}">` : ''}
            <span class="mp-unit-name">${unitType}</span>
            <span class="mp-unit-info-icon" title="${tooltipText}">ⓘ</span>
            <span class="mp-unit-avail">(${unitData.totalQuantity})</span>
          </div>
          <div class="mp-unit-select">
            <button class="mp-qty-btn" data-unit="${unitType}" data-delta="-1">−</button>
            <span class="mp-qty">${selected}</span>
            <button class="mp-qty-btn" data-unit="${unitType}" data-delta="1">+</button>
            <button class="mp-all-btn" data-unit="${unitType}" data-qty="${unitData.totalQuantity}">All</button>
          </div>
        </div>
      `;
    }

    html += `</div>`;

    // Show ship selection for ships with cargo (if in water territory)
    if (this.selectedFrom.isWater && shipsWithCargo.length > 0) {
      html += this._renderShipSelection(shipsWithCargo, player);
    }

    // Show aircraft on carriers that can be launched (combat move phase only)
    if (this.selectedFrom.isWater && isCombatMove) {
      const carrierAircraft = this.gameState.getCarrierAircraft(this.selectedFrom.name, player.id);
      const hasAircraftToLaunch = carrierAircraft.some(c => c.aircraft.length > 0);
      if (hasAircraftToLaunch) {
        html += this._renderCarrierAircraftLaunch(carrierAircraft, player);
      }
    }

    // Move All button - use aggregated totals
    const totalMovable = Object.values(aggregatedUnits).reduce((sum, u) => sum + u.totalQuantity, 0);
    const totalSelected = Object.values(this.selectedUnits).reduce((sum, q) => sum + q, 0);

    html += `
      <div class="mp-select-all">
        <button class="mp-all-units-btn" data-action="select-all" ${totalSelected === totalMovable ? 'disabled' : ''}>
          Select All Units
        </button>
        ${totalSelected > 0 ? `
          <button class="mp-clear-btn" data-action="clear-all">Clear Selection</button>
        ` : ''}
      </div>
    `;

    // Show valid destinations
    const validDests = this.getValidDestinations();
    const hasUnitsSelected = Object.values(this.selectedUnits).some(q => q > 0);
    const hasShipsSelected = this.selectedShipIds.size > 0;

    // Check for air units that can't land (combat move only)
    let airWarningDests = new Set();
    if (isCombatMove && hasUnitsSelected) {
      for (const dest of validDests) {
        for (const [unitType, qty] of Object.entries(this.selectedUnits)) {
          if (qty > 0) {
            const def = this.unitDefs[unitType];
            if (def?.isAir) {
              const landCheck = this.gameState.checkAirUnitCanLand(
                this.selectedFrom.name, dest, unitType, this.unitDefs
              );
              if (!landCheck.canLand) {
                airWarningDests.add(dest);
              }
            }
          }
        }
      }
    }

    if ((hasUnitsSelected || hasShipsSelected) && validDests.length > 0) {
      // Only show warning if:
      // 1. All destinations have landing problems, OR
      // 2. A destination with landing problems is selected
      const allDestsHaveLandingProblems = airWarningDests.size > 0 && airWarningDests.size === validDests.length;
      const selectedDestHasLandingProblem = this.pendingDestination && airWarningDests.has(this.pendingDestination);

      if (allDestsHaveLandingProblems || selectedDestHasLandingProblem) {
        html += `
          <div class="mp-air-warning">
            <span class="mp-warning-icon">⚠️</span>
            <span>WARNING: Air unit cannot land after attacking this destination. Unit will crash!</span>
          </div>
        `;
      }

      html += `
        <div class="mp-destinations">
          <span class="mp-label">Move to:</span>
          <select class="mp-dest-select" data-action="select-dest">
            <option value="">-- Select destination or click map --</option>
            ${validDests.map(dest => {
              const owner = this.gameState.getOwner(dest);
              const isEnemy = owner && owner !== player.id && !this.gameState.areAllies(player.id, owner);
              const cantLand = airWarningDests.has(dest);
              const isSelected = this.pendingDestination === dest;
              const label = cantLand ? `${dest} ⚠️` : `${dest}${isEnemy ? ' (Enemy)' : ''}`;
              return `<option value="${dest}" ${isSelected ? 'selected' : ''} data-territory="${dest}" class="${isEnemy ? 'enemy' : ''} ${cantLand ? 'no-landing' : ''}">${label}</option>`;
            }).join('')}
          </select>
        </div>
      `;

      }

    html += `
      <div class="mp-actions">
        ${canUndo ? `<button class="mp-undo-btn">Undo Last Move</button>` : ''}
        <button class="mp-cancel-btn">Cancel</button>
      </div>
    `;

    this.el.innerHTML = html;
    this._bindEvents();
  }

  _bindEvents() {
    // Quantity buttons
    this.el.querySelectorAll('.mp-qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const unit = btn.dataset.unit;
        const delta = parseInt(btn.dataset.delta);
        this._updateSelection(unit, delta);
      });
    });

    // All button (per unit type)
    this.el.querySelectorAll('.mp-all-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const unit = btn.dataset.unit;
        const qty = parseInt(btn.dataset.qty);
        this.selectedUnits[unit] = qty;
        this._render();
      });
    });

    // Ship selection checkboxes
    this.el.querySelectorAll('.mp-ship-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const shipId = cb.dataset.shipId;
        if (cb.checked) {
          this.selectedShipIds.add(shipId);
        } else {
          this.selectedShipIds.delete(shipId);
        }
        this._render();
      });
    });

    // Ship option click (for selecting)
    this.el.querySelectorAll('.mp-ship-option:not(.disabled)').forEach(opt => {
      opt.addEventListener('click', (e) => {
        // Don't trigger if clicking on checkbox directly
        if (e.target.classList.contains('mp-ship-cb')) return;

        const shipId = opt.dataset.shipId;
        if (!shipId) return;

        if (this.selectedShipIds.has(shipId)) {
          this.selectedShipIds.delete(shipId);
        } else {
          this.selectedShipIds.add(shipId);
        }
        this._render();
      });
    });

    // Select All Units button
    this.el.querySelector('[data-action="select-all"]')?.addEventListener('click', () => {
      const player = this.gameState.currentPlayer;
      const units = this.gameState.getUnitsAt(this.selectedFrom.name);
      const movableUnits = units.filter(u =>
        u.owner === player.id && this._hasRemainingMovement(u) && this._canUnitMove(u.type)
      );

      // Aggregate quantities by type (there may be multiple stacks with different movementUsed)
      const totalByType = {};
      for (const unit of movableUnits) {
        if (!unit.id) { // Only aggregate grouped units, not individual ships
          totalByType[unit.type] = (totalByType[unit.type] || 0) + unit.quantity;
        }
      }
      for (const [type, qty] of Object.entries(totalByType)) {
        this.selectedUnits[type] = qty;
      }

      // Also select all ships with cargo (transports and carriers)
      const shipsWithCargo = this._getShipsWithCargo(this.selectedFrom.name, player.id);
      for (const ship of shipsWithCargo) {
        if (ship.id && this._hasRemainingMovement(ship)) {
          this.selectedShipIds.add(ship.id);
        }
      }

      this._render();
    });

    // Clear Selection button
    this.el.querySelector('[data-action="clear-all"]')?.addEventListener('click', () => {
      this.selectedUnits = {};
      this._render();
    });

    // Aircraft launch buttons (single aircraft)
    this.el.querySelectorAll('.mp-launch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const carrierIdx = parseInt(btn.dataset.carrier);
        const aircraftIdx = parseInt(btn.dataset.aircraftIdx);
        this._launchAircraft(carrierIdx, aircraftIdx);
      });
    });

    // Aircraft launch all buttons (all of one type from carrier)
    this.el.querySelectorAll('.mp-launch-all-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const carrierIdx = parseInt(btn.dataset.carrier);
        const indices = btn.dataset.aircraftIndices.split(',').map(Number);
        // Launch in reverse order to avoid index shifting
        for (const idx of indices.sort((a, b) => b - a)) {
          this._launchAircraft(carrierIdx, idx);
        }
      });
    });

    // Destination dropdown - now just sets pending destination
    const destSelect = this.el.querySelector('.mp-dest-select');
    if (destSelect) {
      // Change event - set pending destination (don't execute move yet)
      destSelect.addEventListener('change', () => {
        const destName = destSelect.value;
        this.pendingDestination = destName || null;
        this._render();
        // Highlight the selected destination
        if (destName && this.onHighlightTerritory) {
          this.onHighlightTerritory(destName, true);
        }
      });

      // Hover events for highlighting
      destSelect.addEventListener('mouseover', (e) => {
        if (e.target.tagName === 'OPTION' && e.target.value) {
          if (this.onHighlightTerritory) {
            this.onHighlightTerritory(e.target.value, true);
          }
        }
      });

      destSelect.addEventListener('mouseout', () => {
        if (this.onHighlightTerritory) {
          this.onHighlightTerritory(null, false);
        }
      });
    }

    // Confirm Move button
    this.el.querySelector('[data-action="confirm-move"]')?.addEventListener('click', () => {
      if (this.pendingDestination) {
        const dest = this.territoryByName[this.pendingDestination];
        if (dest) {
          this._showMoveConfirm(dest);
        }
      }
    });

    // Cancel
    this.el.querySelector('.mp-cancel-btn')?.addEventListener('click', () => {
      this.cancel();
    });

    // Undo
    this.el.querySelector('.mp-undo-btn')?.addEventListener('click', () => {
      const result = this.gameState.undoLastMove();
      if (result.success && this.onMoveComplete) {
        this.onMoveComplete();
      }
      this._render();
    });
  }

  _updateSelection(unitType, delta) {
    const player = this.gameState.currentPlayer;
    const units = this.gameState.getUnitsAt(this.selectedFrom.name);

    // Calculate total available across all stacks of this type
    let totalAvailable = 0;
    for (const u of units) {
      if (u.type === unitType && u.owner === player.id && this._hasRemainingMovement(u) && !u.id) {
        totalAvailable += u.quantity;
      }
    }

    if (totalAvailable === 0) return;

    const current = this.selectedUnits[unitType] || 0;
    const newValue = Math.max(0, Math.min(totalAvailable, current + delta));
    this.selectedUnits[unitType] = newValue;

    this._render();
  }

  // Launch aircraft from carrier - makes it a free unit that can be selected to move
  _launchAircraft(carrierIndex, aircraftIndex) {
    if (!this.selectedFrom || !this.gameState) return;

    const result = this.gameState.launchFromCarrier(
      this.selectedFrom.name,
      carrierIndex,
      aircraftIndex
    );

    if (result.success) {
      // Re-render to show the launched aircraft as a movable unit
      this._render();
    } else {
      console.warn('Launch failed:', result.error);
    }
  }

  // Generate movement info tooltip for a unit
  _getUnitMovementInfo(unitDef) {
    if (!unitDef) return '';

    const parts = [];
    parts.push(`Movement: ${unitDef.movement || 1}`);
    parts.push(`Attack: ${unitDef.attack || 0}`);
    parts.push(`Defense: ${unitDef.defense || 0}`);

    if (unitDef.isAir) {
      parts.push('Air unit - can fly over land/water');
    } else if (unitDef.isLand) {
      parts.push('Land unit - moves on land only');
    } else if (unitDef.isSea) {
      parts.push('Naval unit - moves in sea zones');
    }

    return parts.join(' | ');
  }

  // Get air movement visualization data for rendering on map
  getAirMovementVisualization() {
    if (!this.selectedFrom || !this.gameState) return null;

    // Check if only air units are selected
    const hasOnlyAirSelected = Object.entries(this.selectedUnits).every(([type, qty]) => {
      if (qty <= 0) return true;
      return this.unitDefs[type]?.isAir;
    }) && Object.values(this.selectedUnits).some(q => q > 0);

    if (!hasOnlyAirSelected) return null;

    const player = this.gameState.currentPlayer;
    const isCombatMove = this.gameState.turnPhase === TURN_PHASES.COMBAT_MOVE;
    const airMovementRange = this._getMaxAirMovementRange();

    const reachable = this.gameState.getReachableTerritoriesForAir(
      this.selectedFrom.name,
      airMovementRange,
      player?.id,
      isCombatMove
    );

    // Filter out enemy territories in non-combat
    const isNonCombat = !isCombatMove;
    const filteredReachable = new Map();
    for (const [destName, pathData] of reachable) {
      const toOwner = this.gameState.getOwner(destName);
      const isEnemy = toOwner && toOwner !== player.id &&
        !this.gameState.areAllies(player.id, toOwner);
      if (!isNonCombat || !isEnemy) {
        filteredReachable.set(destName, pathData);
      }
    }

    return {
      source: this.selectedFrom.name,
      reachable: filteredReachable
    };
  }
}

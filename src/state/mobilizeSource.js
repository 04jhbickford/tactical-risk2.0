// Which factory's production a sea-zone mobilize spends.
// A sea zone bordered by two factories must name its source. Captured
// and minor factories produce 5; the current player's capital produces 20.
// A host option replaces those numbers. A missing option keeps 20 and 5.

import { capitalFactoryOutputValue, purchasedFactoryOutputValue } from '../gameOptions.js';

export function factoryProductionLimit(factoryName, capitalName, gameOptions) {
  const capital = !!(factoryName && capitalName && factoryName === capitalName);
  return capital
    ? capitalFactoryOutputValue(gameOptions)
    : purchasedFactoryOutputValue(gameOptions);
}

export function factoryProductionUsed(history, factoryName, playerId) {
  if (!factoryName) return 0;
  return (history || []).filter((entry) => (
    entry
    && entry.owner === playerId
    && (entry.territory === factoryName || entry.sourceFactory === factoryName)
  )).length;
}

export function factoriesAdjacentToSeaZone(gameState, seaZoneName, playerId) {
  if (!gameState || !seaZoneName) return [];
  const atStart = gameState.factoriesAtTurnStart;
  const names = (atStart instanceof Set && atStart.size > 0)
    ? [...atStart]
    : (gameState._getFactoryTerritories?.(playerId) || []);
  return names.filter((name) => {
    const territory = gameState.territoryByName?.[name];
    if (!territory || territory.isWater) return false;
    return (territory.connections || []).includes(seaZoneName);
  });
}

export function resolveSeaMobilizeFactory(gameState, seaZoneName, playerId, sourceFactory = null) {
  const factories = factoriesAdjacentToSeaZone(gameState, seaZoneName, playerId);
  if (sourceFactory) {
    if (!factories.includes(sourceFactory)) {
      return {
        ok: false,
        factories,
        error: 'That factory cannot produce into this sea zone',
      };
    }
    return { ok: true, factory: sourceFactory, factories };
  }
  if (factories.length === 1) return { ok: true, factory: factories[0], factories };
  if (factories.length === 0) {
    return { ok: false, factories, error: 'No factory can produce into this sea zone' };
  }
  return {
    ok: false,
    factories,
    ambiguous: true,
    error: 'Choose which factory produces this unit',
  };
}

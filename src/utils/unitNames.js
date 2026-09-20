// Human unit labels. Never show camelCase ids (tacticalBomber) in the tray.

const UNIT_DISPLAY_NAMES = {
  infantry: 'Infantry',
  armour: 'Tank',
  artillery: 'Artillery',
  fighter: 'Fighter',
  bomber: 'Bomber',
  tacticalBomber: 'Tactical bomber',
  transport: 'Transport',
  transportPlane: 'Transport plane',
  submarine: 'Submarine',
  destroyer: 'Destroyer',
  cruiser: 'Cruiser',
  battleship: 'Battleship',
  carrier: 'Carrier',
  factory: 'Factory',
  aaGun: 'AA Gun',
};

export function formatUnitName(unitType) {
  if (!unitType) return '';
  if (UNIT_DISPLAY_NAMES[unitType]) return UNIT_DISPLAY_NAMES[unitType];
  const spaced = String(unitType).replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

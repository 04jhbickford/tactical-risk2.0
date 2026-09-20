// Utility for getting faction-specific unit icons
// Icons are stored in units/{FactionId}/{ImageName}.png

// Map from unit type to image filename per faction
const UNIT_IMAGE_MAP = {
  // Default mapping (works for most factions)
  default: {
    infantry: 'Infantry.png',
    armour: 'Tank.png',
    artillery: 'Artillery.png',
    fighter: 'Fighter.png',
    bomber: 'Bomber.png',
    tacticalBomber: 'S.Bomber.png',
    transport: 'Transport.png',
    submarine: 'Submarine.png',
    destroyer: 'Destroyer.png',
    cruiser: 'Cruiser.png',
    battleship: 'Battleship.png',
    carrier: 'Carrier.png',
    factory: 'Factory.png',
    aaGun: 'AAGun.png',
  },
  // Faction-specific overrides
  Germans: {
    tacticalBomber: 'Stuka.png',
  },
  Russians: {
    tacticalBomber: 'HeavyFighter.png', // Russians don't have S.Bomber, use HeavyFighter
  },
};

/**
 * Get the icon path for a unit type and faction
 * @param {string} unitType - The unit type (e.g., 'infantry', 'armour')
 * @param {string} factionId - The faction ID (e.g., 'Americans', 'Germans')
 * @returns {string} The path to the unit icon
 */
export function getUnitIconPath(unitType, factionId) {
  // Check for faction-specific override
  const factionOverrides = UNIT_IMAGE_MAP[factionId] || {};
  const imageName = factionOverrides[unitType] || UNIT_IMAGE_MAP.default[unitType];

  if (!imageName) {
    console.warn(`No icon mapping for unit type: ${unitType}`);
    return null;
  }

  return `units/${factionId}/${imageName}`;
}

/**
 * Get the generic icon path for a unit type (fallback to assets/units)
 * @param {string} unitType - The unit type
 * @param {object} unitDefs - Unit definitions from units.json
 * @returns {string} The path to the unit icon
 */
export function getGenericUnitIconPath(unitType, unitDefs) {
  const def = unitDefs?.[unitType];
  if (def?.image) {
    return `assets/units/${def.image}`;
  }
  return null;
}

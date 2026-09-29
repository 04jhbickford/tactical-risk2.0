// Pacific 1940 2nd edition convert recipe.
// One-line switch for Soviet land. 'neutral' is the default: those
// territories stay Neutral with one infantry each. 'chinese' folds the
// same land and garrison into Chinese. Re-run the converter and the
// setup builder after changing it.
export const PACIFIC_RUSSIAN_LAND = 'neutral';

const RUSSIAN_OWNER = PACIFIC_RUSSIAN_LAND === 'chinese' ? 'Chinese' : 'Neutral';

export const PACIFIC_CAPITALS = [
  { territory: 'Japan', owner: 'Japanese' },
  { territory: 'Western United States', owner: 'Americans' },
  { territory: 'India', owner: 'British' },
  { territory: 'New South Wales', owner: 'ANZAC' },
  { territory: 'Szechwan', owner: 'Chinese' },
];

export const PACIFIC_VICTORY_CITY_NAMES = [
  'Japan',
  'Kiangsu',
  'Kwangtung',
  'Philippines',
  'India',
  'New South Wales',
  'Hawaiian Islands',
  'Western United States',
];

// Risk-style regions. Bonus is territory count × 3, the same formula
// tools/convert-map.mjs applies to Classic CONTINENT_DEFS.
export const PACIFIC_CONTINENTS = [
  { name: 'Japanese Home Islands', territories: ['Japan', 'Okinawa', 'Iwo Jima'] },
  { name: 'Manchuria and Korea', territories: ['Manchuria', 'Korea', 'Jehol'] },
  {
    name: 'China',
    territories: [
      'Anhwe', 'Chahar', 'Hainan', 'Hopei', 'Hunan', 'Kansu', 'Kiangsi', 'Kiangsu',
      'Kwangsi', 'Kwangtung', 'Kweichow', 'Shantung', 'Shensi', 'Sikang', 'Suiyuan',
      'Szechwan', 'Tsinghai', 'Yunnan',
    ],
  },
  {
    name: 'Southeast Asia',
    territories: ['French Indo China', 'Siam', 'Burma', 'Malaya', 'Shan State'],
  },
  {
    name: 'East Indies',
    territories: ['Borneo', 'Celebes', 'Java', 'Sumatra', 'Dutch New Guinea', 'New Guinea', 'New Britain'],
  },
  { name: 'Philippines and Formosa', territories: ['Philippines', 'Formosa'] },
  {
    name: 'Australia',
    territories: [
      'New South Wales', 'Queensland', 'Northern Territory', 'South Australia',
      'Victoria', 'Western Australia',
    ],
  },
  {
    name: 'New Zealand and South Pacific',
    territories: ['New Zealand', 'Fiji', 'Samoa', 'New Hebrides', 'Solomon Islands', 'Gilbert Islands'],
  },
  {
    name: 'Central Pacific',
    territories: [
      'Caroline Islands', 'Marshall Islands', 'Marianas', 'Paulau Island', 'Wake Island',
      'Midway', 'Guam', 'Johnston Island', 'Hawaiian Islands', 'Line Islands',
    ],
  },
  { name: 'India', territories: ['India', 'Ceylon'] },
  {
    name: 'North America (West)',
    territories: [
      'Western United States', 'Mexico', 'Alaska', 'British Columbia',
      'Yukon Territory', 'Aleutian Islands',
    ],
  },
  {
    name: 'Soviet Far East',
    territories: [
      'Amur', 'Buryatia', 'Evenkiyskiy', 'Kazakhstan', 'Moscow', 'Sakha', 'Siberia',
      'Soviet Far East', 'Tunguska', 'Yakut S.S.R.', 'Yenisey',
    ],
  },
  {
    name: 'Mongolia',
    territories: ['Olgiy', 'Dzavhan', 'Central Mongolia', 'Buyant-Uhaa', 'Ulaanbaatar', 'Tsagaan-Olom'],
  },
];

export const pacificConvertConfig = {
  id: 'pacific',
  polygons: 'map/pacific/polygons.txt',
  centers: 'map/pacific/centers.txt',
  xml: 'map/pacific/games/ww2pac40_2nd_edition.xml',
  outTerritories: 'data/maps/pacific/territories.json',
  outContinents: 'data/maps/pacific/continents.json',
  // All land production becomes 1, matching Classic. Impassable land stays 0.
  productionRule: 'flat-1',
  // Corner chrome on the TripleA sheet, not territories.
  exclude: ['Box1', 'Box2', 'Box3'],
  // No connections. Not part of a bonus region.
  impassable: ['Himalayas'],
  ownerRemap: {
    Dutch: 'ANZAC',
    French: 'British',
    Russians: RUSSIAN_OWNER,
  },
  capitals: PACIFIC_CAPITALS,
  continents: PACIFIC_CONTINENTS,
  continentColors: {
    'Japanese Home Islands': '#FF8C00',
    'Manchuria and Korea': '#B8860B',
    China: '#8B008B',
    'Southeast Asia': '#228B22',
    'East Indies': '#20B2AA',
    'Philippines and Formosa': '#1E90FF',
    Australia: '#DAA520',
    'New Zealand and South Pacific': '#008B8B',
    'Central Pacific': '#4169E1',
    India: '#C4A35A',
    'North America (West)': '#556B2F',
    'Soviet Far East': '#B22222',
    Mongolia: '#4A4A4A',
  },
};

// Classic convert recipe. These tweaks are what tools/convert-data.js hardcoded.
// Runtime land bridges (16 movement pairs) are a different list. This one is
// the single connection the converter adds to the graph (Eire–UK).

export const classicConvertConfig = {
  id: 'classic',
  polygons: 'map/polygons.txt',
  centers: 'map/centers.txt',
  xml: 'map/games/classic_3rd_edition.xml',
  outTerritories: 'data/territories.json',
  outContinents: 'data/continents.json',
  // All land production becomes 1. 'keep' would leave the XML value.
  productionRule: 'flat-1',
  merges: [
    { from: 'Sinkiang', into: 'China' },
    { from: 'Yakut S.S.R.', into: 'Soviet Far East' },
    { from: 'Afghanistan', into: 'India' },
    { from: 'Caucasus', into: 'Ukraine S.S.R.' },
    { from: 'Libya', into: 'Anglo Sudan Egypt' },
    { from: 'Rio del Oro', into: 'French West Africa' },
    { from: 'Angola', into: 'Congo' },
    { from: 'Mozambique', into: 'Kenya-Rhodesia' },
    { from: 'Gibraltar', into: 'Spain' },
  ],
  continents: [
    { name: 'North America', territories: ['East US', 'West US', 'East Canada', 'West Canada', 'Mexico', 'Alaska', 'Cuba', 'Panama'] },
    { name: 'South America', territories: ['Brazil', 'Argentina-Chile', 'Peru', 'Columbia'] },
    { name: 'Europe', territories: ['United Kingdom', 'West Europe', 'Germany', 'South Europe', 'East Europe', 'Eire', 'Spain', 'Sweden', 'Switzerland', 'Finland Norway'] },
    { name: 'Middle East', territories: ['Turkey', 'Syria Jordan', 'Saudi Arabia', 'Persia', 'India', 'Kazakh S.S.R.'] },
    { name: 'Africa', territories: ['Algeria', 'Anglo Sudan Egypt', 'French West Africa', 'French Equatorial Africa', 'Congo', 'Kenya-Rhodesia', 'South Africa', 'Italian East Africa', 'Madagascar'] },
    { name: 'Asia', territories: ['Russia', 'Karelia S.S.R.', 'Ukraine S.S.R.', 'Novosibirsk', 'Evenki National Okrug', 'Soviet Far East', 'Mongolia', 'Manchuria', 'China', 'Kwangtung', 'French Indo China'] },
    { name: 'Oceania', territories: ['Japan', 'Borneo Celebes', 'East Indies', 'Philippines', 'Okinawa', 'Australia', 'New Zealand', 'New Guinea', 'Solomon Islands', 'Caroline Islands', 'Hawaiian Islands', 'Midway', 'Wake Island'] },
  ],
  landBridges: [
    ['Eire', 'United Kingdom'],
  ],
  removeConnections: [
    ['Gibraltar', 'French West Africa'],
    ['Gibraltar', 'Rio del Oro'],
    ['Spain', 'French West Africa'],
    ['Spain', 'Rio del Oro'],
    ['Brazil', 'French West Africa'],
    ['Brazil', 'Rio del Oro'],
  ],
  continentColors: {
    'North America': '#C4A35A',
    'South America': '#8B4513',
    'Europe': '#4682B4',
    'Middle East': '#F3D36B',
    'Africa': '#D2691E',
    'Asia': '#6B8E23',
    'Oceania': '#708090',
  },
};

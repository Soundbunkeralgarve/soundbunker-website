// Map position of every city page (slug → [latitude, longitude]), for "Near me" and the map.
// Regions and islands use a central point.
export const CITY_COORDS = Object.freeze({
  london: [51.507, -0.128], manchester: [53.481, -2.243], liverpool: [53.408, -2.991], glasgow: [55.864, -4.252],
  edinburgh: [55.953, -3.188], birmingham: [52.486, -1.890], brighton: [50.822, -0.137], bristol: [51.455, -2.587],
  leeds: [53.801, -1.549], newcastle: [54.978, -1.618], sheffield: [53.381, -1.470], nottingham: [52.954, -1.158],
  cardiff: [51.482, -3.179], belfast: [54.597, -5.930], dublin: [53.350, -6.260], algarve: [37.090, -8.250],
  lisbon: [38.722, -9.139], porto: [41.158, -8.629], madeira: [32.651, -16.909], barcelona: [41.385, 2.173],
  madrid: [40.417, -3.704], seville: [37.389, -5.984], malaga: [36.721, -4.421], ibiza: [38.907, 1.433],
  tenerife: [28.080, -16.730], mallorca: [39.570, 2.650], paris: [48.857, 2.352], amsterdam: [52.370, 4.895],
  berlin: [52.520, 13.405], rome: [41.903, 12.496], prague: [50.076, 14.438], vienna: [48.208, 16.374],
  budapest: [47.498, 19.040],
  preston: [53.763, -2.703], chester: [53.193, -2.893], southampton: [50.910, -1.404], portsmouth: [50.820, -1.088],
  leicester: [52.637, -1.140], derby: [52.922, -1.476], coventry: [52.407, -1.512], wolverhampton: [52.587, -2.129],
  solihull: [52.412, -1.778], 'stoke-on-trent': [53.003, -2.180], 'milton-keynes': [52.041, -0.759], northampton: [52.240, -0.903],
  peterborough: [52.573, -0.241], cambridge: [52.205, 0.122], oxford: [51.752, -1.258], reading: [51.454, -0.978],
  norwich: [52.630, 1.297], colchester: [51.896, 0.892], chelmsford: [51.736, 0.480], southend: [51.538, 0.714],
  canterbury: [51.280, 1.079], maidstone: [51.272, 0.529], 'tunbridge-wells': [51.132, 0.263], guildford: [51.236, -0.570],
  worthing: [50.818, -0.372], bournemouth: [50.720, -1.880], salisbury: [51.069, -1.795], bath: [51.381, -2.359],
  exeter: [50.718, -3.534], plymouth: [50.375, -4.143], cheltenham: [51.899, -2.078], worcester: [52.192, -2.220],
  lincoln: [53.230, -0.540], york: [53.960, -1.082], hull: [53.745, -0.336], bradford: [53.796, -1.759],
  doncaster: [53.523, -1.128], middlesbrough: [54.574, -1.235], sunderland: [54.906, -1.381], carlisle: [54.892, -2.932],
  kendal: [54.328, -2.745], blackpool: [53.817, -3.036], bolton: [53.578, -2.430], wigan: [53.545, -2.632],
  warrington: [53.390, -2.597], stockport: [53.411, -2.157], aberdeen: [57.150, -2.094], dundee: [56.462, -2.971],
  stirling: [56.117, -3.937], inverness: [57.478, -4.224], swansea: [51.621, -3.944], newport: [51.584, -2.998],
  derry: [54.997, -7.309], cork: [51.899, -8.476], galway: [53.271, -9.057], limerick: [52.668, -8.630],
  albufeira: [37.089, -8.250], coimbra: [40.203, -8.410], braga: [41.545, -8.427],
  valencia: [39.470, -0.376], bilbao: [43.263, -2.935], granada: [37.177, -3.599], alicante: [38.345, -0.481],
  benidorm: [38.541, -0.123], marbella: [36.510, -4.883], 'gran-canaria': [27.958, -15.592], lanzarote: [29.046, -13.590],
  'san-sebastian': [43.318, -1.981], nice: [43.710, 7.262], lyon: [45.764, 4.836], marseille: [43.296, 5.370],
  bordeaux: [44.838, -0.579], toulouse: [43.605, 1.444], milan: [45.464, 9.190], florence: [43.770, 11.256],
  venice: [45.441, 12.316], naples: [40.852, 14.268], bologna: [44.495, 11.343], turin: [45.070, 7.687],
  munich: [48.135, 11.582], hamburg: [53.551, 9.994], cologne: [50.938, 6.960], frankfurt: [50.111, 8.682],
  rotterdam: [51.924, 4.478], utrecht: [52.091, 5.122], brussels: [50.850, 4.352], antwerp: [51.219, 4.402],
  bruges: [51.209, 3.225], ghent: [51.054, 3.717], salzburg: [47.810, 13.055], zurich: [47.377, 8.541],
  geneva: [46.204, 6.143], copenhagen: [55.676, 12.568], stockholm: [59.329, 18.069], oslo: [59.914, 10.752],
  helsinki: [60.170, 24.938], tallinn: [59.437, 24.754], riga: [56.950, 24.106], vilnius: [54.687, 25.280],
  krakow: [50.065, 19.945], warsaw: [52.230, 21.012], gdansk: [54.352, 18.646], bratislava: [48.149, 17.107],
  ljubljana: [46.057, 14.506], zagreb: [45.815, 15.982], split: [43.508, 16.440], dubrovnik: [42.651, 18.094],
  bucharest: [44.427, 26.103], sofia: [42.698, 23.322], athens: [37.984, 23.728], thessaloniki: [40.640, 22.944],
  mykonos: [37.446, 25.329], santorini: [36.393, 25.461], crete: [35.240, 24.810], corfu: [39.625, 19.922],
  rhodes: [36.434, 28.217], malta: [35.899, 14.514], 'ayia-napa': [34.988, 34.000], paphos: [34.772, 32.430],
  limassol: [34.707, 33.022]
});

// Great-circle distance in km.
export function distanceKm([lat1, lon1], [lat2, lon2]) {
  const r = Math.PI / 180, a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}
// City slugs nearest a point, closest first.
export function nearestCities(point, limit = 3) {
  return Object.entries(CITY_COORDS).map(([slug, at]) => ({slug, km: distanceKm(point, at)})).sort((a, b) => a.km - b.km).slice(0, limit);
}

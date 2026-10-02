/* ---------- src/renderer/zones.js ---------- */
try {
// Friendly city names and search aliases for IANA zones.
// The full IANA list comes from Intl.supportedValuesOf at runtime; this only adds nicer labels and aliases.
window.ZONE_META = {
  'Europe/Lisbon': { city: 'Lisbon', country: 'Portugal', alias: 'Porto', lat: 38.72, lng: -9.14 },
  'Europe/London': { city: 'London', country: 'United Kingdom', alias: 'UK GMT BST Manchester', lat: 51.51, lng: -0.13 },
  'Europe/Dublin': { city: 'Dublin', country: 'Ireland', lat: 53.35, lng: -6.26 },
  'Europe/Paris': { city: 'Paris', country: 'France', alias: 'CET', lat: 48.86, lng: 2.35 },
  'Europe/Madrid': { city: 'Madrid', country: 'Spain', alias: 'Barcelona', lat: 40.42, lng: -3.70 },
  'Europe/Berlin': { city: 'Berlin', country: 'Germany', alias: 'Munich Frankfurt Hamburg', lat: 52.52, lng: 13.40 },
  'Europe/Amsterdam': { city: 'Amsterdam', country: 'Netherlands', lat: 52.37, lng: 4.90 },
  'Europe/Brussels': { city: 'Brussels', country: 'Belgium', lat: 50.85, lng: 4.35 },
  'Europe/Zurich': { city: 'Zurich', country: 'Switzerland', alias: 'Geneva Zug', lat: 47.38, lng: 8.54 },
  'Europe/Rome': { city: 'Rome', country: 'Italy', alias: 'Milan', lat: 41.90, lng: 12.50 },
  'Europe/Vienna': { city: 'Vienna', country: 'Austria', lat: 48.21, lng: 16.37 },
  'Europe/Prague': { city: 'Prague', country: 'Czechia', lat: 50.08, lng: 14.44 },
  'Europe/Warsaw': { city: 'Warsaw', country: 'Poland', lat: 52.23, lng: 21.01 },
  'Europe/Stockholm': { city: 'Stockholm', country: 'Sweden', lat: 59.33, lng: 18.07 },
  'Europe/Oslo': { city: 'Oslo', country: 'Norway', lat: 59.91, lng: 10.75 },
  'Europe/Copenhagen': { city: 'Copenhagen', country: 'Denmark', lat: 55.68, lng: 12.57 },
  'Europe/Helsinki': { city: 'Helsinki', country: 'Finland', lat: 60.17, lng: 24.94 },
  'Europe/Athens': { city: 'Athens', country: 'Greece', lat: 37.98, lng: 23.73 },
  'Europe/Istanbul': { city: 'Istanbul', country: 'Turkey', lat: 41.01, lng: 28.98 },
  'Europe/Kyiv': { city: 'Kyiv', country: 'Ukraine', alias: 'Kiev', lat: 50.45, lng: 30.52 },
  'Europe/Moscow': { city: 'Moscow', country: 'Russia', lat: 55.76, lng: 37.62 },
  'Europe/Bucharest': { city: 'Bucharest', country: 'Romania', lat: 44.43, lng: 26.10 },
  'Africa/Cairo': { city: 'Cairo', country: 'Egypt', lat: 30.04, lng: 31.24 },
  'Africa/Lagos': { city: 'Lagos', country: 'Nigeria', lat: 6.52, lng: 3.38 },
  'Africa/Nairobi': { city: 'Nairobi', country: 'Kenya', lat: -1.29, lng: 36.82 },
  'Africa/Johannesburg': { city: 'Johannesburg', country: 'South Africa', alias: 'Cape Town', lat: -26.20, lng: 28.05 },
  'Africa/Casablanca': { city: 'Casablanca', country: 'Morocco', lat: 33.57, lng: -7.59 },
  'Asia/Dubai': { city: 'Dubai', country: 'UAE', alias: 'Abu Dhabi GST', lat: 25.20, lng: 55.27 },
  'Asia/Riyadh': { city: 'Riyadh', country: 'Saudi Arabia', lat: 24.71, lng: 46.68 },
  'Asia/Jerusalem': { city: 'Tel Aviv', country: 'Israel', alias: 'Jerusalem Israel', lat: 32.09, lng: 34.78 },
  'Asia/Tehran': { city: 'Tehran', country: 'Iran', lat: 35.69, lng: 51.39 },
  'Asia/Karachi': { city: 'Karachi', country: 'Pakistan', lat: 24.86, lng: 67.01 },
  'Asia/Kolkata': { city: 'Mumbai', country: 'India', alias: 'Kolkata Delhi Bangalore Bengaluru IST', lat: 19.08, lng: 72.88 },
  'Asia/Dhaka': { city: 'Dhaka', country: 'Bangladesh', lat: 23.81, lng: 90.41 },
  'Asia/Bangkok': { city: 'Bangkok', country: 'Thailand', alias: 'Hanoi', lat: 13.76, lng: 100.50 },
  'Asia/Jakarta': { city: 'Jakarta', country: 'Indonesia', lat: -6.21, lng: 106.85 },
  'Asia/Singapore': { city: 'Singapore', country: 'Singapore', alias: 'SGT', lat: 1.35, lng: 103.82 },
  'Asia/Kuala_Lumpur': { city: 'Kuala Lumpur', country: 'Malaysia', lat: 3.14, lng: 101.69 },
  'Asia/Manila': { city: 'Manila', country: 'Philippines', lat: 14.60, lng: 120.98 },
  'Asia/Ho_Chi_Minh': { city: 'Ho Chi Minh City', country: 'Vietnam', alias: 'Saigon', lat: 10.82, lng: 106.63 },
  'Asia/Hong_Kong': { city: 'Hong Kong', country: 'Hong Kong', alias: 'HKT', lat: 22.32, lng: 114.17 },
  'Asia/Shanghai': { city: 'Shanghai', country: 'China', alias: 'Beijing Shenzhen CST', lat: 31.23, lng: 121.47 },
  'Asia/Taipei': { city: 'Taipei', country: 'Taiwan', lat: 25.03, lng: 121.57 },
  'Asia/Seoul': { city: 'Seoul', country: 'South Korea', alias: 'KST', lat: 37.57, lng: 126.98 },
  'Asia/Tokyo': { city: 'Tokyo', country: 'Japan', alias: 'Osaka JST', lat: 35.68, lng: 139.69 },
  'Australia/Perth': { city: 'Perth', country: 'Australia', lat: -31.95, lng: 115.86 },
  'Australia/Adelaide': { city: 'Adelaide', country: 'Australia', lat: -34.93, lng: 138.60 },
  'Australia/Brisbane': { city: 'Brisbane', country: 'Australia', lat: -27.47, lng: 153.03 },
  'Australia/Sydney': { city: 'Sydney', country: 'Australia', alias: 'AEST AEDT Canberra', lat: -33.87, lng: 151.21 },
  'Australia/Melbourne': { city: 'Melbourne', country: 'Australia', lat: -37.81, lng: 144.96 },
  'Pacific/Auckland': { city: 'Auckland', country: 'New Zealand', alias: 'Wellington NZ', lat: -36.85, lng: 174.76 },
  'Pacific/Honolulu': { city: 'Honolulu', country: 'USA', alias: 'Hawaii HST', lat: 21.31, lng: -157.86 },
  'America/Anchorage': { city: 'Anchorage', country: 'USA', alias: 'Alaska', lat: 61.22, lng: -149.90 },
  'America/Los_Angeles': { city: 'Los Angeles', country: 'USA', alias: 'San Francisco Seattle Pacific PST PDT', lat: 34.05, lng: -118.24 },
  'America/Vancouver': { city: 'Vancouver', country: 'Canada', lat: 49.28, lng: -123.12 },
  'America/Denver': { city: 'Denver', country: 'USA', alias: 'Mountain MST MDT Salt Lake', lat: 39.74, lng: -104.99 },
  'America/Phoenix': { city: 'Phoenix', country: 'USA', alias: 'Arizona', lat: 33.45, lng: -112.07 },
  'America/Chicago': { city: 'Chicago', country: 'USA', alias: 'Central CST CDT Dallas Austin Houston', lat: 41.88, lng: -87.63 },
  'America/Mexico_City': { city: 'Mexico City', country: 'Mexico', lat: 19.43, lng: -99.13 },
  'America/New_York': { city: 'New York', country: 'USA', alias: 'Eastern EST EDT Boston Miami Washington', lat: 40.71, lng: -74.01 },
  'America/Toronto': { city: 'Toronto', country: 'Canada', alias: 'Montreal Ottawa', lat: 43.65, lng: -79.38 },
  'America/Bogota': { city: 'Bogotá', country: 'Colombia', alias: 'Bogota', lat: 4.71, lng: -74.07 },
  'America/Lima': { city: 'Lima', country: 'Peru', lat: -12.05, lng: -77.04 },
  'America/Caracas': { city: 'Caracas', country: 'Venezuela', lat: 10.48, lng: -66.90 },
  'America/Santiago': { city: 'Santiago', country: 'Chile', lat: -33.45, lng: -70.67 },
  'America/Argentina/Buenos_Aires': { city: 'Buenos Aires', country: 'Argentina', lat: -34.60, lng: -58.38 },
  'America/Sao_Paulo': { city: 'São Paulo', country: 'Brazil', alias: 'Sao Paulo Rio de Janeiro BRT', lat: -23.55, lng: -46.63 },
  'America/Halifax': { city: 'Halifax', country: 'Canada', alias: 'Atlantic', lat: 44.65, lng: -63.58 },
  'Atlantic/Azores': { city: 'Azores', country: 'Portugal', alias: 'Ponta Delgada', lat: 37.74, lng: -25.67 },
  'Atlantic/Reykjavik': { city: 'Reykjavík', country: 'Iceland', alias: 'Reykjavik', lat: 64.15, lng: -21.94 },
  'UTC': { city: 'UTC', country: 'Coordinated Universal Time', alias: 'GMT Zulu', lat: 51.48, lng: 0.00 },
};

// Approximate [lat, lng] of each zone's principal city, for sunrise/sunset. Zones in ZONE_META also carry their own lat/lng.
window.ZONE_COORDS = {
  // Africa
  'Africa/Abidjan': [5.36, -4.01], 'Africa/Accra': [5.60, -0.19], 'Africa/Addis_Ababa': [9.03, 38.74], 'Africa/Algiers': [36.75, 3.06],
  'Africa/Asmara': [15.32, 38.93], 'Africa/Bamako': [12.64, -8.00], 'Africa/Bangui': [4.39, 18.56], 'Africa/Banjul': [13.45, -16.58],
  'Africa/Bissau': [11.86, -15.60], 'Africa/Blantyre': [-15.79, 35.01], 'Africa/Brazzaville': [-4.26, 15.24], 'Africa/Bujumbura': [-3.38, 29.36],
  'Africa/Ceuta': [35.89, -5.32], 'Africa/Conakry': [9.64, -13.58], 'Africa/Dakar': [14.72, -17.47], 'Africa/Dar_es_Salaam': [-6.79, 39.21],
  'Africa/Djibouti': [11.59, 43.15], 'Africa/Douala': [4.05, 9.77], 'Africa/El_Aaiun': [27.15, -13.20], 'Africa/Freetown': [8.47, -13.23],
  'Africa/Gaborone': [-24.63, 25.92], 'Africa/Harare': [-17.83, 31.05], 'Africa/Juba': [4.86, 31.57], 'Africa/Kampala': [0.35, 32.58],
  'Africa/Khartoum': [15.50, 32.56], 'Africa/Kigali': [-1.94, 30.06], 'Africa/Kinshasa': [-4.44, 15.27], 'Africa/Libreville': [0.42, 9.47],
  'Africa/Lome': [6.13, 1.22], 'Africa/Luanda': [-8.84, 13.23], 'Africa/Lubumbashi': [-11.66, 27.48], 'Africa/Lusaka': [-15.39, 28.32],
  'Africa/Malabo': [3.75, 8.78], 'Africa/Maputo': [-25.97, 32.57], 'Africa/Maseru': [-29.31, 27.48], 'Africa/Mbabane': [-26.31, 31.14],
  'Africa/Mogadishu': [2.05, 45.32], 'Africa/Monrovia': [6.30, -10.80], 'Africa/Ndjamena': [12.13, 15.06], 'Africa/Niamey': [13.51, 2.11],
  'Africa/Nouakchott': [18.08, -15.98], 'Africa/Ouagadougou': [12.37, -1.52], 'Africa/Porto-Novo': [6.50, 2.60], 'Africa/Sao_Tome': [0.34, 6.73],
  'Africa/Tripoli': [32.89, 13.19], 'Africa/Tunis': [36.81, 10.18], 'Africa/Windhoek': [-22.56, 17.07],
  'Africa/Cairo': [30.04, 31.24], 'Africa/Lagos': [6.52, 3.38], 'Africa/Nairobi': [-1.29, 36.82], 'Africa/Johannesburg': [-26.20, 28.05], 'Africa/Casablanca': [33.57, -7.59],
  // Americas
  'America/Adak': [51.88, -176.66], 'America/Anchorage': [61.22, -149.90], 'America/Anguilla': [18.22, -63.07], 'America/Antigua': [17.12, -61.85],
  'America/Araguaina': [-7.19, -48.21], 'America/Argentina/Buenos_Aires': [-34.60, -58.38], 'America/Argentina/Catamarca': [-28.47, -65.78],
  'America/Argentina/Cordoba': [-31.42, -64.18], 'America/Argentina/Jujuy': [-24.19, -65.30], 'America/Argentina/La_Rioja': [-29.41, -66.86],
  'America/Argentina/Mendoza': [-32.89, -68.83], 'America/Argentina/Rio_Gallegos': [-51.62, -69.22], 'America/Argentina/Salta': [-24.79, -65.41],
  'America/Argentina/San_Juan': [-31.54, -68.54], 'America/Argentina/San_Luis': [-33.30, -66.34], 'America/Argentina/Tucuman': [-26.81, -65.22],
  'America/Argentina/Ushuaia': [-54.80, -68.30], 'America/Aruba': [12.52, -70.03], 'America/Asuncion': [-25.26, -57.58], 'America/Atikokan': [48.76, -91.62],
  'America/Bahia': [-12.97, -38.50], 'America/Bahia_Banderas': [20.80, -105.25], 'America/Barbados': [13.10, -59.62], 'America/Belem': [-1.46, -48.49],
  'America/Belize': [17.50, -88.20], 'America/Blanc-Sablon': [51.43, -57.13], 'America/Boa_Vista': [2.82, -60.67], 'America/Bogota': [4.71, -74.07],
  'America/Boise': [43.62, -116.20], 'America/Cambridge_Bay': [69.12, -105.06], 'America/Campo_Grande': [-20.47, -54.62], 'America/Cancun': [21.16, -86.85],
  'America/Caracas': [10.48, -66.90], 'America/Cayenne': [4.94, -52.33], 'America/Cayman': [19.29, -81.37], 'America/Chicago': [41.88, -87.63],
  'America/Chihuahua': [28.63, -106.07], 'America/Ciudad_Juarez': [31.69, -106.42], 'America/Costa_Rica': [9.93, -84.08], 'America/Cuiaba': [-15.60, -56.10],
  'America/Curacao': [12.11, -68.93], 'America/Danmarkshavn': [76.77, -18.67], 'America/Dawson': [64.06, -139.43], 'America/Dawson_Creek': [55.76, -120.24],
  'America/Denver': [39.74, -104.99], 'America/Detroit': [42.33, -83.05], 'America/Dominica': [15.30, -61.39], 'America/Edmonton': [53.55, -113.49],
  'America/Eirunepe': [-6.66, -69.87], 'America/El_Salvador': [13.69, -89.22], 'America/Fort_Nelson': [58.81, -122.70], 'America/Fortaleza': [-3.73, -38.53],
  'America/Glace_Bay': [46.20, -59.96], 'America/Goose_Bay': [53.30, -60.33], 'America/Grand_Turk': [21.47, -71.14], 'America/Grenada': [12.05, -61.75],
  'America/Guadeloupe': [16.24, -61.53], 'America/Guatemala': [14.63, -90.51], 'America/Guayaquil': [-2.19, -79.89], 'America/Guyana': [6.80, -58.16],
  'America/Halifax': [44.65, -63.58], 'America/Havana': [23.11, -82.37], 'America/Hermosillo': [29.07, -110.96], 'America/Indiana/Indianapolis': [39.77, -86.16],
  'America/Indianapolis': [39.77, -86.16], 'America/Inuvik': [68.36, -133.72], 'America/Iqaluit': [63.75, -68.52], 'America/Jamaica': [18.00, -76.79],
  'America/Juneau': [58.30, -134.42], 'America/Kentucky/Louisville': [38.25, -85.76], 'America/Louisville': [38.25, -85.76], 'America/Kralendijk': [12.15, -68.27],
  'America/La_Paz': [-16.50, -68.15], 'America/Lima': [-12.05, -77.04], 'America/Los_Angeles': [34.05, -118.24], 'America/Lower_Princes': [18.03, -63.05],
  'America/Maceio': [-9.67, -35.74], 'America/Managua': [12.11, -86.24], 'America/Manaus': [-3.12, -60.02], 'America/Marigot': [18.07, -63.08],
  'America/Martinique': [14.60, -61.07], 'America/Matamoros': [25.87, -97.50], 'America/Mazatlan': [23.25, -106.41], 'America/Menominee': [45.11, -87.61],
  'America/Merida': [20.97, -89.62], 'America/Metlakatla': [55.13, -131.57], 'America/Mexico_City': [19.43, -99.13], 'America/Miquelon': [47.10, -56.38],
  'America/Moncton': [46.09, -64.78], 'America/Monterrey': [25.69, -100.32], 'America/Montevideo': [-34.90, -56.16], 'America/Montserrat': [16.71, -62.22],
  'America/Nassau': [25.05, -77.35], 'America/New_York': [40.71, -74.01], 'America/Nome': [64.50, -165.41], 'America/Noronha': [-3.85, -32.42],
  'America/North_Dakota/Center': [47.12, -101.30], 'America/Nuuk': [64.18, -51.72], 'America/Godthab': [64.18, -51.72], 'America/Ojinaga': [29.56, -104.42],
  'America/Panama': [8.98, -79.52], 'America/Paramaribo': [5.85, -55.20], 'America/Phoenix': [33.45, -112.07], 'America/Port-au-Prince': [18.59, -72.31],
  'America/Port_of_Spain': [10.66, -61.51], 'America/Porto_Velho': [-8.76, -63.90], 'America/Puerto_Rico': [18.47, -66.11], 'America/Punta_Arenas': [-53.16, -70.91],
  'America/Rankin_Inlet': [62.81, -92.09], 'America/Recife': [-8.05, -34.88], 'America/Regina': [50.45, -104.62], 'America/Resolute': [74.70, -94.83],
  'America/Rio_Branco': [-9.97, -67.81], 'America/Santarem': [-2.44, -54.71], 'America/Santiago': [-33.45, -70.67], 'America/Santo_Domingo': [18.49, -69.93],
  'America/Sao_Paulo': [-23.55, -46.63], 'America/Scoresbysund': [70.49, -21.96], 'America/Sitka': [57.05, -135.33], 'America/St_Barthelemy': [17.90, -62.85],
  'America/St_Johns': [47.56, -52.71], 'America/St_Kitts': [17.30, -62.72], 'America/St_Lucia': [14.01, -60.99], 'America/St_Thomas': [18.34, -64.93],
  'America/St_Vincent': [13.16, -61.23], 'America/Swift_Current': [50.29, -107.79], 'America/Tegucigalpa': [14.07, -87.19], 'America/Thule': [76.53, -68.70],
  'America/Tijuana': [32.51, -117.04], 'America/Toronto': [43.65, -79.38], 'America/Tortola': [18.43, -64.62], 'America/Vancouver': [49.28, -123.12],
  'America/Whitehorse': [60.72, -135.06], 'America/Winnipeg': [49.90, -97.14], 'America/Yakutat': [59.55, -139.73], 'America/Montreal': [45.50, -73.57],
  'America/Buenos_Aires': [-34.60, -58.38],
  // Antarctica / Arctic
  'Antarctica/McMurdo': [-77.85, 166.67], 'Antarctica/Palmer': [-64.77, -64.05], 'Antarctica/Casey': [-66.28, 110.53], 'Antarctica/Davis': [-68.58, 77.97],
  'Antarctica/Mawson': [-67.60, 62.87], 'Antarctica/Rothera': [-67.57, -68.13], 'Antarctica/Syowa': [-69.00, 39.58], 'Antarctica/Troll': [-72.01, 2.53],
  'Antarctica/Vostok': [-78.46, 106.84], 'Antarctica/DumontDUrville': [-66.66, 140.00], 'Antarctica/Macquarie': [-54.50, 158.95], 'Arctic/Longyearbyen': [78.22, 15.65],
  // Asia
  'Asia/Aden': [12.79, 45.02], 'Asia/Almaty': [43.24, 76.89], 'Asia/Amman': [31.95, 35.93], 'Asia/Anadyr': [64.73, 177.51], 'Asia/Aqtau': [43.65, 51.17],
  'Asia/Aqtobe': [50.28, 57.17], 'Asia/Ashgabat': [37.96, 58.33], 'Asia/Atyrau': [47.10, 51.92], 'Asia/Baghdad': [33.31, 44.37], 'Asia/Bahrain': [26.23, 50.59],
  'Asia/Baku': [40.41, 49.87], 'Asia/Bangkok': [13.76, 100.50], 'Asia/Barnaul': [53.35, 83.78], 'Asia/Beirut': [33.89, 35.50], 'Asia/Bishkek': [42.87, 74.59],
  'Asia/Brunei': [4.90, 114.94], 'Asia/Calcutta': [22.57, 88.36], 'Asia/Chita': [52.03, 113.50], 'Asia/Colombo': [6.93, 79.86], 'Asia/Damascus': [33.51, 36.28],
  'Asia/Dhaka': [23.81, 90.41], 'Asia/Dili': [-8.56, 125.57], 'Asia/Dubai': [25.20, 55.27], 'Asia/Dushanbe': [38.56, 68.79], 'Asia/Famagusta': [35.12, 33.94],
  'Asia/Gaza': [31.50, 34.47], 'Asia/Hebron': [31.53, 35.10], 'Asia/Ho_Chi_Minh': [10.82, 106.63], 'Asia/Saigon': [10.82, 106.63], 'Asia/Hong_Kong': [22.32, 114.17],
  'Asia/Hovd': [48.01, 91.64], 'Asia/Irkutsk': [52.29, 104.28], 'Asia/Jakarta': [-6.21, 106.85], 'Asia/Jayapura': [-2.53, 140.72], 'Asia/Jerusalem': [31.77, 35.21],
  'Asia/Kabul': [34.56, 69.21], 'Asia/Kamchatka': [53.02, 158.65], 'Asia/Karachi': [24.86, 67.01], 'Asia/Kathmandu': [27.72, 85.32], 'Asia/Katmandu': [27.72, 85.32],
  'Asia/Khandyga': [62.66, 135.55], 'Asia/Kolkata': [19.08, 72.88], 'Asia/Krasnoyarsk': [56.01, 92.85], 'Asia/Kuala_Lumpur': [3.14, 101.69], 'Asia/Kuching': [1.55, 110.34],
  'Asia/Kuwait': [29.38, 47.99], 'Asia/Macau': [22.20, 113.54], 'Asia/Magadan': [59.56, 150.80], 'Asia/Makassar': [-5.15, 119.43], 'Asia/Manila': [14.60, 120.98],
  'Asia/Muscat': [23.59, 58.41], 'Asia/Nicosia': [35.19, 33.38], 'Asia/Novokuznetsk': [53.76, 87.14], 'Asia/Novosibirsk': [55.01, 82.93], 'Asia/Omsk': [54.99, 73.37],
  'Asia/Oral': [51.23, 51.37], 'Asia/Phnom_Penh': [11.56, 104.93], 'Asia/Pontianak': [-0.03, 109.33], 'Asia/Pyongyang': [39.04, 125.76], 'Asia/Qatar': [25.29, 51.53],
  'Asia/Qostanay': [53.21, 63.63], 'Asia/Qyzylorda': [44.85, 65.51], 'Asia/Rangoon': [16.87, 96.20], 'Asia/Yangon': [16.87, 96.20], 'Asia/Riyadh': [24.71, 46.68],
  'Asia/Sakhalin': [46.96, 142.73], 'Asia/Samarkand': [39.65, 66.96], 'Asia/Seoul': [37.57, 126.98], 'Asia/Shanghai': [31.23, 121.47], 'Asia/Singapore': [1.35, 103.82],
  'Asia/Srednekolymsk': [67.45, 153.73], 'Asia/Taipei': [25.03, 121.57], 'Asia/Tashkent': [41.30, 69.24], 'Asia/Tbilisi': [41.72, 44.79], 'Asia/Tehran': [35.69, 51.39],
  'Asia/Tel_Aviv': [32.09, 34.78], 'Asia/Thimphu': [27.47, 89.64], 'Asia/Tokyo': [35.68, 139.69], 'Asia/Tomsk': [56.50, 84.97], 'Asia/Ulaanbaatar': [47.89, 106.91],
  'Asia/Urumqi': [43.83, 87.62], 'Asia/Ust-Nera': [64.57, 143.24], 'Asia/Vientiane': [17.98, 102.63], 'Asia/Vladivostok': [43.12, 131.89], 'Asia/Yakutsk': [62.03, 129.73],
  'Asia/Yekaterinburg': [56.84, 60.61], 'Asia/Yerevan': [40.18, 44.51],
  // Atlantic
  'Atlantic/Azores': [37.74, -25.67], 'Atlantic/Bermuda': [32.29, -64.78], 'Atlantic/Canary': [28.12, -15.43], 'Atlantic/Cape_Verde': [14.93, -23.51],
  'Atlantic/Faroe': [62.01, -6.77], 'Atlantic/Madeira': [32.65, -16.91], 'Atlantic/Reykjavik': [64.15, -21.94], 'Atlantic/South_Georgia': [-54.28, -36.51],
  'Atlantic/St_Helena': [-15.92, -5.72], 'Atlantic/Stanley': [-51.70, -57.85],
  // Australia
  'Australia/Adelaide': [-34.93, 138.60], 'Australia/Brisbane': [-27.47, 153.03], 'Australia/Broken_Hill': [-31.95, 141.47], 'Australia/Darwin': [-12.46, 130.84],
  'Australia/Eucla': [-31.68, 128.88], 'Australia/Hobart': [-42.88, 147.33], 'Australia/Lindeman': [-20.45, 149.04], 'Australia/Lord_Howe': [-31.55, 159.08],
  'Australia/Melbourne': [-37.81, 144.96], 'Australia/Perth': [-31.95, 115.86], 'Australia/Sydney': [-33.87, 151.21], 'Australia/Canberra': [-35.28, 149.13],
  // Europe
  'Europe/Amsterdam': [52.37, 4.90], 'Europe/Andorra': [42.51, 1.52], 'Europe/Astrakhan': [46.35, 48.04], 'Europe/Athens': [37.98, 23.73], 'Europe/Belgrade': [44.79, 20.45],
  'Europe/Berlin': [52.52, 13.40], 'Europe/Bratislava': [48.15, 17.11], 'Europe/Brussels': [50.85, 4.35], 'Europe/Bucharest': [44.43, 26.10], 'Europe/Budapest': [47.50, 19.04],
  'Europe/Busingen': [47.70, 8.69], 'Europe/Chisinau': [47.01, 28.86], 'Europe/Copenhagen': [55.68, 12.57], 'Europe/Dublin': [53.35, -6.26], 'Europe/Gibraltar': [36.14, -5.35],
  'Europe/Guernsey': [49.45, -2.54], 'Europe/Helsinki': [60.17, 24.94], 'Europe/Isle_of_Man': [54.15, -4.48], 'Europe/Istanbul': [41.01, 28.98], 'Europe/Jersey': [49.19, -2.11],
  'Europe/Kaliningrad': [54.71, 20.51], 'Europe/Kiev': [50.45, 30.52], 'Europe/Kyiv': [50.45, 30.52], 'Europe/Kirov': [58.60, 49.66], 'Europe/Lisbon': [38.72, -9.14],
  'Europe/Ljubljana': [46.06, 14.51], 'Europe/London': [51.51, -0.13], 'Europe/Luxembourg': [49.61, 6.13], 'Europe/Madrid': [40.42, -3.70], 'Europe/Malta': [35.90, 14.51],
  'Europe/Mariehamn': [60.10, 19.94], 'Europe/Minsk': [53.90, 27.56], 'Europe/Monaco': [43.74, 7.42], 'Europe/Moscow': [55.76, 37.62], 'Europe/Oslo': [59.91, 10.75],
  'Europe/Paris': [48.86, 2.35], 'Europe/Podgorica': [42.44, 19.26], 'Europe/Prague': [50.08, 14.44], 'Europe/Riga': [56.95, 24.11], 'Europe/Rome': [41.90, 12.50],
  'Europe/Samara': [53.20, 50.15], 'Europe/San_Marino': [43.94, 12.45], 'Europe/Sarajevo': [43.86, 18.41], 'Europe/Saratov': [51.53, 46.03], 'Europe/Simferopol': [44.95, 34.10],
  'Europe/Skopje': [42.00, 21.43], 'Europe/Sofia': [42.70, 23.32], 'Europe/Stockholm': [59.33, 18.07], 'Europe/Tallinn': [59.44, 24.75], 'Europe/Tirane': [41.33, 19.82],
  'Europe/Ulyanovsk': [54.32, 48.40], 'Europe/Vaduz': [47.14, 9.52], 'Europe/Vatican': [41.90, 12.45], 'Europe/Vienna': [48.21, 16.37], 'Europe/Vilnius': [54.69, 25.28],
  'Europe/Volgograd': [48.71, 44.51], 'Europe/Warsaw': [52.23, 21.01], 'Europe/Zagreb': [45.81, 15.98], 'Europe/Zurich': [47.38, 8.54],
  // Indian
  'Indian/Antananarivo': [-18.88, 47.51], 'Indian/Chagos': [-7.31, 72.41], 'Indian/Christmas': [-10.42, 105.68], 'Indian/Cocos': [-12.19, 96.83],
  'Indian/Comoro': [-11.70, 43.26], 'Indian/Kerguelen': [-49.35, 70.22], 'Indian/Mahe': [-4.62, 55.45], 'Indian/Maldives': [4.18, 73.51],
  'Indian/Mauritius': [-20.16, 57.50], 'Indian/Mayotte': [-12.78, 45.23], 'Indian/Reunion': [-20.88, 55.45],
  // Pacific
  'Pacific/Apia': [-13.83, -171.76], 'Pacific/Auckland': [-36.85, 174.76], 'Pacific/Bougainville': [-6.23, 155.57], 'Pacific/Chatham': [-43.95, -176.55],
  'Pacific/Chuuk': [7.45, 151.85], 'Pacific/Easter': [-27.15, -109.43], 'Pacific/Efate': [-17.73, 168.32], 'Pacific/Fakaofo': [-9.37, -171.23],
  'Pacific/Fiji': [-18.14, 178.44], 'Pacific/Funafuti': [-8.52, 179.20], 'Pacific/Galapagos': [-0.90, -89.60], 'Pacific/Gambier': [-23.13, -134.95],
  'Pacific/Guadalcanal': [-9.43, 159.95], 'Pacific/Guam': [13.47, 144.75], 'Pacific/Honolulu': [21.31, -157.86], 'Pacific/Kanton': [-2.81, -171.67],
  'Pacific/Kiritimati': [1.87, -157.40], 'Pacific/Kosrae': [5.32, 162.98], 'Pacific/Kwajalein': [9.19, 167.42], 'Pacific/Majuro': [7.09, 171.38],
  'Pacific/Marquesas': [-9.00, -139.50], 'Pacific/Midway': [28.21, -177.38], 'Pacific/Nauru': [-0.55, 166.92], 'Pacific/Niue': [-19.06, -169.92],
  'Pacific/Norfolk': [-29.06, 167.96], 'Pacific/Noumea': [-22.28, 166.46], 'Pacific/Pago_Pago': [-14.28, -170.70], 'Pacific/Palau': [7.34, 134.48],
  'Pacific/Pitcairn': [-25.07, -130.10], 'Pacific/Pohnpei': [6.96, 158.21], 'Pacific/Port_Moresby': [-9.44, 147.18], 'Pacific/Rarotonga': [-21.23, -159.78],
  'Pacific/Saipan': [15.18, 145.75], 'Pacific/Tahiti': [-17.53, -149.57], 'Pacific/Tarawa': [1.45, 172.97], 'Pacific/Tongatapu': [-21.14, -175.20],
  'Pacific/Wake': [19.28, 166.65], 'Pacific/Wallis': [-13.28, -176.17],
  // Legacy / secondary ids
  'Africa/Asmera': [15.32, 38.93], 'America/Catamarca': [-28.47, -65.78], 'America/Coral_Harbour': [48.76, -91.62], 'America/Cordoba': [-31.42, -64.18],
  'America/Coyhaique': [-45.57, -72.07], 'America/Creston': [49.10, -116.51], 'America/Indiana/Knox': [41.30, -86.63], 'America/Indiana/Marengo': [38.38, -86.34],
  'America/Indiana/Petersburg': [38.49, -87.28], 'America/Indiana/Tell_City': [37.95, -86.76], 'America/Indiana/Vevay': [38.75, -85.07], 'America/Indiana/Vincennes': [38.68, -87.53],
  'America/Indiana/Winamac': [41.05, -86.60], 'America/Jujuy': [-24.19, -65.30], 'America/Kentucky/Monticello': [36.83, -84.85], 'America/Mendoza': [-32.89, -68.83],
  'America/North_Dakota/Beulah': [47.26, -101.78], 'America/North_Dakota/New_Salem': [46.85, -101.41], 'Atlantic/Faeroe': [62.01, -6.77], 'Pacific/Enderbury': [-2.81, -171.67],
  'Pacific/Ponape': [6.96, 158.21], 'Pacific/Truk': [7.45, 151.85],
  'UTC': [51.48, 0.00],
};

// ISO 3166 country of each zone, so the country shown next to a city is localized (Intl.DisplayNames) and zones
// without ZONE_META show a country instead of only a continent ("Budapest · Hungary", not "Budapest · Europe").
window.ZONE_CC = (() => {
  const out = {};
  const add = (area, list) => { for (const pair of list.split(' ')) { const [z, cc] = pair.split(':'); out[area + '/' + z] = cc; } };
  add('Africa', 'Abidjan:CI Accra:GH Addis_Ababa:ET Algiers:DZ Asmara:ER Asmera:ER Bamako:ML Bangui:CF Banjul:GM Bissau:GW Blantyre:MW Brazzaville:CG Bujumbura:BI Cairo:EG Casablanca:MA Ceuta:ES Conakry:GN Dakar:SN Dar_es_Salaam:TZ Djibouti:DJ Douala:CM El_Aaiun:EH Freetown:SL Gaborone:BW Harare:ZW Johannesburg:ZA Juba:SS Kampala:UG Khartoum:SD Kigali:RW Kinshasa:CD Lagos:NG Libreville:GA Lome:TG Luanda:AO Lubumbashi:CD Lusaka:ZM Malabo:GQ Maputo:MZ Maseru:LS Mbabane:SZ Mogadishu:SO Monrovia:LR Nairobi:KE Ndjamena:TD Niamey:NE Nouakchott:MR Ouagadougou:BF Porto-Novo:BJ Sao_Tome:ST Tripoli:LY Tunis:TN Windhoek:NA');
  add('America', 'Adak:US Anchorage:US Anguilla:AI Antigua:AG Araguaina:BR Argentina/Buenos_Aires:AR Argentina/Catamarca:AR Argentina/Cordoba:AR Argentina/Jujuy:AR Argentina/La_Rioja:AR Argentina/Mendoza:AR Argentina/Rio_Gallegos:AR Argentina/Salta:AR Argentina/San_Juan:AR Argentina/San_Luis:AR Argentina/Tucuman:AR Argentina/Ushuaia:AR Aruba:AW Asuncion:PY Atikokan:CA Bahia:BR Bahia_Banderas:MX Barbados:BB Belem:BR Belize:BZ Blanc-Sablon:CA Boa_Vista:BR Bogota:CO Boise:US Buenos_Aires:AR Cambridge_Bay:CA Campo_Grande:BR Cancun:MX Caracas:VE Catamarca:AR Cayenne:GF Cayman:KY Chicago:US Chihuahua:MX Ciudad_Juarez:MX Coral_Harbour:CA Cordoba:AR Costa_Rica:CR Coyhaique:CL Creston:CA Cuiaba:BR Curacao:CW Danmarkshavn:GL Dawson:CA Dawson_Creek:CA Denver:US Detroit:US Dominica:DM Edmonton:CA Eirunepe:BR El_Salvador:SV Fort_Nelson:CA Fortaleza:BR Glace_Bay:CA Godthab:GL Goose_Bay:CA Grand_Turk:TC Grenada:GD Guadeloupe:GP Guatemala:GT Guayaquil:EC Guyana:GY Halifax:CA Havana:CU Hermosillo:MX Indiana/Indianapolis:US Indiana/Knox:US Indiana/Marengo:US Indiana/Petersburg:US Indiana/Tell_City:US Indiana/Vevay:US Indiana/Vincennes:US Indiana/Winamac:US Indianapolis:US Inuvik:CA Iqaluit:CA Jamaica:JM Jujuy:AR Juneau:US Kentucky/Louisville:US Kentucky/Monticello:US Kralendijk:BQ La_Paz:BO Lima:PE Los_Angeles:US Louisville:US Lower_Princes:SX Maceio:BR Managua:NI Manaus:BR Marigot:MF Martinique:MQ Matamoros:MX Mazatlan:MX Mendoza:AR Menominee:US Merida:MX Metlakatla:US Mexico_City:MX Miquelon:PM Moncton:CA Monterrey:MX Montevideo:UY Montreal:CA Montserrat:MS Nassau:BS New_York:US Nome:US Noronha:BR North_Dakota/Beulah:US North_Dakota/Center:US North_Dakota/New_Salem:US Nuuk:GL Ojinaga:MX Panama:PA Paramaribo:SR Phoenix:US Port-au-Prince:HT Port_of_Spain:TT Porto_Velho:BR Puerto_Rico:PR Punta_Arenas:CL Rankin_Inlet:CA Recife:BR Regina:CA Resolute:CA Rio_Branco:BR Santarem:BR Santiago:CL Santo_Domingo:DO Sao_Paulo:BR Scoresbysund:GL Sitka:US St_Barthelemy:BL St_Johns:CA St_Kitts:KN St_Lucia:LC St_Thomas:VI St_Vincent:VC Swift_Current:CA Tegucigalpa:HN Thule:GL Tijuana:MX Toronto:CA Tortola:VG Vancouver:CA Whitehorse:CA Winnipeg:CA Yakutat:US');
  add('Antarctica', 'Casey:AQ Davis:AQ DumontDUrville:AQ Macquarie:AU Mawson:AQ McMurdo:AQ Palmer:AQ Rothera:AQ Syowa:AQ Troll:AQ Vostok:AQ');
  add('Arctic', 'Longyearbyen:SJ');
  add('Asia', 'Aden:YE Almaty:KZ Amman:JO Anadyr:RU Aqtau:KZ Aqtobe:KZ Ashgabat:TM Atyrau:KZ Baghdad:IQ Bahrain:BH Baku:AZ Bangkok:TH Barnaul:RU Beirut:LB Bishkek:KG Brunei:BN Calcutta:IN Chita:RU Colombo:LK Damascus:SY Dhaka:BD Dili:TL Dubai:AE Dushanbe:TJ Famagusta:CY Gaza:PS Hebron:PS Ho_Chi_Minh:VN Hong_Kong:HK Hovd:MN Irkutsk:RU Jakarta:ID Jayapura:ID Jerusalem:IL Kabul:AF Kamchatka:RU Karachi:PK Kathmandu:NP Katmandu:NP Khandyga:RU Kolkata:IN Krasnoyarsk:RU Kuala_Lumpur:MY Kuching:MY Kuwait:KW Macau:MO Magadan:RU Makassar:ID Manila:PH Muscat:OM Nicosia:CY Novokuznetsk:RU Novosibirsk:RU Omsk:RU Oral:KZ Phnom_Penh:KH Pontianak:ID Pyongyang:KP Qatar:QA Qostanay:KZ Qyzylorda:KZ Rangoon:MM Riyadh:SA Saigon:VN Sakhalin:RU Samarkand:UZ Seoul:KR Shanghai:CN Singapore:SG Srednekolymsk:RU Taipei:TW Tashkent:UZ Tbilisi:GE Tehran:IR Tel_Aviv:IL Thimphu:BT Tokyo:JP Tomsk:RU Ulaanbaatar:MN Urumqi:CN Ust-Nera:RU Vientiane:LA Vladivostok:RU Yakutsk:RU Yangon:MM Yekaterinburg:RU Yerevan:AM');
  add('Atlantic', 'Azores:PT Bermuda:BM Canary:ES Cape_Verde:CV Faeroe:FO Faroe:FO Madeira:PT Reykjavik:IS South_Georgia:GS St_Helena:SH Stanley:FK');
  add('Australia', 'Adelaide:AU Brisbane:AU Broken_Hill:AU Canberra:AU Darwin:AU Eucla:AU Hobart:AU Lindeman:AU Lord_Howe:AU Melbourne:AU Perth:AU Sydney:AU');
  add('Europe', 'Amsterdam:NL Andorra:AD Astrakhan:RU Athens:GR Belgrade:RS Berlin:DE Bratislava:SK Brussels:BE Bucharest:RO Budapest:HU Busingen:DE Chisinau:MD Copenhagen:DK Dublin:IE Gibraltar:GI Guernsey:GG Helsinki:FI Isle_of_Man:IM Istanbul:TR Jersey:JE Kaliningrad:RU Kiev:UA Kirov:RU Kyiv:UA Lisbon:PT Ljubljana:SI London:GB Luxembourg:LU Madrid:ES Malta:MT Mariehamn:AX Minsk:BY Monaco:MC Moscow:RU Oslo:NO Paris:FR Podgorica:ME Prague:CZ Riga:LV Rome:IT Samara:RU San_Marino:SM Sarajevo:BA Saratov:RU Skopje:MK Sofia:BG Stockholm:SE Tallinn:EE Tirane:AL Ulyanovsk:RU Vaduz:LI Vatican:VA Vienna:AT Vilnius:LT Volgograd:RU Warsaw:PL Zagreb:HR Zurich:CH');
  add('Indian', 'Antananarivo:MG Chagos:IO Christmas:CX Cocos:CC Comoro:KM Kerguelen:TF Mahe:SC Maldives:MV Mauritius:MU Mayotte:YT Reunion:RE');
  add('Pacific', 'Apia:WS Auckland:NZ Bougainville:PG Chatham:NZ Chuuk:FM Easter:CL Efate:VU Enderbury:KI Fakaofo:TK Fiji:FJ Funafuti:TV Galapagos:EC Gambier:PF Guadalcanal:SB Guam:GU Honolulu:US Kanton:KI Kiritimati:KI Kosrae:FM Kwajalein:MH Majuro:MH Marquesas:PF Midway:UM Nauru:NR Niue:NU Norfolk:NF Noumea:NC Pago_Pago:AS Palau:PW Pitcairn:PN Pohnpei:FM Ponape:FM Port_Moresby:PG Rarotonga:CK Saipan:MP Tahiti:PF Tarawa:KI Tongatapu:TO Truk:FM Wake:UM Wallis:WF');
  return out;
})();

// City names that differ in Portuguese / Spanish (everything else keeps the ZONE_META name).
window.ZONE_I18N = {
  pt: {
    'Europe/Lisbon': 'Lisboa', 'Europe/London': 'Londres', 'Europe/Berlin': 'Berlim', 'Europe/Amsterdam': 'Amsterdã', 'Europe/Brussels': 'Bruxelas',
    'Europe/Zurich': 'Zurique', 'Europe/Rome': 'Roma', 'Europe/Vienna': 'Viena', 'Europe/Prague': 'Praga', 'Europe/Warsaw': 'Varsóvia',
    'Europe/Stockholm': 'Estocolmo', 'Europe/Copenhagen': 'Copenhague', 'Europe/Helsinki': 'Helsinque', 'Europe/Athens': 'Atenas',
    'Europe/Istanbul': 'Istambul', 'Europe/Kyiv': 'Kiev', 'Europe/Moscow': 'Moscou', 'Europe/Bucharest': 'Bucareste',
    'Africa/Johannesburg': 'Joanesburgo', 'Asia/Riyadh': 'Riad', 'Asia/Tehran': 'Teerã', 'Asia/Dhaka': 'Daca', 'Asia/Jakarta': 'Jacarta',
    'Asia/Singapore': 'Singapura', 'Asia/Ho_Chi_Minh': 'Cidade de Ho Chi Minh', 'Asia/Shanghai': 'Xangai', 'Asia/Seoul': 'Seul',
    'Asia/Tokyo': 'Tóquio', 'America/Mexico_City': 'Cidade do México', 'America/New_York': 'Nova York', 'Atlantic/Azores': 'Açores',
  },
  es: {
    'Europe/Lisbon': 'Lisboa', 'Europe/London': 'Londres', 'Europe/Berlin': 'Berlín', 'Europe/Amsterdam': 'Ámsterdam', 'Europe/Brussels': 'Bruselas',
    'Europe/Zurich': 'Zúrich', 'Europe/Rome': 'Roma', 'Europe/Vienna': 'Viena', 'Europe/Prague': 'Praga', 'Europe/Warsaw': 'Varsovia',
    'Europe/Stockholm': 'Estocolmo', 'Europe/Copenhagen': 'Copenhague', 'Europe/Athens': 'Atenas', 'Europe/Istanbul': 'Estambul',
    'Europe/Kyiv': 'Kiev', 'Europe/Moscow': 'Moscú', 'Europe/Bucharest': 'Bucarest', 'Africa/Cairo': 'El Cairo',
    'Africa/Johannesburg': 'Johannesburgo', 'Asia/Dubai': 'Dubái', 'Asia/Riyadh': 'Riad', 'Asia/Tehran': 'Teherán', 'Asia/Kolkata': 'Bombay',
    'Asia/Dhaka': 'Daca', 'Asia/Jakarta': 'Yakarta', 'Asia/Singapore': 'Singapur', 'Asia/Ho_Chi_Minh': 'Ciudad Ho Chi Minh',
    'Asia/Shanghai': 'Shanghái', 'Asia/Taipei': 'Taipéi', 'Asia/Seoul': 'Seúl', 'Asia/Tokyo': 'Tokio', 'Australia/Sydney': 'Sídney',
    'America/Mexico_City': 'Ciudad de México', 'America/New_York': 'Nueva York',
  },
};
} catch (e) { console.error('Open World Clock: zones.js failed to start', e); }

/* ---------- src/renderer/time.js ---------- */
try {
// Pure time helpers (no DOM access). Exposed as window.WCTime.
(() => {
  'use strict';
  // Intl.DateTimeFormat instances are costly to build, so they are cached, but the cache is a small LRU: a few cards
  // in a few formats need well under 300, and a search or a long session over many zones never grows it past that.
  const FMT_CAP = 300;
  const fmtCache = new Map();

  function fmt(zone, opts, locale) {
    const loc = locale || 'en-US';
    const key = loc + '|' + zone + JSON.stringify(opts);
    let f = fmtCache.get(key);
    if (f) { fmtCache.delete(key); fmtCache.set(key, f); return f; } // most recently used goes last
    f = new Intl.DateTimeFormat(loc, { timeZone: zone, ...opts });
    if (fmtCache.size >= FMT_CAP) fmtCache.delete(fmtCache.keys().next().value);
    fmtCache.set(key, f);
    return f;
  }
  function parts(zone, date, opts, locale) {
    const out = {};
    for (const p of fmt(zone, opts, locale).formatToParts(date)) out[p.type] = p.value;
    return out;
  }
  const YMD = { year: 'numeric', month: '2-digit', day: '2-digit' };

  const OFFSET_OPTS = { hourCycle: 'h23', ...YMD, hour: '2-digit', minute: '2-digit', second: '2-digit' };
  function offsetFrom(f, date) {
    const p = {};
    for (const x of f.formatToParts(date)) p[x.type] = x.value;
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  }
  function offsetMinutes(zone, date) { return offsetFrom(fmt(zone, OFFSET_OPTS), date); }
  // The same without the cache, for one-off passes over every zone (an offset search), which would otherwise push
  // the cards' formatters out of it.
  function offsetMinutesUncached(zone, date) { return offsetFrom(new Intl.DateTimeFormat('en-US', { timeZone: zone, ...OFFSET_OPTS }), date); }
  // "+5:30", "-7", "+0"
  function formatOffset(mins) {
    const sign = mins < 0 ? '-' : '+';
    const a = Math.abs(mins), h = Math.floor(a / 60), m = a % 60;
    return `${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
  }
  // Convert a wall-clock time in `zone` to an epoch. Handles DST: in an overlap (clock set back) the first
  // occurrence wins; in a gap (clock set forward) the time is shifted forward by the gap, matching OS behavior.
  function zonedToEpoch(zone, y, m, d, h, mi) {
    const wall = Date.UTC(y, m - 1, d, h, mi);
    const DAY = 86400000;
    const offsets = [...new Set([offsetMinutes(zone, new Date(wall - DAY)), offsetMinutes(zone, new Date(wall + DAY))])];
    const valid = offsets.map((o) => wall - o * 60000).filter((e) => offsetMinutes(zone, new Date(e)) * 60000 === wall - e);
    if (valid.length) return Math.min(...valid);
    return wall - offsets[0] * 60000; // gap: use the pre-transition offset
  }
  function dayDiff(zone, date, refZone) {
    const a = parts(zone, date, YMD);
    const b = parts(refZone, date, YMD);
    return Math.round((Date.UTC(+a.year, +a.month - 1, +a.day) - Date.UTC(+b.year, +b.month - 1, +b.day)) / 86400000);
  }
  // Accepts "9", "09", "930", "9:30", "9.30", "3pm", "3 pm", "3:15pm", "15h", "15h30". Returns [h, m] or null.
  function parseTime(text) {
    const t = String(text || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!t) return null;
    const m = t.match(/^(\d{1,2})(?:[:.h]?(\d{2}))?h?(am|pm|a|p)?$/);
    if (!m) return null;
    let h = +m[1]; const mi = m[2] ? +m[2] : 0; const ap = m[3];
    if (mi > 59) return null;
    if (ap) { if (h < 1 || h > 12) return null; h = h % 12 + (ap[0] === 'p' ? 12 : 0); }
    else if (h > 23) return null;
    return [h, mi];
  }
  // A time with a place, for the converter field: "3pm Tokyo", "3 pm in Tokyo", "15:00 EST", "15h30 lisboa",
  // "tokyo 3pm", "Tokyo at 3pm", "às 15h em Lisboa", "a las 3pm en Madrid". Returns { time: [h, m], place } or null
  // (a plain time like "3pm", a place alone, or no parseable time). The place is returned as typed (trimmed); the
  // caller resolves it to a zone.
  const TIME_RE = '(\\d{1,2}(?:[:.h]\\d{2})?h?(?:\\s?(?:am|pm)|[ap])?)';
  const LEAD_RE = /^(?:at|às|as|a las|a la|las)\s+/i;
  const TIME_FIRST = new RegExp(`^${TIME_RE}(?:\\s+(?:in|at|em|no|na|en|a las|às))?\\s+(.+)$`, 'i');
  const PLACE_FIRST = new RegExp(`^(.+?)(?:\\s+(?:at|às|as|a las|a la))?\\s+${TIME_RE}$`, 'i');
  function splitTimePlace(text) {
    const s = String(text || '').trim().replace(/\s+/g, ' ').replace(/[.,!?;]+$/, '');
    if (!s || parseTime(s)) return null;
    const ok = (tm, place) => {
      const time = parseTime(tm);
      place = String(place || '').trim();
      // the place needs a letter and must not be a time or a day period on its own
      if (!time || !place || !/\p{L}/u.test(place) || parseTime(place) || /^(?:am|pm|a|p|h)$/i.test(place)) return null;
      return { time, place };
    };
    const body = s.replace(LEAD_RE, '');
    let m = TIME_FIRST.exec(body);
    const first = m && ok(m[1], m[2]);
    if (first) return first;
    m = PLACE_FIRST.exec(s);
    return (m && ok(m[2], m[1].replace(LEAD_RE, '').replace(/^(?:in|em|en|no|na)\s+/i, ''))) || null;
  }
  function phaseOf(hour) {
    if (hour < 5) return 'night';
    if (hour < 7) return 'dawn';
    if (hour < 11) return 'morning';
    if (hour < 14) return 'midday';
    if (hour < 17) return 'afternoon';
    if (hour < 19) return 'golden';
    if (hour < 21) return 'dusk';
    return 'night';
  }
  // Zones that show the same time all year form one group: same UTC offset at refMs and on Jan 15 and Jul 15 (UTC) of
  // refMs's year, so the same DST rule too. Keeps the first zone of each group, in order, and drops the later ones
  // (Lisbon and London, for example). Zones on different DST rules that only share a winter offset both stay.
  function uniqueClocks(zones, refMs) {
    const y = new Date(refMs).getUTCFullYear();
    const at = [new Date(refMs), new Date(Date.UTC(y, 0, 15)), new Date(Date.UTC(y, 6, 15))];
    const seen = new Set(), out = [];
    for (const z of zones) {
      let key;
      try { key = at.map((d) => offsetMinutes(z, d)).join('|'); } catch { key = 'zone:' + z; } // unknown zone: its own group
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(z);
    }
    return out;
  }

  // Planner fallback when no hour works for everyone. `states` has one array of 24 'work' | 'night' | 'off' values per
  // row (city); `prefer` lists the rows that should win ties (the home city and the planner source). Each hour scores
  // [cities working, preferred cities working, minus cities at night], compared in that order. Returns the longest run
  // of top-scoring hours (the earliest on a tie) as { start, end (exclusive), working, total, out: rows not working at
  // start }, or null with fewer than 2 rows, when every row works at some hour (the overlap band covers that) or when
  // at most one row works at any hour.
  function bestHours(states, prefer) {
    const rows = Array.isArray(states) ? states : [];
    const total = rows.length;
    if (total < 2) return null;
    const pref = new Set((Array.isArray(prefer) ? prefer : []).filter((i) => Number.isInteger(i) && i >= 0 && i < total));
    const score = [];
    for (let h = 0; h < 24; h++) {
      let w = 0, p = 0, n = 0;
      rows.forEach((row, i) => {
        const st = row && row[h];
        if (st === 'work') { w++; if (pref.has(i)) p++; } else if (st === 'night') n++;
      });
      score.push([w, p, -n]);
    }
    const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    const top = score.reduce((m, s) => (cmp(s, m) > 0 ? s : m));
    if (top[0] >= total || top[0] < 2) return null;
    let best = null, start = -1;
    for (let h = 0; h <= 24; h++) {
      const on = h < 24 && cmp(score[h], top) === 0;
      if (on && start < 0) start = h;
      if (!on && start >= 0) { if (!best || h - start > best.end - best.start) best = { start, end: h }; start = -1; }
    }
    const out = [];
    rows.forEach((row, i) => { if (!row || row[best.start] !== 'work') out.push(i); });
    return { start: best.start, end: best.end, working: top[0], total, out };
  }

  window.WCTime = { fmt, parts, offsetMinutes, offsetMinutesUncached, formatOffset, zonedToEpoch, dayDiff, parseTime, splitTimePlace, phaseOf,
    uniqueClocks, bestHours, _fmtSize: () => fmtCache.size };
})();
} catch (e) { console.error('Open World Clock: time.js failed to start', e); }

/* ---------- src/renderer/sun.js ---------- */
try {
// Offline solar position and sunrise/sunset (NOAA/Astronomy Answers formulas).
// Derived from SunCalc, https://github.com/mourner/suncalc, used under the BSD 2-Clause License:
//
// Copyright (c) 2026, Volodymyr Agafonkin
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without modification, are
// permitted provided that the following conditions are met:
//
//    1. Redistributions of source code must retain the above copyright notice, this list of
//       conditions and the following disclaimer.
//
//    2. Redistributions in binary form must reproduce the above copyright notice, this list
//       of conditions and the following disclaimer in the documentation and/or other materials
//       provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
// EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
// COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
// EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
// HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
// TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// Pure functions, no DOM. Exposes window.WCSun.
(function () {
  const rad = Math.PI / 180;
  const dayMs = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const J0 = 0.0009;
  const e = rad * 23.4397; // obliquity of the Earth
  const H0 = -0.833 * rad; // sunrise/sunset altitude (refraction + solar disc)

  const toJulian = (date) => date.valueOf() / dayMs - 0.5 + J1970;
  const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
  const toDays = (date) => toJulian(date) - J2000;

  const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
  function eclipticLongitude(M) {
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const P = rad * 102.9372; // perihelion of the Earth
    return M + C + P + Math.PI;
  }
  const declination = (L) => Math.asin(Math.sin(e) * Math.sin(L));
  const rightAscension = (L) => Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

  function altitude(date, lat, lng) {
    const lw = rad * -lng;
    const phi = rad * lat;
    const d = toDays(date);
    const L = eclipticLongitude(solarMeanAnomaly(d));
    const dec = declination(L);
    const H = siderealTime(d, lw) - rightAscension(L);
    const h = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    return h / rad;
  }

  const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * Math.PI));
  const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n;
  const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

  // Sunrise/sunset for the solar day nearest `date` at the given location.
  function times(date, lat, lng) {
    const lw = rad * -lng;
    const phi = rad * lat;
    const d = toDays(date);
    const n = julianCycle(d, lw);
    const ds = approxTransit(0, lw, n);
    const M = solarMeanAnomaly(ds);
    const L = eclipticLongitude(M);
    const dec = declination(L);
    const Jnoon = solarTransitJ(ds, M, L);
    const cosW = (Math.sin(H0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (cosW < -1) return { sunrise: null, sunset: null, polar: 'day' };
    if (cosW > 1) return { sunrise: null, sunset: null, polar: 'night' };
    const w = Math.acos(cosW);
    const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
    const Jrise = Jnoon - (Jset - Jnoon);
    return { sunrise: refine(fromJulian(Jrise), lat, lng), sunset: refine(fromJulian(Jset), lat, lng), polar: null };
  }

  // Newton steps so the event lands exactly where altitude() crosses -0.833 deg (keeps isDay consistent).
  function refine(date, lat, lng) {
    let t = date.getTime();
    for (let i = 0; i < 3; i++) {
      const a = altitude(new Date(t), lat, lng) + 0.833;
      const rate = (altitude(new Date(t + 60000), lat, lng) - altitude(new Date(t - 60000), lat, lng)) / 120000;
      if (!rate || Math.abs(a) < 1e-4) break;
      const step = a / rate;
      if (Math.abs(step) > 1800000) break; // grazing sun: keep the analytic estimate
      t -= step;
    }
    return new Date(t);
  }

  const isDay = (date, lat, lng) => altitude(date, lat, lng) > -0.833;

  const api = { times, altitude, isDay };
  if (typeof window !== 'undefined') window.WCSun = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
} catch (e) { console.error('Open World Clock: sun.js failed to start', e); }

/* ---------- src/renderer/i18n.js ---------- */
try {
// UI strings. Exposed as window.WCI18N = { t(key, vars), setLang(lang, systemLang, systemLocale), lang, locale }.
// Rule: no en or em dashes in any UI string (use "to", a middle dot or a colon). "−" in day markers is a minus sign.
(() => {
  'use strict';
  const en = {
    'app.title': 'Open World Clock',
    'bar.grip': 'Drag to move',
    'conv.ifIts': 'If it’s',
    'conv.in': 'in',
    'conv.placeholder': '9:30 or 3pm',
    'conv.timeAria': 'Time to convert',
    'conv.sliderAria': 'Time slider',
    'conv.zoneAria': 'Source time zone',
    'conv.clear': 'Back to now',
    'conv.clearTitle': 'Stop converting and show the current time',
    'conv.local': '{city} (local)',
    'conv.copyTimes': 'Copy times',
    'hint.when': 'When it is {time} in {city}',
    'hint.whenOn': 'When it is {time} in {city} on {date}',
    'hint.invalid': 'Type a time like 9, 9:30, 930 or 3pm',
    'hint.copied': 'Copied',
    'hint.addFirst': 'Add {city} first to convert from it',
    'hint.noPlace': 'No city called {place}',
    'copy.header': 'When it is {time} in {city}:',
    'search.placeholder': 'Add city',
    'search.aria': 'Add a city',
    'search.none': 'No matching cities',
    'search.already': '{city} is already on your list',
    'btn.pin': 'Pin above all windows',
    'btn.pinned': 'Pinned above all windows. Click to unpin',
    'btn.settings': 'Settings',
    'btn.hide': 'Hide to tray',
    'btn.hideAria': 'Hide',
    'btn.quit': 'Quit',
    'btn.minimize': 'Minimize',
    'btn.close': 'Close to tray',
    'btn.closeTitle': 'Close to tray. Quit from the tray menu.',
    'btn.help': 'Help and shortcuts',
    'btn.planner': 'Meeting planner',
    'btn.map': 'World map',
    'menu.aria': 'City options',
    'menu.source': 'Use as converter source',
    'menu.rename': 'Rename…',
    'menu.hours': 'Working hours…',
    'menu.copy': 'Copy time',
    'menu.left': 'Move left',
    'menu.right': 'Move right',
    'menu.up': 'Move up',
    'menu.down': 'Move down',
    'menu.remove': 'Remove',
    'panel.title': 'Settings',
    'panel.close': 'Close settings',
    'panel.display': 'Display',
    'panel.window': 'Window',
    'opt.hour24': '24-hour clock',
    'opt.seconds': 'Show seconds',
    'opt.theme': 'Theme',
    'opt.theme.system': 'System',
    'opt.theme.light': 'Light',
    'opt.theme.dark': 'Dark',
    'opt.layout': 'Layout',
    'opt.layout.strip': 'Strip',
    'opt.layout.compact': 'Compact',
    'opt.layout.vertical': 'Vertical',
    'opt.language': 'Language',
    'opt.language.auto': 'Auto',
    'opt.opacity': 'Background opacity',
    'opt.top': 'Always on top',
    'opt.login': 'Launch at login',
    'opt.login.portable': 'Registers the portable launcher you ran. Move the exe and re-enable this.',
    'opt.login.store': 'Managed by Windows Startup apps',
    'opt.login.open': 'Open Startup apps',
    'about.text': 'Free, open source, no telemetry.',
    'card.home': 'Home',
    'card.more': 'Card options',
    'card.moreTitle': 'Options',
    'card.title': 'Drag to reorder. Double-click to convert from this city',
    'card.renameAria': 'Custom label for {city}',
    'card.asleep': 'likely asleep',
    'rel.local': 'Local',
    'phase.night': 'Night', 'phase.dawn': 'Dawn', 'phase.morning': 'Morning', 'phase.midday': 'Midday',
    'phase.afternoon': 'Afternoon', 'phase.golden': 'Golden', 'phase.dusk': 'Dusk',
    'sun.times': 'Sunrise {rise} · Sunset {set}', 'sun.noSet': "Sun doesn't set today", 'sun.noRise': "Sun doesn't rise today",
    'day.plus1': '+1 day', 'day.plusN': '+{n} days', 'day.minus1': '−1 day', 'day.minusN': '−{n} days',
    'day.today': 'Today', 'day.tomorrow': 'Tomorrow', 'dates.aria': 'Date to convert',
    'empty.title': 'No cities yet',
    'empty.sub': 'Try Tokyo, London or New York',
    'empty.add': 'Add a city',
    'help.title': 'Tips', 'tip.close': 'Close help',
    'tip.chip1': 'Type a time like 3pm or 3pm Tokyo to see it in every city', 'tip.chip2': 'Scroll over a clock, or drag its day line, to move through the day',
    'tip.chip3': 'Double-click a city to convert from its time', 'tip.chip4': 'Right-click a city to rename it or set its working hours',
    'tip.chip5': 'Drag cards to reorder, and drag empty space to move the window',
    'say.added': '{city} added',
    'say.removed': '{city} removed',
    'say.renamed': '{old} renamed to {name}',
    'say.moved': '{city} moved to position {n}',
    'say.converted': 'Showing times for {time} in {city}',
    'say.now': 'Showing the current time',
    'say.copied': 'Copied to clipboard',
    'say.hoursSaved': 'Working hours saved for {city}', 'say.hoursReset': 'Working hours reset for {city}',
    'hours.title': 'Working hours', 'hours.start': 'Start time', 'hours.end': 'End time', 'hours.to': 'to', 'hours.days': 'Working days',
    'hours.save': 'Save', 'hours.reset': 'Reset', 'hours.invalid': 'Use two different times, like 9:00 and 18:00',
    'hours.noDays': 'Pick at least one day', 'hours.overnight': 'Ends the next day', 'hours.aria': 'Working hours for {city}',
    'plan.aria': 'Meeting planner', 'plan.overlap': '{n} h overlap', 'plan.none': 'No overlap', 'plan.more': '+{n} more',
    'plan.range': '{start} to {end}',
    'plan.best': 'Best: {range} ({city}), {n} of {total} working', 'plan.bestOut': 'Outside hours: {list}',
    'plan.caption': 'Hours in {city} · {date}', 'plan.empty': 'Add cities to compare working hours',
    'plan.cell': '{time} in {src}: {local} in {city}, {state}', 'plan.state.work': 'working', 'plan.state.night': 'night', 'plan.state.off': 'off hours',
    'plan.edit': 'Edit working hours for {city}', 'plan.legend.work': 'Working', 'plan.legend.night': 'Night',
    'dst.in': 'Clocks {delta} in {n} days', 'dst.tomorrow': 'Clocks {delta} tomorrow', 'dst.today': 'Clocks {delta} today',
    'dst.forward': 'Clocks go forward {d} on {date} at {time}', 'dst.back': 'Clocks go back {d} on {date} at {time}',
    'unit.h': '{n} h', 'unit.min': '{n} min',
    'layout.strip': 'Strip layout', 'layout.compact': 'Compact layout', 'layout.vertical': 'Vertical layout', 'layout.current': 'Layout: {name}',
    'map.aria': 'World map',
    // accessibility audit (v1.3)
    'search.results': 'Cities',
    'about.kofi': 'Support on Ko-fi',
    'about.website': 'Website', 'about.report': 'Report a problem', 'about.updates': 'Check for updates',
    'boot.failed': 'Could not load your settings. Your cities are safe on disk.', 'boot.retry': 'Retry',
    'card.source': 'Source',
    'card.moreFor': 'Options for {city}',
    'card.state.source': 'converter source', 'card.state.converted': 'converted time',
    'card.state.working': 'working hours', 'card.state.off': 'off hours',
    'rel.ahead': '{d} ahead of local', 'rel.behind': '{d} behind local', 'rel.same': 'same time as local',
    'card.keys': 'Enter converts from this city. F2 renames, Delete removes, Alt with the arrow keys moves it, [ and ] change the time by 15 minutes, Page Up and Page Down by 1 hour, Shift+F10 opens its options. Type a digit to convert a time from this city.',
    'help.keys': 'Keyboard shortcuts', 'help.keysCard': 'On a focused city card',
    'kbd.enter': 'Enter', 'kbd.f2': 'F2', 'kbd.del': 'Delete', 'kbd.move': 'Alt + arrows', 'kbd.scrub': '[ and ]', 'kbd.hour': 'Page Up / Page Down',
    'kbd.menu': 'Shift + F10', 'kbd.zoomIn': 'Ctrl + plus', 'kbd.zoomOut': 'Ctrl + minus', 'kbd.zoomReset': 'Ctrl + 0',
    'keys.enter': 'Convert from that city', 'keys.f2': 'Rename', 'keys.del': 'Remove', 'keys.move': 'Move it',
    'keys.scrub': 'Time 15 min earlier or later', 'keys.hour': 'Time 1 h later or earlier', 'keys.menu': 'City options',
    'keys.zoomIn': 'Zoom in', 'keys.zoomOut': 'Zoom out', 'keys.zoomReset': 'Reset zoom',
    'kbd.type': '0 to 9', 'keys.type': 'Type a time: convert from this city',
    'help.keysAny': 'Anywhere',
    'kbd.ctrlF': 'Ctrl + F', 'kbd.ctrlT': 'Ctrl + T', 'kbd.ctrlM': 'Ctrl + M', 'kbd.ctrlP': 'Ctrl + P', 'kbd.ctrlComma': 'Ctrl + comma',
    'keys.ctrlF': 'Add a city', 'keys.ctrlT': 'Type a time', 'keys.ctrlM': 'World map', 'keys.ctrlP': 'Meeting planner', 'keys.ctrlComma': 'Settings',
    'say.zoom': 'Zoom {n}%',
    'copy.menu': 'Copy or save the times', 'copy.discord': 'Copy for Discord', 'copy.utc': 'Copy in UTC', 'copy.ics': 'Save calendar invite',
    'say.icsSaved': 'Invite saved', 'ics.title': 'Meeting',
    'plan.copy': 'Copy slot', 'plan.ics': 'Save invite',
  };
  const pt = {
    'app.title': 'Open World Clock',
    'bar.grip': 'Arraste para mover',
    'conv.ifIts': 'Às',
    'conv.in': 'em',
    'conv.placeholder': '9:30 ou 15h',
    'conv.timeAria': 'Horário para converter',
    'conv.sliderAria': 'Controle de horário',
    'conv.zoneAria': 'Fuso horário de origem',
    'conv.clear': 'Ver horário atual',
    'conv.clearTitle': 'Parar a conversão e mostrar o horário atual',
    'conv.local': '{city} (local)',
    'conv.copyTimes': 'Copiar horários',
    'hint.when': 'Às {time} em {city}',
    'hint.whenOn': 'Às {time} em {city}, {date}',
    'hint.invalid': 'Digite um horário como 9, 9:30, 15h ou 15h30',
    'hint.copied': 'Copiado',
    'hint.addFirst': 'Adicione {city} primeiro para converter a partir dela',
    'hint.noPlace': 'Nenhuma cidade chamada {place}',
    'copy.header': 'Às {time} em {city}:',
    'search.placeholder': 'Adicionar cidade',
    'search.aria': 'Adicionar uma cidade',
    'search.none': 'Nenhuma cidade encontrada',
    'search.already': '{city} já está na sua lista',
    'btn.pin': 'Fixar por cima de todas as janelas',
    'btn.pinned': 'Fixado por cima de todas as janelas. Clique para desafixar',
    'btn.settings': 'Configurações',
    'btn.hide': 'Ocultar na bandeja',
    'btn.hideAria': 'Ocultar',
    'btn.quit': 'Sair',
    'btn.minimize': 'Minimizar',
    'btn.close': 'Fechar e manter na bandeja',
    'btn.closeTitle': 'Fechar e manter na bandeja. Para sair, use o menu da bandeja.',
    'btn.help': 'Ajuda e atalhos',
    'btn.planner': 'Planejador de reuniões',
    'btn.map': 'Mapa-múndi',
    'menu.aria': 'Opções da cidade',
    'menu.source': 'Usar como origem da conversão',
    'menu.rename': 'Renomear…',
    'menu.hours': 'Horário de trabalho…',
    'menu.copy': 'Copiar horário',
    'menu.left': 'Mover para a esquerda',
    'menu.right': 'Mover para a direita',
    'menu.up': 'Mover para cima',
    'menu.down': 'Mover para baixo',
    'menu.remove': 'Remover',
    'panel.title': 'Configurações',
    'panel.close': 'Fechar configurações',
    'panel.display': 'Exibição',
    'panel.window': 'Janela',
    'opt.hour24': 'Relógio de 24 horas',
    'opt.seconds': 'Mostrar segundos',
    'opt.theme': 'Tema',
    'opt.theme.system': 'Sistema',
    'opt.theme.light': 'Claro',
    'opt.theme.dark': 'Escuro',
    'opt.layout': 'Layout',
    'opt.layout.strip': 'Faixa',
    'opt.layout.compact': 'Compacto',
    'opt.layout.vertical': 'Vertical',
    'opt.language': 'Idioma',
    'opt.language.auto': 'Automático',
    'opt.opacity': 'Opacidade do fundo',
    'opt.top': 'Sempre visível',
    'opt.login': 'Iniciar com o Windows',
    'opt.login.portable': 'Registra o executável portátil que você abriu. Se movê-lo, ative esta opção de novo.',
    'opt.login.store': 'Gerenciado em Configurações > Aplicativos > Inicialização',
    'opt.login.open': 'Abrir configurações de inicialização',
    'about.text': 'Grátis, de código aberto e sem telemetria.',
    'card.home': 'Aqui',
    'card.more': 'Opções do cartão',
    'card.moreTitle': 'Opções',
    'card.title': 'Arraste para reordenar. Clique duas vezes para converter a partir desta cidade',
    'card.renameAria': 'Nome personalizado para {city}',
    'card.asleep': 'provavelmente dormindo',
    'rel.local': 'Local',
    'phase.night': 'Noite', 'phase.dawn': 'Amanhecer', 'phase.morning': 'Manhã', 'phase.midday': 'Meio-dia',
    'phase.afternoon': 'Tarde', 'phase.golden': 'Fim de tarde', 'phase.dusk': 'Anoitecer',
    'sun.times': 'Nascer do sol {rise} · Pôr do sol {set}', 'sun.noSet': 'O sol não se põe hoje', 'sun.noRise': 'O sol não nasce hoje',
    'day.plus1': '+1 dia', 'day.plusN': '+{n} dias', 'day.minus1': '−1 dia', 'day.minusN': '−{n} dias',
    'day.today': 'Hoje', 'day.tomorrow': 'Amanhã', 'dates.aria': 'Data para converter',
    'empty.title': 'Nenhuma cidade adicionada',
    'empty.sub': 'Experimente Tóquio, Londres ou Nova York',
    'empty.add': 'Adicionar cidade',
    'help.title': 'Dicas', 'tip.close': 'Fechar ajuda',
    'tip.chip1': 'Digite um horário como 15h ou 15h Tóquio para ver em todas as cidades', 'tip.chip2': 'Role sobre um relógio, ou arraste a linha do dia, para mudar o horário',
    'tip.chip3': 'Clique duas vezes numa cidade para converter a partir dela', 'tip.chip4': 'Clique com o botão direito numa cidade para renomear ou definir o expediente',
    'tip.chip5': 'Arraste os cartões para reordenar e o espaço vazio para mover a janela',
    'say.added': '{city} entrou na lista',
    'say.removed': '{city} saiu da lista',
    'say.renamed': '{old} agora se chama {name}',
    'say.moved': '{city} agora está na posição {n}',
    'say.converted': 'Mostrando os horários equivalentes a {time} em {city}',
    'say.now': 'Mostrando o horário atual',
    'say.copied': 'Copiado para a área de transferência',
    'say.hoursSaved': 'Horário de trabalho de {city} salvo', 'say.hoursReset': 'Horário de trabalho de {city} redefinido',
    'hours.title': 'Horário de trabalho', 'hours.start': 'Início', 'hours.end': 'Fim', 'hours.to': 'às', 'hours.days': 'Dias de trabalho',
    'hours.save': 'Salvar', 'hours.reset': 'Redefinir', 'hours.invalid': 'Use dois horários diferentes, como 9:00 e 18:00',
    'hours.noDays': 'Escolha pelo menos um dia', 'hours.overnight': 'Termina no dia seguinte', 'hours.aria': 'Horário de trabalho de {city}',
    'plan.aria': 'Planejador de reuniões', 'plan.overlap': '{n} h em comum', 'plan.none': 'Sem horário em comum', 'plan.more': '+{n}',
    'plan.range': '{start} às {end}',
    'plan.best': 'Melhor horário: {range} ({city}), {n} de {total} no expediente', 'plan.bestOut': 'Fora do expediente: {list}',
    'plan.caption': 'Horário de {city} · {date}', 'plan.empty': 'Adicione cidades para comparar horários de trabalho',
    'plan.cell': '{time} em {src}: {local} em {city}, {state}', 'plan.state.work': 'em expediente', 'plan.state.night': 'noite', 'plan.state.off': 'fora do expediente',
    'plan.edit': 'Editar horário de trabalho de {city}', 'plan.legend.work': 'Expediente', 'plan.legend.night': 'Noite',
    'dst.in': 'Relógios {delta} em {n} dias', 'dst.tomorrow': 'Relógios {delta} amanhã', 'dst.today': 'Relógios {delta} hoje',
    'dst.forward': 'Os relógios adiantam {d} às {time} de {date}', 'dst.back': 'Os relógios atrasam {d} às {time} de {date}',
    'unit.h': '{n} h', 'unit.min': '{n} min',
    'layout.strip': 'Layout em faixa', 'layout.compact': 'Layout compacto', 'layout.vertical': 'Layout vertical', 'layout.current': 'Layout: {name}',
    'map.aria': 'Mapa-múndi',
    // accessibility audit (v1.3)
    'search.results': 'Cidades',
    'about.kofi': 'Apoiar no Ko-fi',
    'about.website': 'Site', 'about.report': 'Relatar um problema', 'about.updates': 'Verificar atualizações',
    'boot.failed': 'Não foi possível carregar suas configurações. Suas cidades continuam salvas no disco.', 'boot.retry': 'Tentar de novo',
    'card.source': 'Origem',
    'card.moreFor': 'Opções de {city}',
    'card.state.source': 'origem da conversão', 'card.state.converted': 'horário convertido',
    'card.state.working': 'em expediente', 'card.state.off': 'fora do expediente',
    'rel.ahead': '{d} a mais que aqui', 'rel.behind': '{d} a menos que aqui', 'rel.same': 'mesmo horário que aqui',
    'card.keys': 'Enter converte a partir desta cidade. F2 renomeia, Delete remove, Alt com as setas move, [ e ] mudam o horário em 15 minutos, Page Up e Page Down em 1 hora, Shift+F10 abre as opções. Digite um número para converter um horário a partir desta cidade.',
    'help.keys': 'Atalhos de teclado', 'help.keysCard': 'Com o cartão de uma cidade em foco',
    'kbd.enter': 'Enter', 'kbd.f2': 'F2', 'kbd.del': 'Delete', 'kbd.move': 'Alt + setas', 'kbd.scrub': '[ e ]', 'kbd.hour': 'Page Up / Page Down',
    'kbd.menu': 'Shift + F10', 'kbd.zoomIn': 'Ctrl + mais', 'kbd.zoomOut': 'Ctrl + menos', 'kbd.zoomReset': 'Ctrl + 0',
    'keys.enter': 'Converter a partir da cidade', 'keys.f2': 'Renomear', 'keys.del': 'Remover', 'keys.move': 'Mover',
    'keys.scrub': 'Voltar ou avançar 15 min', 'keys.hour': 'Avançar ou voltar 1 h', 'keys.menu': 'Opções da cidade',
    'keys.zoomIn': 'Aumentar o zoom', 'keys.zoomOut': 'Diminuir o zoom', 'keys.zoomReset': 'Redefinir o zoom',
    'kbd.type': '0 a 9', 'keys.type': 'Digitar um horário para converter a partir desta cidade',
    'help.keysAny': 'Em qualquer lugar',
    'kbd.ctrlF': 'Ctrl + F', 'kbd.ctrlT': 'Ctrl + T', 'kbd.ctrlM': 'Ctrl + M', 'kbd.ctrlP': 'Ctrl + P', 'kbd.ctrlComma': 'Ctrl + vírgula',
    'keys.ctrlF': 'Adicionar cidade', 'keys.ctrlT': 'Digitar um horário', 'keys.ctrlM': 'Mapa-múndi', 'keys.ctrlP': 'Planejador de reuniões', 'keys.ctrlComma': 'Configurações',
    'say.zoom': 'Zoom {n}%',
    'copy.menu': 'Copiar ou salvar os horários', 'copy.discord': 'Copiar para o Discord', 'copy.utc': 'Copiar em UTC', 'copy.ics': 'Salvar convite de calendário',
    'say.icsSaved': 'Convite salvo', 'ics.title': 'Reunião',
    'plan.copy': 'Copiar horário', 'plan.ics': 'Salvar convite',
  };
  const es = {
    'app.title': 'Open World Clock',
    'bar.grip': 'Arrastra para mover',
    'conv.ifIts': 'A las',
    'conv.in': 'en',
    'conv.placeholder': '9:30 o 3pm',
    'conv.timeAria': 'Hora para convertir',
    'conv.sliderAria': 'Control deslizante de hora',
    'conv.zoneAria': 'Zona horaria de origen',
    'conv.clear': 'Hora actual',
    'conv.clearTitle': 'Dejar de convertir y mostrar la hora actual',
    'conv.local': '{city} (local)',
    'conv.copyTimes': 'Copiar horas',
    'hint.when': 'A las {time} en {city}',
    'hint.whenOn': 'A las {time} en {city}, el {date}',
    'hint.invalid': 'Escribe una hora como 9, 9:30, 930 o 3pm',
    'hint.copied': 'Copiado',
    'hint.addFirst': 'Primero agrega {city} para convertir desde ahí',
    'hint.noPlace': 'No hay ninguna ciudad llamada {place}',
    'copy.header': 'A las {time} en {city}:',
    'search.placeholder': 'Agregar ciudad',
    'search.aria': 'Agregar una ciudad',
    'search.none': 'No se encontraron ciudades',
    'search.already': '{city} ya está en tu lista',
    'btn.pin': 'Mantener siempre visible',
    'btn.pinned': 'Siempre visible. Haz clic para desactivar',
    'btn.settings': 'Configuración',
    'btn.hide': 'Ocultar en la bandeja',
    'btn.hideAria': 'Ocultar',
    'btn.quit': 'Salir',
    'btn.minimize': 'Minimizar',
    'btn.close': 'Cerrar y dejar en la bandeja',
    'btn.closeTitle': 'Cerrar la ventana sin salir. Para salir, usa el menú de la bandeja.',
    'btn.help': 'Ayuda y atajos',
    'btn.planner': 'Planificador de reuniones',
    'btn.map': 'Mapa mundial',
    'menu.aria': 'Opciones de la ciudad',
    'menu.source': 'Usar como origen de la conversión',
    'menu.rename': 'Cambiar nombre…',
    'menu.hours': 'Horario laboral…',
    'menu.copy': 'Copiar hora',
    'menu.left': 'Mover a la izquierda',
    'menu.right': 'Mover a la derecha',
    'menu.up': 'Mover hacia arriba',
    'menu.down': 'Mover hacia abajo',
    'menu.remove': 'Quitar',
    'panel.title': 'Configuración',
    'panel.close': 'Cerrar configuración',
    'panel.display': 'Apariencia',
    'panel.window': 'Ventana',
    'opt.hour24': 'Reloj de 24 horas',
    'opt.seconds': 'Mostrar segundos',
    'opt.theme': 'Tema',
    'opt.theme.system': 'Sistema',
    'opt.theme.light': 'Claro',
    'opt.theme.dark': 'Oscuro',
    'opt.layout': 'Diseño',
    'opt.layout.strip': 'Franja',
    'opt.layout.compact': 'Compacto',
    'opt.layout.vertical': 'Vertical',
    'opt.language': 'Idioma',
    'opt.language.auto': 'Automático',
    'opt.opacity': 'Opacidad del fondo',
    'opt.top': 'Siempre visible',
    'opt.login': 'Iniciar con Windows',
    'opt.login.portable': 'Registra el ejecutable portátil que abriste. Si lo mueves, vuelve a activar esta opción.',
    'opt.login.store': 'Se administra en Configuración > Aplicaciones > Inicio',
    'opt.login.open': 'Abrir la configuración de inicio',
    'about.text': 'Gratis, de código abierto, sin telemetría.',
    'card.home': 'Aquí',
    'card.more': 'Opciones de la tarjeta',
    'card.moreTitle': 'Opciones',
    'card.title': 'Arrastra para reordenar. Haz doble clic para convertir desde esta ciudad',
    'card.renameAria': 'Nombre personalizado para {city}',
    'card.asleep': 'probablemente durmiendo',
    'rel.local': 'Local',
    'phase.night': 'Noche', 'phase.dawn': 'Amanecer', 'phase.morning': 'Mañana', 'phase.midday': 'Mediodía',
    'phase.afternoon': 'Tarde', 'phase.golden': 'Atardecer', 'phase.dusk': 'Anochecer',
    'sun.times': 'Salida del sol {rise} · Puesta del sol {set}', 'sun.noSet': 'Hoy el sol no se pone', 'sun.noRise': 'Hoy el sol no sale',
    'day.plus1': '+1 día', 'day.plusN': '+{n} días', 'day.minus1': '−1 día', 'day.minusN': '−{n} días',
    'day.today': 'Hoy', 'day.tomorrow': 'Mañana', 'dates.aria': 'Fecha para convertir',
    'empty.title': 'Aún no hay ciudades',
    'empty.sub': 'Prueba con Tokio, Londres o Nueva York',
    'empty.add': 'Agregar ciudad',
    'help.title': 'Consejos', 'tip.close': 'Cerrar ayuda',
    'tip.chip1': 'Escribe una hora como 3pm o 3pm Tokio para verla en todas las ciudades', 'tip.chip2': 'Gira la rueda sobre un reloj o arrastra su línea del día para cambiar la hora',
    'tip.chip3': 'Haz doble clic en una ciudad para convertir desde su hora', 'tip.chip4': 'Haz clic derecho en una ciudad para cambiar su nombre o su horario laboral',
    'tip.chip5': 'Arrastra las tarjetas para ordenarlas y el espacio vacío para mover la ventana',
    'say.added': 'Se agregó {city}',
    'say.removed': 'Se quitó {city}',
    'say.renamed': '{old} ahora se llama {name}',
    'say.moved': '{city} ahora está en la posición {n}',
    'say.converted': 'Conversión desde {city}: {time}',
    'say.now': 'De vuelta a la hora actual',
    'say.copied': 'Se copió al portapapeles',
    'say.hoursSaved': 'Se guardó el horario laboral de {city}', 'say.hoursReset': 'Se restableció el horario laboral de {city}',
    'hours.title': 'Horario laboral', 'hours.start': 'Hora de inicio', 'hours.end': 'Hora de fin', 'hours.to': 'a', 'hours.days': 'Días laborales',
    'hours.save': 'Guardar', 'hours.reset': 'Restablecer', 'hours.invalid': 'Usa dos horas distintas, como 9:00 y 18:00',
    'hours.noDays': 'Elige al menos un día', 'hours.overnight': 'Termina al día siguiente', 'hours.aria': 'Horario laboral de {city}',
    'plan.aria': 'Planificador de reuniones', 'plan.overlap': '{n} h en común', 'plan.none': 'Sin horas en común', 'plan.more': '+{n}',
    'plan.range': '{start} a {end}',
    'plan.best': 'Mejor opción: {range} ({city}), {n} de {total} en horario laboral', 'plan.bestOut': 'Fuera de horario: {list}',
    'plan.caption': 'Horas en {city} · {date}', 'plan.empty': 'Agrega ciudades para comparar sus horarios laborales',
    'plan.cell': '{time} en {src}: {local} en {city}, {state}', 'plan.state.work': 'en horario laboral', 'plan.state.night': 'de noche', 'plan.state.off': 'fuera de horario',
    'plan.edit': 'Editar el horario laboral de {city}', 'plan.legend.work': 'Trabajo', 'plan.legend.night': 'Noche',
    'dst.in': 'Relojes {delta} en {n} días', 'dst.tomorrow': 'Relojes {delta} mañana', 'dst.today': 'Relojes {delta} hoy',
    'dst.forward': 'Los relojes se adelantan {d} el {date}, {time}', 'dst.back': 'Los relojes se atrasan {d} el {date}, {time}',
    'unit.h': '{n} h', 'unit.min': '{n} min',
    'layout.strip': 'Diseño en franja', 'layout.compact': 'Diseño compacto', 'layout.vertical': 'Diseño vertical', 'layout.current': 'Diseño: {name}',
    'map.aria': 'Mapa mundial',
    // accessibility audit (v1.3)
    'search.results': 'Ciudades',
    'about.kofi': 'Apoyar en Ko-fi',
    'about.website': 'Sitio web', 'about.report': 'Reportar un problema', 'about.updates': 'Buscar actualizaciones',
    'boot.failed': 'No se pudo cargar tu configuración. Tus ciudades están a salvo en el disco.', 'boot.retry': 'Reintentar',
    'card.source': 'Origen',
    'card.moreFor': 'Opciones de {city}',
    'card.state.source': 'origen de la conversión', 'card.state.converted': 'hora convertida',
    'card.state.working': 'en horario laboral', 'card.state.off': 'fuera de horario',
    'rel.ahead': '{d} más que la hora local', 'rel.behind': '{d} menos que la hora local', 'rel.same': 'la misma hora que la local',
    'card.keys': 'Enter convierte desde esta ciudad. F2 le cambia el nombre, Supr la quita, Alt con las flechas la mueve, [ y ] cambian la hora en 15 minutos, Re Pág y Av Pág en 1 hora, y Mayús+F10 abre sus opciones. Escribe un número para convertir una hora desde esta ciudad.',
    'help.keys': 'Atajos de teclado', 'help.keysCard': 'Con el foco en una tarjeta de ciudad',
    'kbd.enter': 'Enter', 'kbd.f2': 'F2', 'kbd.del': 'Supr', 'kbd.move': 'Alt + flechas', 'kbd.scrub': '[ y ]', 'kbd.hour': 'Re Pág / Av Pág',
    'kbd.menu': 'Mayús + F10', 'kbd.zoomIn': 'Ctrl + más', 'kbd.zoomOut': 'Ctrl + menos', 'kbd.zoomReset': 'Ctrl + 0',
    'keys.enter': 'Convertir desde esta ciudad', 'keys.f2': 'Cambiar nombre', 'keys.del': 'Quitar', 'keys.move': 'Mover',
    'keys.scrub': 'Hora 15 min antes o después', 'keys.hour': 'Hora 1 h después o antes', 'keys.menu': 'Opciones de la ciudad',
    'keys.zoomIn': 'Acercar', 'keys.zoomOut': 'Alejar', 'keys.zoomReset': 'Restablecer el zoom',
    'kbd.type': '0 a 9', 'keys.type': 'Escribir una hora de esta ciudad',
    'help.keysAny': 'En cualquier lugar',
    'kbd.ctrlF': 'Ctrl + F', 'kbd.ctrlT': 'Ctrl + T', 'kbd.ctrlM': 'Ctrl + M', 'kbd.ctrlP': 'Ctrl + P', 'kbd.ctrlComma': 'Ctrl + coma',
    'keys.ctrlF': 'Agregar ciudad', 'keys.ctrlT': 'Escribir una hora', 'keys.ctrlM': 'Mapa mundial', 'keys.ctrlP': 'Planificador de reuniones', 'keys.ctrlComma': 'Configuración',
    'say.zoom': 'Zoom {n}%',
    'copy.menu': 'Copiar o guardar las horas', 'copy.discord': 'Copiar para Discord', 'copy.utc': 'Copiar en UTC', 'copy.ics': 'Guardar invitación de calendario',
    'say.icsSaved': 'Invitación guardada', 'ics.title': 'Reunión',
    'plan.copy': 'Copiar horario', 'plan.ics': 'Guardar invitación',
  };
  const DICTS = { en, pt, es };
  const LOCALES = { en: 'en-US', pt: 'pt-BR', es: 'es-419' };
  const known = (l) => l === 'en' || l === 'pt' || l === 'es';

  // 'auto' follows the Windows display language main resolved (systemLang), which also covers pt-PT, es-419 and
  // other variants Chromium's own locale falls back to English for. navigator.language is the last resort.
  function resolve(lang, systemLang) {
    if (known(lang)) return lang;
    if (known(systemLang)) return systemLang;
    const nav = String((typeof navigator !== 'undefined' && navigator.language) || '').toLowerCase();
    if (nav.startsWith('pt')) return 'pt';
    if (nav.startsWith('es')) return 'es';
    return 'en';
  }

  // The Windows Region format ('en-GB', 'en-AU', 'pt-PT', 'es-MX'...) formats dates and times when it is a variant of
  // the app language; otherwise the language's own locale does (strings always stay in the app language).
  function regional(loc, lang) {
    const s = String(loc || '').replace(/_/g, '-');
    if (!s || s.toLowerCase().split('-')[0] !== lang) return '';
    try { return Intl.DateTimeFormat.supportedLocalesOf([s])[0] || ''; } catch { return ''; }
  }

  const api = {
    lang: 'en',
    locale: 'en-US',
    setLang(lang, systemLang, systemLocale) { api.lang = resolve(lang, systemLang); api.locale = regional(systemLocale, api.lang) || LOCALES[api.lang]; return api.lang; },
    t(key, vars) {
      const d = DICTS[api.lang] || en;
      let s = key in d ? d[key] : (key in en ? en[key] : key);
      if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
      return s;
    },
  };
  window.WCI18N = api;
})();
} catch (e) { console.error('Open World Clock: i18n.js failed to start', e); }

/* ---------- src/renderer/motion/_shared.js ---------- */
try {
// Shared helpers for motion modules. Loaded before them.
(() => {
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Motion tokens (tokens.css) only change under the reduced-motion query, so each is read from the computed style once
  // and cached; the cache is dropped when that query flips. Saves a style read on every animation.
  const cache = new Map();
  const onChange = () => cache.clear();
  if (typeof RM.addEventListener === 'function') RM.addEventListener('change', onChange);
  else if (typeof RM.addListener === 'function') RM.addListener(onChange);
  const css = (name, fallback) => {
    let v = cache.get(name);
    if (v === undefined) {
      v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      cache.set(name, v);
    }
    return v || (fallback === undefined ? '' : fallback);
  };
  window.WCMotion = {
    reduced: () => RM.matches,
    on: (name, fn) => document.addEventListener('wc:' + name, (e) => { try { fn(e.detail || {}); } catch (err) { console.warn('motion', name, err); } }),
    css,
    ms: (v) => parseFloat(css(v)) || 0,
  };
})();
} catch (e) { console.error('Open World Clock: motion/_shared.js failed to start', e); }

/* ---------- src/renderer/motion/cards.js ---------- */
try {
// motion: cards
(() => {
  const M = window.WCMotion;
  if (!M) return;
  const strip = () => document.getElementById('strip');
  const cards = () => { const s = strip(); return s ? [...s.querySelectorAll('.card[data-zone]')] : []; };
  const ease = (name) => M.css(name, 'ease');

  // Boot stagger
  const s0 = strip();
  if (s0 && !M.reduced()) s0.classList.add('wc-cards-booting');
  M.on('boot', (d) => {
    const s = d.strip || strip();
    if (!s) return;
    const list = cards();
    s.classList.remove('wc-cards-booting');
    if (M.reduced()) return;
    const dur = M.ms('--dur-3'), st = M.ms('--stagger'), rise = M.ms('--rise'), e = ease('--ease-emphasized');
    list.forEach((c, i) => c.animate(
      [{ opacity: 0, transform: `translateY(${rise}px)` }, { opacity: 1, transform: 'none' }],
      { duration: dur, delay: i * st, easing: e, fill: 'backwards' }));
  });
  // Safety: never leave cards hidden if boot never fires.
  setTimeout(() => { const s = strip(); if (s) s.classList.remove('wc-cards-booting'); }, 1500);

  // FLIP on zone changes
  let rects = null, ghosts = [];
  M.on('zones-before', () => {
    rects = new Map();
    ghosts.forEach((g) => g.remove()); ghosts = [];
    for (const c of cards()) rects.set(c.dataset.zone, c.getBoundingClientRect());
  });
  // Clone leaving cards in zones-before (they're gone by zones-after).
  M.on('zones-before', (d) => {
    const to = new Set(d.to || []);
    for (const c of cards()) {
      const z = c.dataset.zone;
      if (to.has(z)) continue;
      const r = rects.get(z);
      const g = c.cloneNode(true);
      for (const n of [g, ...g.querySelectorAll('*')]) { n.removeAttribute('data-zone'); n.removeAttribute('id'); }
      g.classList.remove('dragging', 'drop-before', 'drop-after');
      g.classList.add('card-ghost');
      g.setAttribute('aria-hidden', 'true');
      g.removeAttribute('tabindex'); g.removeAttribute('draggable');
      Object.assign(g.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px',
        height: r.height + 'px', minWidth: '0', maxWidth: 'none', pointerEvents: 'none', transformOrigin: 'center' });
      (c.closest('.app') || document.body).appendChild(g);
      ghosts.push(g);
    }
  });
  M.on('zones-after', (d) => {
    const before = rects || new Map(); rects = null;
    const from = new Set(d.from || []);
    const reduced = M.reduced();
    const dur3 = M.ms('--dur-3'), dur2 = M.ms('--dur-2');
    const eEmph = ease('--ease-emphasized'), eExit = ease('--ease-exit');
    // Leaving ghosts
    const gs = ghosts; ghosts = [];
    for (const g of gs) {
      if (reduced || !dur2) { g.remove(); continue; }
      const a = g.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }],
        { duration: dur2, easing: eExit, fill: 'forwards' });
      a.onfinish = a.oncancel = () => g.remove();
      setTimeout(() => g.remove(), dur2 + 200);
    }
    if (reduced) {
      const added = cards().find((c) => !from.has(c.dataset.zone));
      if (added && from.size) reveal(added, true);
      return;
    }
    for (const c of cards()) {
      const z = c.dataset.zone, r0 = before.get(z);
      if (r0) {
        const r1 = c.getBoundingClientRect();
        const dx = r0.left - r1.left, dy = r0.top - r1.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { duration: dur3, easing: eEmph });
      } else if (!from.has(z) && from.size) {

        const a = c.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }],
          { duration: dur3, easing: eEmph, fill: 'backwards' });
        a.onfinish = () => reveal(c, false);
      }
    }
  });

  function reveal(card, instant) {
    const s = strip();
    if (!s || !card.isConnected) return;
    const sr = s.getBoundingClientRect(), cr = card.getBoundingClientRect();
    const vertical = s.scrollHeight > s.clientHeight + 1 && s.scrollWidth <= s.clientWidth + 1;
    const behavior = instant || M.reduced() ? 'auto' : 'smooth';
    const pad = 16;
    if (vertical) {
      let dy = 0;
      if (cr.bottom > sr.bottom - pad) dy = cr.bottom - sr.bottom + pad;
      else if (cr.top < sr.top + pad) dy = cr.top - sr.top - pad;
      if (dy) s.scrollTo({ top: s.scrollTop + dy, behavior });
    } else {
      let dx = 0;
      if (cr.right > sr.right - pad) dx = cr.right - sr.right + pad;
      else if (cr.left < sr.left + pad) dx = cr.left - sr.left - pad;
      if (dx) s.scrollTo({ left: s.scrollLeft + dx, behavior });
    }
  }
})();
} catch (e) { console.error('Open World Clock: motion/cards.js failed to start', e); }

/* ---------- src/renderer/motion/time.js ---------- */
try {
// motion: time
(() => {
  const M = window.WCMotion;
  const active = new WeakMap(); // card -> { finish }
  const fades = new WeakMap(); // .hm -> { anim, at }: the last crossfade and when that .hm last changed
  const FADE_GAP = 300; // ms: a .hm that changes again sooner than this shows plain digits (continuous scrubbing)

  function finishActive(card) {
    const a = active.get(card);
    if (a) a.finish();
  }

  // Converted times: a short dip that ends at the element's own opacity (asleep cards stay dimmed). One animation per
  // .hm at most, and none while it keeps changing (scrubbing), so the digits never blink.
  function crossfade(hm) {
    const now = performance.now();
    const prev = fades.get(hm);
    if (prev && prev.anim) { try { prev.anim.cancel(); } catch (_) {} }
    const recent = prev && now - prev.at < FADE_GAP;
    const rec = { anim: null, at: now };
    fades.set(hm, rec);
    if (recent) return;
    rec.anim = hm.animate([{ opacity: 0.4, offset: 0 }], { duration: M.ms('--dur-2'), easing: M.css('--ease-standard', 'ease') });
    rec.anim.onfinish = () => { if (rec.anim) rec.anim = null; };
  }

  // Reads for one digit roll (layout and computed style), taken for every card before any overlay is added.
  function measure(card, hm, from, to) {
    const host = hm.parentElement;
    if (!host) return null;
    const cs = getComputedStyle(hm);
    return {
      card, hm, host, from, to, left: hm.offsetLeft, top: hm.offsetTop,
      color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing, lineHeight: cs.lineHeight,
    };
  }

  function perDigit(m) {
    const { card, hm, host, from, to } = m;
    const dur = M.ms('--dur-3');
    const ease = M.css('--ease-emphasized', 'ease-out');

    const fx = document.createElement('span');
    fx.className = 'digit-fx';
    fx.setAttribute('aria-hidden', 'true');
    fx.style.left = m.left + 'px';
    fx.style.top = m.top + 'px';
    fx.style.color = m.color;
    fx.style.fontSize = m.fontSize;
    fx.style.fontWeight = m.fontWeight;
    fx.style.letterSpacing = m.letterSpacing;
    fx.style.lineHeight = m.lineHeight;

    // Only the digits that changed get their own boxes and animations (on a minute tick, usually just the last one);
    // each run of unchanged characters is one plain text node.
    const anims = [];
    let same = '';
    for (let i = 0; i < to.length; i++) {
      if (from[i] === to[i]) { same += to[i]; continue; }
      if (same) { fx.appendChild(document.createTextNode(same)); same = ''; }
      const c = document.createElement('span');
      c.className = 'dfx-c';
      const n = document.createElement('span');
      n.textContent = to[i];
      const o = document.createElement('span');
      o.className = 'dfx-old';
      o.textContent = from[i];
      c.append(n, o);
      fx.appendChild(c);
      anims.push(o.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-30%)', opacity: 0 }],
        { duration: dur, easing: ease, fill: 'forwards' }));
      anims.push(n.animate([{ transform: 'translateY(30%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: dur, easing: ease, fill: 'backwards' }));
    }
    if (!anims.length) return;
    if (same) fx.appendChild(document.createTextNode(same));

    host.appendChild(fx);
    hm.style.opacity = '0';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      anims.forEach((a) => { try { a.cancel(); } catch (_) {} });
      fx.remove();
      hm.style.opacity = ''; // no opacity transition on .hm (topbar.css): the real digits are back at once, no fade up
      if (active.get(card) && active.get(card).finish === finish) active.delete(card);
    };
    active.set(card, { finish });
    Promise.all(anims.map((a) => a.finished)).then(finish, finish);
    setTimeout(finish, dur + 100); // safety net
  }

  // app.js sets the text synchronously and fires one time-change per card; the animations start in one microtask
  // (still before paint): first every read, then every write, so a minute tick or a scrub step costs one layout, not
  // one per card.
  let queue = [];
  function flush() {
    const items = queue;
    queue = [];
    const byCard = new Map(); // a card that changed twice in one task rolls from its first to its last time
    for (const d of items) {
      const prev = byCard.get(d.card);
      byCard.set(d.card, prev ? { ...d, from: prev.from } : d);
    }
    for (const card of byCard.keys()) finishActive(card);
    if (M.reduced()) return;
    const fadeList = [], rolls = [];
    for (const { card, from, to, converting } of byCard.values()) {
      const hm = card.querySelector('.hm');
      if (!hm) continue;
      if (converting || !from || !to || String(from).length !== String(to).length || !card.isConnected || !hm.offsetParent) { fadeList.push(hm); continue; }
      const m = measure(card, hm, String(from), String(to));
      if (m) rolls.push(m);
    }
    fadeList.forEach(crossfade);
    rolls.forEach(perDigit);
  }

  M.on('time-change', (d) => {
    if (!d.card) return;
    if (!queue.length) queueMicrotask(() => { try { flush(); } catch (err) { console.warn('motion time-change', err); } });
    queue.push(d);
  });

  // A card rebuilt or removed mid-animation: drop any orphaned overlays.
  M.on('zones-before', () => {
    document.querySelectorAll('.card').forEach(finishActive);
  });
})();
} catch (e) { console.error('Open World Clock: motion/time.js failed to start', e); }

/* ---------- src/renderer/motion/topbar.js ---------- */
try {
// motion: topbar + converter
(() => {
  const M = window.WCMotion;
  const $ = (id) => document.getElementById(id);
  const dur = (v) => (M.reduced() ? 0 : M.ms(v));
  const EMPH = 'cubic-bezier(.32, .72, 0, 1)';
  const STD = 'cubic-bezier(.2, .8, .2, 1)';

  function hintFade() {
    const h = $('convHint');
    if (!h || M.reduced()) return;
    h.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: dur('--dur-2'), easing: STD });
  }

  M.on('convert', ({ on }) => {
    hintFade();
    if (!on || M.reduced()) return;
    ['convClear', 'btnCopy'].forEach((id, i) => {
      const b = $(id);
      if (!b || b.hidden || b.dataset.wcShown === '1') return;
      b.dataset.wcShown = '1';
      b.animate([{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }],
        { duration: dur('--dur-2'), easing: EMPH, delay: i * 40, fill: 'backwards' });
    });
  });
  // Reset the "already shown" marker once app.js hides them again.
  M.on('convert', ({ on }) => { if (!on) ['convClear', 'btnCopy'].forEach((id) => { const b = $(id); if (b) delete b.dataset.wcShown; }); });

  M.on('invalid', ({ input }) => {
    hintFade();
    const el = input || $('convTime');
    if (!el || M.reduced()) return;
    el.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' },
      { transform: 'translateX(-3px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' },
    ], { duration: 320, easing: 'ease-out' });
  });

  M.on('pin', ({ button }) => {
    const b = button || $('btnPin');
    const svg = b && b.querySelector('svg');
    if (!svg || M.reduced()) return;
    // Compose with the CSS resting rotation by animating the button's icon wrapper-free: use the individual `rotate`/`scale` props.
    svg.animate([{ rotate: '-20deg', scale: '.85' }, { rotate: '0deg', scale: '1' }],
      { duration: dur('--dur-3'), easing: 'cubic-bezier(.34, 1.56, .64, 1)' });
  });

  let copyTimer = null;
  M.on('copied', () => {
    hintFade();
    const b = $('btnCopy');
    if (!b || b.hidden) return;
    let check = b.querySelector('.wc-copy-check');
    if (!check) {
      const NS = 'http://www.w3.org/2000/svg';
      check = document.createElementNS(NS, 'svg');
      check.setAttribute('class', 'wc-copy-check');
      check.setAttribute('viewBox', '0 0 16 16');
      check.setAttribute('width', '16'); check.setAttribute('height', '16');
      check.setAttribute('aria-hidden', 'true'); check.setAttribute('focusable', 'false');
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', 'M3.5 8.5l3 3 6-7');
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '1.75'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
      check.appendChild(p);
      b.appendChild(check);
    }
    const icon = b.querySelector('svg:not(.wc-copy-check)');
    clearTimeout(copyTimer);
    b.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    const d = dur('--dur-2');
    const hold = 900;
    const total = d * 2 + hold;
    const inEnd = total ? d / total : 0, outStart = total ? (d + hold) / total : 1;
    check.animate([
      { opacity: 0, transform: 'scale(.6)', offset: 0 },
      { opacity: 1, transform: 'scale(1)', offset: inEnd, easing: 'linear' },
      { opacity: 1, transform: 'scale(1)', offset: outStart },
      { opacity: 0, transform: 'scale(.85)', offset: 1 },
    ], { duration: total, easing: EMPH });
    if (icon) icon.animate([
      { opacity: 1, transform: 'scale(1)', offset: 0 },
      { opacity: 0, transform: 'scale(.7)', offset: inEnd, easing: 'linear' },
      { opacity: 0, transform: 'scale(.7)', offset: outStart },
      { opacity: 1, transform: 'scale(1)', offset: 1 },
    ], { duration: total, easing: EMPH });
    // Remove the overlay afterwards so the button's children end as app.js left them.
    copyTimer = setTimeout(() => { if (check.isConnected) check.remove(); }, total + 50);
  });
})();
} catch (e) { console.error('Open World Clock: motion/topbar.js failed to start', e); }

/* ---------- src/renderer/motion/popovers.js ---------- */
try {
// motion: popovers (search results #zoneResults + card menu #cardMenu)
(() => {
  const M = window.WCMotion;
  if (!M) return;
  const EMPH = 'cubic-bezier(.32, .72, 0, 1)';
  const EXIT = 'cubic-bezier(.4, 0, 1, 1)';
  const cssVar = (v, fb) => M.css(v, fb);

  M.on('results', ({ open, list }) => {
    if (!open || !list || M.reduced()) return;
    const d = M.ms('--dur-2');
    if (!d) return;
    const ease = cssVar('--ease-emphasized', EMPH);
    list.style.transformOrigin = 'top center';
    list.animate(
      [{ opacity: 0, transform: 'translateY(-4px) scale(.97)' }, { opacity: 1, transform: 'none' }],
      { duration: d, easing: ease }
    );
    Array.from(list.children).slice(0, 8).forEach((li, i) => {
      li.animate([{ opacity: 0 }, { opacity: 1 }],
        { duration: d, delay: 40 + i * 12, easing: ease, fill: 'backwards' });
    });
  });

  let ghost = null;
  M.on('menu', ({ open, menu, anchor }) => {
    if (!menu) return;
    if (ghost) { ghost.remove(); ghost = null; }
    if (M.reduced()) return;
    if (open) {
      const d = M.ms('--dur-2');
      if (!d) return;
      let origin = 'top right';
      if (anchor) {
        const a = anchor.getBoundingClientRect(), m = menu.getBoundingClientRect();
        const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
        const ox = Math.max(0, Math.min(m.width, ax - m.left));
        const oy = ay < m.top + m.height / 2 ? 0 : m.height;
        origin = `${ox}px ${oy}px`;
      } else {
        origin = 'top left'; // context menu: opens from pointer at its top-left
      }
      menu.style.transformOrigin = origin;
      menu.animate(
        [{ opacity: 0, transform: 'scale(.95)' }, { opacity: 1, transform: 'none' }],
        { duration: d, easing: cssVar('--ease-emphasized', EMPH) }
      );
      return;
    }
    // closing: menu is hidden synchronously right after this event, so exit on a clone
    if (menu.hidden) return;
    const d = M.ms('--dur-1');
    if (!d) return;
    const r = menu.getBoundingClientRect();
    const c = menu.cloneNode(true);
    c.removeAttribute('id');
    c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    c.querySelectorAll('[data-act]').forEach((n) => n.removeAttribute('data-act'));
    c.removeAttribute('data-act');
    c.setAttribute('aria-hidden', 'true');
    c.removeAttribute('role');
    c.querySelectorAll('[role]').forEach((n) => n.removeAttribute('role'));
    c.querySelectorAll('button').forEach((b) => { b.tabIndex = -1; });
    c.classList.add('wc-menu-ghost');
    c.hidden = false;
    Object.assign(c.style, { left: r.left + 'px', top: r.top + 'px', margin: '0', transformOrigin: menu.style.transformOrigin || 'top right' });
    document.body.appendChild(c);
    ghost = c;
    const anim = c.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }],
      { duration: d, easing: cssVar('--ease-exit', EXIT), fill: 'forwards' }
    );
    const done = () => { c.remove(); if (ghost === c) ghost = null; };
    anim.onfinish = done; anim.oncancel = done;
    setTimeout(done, d + 200);
  });
})();
} catch (e) { console.error('Open World Clock: motion/popovers.js failed to start', e); }

/* ---------- src/renderer/motion/settings.js ---------- */
try {
// motion: settings
(() => {
  const M = window.WCMotion;
  if (!M) return;
  let raf = 0;
  let anims = [];
  let clone = null;
  const cssVar = (n, f) => M.css(n, f);

  const cancelAll = () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    anims.forEach((a) => { try { a.cancel(); } catch (_) {} });
    anims = [];
  };
  const dropClone = () => { if (clone) { clone.remove(); clone = null; } };

  function open(panel) {
    cancelAll();
    dropClone();
    if (M.reduced()) return;
    const dur = M.ms('--dur-3');
    if (!dur) return;
    const ease = cssVar('--ease-emphasized', 'ease-out');
    const kids = Array.from(panel.children).filter((c) => !c.hidden);
    // Hide the first frame (painted while the window resizes), then animate on the next frame.
    panel.style.opacity = '0';
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        raf = 0;
        panel.style.opacity = '';
        panel.classList.add('wc-sheet-anim');
        anims.push(panel.animate(
          [{ opacity: 0, transform: 'translateY(12px) scale(.985)' }, { opacity: 1, transform: 'none' }],
          { duration: dur, easing: ease, fill: 'backwards' }));
        kids.forEach((k, i) => {
          anims.push(k.animate(
            [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
            { duration: dur, easing: ease, delay: 40 * (i + 1), fill: 'backwards' }));
        });
        const mine = anims.slice();
        Promise.all(mine.map((a) => a.finished)).catch(() => {}).then(() => {
          if (anims[0] === mine[0]) panel.classList.remove('wc-sheet-anim');
        });
      });
    });
  }

  function close(panel) {
    cancelAll();
    panel.style.opacity = '';
    panel.classList.remove('wc-sheet-anim');
    dropClone();
    if (M.reduced() || panel.hidden || !panel.parentNode) return;
    const dur = M.ms('--dur-2');
    if (!dur) return;
    const scroll = panel.scrollTop;
    const c = panel.cloneNode(true);
    c.removeAttribute('id');
    c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    c.querySelectorAll('[for]').forEach((n) => n.removeAttribute('for'));
    c.removeAttribute('role');
    c.removeAttribute('aria-labelledby');
    c.setAttribute('aria-hidden', 'true');
    c.inert = true;
    c.classList.add('wc-sheet-clone');
    panel.parentNode.insertBefore(c, panel.nextSibling);
    c.scrollTop = scroll;
    clone = c;
    const a = c.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px) scale(.99)' }],
      { duration: dur, easing: cssVar('--ease-exit', 'ease-in'), fill: 'forwards' });
    const done = () => { if (clone === c) clone = null; c.remove(); };
    a.finished.then(done, done);
  }

  M.on('panel', (d) => {
    const panel = d.panel || document.getElementById('settingsPanel');
    if (!panel) return;
    if (d.open) open(panel); else close(panel);
  });
})();
} catch (e) { console.error('Open World Clock: motion/settings.js failed to start', e); }

/* ---------- src/renderer/motion/ambient.js ---------- */
try {
// motion: ambient: tip chips entrance, tip dismiss (ghost + FLIP strip), map and planner entrance, layout crossfade.
(() => {
  const M = window.WCMotion;
  const $ = (id) => document.getElementById(id);
  const css = (v) => M.css(v);

  // Tip chips: fade + rise, staggered, trailing the cards.
  M.on('boot', () => {
    const tip = $('tip');
    if (!tip || tip.hidden || M.reduced()) return;
    const rise = css('--rise') || '8px';
    tip.querySelectorAll('.chip').forEach((chip, i) => {
      chip.animate(
        [{ opacity: 0, transform: `translateY(${rise})` }, { opacity: 1, transform: 'none' }],
        { duration: M.ms('--dur-3'), delay: 200 + i * 40, easing: css('--ease-emphasized'), fill: 'backwards' }
      );
    });
  });

  // Tip dismiss: ghost fades in place while the strip slides up into the freed space.
  M.on('tip-dismiss', ({ tip }) => {
    const strip = $('strip');
    if (!tip || !strip || M.reduced()) return;
    const r = tip.getBoundingClientRect();
    const oldTop = strip.getBoundingClientRect().top;
    const ghost = tip.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.hidden = false;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    ghost.classList.add('tip-ghost');
    Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    document.body.appendChild(ghost);
    const kill = () => ghost.remove();
    const a = ghost.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.98)' }],
      { duration: M.ms('--dur-2'), easing: css('--ease-exit'), fill: 'forwards' }
    );
    a.onfinish = kill; a.oncancel = kill;
    setTimeout(kill, M.ms('--dur-2') + 400);
    requestAnimationFrame(() => {
      const dy = oldTop - strip.getBoundingClientRect().top;
      if (Math.abs(dy) < 0.5) return;
      strip.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
        { duration: M.ms('--dur-3'), easing: css('--ease-emphasized') }
      );
    });
  });

  // Map and planner open with the same short entrance as the other surfaces (fade and rise, no fill, so nothing stays
  // on the element); closing both brings the cards back the same way, unless the layout crossfade is already on them.
  const enter = (el) => {
    if (!el || el.hidden || M.reduced()) return;
    el.animate(
      [{ opacity: 0, transform: `translateY(${css('--rise') || '8px'})` }, { opacity: 1, transform: 'none' }],
      { duration: M.ms('--dur-3'), easing: css('--ease-emphasized') }
    );
  };
  const back = () => {
    const app = $('app'), strip = $('strip');
    if (!app || !strip || app.classList.contains('planner-on') || app.classList.contains('map-on') || strip.getAnimations().length) return;
    enter(strip);
  };
  M.on('planner', ({ on, planner }) => (on ? enter(planner) : back()));
  M.on('map', ({ on, map }) => (on ? enter(map) : back()));

  // Layout switch: quick fade out, then settle back in with a hint of scale.
  let fadeOut = null, fadeIn = null, safety = 0;
  M.on('layout', () => {
    const strip = $('strip');
    if (!strip || M.reduced()) return;
    if (fadeOut) fadeOut.cancel();
    if (fadeIn) fadeIn.cancel();
    clearTimeout(safety);
    const restore = () => { if (fadeOut) { fadeOut.cancel(); fadeOut = null; } };
    const cur = parseFloat(getComputedStyle(strip).opacity) || 1;
    fadeOut = strip.animate([{ opacity: cur }, { opacity: 0 }],
      { duration: M.ms('--dur-1'), easing: css('--ease-exit'), fill: 'forwards' });
    fadeOut.onfinish = () => requestAnimationFrame(() => {
      restore();
      fadeIn = strip.animate(
        [{ opacity: 0, transform: 'scale(.99)' }, { opacity: 1, transform: 'none' }],
        { duration: M.ms('--dur-3'), easing: css('--ease-emphasized') }
      );
    });
    // Guarantee: the strip is never left invisible.
    safety = setTimeout(restore, M.ms('--dur-1') + 400);
  });
})();
} catch (e) { console.error('Open World Clock: motion/ambient.js failed to start', e); }

/* ---------- src/renderer/motion/sky.js ---------- */
try {
// motion: sky: card gradients that follow the real sun altitude.
// Loads after sun.js and _shared.js, before app.js. Only adds the `sky-on` class and --sky-* custom
// properties; never touches classes, text, ids or hidden that app.js sets.
//
// Which moment a card shows:
//   1. card[data-epoch] (UTC epoch milliseconds) when present;
//   2. otherwise Date.now(), unless the card is `.converted` (converter active, instant unknown here),
//      in which case the phase comes from app.js's data-phase instead.
// Light versus dark stops always follow app.js's `.is-night` class, so text contrast matches the
// existing --day-fg / --night-fg colours even if the altitude estimate disagrees.
(function () {
  const M = window.WCMotion;
  const PHASES = ['night', 'twilight', 'dawn', 'day', 'golden', 'dusk'];
  const state = new WeakMap(); // card -> { phase, anim }
  let strip = null;
  let raf = 0;

  function coordsOf(zone) {
    const m = window.ZONE_META && window.ZONE_META[zone];
    if (m && typeof m.lat === 'number' && typeof m.lng === 'number') return [m.lat, m.lng];
    const c = window.ZONE_COORDS && window.ZONE_COORDS[zone];
    return Array.isArray(c) && c.length === 2 ? c : null;
  }

  function epochOf(card) {
    const raw = card.getAttribute('data-epoch');
    if (raw !== null && raw !== '') {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    return card.classList.contains('converted') ? null : Date.now();
  }

  // Fallback when the instant is unknown: map app.js's phase key onto the matching family.
  function phaseFromKey(key, night) {
    switch (key) {
      case 'night': return 'night';
      case 'dawn': return night ? 'twilight' : 'dawn';
      case 'dusk': return night ? 'dusk' : 'golden';
      case 'golden': return night ? 'dusk' : 'golden';
      default: return night ? 'night' : 'day';
    }
  }

  function phaseOf(card) {
    const night = card.classList.contains('is-night');
    const ll = coordsOf(card.dataset.zone);
    const epoch = epochOf(card);
    const S = window.WCSun;
    if (!ll || epoch === null || !S) return phaseFromKey(card.dataset.phase, night);
    const alt = S.altitude(new Date(epoch), ll[0], ll[1]);
    const rising = S.altitude(new Date(epoch + 600000), ll[0], ll[1]) > alt;
    if (night) {
      if (alt < -12) return 'night';
      if (alt < -4 || rising) return 'twilight';
      return 'dusk';
    }
    if (rising) return alt <= 6 ? 'dawn' : 'day';
    return alt <= 10 ? 'golden' : 'day';
  }

  const ref = (phase, stop) => `var(--sky-${phase}-${stop})`;

  function crossfade(card, st, from) {
    // Still fading from an earlier phase (scrubbing through dawn or dusk): apply() already swapped the gradient
    // variables, so that fade simply ends on the new phase instead of a second one starting on top of it.
    if (st.anim && st.anim.playState === 'running') return;
    if (st.anim) { try { st.anim.cancel(); } catch (e) { /* ignore */ } st.anim = null; }
    if (M.reduced() || typeof card.animate !== 'function') return;
    const dur = M.ms('--dur-4'); // cached token (motion/_shared.js)
    if (!dur) return;
    card.style.setProperty('--sky-pa', ref(from, 'a'));
    card.style.setProperty('--sky-pb', ref(from, 'b'));
    try {
      st.anim = card.animate({ opacity: [1, 0] }, { duration: dur, easing: 'cubic-bezier(.2, .8, .2, 1)', pseudoElement: '::after' });
      st.anim.onfinish = () => { st.anim = null; };
    } catch (e) { st.anim = null; } // pseudoElement unsupported: plain swap
  }

  function apply(card) {
    const phase = phaseOf(card);
    if (PHASES.indexOf(phase) < 0) return;
    let st = state.get(card);
    if (!st) { st = { phase: null, anim: null }; state.set(card, st); }
    if (st.phase === phase && card.classList.contains('sky-on')) return;
    const prev = st.phase;
    st.phase = phase;
    card.style.setProperty('--sky-a', ref(phase, 'a'));
    card.style.setProperty('--sky-b', ref(phase, 'b'));
    if (!card.classList.contains('sky-on')) card.classList.add('sky-on');
    else if (prev && prev !== phase) crossfade(card, st, prev);
  }

  function update() {
    raf = 0;
    const root = strip || document.querySelector('.strip') || document;
    for (const card of root.querySelectorAll('.card[data-zone]')) {
      try { apply(card); } catch (e) { console.warn('motion sky', e); }
    }
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(update);
  }

  // No timer of its own: app.js writes each card's data-epoch (now to the minute, or the converted instant) on every
  // render and toggles is-night / converted, and the observers below follow those. The minute tick and a return to the
  // window re-render the cards, so the sky keeps up without waking every minute (or second) here.
  // Two observers: cards added or removed (direct children of the strip only), and card attributes anywhere below it.
  // Neither sees the per-second text updates inside the cards, so no mutation records are queued on every tick.
  const cardsObserver = new MutationObserver(() => schedule());
  const attrObserver = new MutationObserver((list) => {
    for (const m of list) {
      const t = m.target;
      if (t.classList && t.classList.contains('card') && t.hasAttribute('data-zone')) {
        const st = state.get(t);
        if (!st || m.attributeName === 'data-epoch' || m.oldValue === null
          || m.oldValue.split(/\s+/).includes('is-night') !== t.classList.contains('is-night')
          || m.oldValue.split(/\s+/).includes('converted') !== t.classList.contains('converted')) { schedule(); return; }
      }
    }
  });

  function watch(el) {
    if (!el || el === strip) return;
    strip = el;
    cardsObserver.disconnect();
    attrObserver.disconnect();
    cardsObserver.observe(el, { childList: true });
    attrObserver.observe(el, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'data-epoch'] });
  }

  M.on('boot', (d) => { watch(d.strip || document.querySelector('.strip')); schedule(); });
  M.on('zones-after', schedule);
  M.on('convert', schedule);
  M.on('time-change', schedule);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(); });
  document.addEventListener('DOMContentLoaded', () => { watch(document.querySelector('.strip')); schedule(); });

  window.WCSky = { refresh: schedule, phaseOf };
})();
} catch (e) { console.error('Open World Clock: motion/sky.js failed to start', e); }

/* ---------- src/renderer/app.js ---------- */
try {
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const T = window.WCTime;
  const I = window.WCI18N;
  const t = (k, v) => I.t(k, v);
  const el = {
    app: $('app'),
    strip: $('strip'), addCard: $('addCard'), convTime: $('convTime'), convDate: $('convDate'), convZone: $('convZone'),
    convClear: $('convClear'), convSlider: $('convSlider'), convHint: $('convHint'), btnCopy: $('btnCopy'),
    search: $('zoneSearch'), results: $('zoneResults'),
    menu: $('cardMenu'), panel: $('settingsPanel'), optHour24: $('optHour24'), optSeconds: $('optSeconds'),
    optTop: $('optTop'), optLogin: $('optLogin'), optLoginNote: $('optLoginNote'), optLoginOpen: $('optLoginOpen'),
    optOpacity: $('optOpacity'), optOpacityValue: $('optOpacityValue'),
    optTheme: $('optTheme'), optLayout: $('optLayout'), optLanguage: $('optLanguage'), ver: $('ver'),
    btnPin: $('btnPin'), btnSettings: $('btnSettings'), tip: $('tip'), tipText: $('tipText'), tipClose: $('tipClose'),
    announce: $('announce'),
    btnPlanner: $('btnPlanner'), planner: $('planner'), planBody: $('planBody'), plannerSummary: $('plannerSummary'), plannerCaption: $('plannerCaption'),
    plannerBest: $('plannerBest'),
    btnDay: $('btnDay'), btnDayText: $('btnDayText'), dateChips: $('dateChips'),
    hoursEditor: $('hoursEditor'), hoursCity: $('hoursCity'), hoursStart: $('hoursStart'), hoursEnd: $('hoursEnd'), hoursDays: $('hoursDays'),
    hoursSave: $('hoursSave'), hoursReset: $('hoursReset'), hoursNote: $('hoursNote'),
    btnMap: $('btnMap'), mapView: $('mapView'),
    layoutWrap: $('layoutWrap'), layoutSwitch: $('layoutSwitch'), btnLayout: $('btnLayout'),
    convToast: $('convToast'), kofiLink: $('kofiLink'), helpKeys: $('helpKeys'),
    reportLink: $('reportLink'), updatesLink: $('updatesLink'),
    copyMenu: $('copyMenu'), planSelBar: $('planSelBar'), planSel: $('planSel'), planCopy: $('planCopy'), planIcs: $('planIcs'),
  };

  // Chromium lists some legacy IANA ids; map them to the canonical names used in ZONE_META.
  const LEGACY = { 'Europe/Kiev': 'Europe/Kyiv', 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Saigon': 'Asia/Ho_Chi_Minh',
    'America/Buenos_Aires': 'America/Argentina/Buenos_Aires', 'Asia/Rangoon': 'Asia/Yangon', 'Asia/Katmandu': 'Asia/Kathmandu',
    'Asia/Tel_Aviv': 'Asia/Jerusalem' };
  // Memoized: render, the planner, the map and the copy button ask about every saved zone on every update, and each
  // uncached answer builds an Intl.DateTimeFormat. Self-contained (the cache lives in the closure of this one const),
  // so scripts/export-shared.mjs can still extract it on its own.
  const supportsZone = ((ok) => (z) => {
    let v = ok.get(z);
    if (v === undefined) {
      try { new Intl.DateTimeFormat('en-US', { timeZone: z }); v = true; } catch { v = false; }
      ok.set(z, v);
    }
    return v;
  })(new Map());
  const canonical = (z) => LEGACY[z] || z;
  const readLocalZone = () => canonical(Intl.DateTimeFormat().resolvedOptions().timeZone);
  // The OS time zone can change while the app runs (travel, manual change): re-read every minute and on show.
  let LOCAL_ZONE = readLocalZone();
  // Every searchable zone. Ids Intl lists itself are valid by definition, so only the canonical renames and the
  // ZONE_META extras are checked (no formatter for each of the ~420 listed ids at startup).
  const ALL_ZONES = ((listed) => {
    const intl = new Set(listed);
    return [...new Set([...listed.map(canonical), ...Object.keys(window.ZONE_META)])]
      .filter((z) => !/^Etc\//.test(z) && (intl.has(z) || supportsZone(z)));
  })(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []);

  let settings = null;
  let convert = null; // { zone, epochMs, h, mi } while the converter is active
  let tick = null;
  let menuZone = null;
  let menuAnchor = null; // the .more button (or card) that opened the menu, for focus return
  let structKey = null; // zones/labels/layout/lang signature of the built cards
  let lastMinute = -1; // minute of the last full render (seconds-only ticks skip the full render)

  // ---------- small helpers ----------
  const parts = T.parts;
  const locale = () => I.locale;
  const layout = () => (settings && settings.layout) || 'strip';
  const englishCity = (z) => (window.ZONE_META[z] ? window.ZONE_META[z].city : z.split('/').pop().replace(/_/g, ' '));
  const cityOf = (z) => { const tr = window.ZONE_I18N && window.ZONE_I18N[I.lang]; return (tr && tr[z]) || englishCity(z); };
  // Localized country name (Intl.DisplayNames) from the zone's ISO code; falls back to ZONE_META, then the IANA area.
  const regionNames = new Map();
  const regionOf = (z) => {
    const cc = window.ZONE_CC && window.ZONE_CC[z];
    if (cc) {
      try {
        let dn = regionNames.get(I.locale);
        if (!dn) { dn = new Intl.DisplayNames([I.locale], { type: 'region', style: 'short' }); regionNames.set(I.locale, dn); }
        const n = dn.of(cc);
        if (n && n !== cc) return n;
      } catch { /* fall through */ }
    }
    return window.ZONE_META[z] ? window.ZONE_META[z].country : z.split('/')[0].replace(/_/g, ' ');
  };
  const customLabel = (z) => { const l = settings && settings.labels && settings.labels[z]; return typeof l === 'string' && l.trim() ? l.trim() : ''; };
  const labelOf = (z) => customLabel(z) || cityOf(z);
  const displayName = (z) => (customLabel(z) ? `${customLabel(z)} (${cityOf(z)})` : cityOf(z));
  const setText = (node, s) => { if (node.textContent !== s) node.textContent = s; };
  // Motion hooks: app state/text changes stay synchronous; motion modules (src/renderer/motion/*.js) only listen and animate.
  const emit = (name, detail) => { try { document.dispatchEvent(new CustomEvent('wc:' + name, { detail })); } catch (e) { console.warn('world-clock: motion hook failed', name, e); } };
  const guard = (fn) => function (...args) { if (!settings) return undefined; return fn.apply(this, args); };
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Native Windows 11 acrylic backdrop (main decides); Windows then draws corners, border, shadow and blur.
  function applyBackdrop(s) { if (s) document.documentElement.classList.toggle('backdrop-native', !!s.backdrop && s.backdrop !== 'none'); }
  function onIpcError(err) {
    console.warn('world-clock: IPC call failed, resyncing settings', err);
    window.wc.getSettings().then(adopt).catch((e) => console.warn('world-clock: resync failed', e));
  }
  // A settings object main sent (settings:get, settings:changed) is only used whole: null (a refused sender) or
  // anything without a zones list is ignored, so settings is never a half-built object.
  const validSettings = (s) => !!s && typeof s === 'object' && Array.isArray(s.zones);
  function adopt(s) {
    if (!validSettings(s)) return;
    // Settings arriving before the first load succeeded (or after it failed) start the app like the first load does.
    if (!booted) { boot(s); return; }
    applyBackdrop(s);
    const prevLang = settings && settings.language, prevSys = settings && settings.systemLanguage, prevLoc = settings && settings.systemLocale;
    const prevZoom = settings ? settings.zoom || 0 : null;
    settings = { ...(settings || {}), ...s };
    if (settings.language !== prevLang || settings.systemLanguage !== prevSys || settings.systemLocale !== prevLoc) applyLanguage();
    // Ctrl + / Ctrl - / Ctrl 0 are handled by main; say the new level.
    if (prevZoom !== null && (settings.zoom || 0) !== prevZoom) announce(t('say.zoom', { n: Math.round(100 * 1.2 ** (settings.zoom || 0)) }));
    syncPanel(); fillConvZones(); renderTip(); render(); scheduleTick();
  }

  let announceTimer = null;
  function announce(msg) {
    clearTimeout(announceTimer);
    el.announce.textContent = '';
    announceTimer = setTimeout(() => { el.announce.textContent = msg; }, 60);
  }

  function relLabel(zone, date) {
    if (zone === LOCAL_ZONE) return t('rel.local');
    const d = T.offsetMinutes(zone, date) - T.offsetMinutes(LOCAL_ZONE, date);
    if (d === 0) return '±0';
    const a = Math.abs(d), h = Math.floor(a / 60), m = a % 60;
    return `${d > 0 ? '+' : '-'}${h}h${m ? String(m).padStart(2, '0') + 'm' : ''}`;
  }
  // Spoken form of the offset for the card's accessible name ("5 h 30 min ahead of local").
  function relSpoken(zone, date) {
    const d = T.offsetMinutes(zone, date) - T.offsetMinutes(LOCAL_ZONE, date);
    if (!d) return t('rel.same');
    return t(d > 0 ? 'rel.ahead' : 'rel.behind', { d: durationText(d) });
  }
  function dayMarker(diff) {
    if (!diff) return '';
    if (diff === 1) return t('day.plus1');
    if (diff === -1) return t('day.minus1');
    return t(diff > 0 ? 'day.plusN' : 'day.minusN', { n: Math.abs(diff) });
  }
  // Wall-clock parts for a zone, honoring the 12/24h setting. 24h always uses hourCycle h23.
  function clock(zone, date) {
    if (settings.hour12) {
      const p = parts(zone, date, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
      return { hm: `${p.hour}:${p.minute}`, sec: p.second, ampm: p.dayPeriod || '' };
    }
    const p = parts(zone, date, { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return { hm: `${p.hour}:${p.minute}`, sec: p.second, ampm: '' };
  }
  // Value written into #convTime: always parseable by T.parseTime ("15:00" or "3:00 PM").
  function formatInput(h, mi) {
    if (settings && settings.hour12) return `${h % 12 || 12}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  }
  // Human-facing time (hint, copy, announcements): localized via Intl, day period included.
  function formatTime(h, mi) {
    const d = new Date(Date.UTC(2026, 0, 1, h, mi));
    const opts = settings && settings.hour12 ? { hour: 'numeric', minute: '2-digit', hour12: true } : { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' };
    return T.fmt('UTC', opts, locale()).format(d);
  }
  // "A las 3:00" but "A la 1:00" (Spanish), "Às 3:00" but "À 1:00" (Portuguese): one o'clock is singular. `shown` is
  // the hour as displayed (12-hour clock: 1 for 13:00).
  const shownHour = (h) => (settings && settings.hour12 ? h % 12 || 12 : h);
  function atTime(key, vars, shown) {
    const s = t(key, vars);
    if (shown !== 1) return s;
    if (I.lang === 'es') return s.replace(/^A las /, 'A la ');
    if (I.lang === 'pt') return s.replace(/^Às /, 'À ');
    return s;
  }
  // ---------- working hours ----------
  // settings.hours[zone] = { start: 'HH:MM', end: 'HH:MM', days: [0..6] } (0 = Sunday). end < start = overnight shift.
  const DEFAULT_HOURS = Object.freeze({ start: '09:00', end: '18:00', days: Object.freeze([1, 2, 3, 4, 5]) });
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const pad2 = (n) => String(n).padStart(2, '0');
  const toMin = (s) => +s.slice(0, 2) * 60 + +s.slice(3, 5);
  const hhmm = (min) => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`;
  function hoursOf(zone) {
    const h = settings && settings.hours && settings.hours[zone];
    if (h && HHMM.test(h.start) && HHMM.test(h.end) && h.start !== h.end && Array.isArray(h.days) && h.days.length) return h;
    return DEFAULT_HOURS;
  }
  const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // Local weekday (0 = Sunday) and minutes since local midnight.
  function localWall(zone, date) {
    const p = parts(zone, date, { weekday: 'short', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }, 'en-US');
    return { wd: WEEKDAY[p.weekday], min: (+p.hour % 24) * 60 + +p.minute };
  }
  function isWorking(zone, date) {
    const h = hoursOf(zone); const s = toMin(h.start), e = toMin(h.end);
    const { wd, min } = localWall(zone, date);
    if (s < e) return min >= s && min < e && h.days.includes(wd);
    if (min >= s) return h.days.includes(wd); // overnight shift, evening part
    if (min < e) return h.days.includes((wd + 6) % 7); // overnight shift started the day before
    return false;
  }
  function tzInfo(zone, date) {
    const abbr = parts(zone, date, { timeZoneName: 'short', hour: 'numeric' }, 'en-US').timeZoneName || '';
    const long = parts(zone, date, { timeZoneName: 'long', hour: 'numeric' }, locale()).timeZoneName || '';
    return { abbr: /^[A-Za-z]+$/.test(abbr) && !/^(GMT|UTC)$/.test(abbr) ? abbr : '', long };
  }

  // ---------- sun ----------
  function coordsOf(zone) {
    const m = window.ZONE_META[zone];
    if (m && typeof m.lat === 'number' && typeof m.lng === 'number') return [m.lat, m.lng];
    const c = window.ZONE_COORDS && window.ZONE_COORDS[zone];
    return Array.isArray(c) && c.length === 2 ? c : null;
  }
  // Phase from the real sun position; the local hour only separates morning / midday / afternoon.
  function sunPhase(date, ll, hour) {
    const S = window.WCSun;
    const alt = S.altitude(date, ll[0], ll[1]);
    const rising = S.altitude(new Date(date.getTime() + 600000), ll[0], ll[1]) > alt;
    if (alt < -6) return 'night';
    if (rising && alt <= 6) return 'dawn';
    if (!rising && alt < 0) return 'dusk';
    if (hour >= 11 && hour < 14 && alt > 0) return 'midday';
    if (!rising && alt <= 10) return 'golden';
    return rising && hour < 11 ? 'morning' : 'afternoon';
  }
  const sunCache = new Map();
  function sunTitleOf(zone, date, ll) {
    const key = [zone, Math.floor(date.getTime() / 3600000), settings.hour12, I.lang].join('|');
    if (sunCache.has(key)) return sunCache.get(key);
    const r = window.WCSun.times(date, ll[0], ll[1]);
    let s;
    if (r.polar === 'day') s = t('sun.noSet');
    else if (r.polar === 'night') s = t('sun.noRise');
    else {
      const opts = settings.hour12 ? { hour: 'numeric', minute: '2-digit', hour12: true } : { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' };
      const f = T.fmt(zone, opts, locale());
      s = t('sun.times', { rise: f.format(r.sunrise), set: f.format(r.sunset) });
    }
    if (sunCache.size > 500) sunCache.clear();
    sunCache.set(key, s);
    return s;
  }

  // ---------- clock changes (DST) ----------
  // First UTC-offset change within 7 days after `ms`: { at, delta, old } or null. Offsets change at most once
  // a week, so daily samples find the day and a binary search pins the minute.
  const DAY_MS = 86400000;
  const dstCache = new Map();
  function nextOffsetChange(zone, ms) {
    const key = zone + '|' + Math.floor(ms / 3600000);
    if (dstCache.has(key)) return dstCache.get(key);
    const off = (x) => T.offsetMinutes(zone, new Date(x));
    const old = off(ms);
    let res = null;
    for (let d = 1; d <= 7; d++) {
      const hiOff = off(ms + d * DAY_MS);
      if (hiOff === old) continue;
      let lo = ms + (d - 1) * DAY_MS, hi = ms + d * DAY_MS;
      while (hi - lo > 60000) { const mid = Math.floor((lo + hi) / 2); if (off(mid) === old) lo = mid; else hi = mid; }
      res = { at: Math.floor(hi / 60000) * 60000, delta: off(hi) - old, old };
      break;
    }
    if (dstCache.size > 400) dstCache.clear();
    dstCache.set(key, res);
    return res;
  }
  function durationText(mins) {
    const a = Math.abs(mins), h = Math.floor(a / 60), m = a % 60;
    return [h ? t('unit.h', { n: h }) : '', m ? t('unit.min', { n: m }) : ''].filter(Boolean).join(' ');
  }
  const ymdUTC = (p) => Date.UTC(+p.year, +p.month - 1, +p.day);
  const YMD_OPTS = { year: 'numeric', month: '2-digit', day: '2-digit' };
  // { text, title } for the card's .dst-note, or null when the offset stays put for the next 7 days.
  function dstNote(zone, date) {
    const ch = nextOffsetChange(zone, date.getTime());
    if (!ch) return null;
    // Wall clock at the change, in the old offset ("at 02:00, clocks go back to 01:00"). The day and the count come from
    // it too: a change at local midnight (Santiago, Beirut, Cairo, Havana) happens at 00:00 of that day, not at 23:59 of
    // the day before.
    const wall = new Date(ch.at + ch.old * 60000);
    const days = Math.round((Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - ymdUTC(parts(zone, date, YMD_OPTS))) / DAY_MS);
    // Short enough to never truncate on a card: "Clocks −1h tomorrow". The title carries the full sentence.
    const a = Math.abs(ch.delta), dh = Math.floor(a / 60), dm = a % 60;
    const delta = `${ch.delta > 0 ? '+' : '−'}${dh ? dh + 'h' : ''}${dm ? dm + 'm' : ''}`;
    const text = days <= 0 ? t('dst.today', { delta }) : days === 1 ? t('dst.tomorrow', { delta }) : t('dst.in', { n: days, delta });
    const day = T.fmt('UTC', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, locale()).format(wall);
    const title = t(ch.delta > 0 ? 'dst.forward' : 'dst.back', { d: durationText(ch.delta), date: day, time: formatTime(wall.getUTCHours(), wall.getUTCMinutes()) });
    return { text, title };
  }

  // ---------- i18n ----------
  function applyStatic() {
    document.documentElement.lang = I.locale;
    document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((n) => { n.placeholder = t(n.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-title]').forEach((n) => { n.title = t(n.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-aria]').forEach((n) => { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
  }
  function applyLanguage() {
    I.setLang((settings && settings.language) || 'auto', settings && settings.systemLanguage, settings && settings.systemLocale);
    applyStatic();
    structKey = null; // rebuild cards with translated chrome
    planKey = null;
    if (settings) { syncPanel(); fillConvZones(); renderTip(); refreshHint(); }
  }

  // ---------- render ----------
  function structureSignature() {
    const labels = {};
    for (const z of settings.zones) if (customLabel(z)) labels[z] = customLabel(z);
    return JSON.stringify([settings.zones, labels, layout(), I.lang]);
  }
  function buildStructure() {
    // Commit an in-progress rename before cards are rebuilt so the edit is never lost.
    el.strip.querySelectorAll('input.rename').forEach((i) => { if (typeof i._finish === 'function') i._finish(true); });
    // Keep keyboard focus on whatever had it inside the strip (a card or its "..." button): re-parenting the cards
    // below drops focus to <body> otherwise (e.g. after Move left/right from the card menu).
    const focused = document.activeElement && el.strip.contains(document.activeElement) ? document.activeElement : null;
    const langChanged = !el.strip.dataset.lang || el.strip.dataset.lang !== I.lang;
    el.strip.dataset.lang = I.lang;
    const existing = langChanged ? new Map()
      : new Map([...el.strip.querySelectorAll('.card[data-zone]')].map((c) => [c.dataset.zone, c]));
    const frag = document.createDocumentFragment();
    for (const zone of settings.zones) {
      if (!supportsZone(zone)) continue;
      const card = existing.get(zone) || buildCard(zone);
      applyLabel(card, zone);
      frag.appendChild(card);
    }
    // Card count drives the CSS size scale (cards share the width evenly, see .card --cw in style.css).
    el.strip.dataset.count = String(Math.max(1, frag.childNodes.length));
    el.strip.style.setProperty('--n', el.strip.dataset.count);
    if (!frag.childNodes.length) frag.appendChild(buildEmpty());
    frag.appendChild(el.addCard);
    el.strip.replaceChildren(frag);
    updateStripRows();
    sendTrayNames();
    if (focused && focused.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: false });
  }
  // The tray tooltip lists the cards with their times (main formats the times on hover). Sent when the cards are
  // rebuilt (cities, labels, layout or language changed), never on a tick.
  let trayKey = '';
  function sendTrayNames() {
    if (typeof window.wc.setTrayNames !== 'function') return;
    const names = {};
    for (const z of settings.zones.filter(supportsZone).slice(0, 50)) names[z] = labelOf(z).slice(0, 40);
    const k = JSON.stringify(names);
    if (k === trayKey) return;
    trayKey = k;
    window.wc.setTrayNames(names);
  }
  // Tall strip windows with more cards than fit in one row: wrap into rows instead of one long scrolling row with
  // empty bands above and below (cards never grow taller than ~1.15x their width). --n becomes cards per row.
  const CARD_MIN_W = 200, CARD_MIN_H = 216;
  let rowsKey = '';
  function updateStripRows() {
    const s = el.strip, n = +s.dataset.count || 1;
    const key = [n, layout(), s.clientWidth, s.clientHeight].join('|');
    if (key === rowsKey) return;
    rowsKey = key;
    let rows = 1, cols = n;
    if (settings && layout() === 'strip' && s.querySelector('.card[data-zone]')) {
      const cs = getComputedStyle(s), gap = parseFloat(cs.columnGap) || 12;
      const w = s.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const h = s.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      const perRow = Math.max(1, Math.floor((w + gap) / (CARD_MIN_W + gap)));
      const fitRows = Math.max(1, Math.floor((h + gap) / (CARD_MIN_H + gap)));
      if (n > perRow && fitRows > 1) {
        const lines = Math.ceil(n / perRow);
        // all lines fit: balance the cards over them; otherwise size for the visible rows and scroll down
        if (lines <= fitRows) { rows = lines; cols = Math.ceil(n / rows); } else { rows = fitRows; cols = perRow; }
      }
    }
    s.classList.toggle('rows', rows > 1);
    s.style.setProperty('--rows', String(rows));
    s.style.setProperty('--n', String(rows > 1 ? cols : n));
  }
  function buildEmpty() {
    const e = document.createElement('div'); e.className = 'empty';
    const title = document.createElement('div'); title.className = 'empty-title'; title.textContent = t('empty.title');
    const sub = document.createElement('div'); sub.className = 'empty-sub'; sub.textContent = t('empty.sub');
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pill empty-add'; btn.textContent = t('empty.add');
    btn.addEventListener('click', () => el.search.focus());
    e.append(title, sub, btn);
    setTimeout(() => { if (btn.isConnected && (document.activeElement === document.body || !document.activeElement)) btn.focus(); }, 0);
    return e;
  }
  const cardEl = (zone) => [...el.strip.querySelectorAll('.card[data-zone]')].find((c) => c.dataset.zone === zone) || null;

  function render() {
    if (!settings) return;
    const sig = structureSignature();
    if (sig !== structKey) { structKey = sig; buildStructure(); }
    if (el.app.classList.contains('converting') !== !!convert) el.app.classList.toggle('converting', !!convert);
    if (!convert && document.activeElement !== el.convSlider) {
      const n = parts(el.convZone.value || LOCAL_ZONE, new Date(), { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
      el.convSlider.value = +n.hour * 60 + +n.minute;
    }
    const date = convert ? new Date(convert.epochMs) : new Date();
    const refZone = convert ? convert.zone : LOCAL_ZONE;
    const pickedDate = !!convert && !!el.convDate.value && el.convDate.value !== todayIn(convert.zone);
    // No layout reads here: a minute tick or a scrub step only changes text and classes. The strip's rows follow its
    // size (ResizeObserver below, buildStructure, applyLayout); the edge fades are read after the frame is laid out.
    for (const card of el.strip.querySelectorAll('.card[data-zone]')) updateCard(card, card.dataset.zone, date, refZone, !!convert, pickedDate);
    lastMinute = Math.floor(Date.now() / 60000);
    queueOverflow();
    renderPlanner(date);
    renderMap(date);
    updateDayButton();
    syncSliderText();
  }
  // Screen readers hear the slider as a time ("09:00"), not as minutes ("540").
  function syncSliderText() {
    const v = +el.convSlider.value, txt = formatTime(Math.floor(v / 60) % 24, v % 60);
    if (el.convSlider.getAttribute('aria-valuetext') !== txt) el.convSlider.setAttribute('aria-valuetext', txt);
  }

  function buildCard(zone) {
    const c = document.createElement('div');
    c.className = 'card';
    c.dataset.zone = zone;
    c.draggable = true;
    c.tabIndex = 0;
    c.setAttribute('role', 'group');
    c.innerHTML = `
      <div class="card-head">
        <div class="head-text"><div class="city-row"><span class="city"></span><span class="pin" hidden></span><span class="src-badge" hidden></span></div><div class="phase-row"><span class="phase"></span><span class="moon" role="img" hidden></span></div><div class="dst-note" hidden></div></div>
        <button class="icon-btn more" aria-haspopup="menu" aria-expanded="false" aria-controls="cardMenu"><svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor"><circle cx="3.5" cy="8" r="1.35"/><circle cx="8" cy="8" r="1.35"/><circle cx="12.5" cy="8" r="1.35"/></g></svg></button>
      </div>
      <div class="display">
        <div class="time"><span class="hm"></span><span class="sec"></span><span class="ampm"></span></div>
        <div class="sky" hidden></div>
      </div>
      <div class="arc" aria-hidden="true"><span class="arc-work"></span><span class="arc-fill"></span><span class="arc-dot"></span></div>
      <div class="card-foot">
        <div class="date"></div>
        <div class="meta"><span class="tzname"></span><span class="utc"></span><span class="dshift" aria-hidden="true" hidden></span><span class="rel"></span></div>
      </div>`;
    c._city = c.querySelector('.city');
    const moon = c.querySelector('.moon'); moon.textContent = '☾'; moon.setAttribute('aria-label', t('card.asleep')); moon.title = t('card.asleep');
    c.addEventListener('wheel', onCardWheel, { passive: false });
    attachArcScrub(c, zone);
    c.querySelector('.pin').textContent = t('card.home');
    c.querySelector('.src-badge').textContent = t('card.source');
    // Keyboard shortcuts are discoverable from the card itself (and listed in the Help popover).
    c.setAttribute('aria-keyshortcuts', 'Enter F2 Delete Alt+ArrowLeft Alt+ArrowRight [ ] PageUp PageDown Shift+F10 0 1 2 3 4 5 6 7 8 9');
    c.setAttribute('aria-description', t('card.keys'));
    // A focused card keeps its accessible name while it has focus (no re-reading on every minute or scrub step);
    // it catches up when focus arrives or leaves. Conversions are spoken through announce().
    const flushAria = () => { if (c._aria && c.getAttribute('aria-label') !== c._aria) c.setAttribute('aria-label', c._aria); };
    c.addEventListener('focus', flushAria);
    c.addEventListener('blur', flushAria);
    const more = c.querySelector('.more');
    more.title = t('card.moreTitle'); more.setAttribute('aria-label', t('card.more'));
    more.addEventListener('click', (e) => { e.stopPropagation(); if (!settings) return; if (!el.menu.hidden && menuZone === zone) { closeMenu(true); return; } openMenu(zone, more); });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!settings || e.target.closest('input.rename')) return; openMenu(zone, null, e.clientX, e.clientY); });
    c.addEventListener('dblclick', (e) => { if (e.target.closest('button, input')) return; convertFrom(zone); });
    c.addEventListener('keydown', (e) => onCardKey(e, c));
    c.title = t('card.title');
    attachDrag(c);
    return c;
  }
  function applyLabel(card, zone) {
    const city = card._city;
    setText(city, labelOf(zone));
    city.title = `${displayName(zone)}, ${regionOf(zone)} (${zone})`;
    card.querySelector('.more').setAttribute('aria-label', t('card.moreFor', { city: labelOf(zone) }));
    card._aria = null; // force aria-label refresh
  }

  function updateCard(c, zone, date, refZone, converting, pickedDate) {
    const k = clock(zone, date);
    const hmEl = c.querySelector('.hm'); const prevHm = hmEl.textContent;
    setText(hmEl, k.hm);
    if (prevHm && prevHm !== k.hm) emit('time-change', { card: c, from: prevHm, to: k.hm, converting });
    setText(c.querySelector('.sec'), (!converting && settings.showSeconds) ? k.sec : '');
    setText(c.querySelector('.ampm'), k.ampm);
    const isHome = zone === LOCAL_ZONE;
    c.classList.toggle('converted', converting);
    c.classList.toggle('home', isHome);

    const hp = parts(zone, date, { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
    const hour = +hp.hour;
    const ll = coordsOf(zone);
    const key = ll ? sunPhase(date, ll, hour) : T.phaseOf(hour);
    const ph = c.querySelector('.phase');
    const phaseLabel = t('phase.' + key);
    setText(ph, phaseLabel);
    if (ph.className !== `phase ${key}`) ph.className = `phase ${key}`;
    const sunTitle = ll ? sunTitleOf(zone, date, ll) : '';
    if (ph.title !== sunTitle) ph.title = sunTitle;
    if (c.dataset.phase !== key) c.dataset.phase = key;
    const p = ((hour * 60 + +hp.minute) / 1440).toFixed(4);
    if (c._p !== p) { c._p = p; c.style.setProperty('--p', p); }
    // Displayed instant for motion/sky.js: the converted instant, or now to the minute (avoids per-second churn).
    const epoch = String(converting ? date.getTime() : Math.floor(date.getTime() / 60000) * 60000);
    if (c.dataset.epoch !== epoch) c.dataset.epoch = epoch;
    // Working-hours band on the day line follows this city's hours; dimmed on its days off.
    const wh = hoursOf(zone);
    const ws = toMin(wh.start) / 1440, we = toMin(wh.end) / 1440;
    const offDay = !wh.days.includes(localWall(zone, date).wd);
    const bandKey = `${ws}|${we}|${offDay}`;
    if (c._band !== bandKey) {
      c._band = bandKey;
      c.style.setProperty('--ws', ws.toFixed(4)); c.style.setProperty('--we', we.toFixed(4));
      c.querySelector('.arc-work').classList.toggle('overnight', we < ws);
      c.classList.toggle('off-day', offDay);
    }
    c.classList.toggle('working', isWorking(zone, date));
    c.classList.toggle('is-night', ll ? !window.WCSun.isDay(date, ll[0], ll[1]) : (hour < 6 || hour >= 20));
    const asleep = converting && (hour >= 22 || hour < 7);
    c.classList.toggle('asleep', asleep);
    const moonEl = c.querySelector('.moon');
    if (moonEl.hidden === asleep) moonEl.hidden = !asleep;
    const pin = c.querySelector('.pin');
    if (pin.hidden === isHome) pin.hidden = !isHome;
    const sky = c.querySelector('.sky');
    setText(sky, (key === 'night' || key === 'dusk') ? '\u{1F319}' : '☀️');

    const diff = T.dayDiff(zone, date, refZone);
    const dateStr = T.fmt(zone, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, locale()).format(date);
    const marker = dayMarker(diff);
    const d = c.querySelector('.date');
    const dKey = dateStr + '|' + marker;
    if (d._key !== dKey) {
      d._key = dKey;
      d.textContent = dateStr;
      if (marker) { const s = document.createElement('span'); s.className = 'shift'; s.textContent = marker; d.append(' ', s); }
    }
    d.classList.toggle('same', !diff);
    // A date other than today picked in the converter: every card shows its own local date, so the chosen day is
    // visible on the clocks themselves (not only in the date button). Otherwise the pill shows the day shift.
    const ds = c.querySelector('.dshift');
    const pill = pickedDate ? T.fmt(zone, { month: 'short', day: 'numeric' }, locale()).format(date) : marker;
    setText(ds, pill);
    if (ds.hidden !== !pill) ds.hidden = !pill;
    ds.classList.toggle('on-date', !!pickedDate);
    const isSource = converting && zone === refZone;
    c.classList.toggle('source', isSource);
    const srcBadge = c.querySelector('.src-badge');
    if (srcBadge.hidden === isSource) srcBadge.hidden = !isSource; // visible "Source" label, not only the accent color

    const tz = tzInfo(zone, date);
    const tzn = c.querySelector('.tzname');
    setText(tzn, tz.abbr);
    if (tzn.title !== tz.long) tzn.title = tz.long;
    const utc = `UTC${T.formatOffset(T.offsetMinutes(zone, date))}`;
    setText(c.querySelector('.utc'), utc);
    const rel = c.querySelector('.rel');
    setText(rel, relLabel(zone, date));
    rel.classList.toggle('home', isHome);

    const dn = dstNote(zone, date);
    const dstEl = c.querySelector('.dst-note');
    setText(dstEl, dn ? dn.text : '');
    if (dstEl.title !== (dn ? dn.title : '')) dstEl.title = dn ? dn.title : '';
    if (dstEl.hidden !== !dn) dstEl.hidden = !dn;

    const timeText = k.ampm ? `${k.hm} ${k.ampm}` : k.hm;
    const working = c.classList.contains('working');
    const aria = [displayName(zone), timeText, isHome ? t('card.home') : relSpoken(zone, date),
      converting ? t(isSource ? 'card.state.source' : 'card.state.converted') : '', pickedDate ? dateStr : '', marker,
      phaseLabel, asleep ? t('card.asleep') : '', t(working ? 'card.state.working' : 'card.state.off'), utc, tz.long, dn ? dn.text : '']
      .filter(Boolean).join(', ');
    if (c._aria !== aria) {
      c._aria = aria;
      if (document.activeElement !== c || !c.hasAttribute('aria-label')) c.setAttribute('aria-label', aria);
    }
  }

  // ---------- card actions ----------
  function convertFrom(zone) {
    if (!settings) return;
    el.convZone.value = zone;
    if (!el.convTime.value) el.convTime.value = formatInput(9, 0);
    applyConvert(true);
    el.convTime.focus(); el.convTime.select();
  }
  function moveZone(zone, delta) {
    const z = [...settings.zones]; const i = z.indexOf(zone); const j = i + delta;
    if (i < 0 || j < 0 || j >= z.length) return false;
    [z[i], z[j]] = [z[j], z[i]];
    saveZones(z);
    announce(t('say.moved', { city: labelOf(zone), n: j + 1 }));
    return true;
  }
  function removeZone(zone) {
    const z = settings.zones.filter((x) => x !== zone);
    const i = settings.zones.indexOf(zone);
    saveZones(z);
    announce(t('say.removed', { city: labelOf(zone) }));
    const cards = [...el.strip.querySelectorAll('.card[data-zone]')];
    const next = cards[Math.min(i, cards.length - 1)];
    if (next) next.focus(); else el.search.focus();
  }
  function onCardKey(e, card) {
    if (!settings || e.target !== card) return;
    const zone = card.dataset.zone;
    const vertical = layout() === 'vertical';
    // A digit starts a conversion from this city: the digit goes into the time field, which takes focus, so the rest
    // of the time is typed there ("1", "5" reads 15, then 15:00 on blur).
    if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      if (el.convDate.dataset.auto) el.convDate.value = ''; // an automatic date is re-picked: today in this city
      el.convZone.value = zone;
      el.convTime.value = e.key;
      applyConvert();
      el.convTime.focus();
      try { el.convTime.setSelectionRange(1, 1); } catch { /* not a text field */ }
    }
    else if (e.key === 'Enter') { e.preventDefault(); convertFrom(zone); }
    else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || (vertical && (e.key === 'ArrowUp' || e.key === 'ArrowDown')))) {
      e.preventDefault();
      moveZone(zone, (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1);
      const c = cardEl(zone); if (c) c.focus();
    } else if (e.key === 'Delete') { e.preventDefault(); removeZone(zone); }
    else if (e.key === 'F2') { e.preventDefault(); startRename(zone); }
    else if (e.key === '[' || e.key === ']') { e.preventDefault(); scrubBy(e.key === ']' ? 15 : -15); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); scrubBy(e.key === 'PageUp' ? 60 : -60); }
    else if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); openMenu(zone, card.querySelector('.more')); }
  }

  // ---------- rename ----------
  function startRename(zone) {
    const card = cardEl(zone); if (!card) return;
    const span = card._city;
    if (!span.isConnected) return; // already renaming
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'rename'; input.maxLength = 40; input.spellcheck = false; input.autocomplete = 'off';
    input.value = labelOf(zone);
    input.setAttribute('aria-label', t('card.renameAria', { city: cityOf(zone) }));
    card.draggable = false;
    span.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const finish = input._finish = (save) => {
      if (done) return; done = true;
      if (input.isConnected) input.replaceWith(span);
      card.draggable = true;
      if (save && settings) {
        const before = displayName(zone);
        const v = input.value.trim().slice(0, 40);
        const labels = { ...(settings.labels || {}) };
        if (!v || v === cityOf(zone)) delete labels[zone]; else labels[zone] = v;
        if ((labels[zone] || '') !== customLabel(zone)) {
          set({ labels });
          fillConvZones();
          announce(t('say.renamed', { old: before, name: labelOf(zone) }));
        }
      }
      if (card.isConnected && document.activeElement === document.body) card.focus();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); card.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); card.focus(); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());
  }

  // ---------- copy ----------
  // "Copy times": a header line, then one line per city. The rows go along too, so main can put a table on the
  // clipboard for mail and chat apps (it builds and escapes the HTML itself).
  function copyData(onlyZone) {
    const date = convert ? new Date(convert.epochMs) : new Date();
    const refZone = convert ? convert.zone : LOCAL_ZONE;
    let header;
    if (convert) header = atTime('copy.header', { time: formatTime(convert.h, convert.mi), city: labelOf(convert.zone) }, shownHour(convert.h));
    else { const k = clock(LOCAL_ZONE, date); header = atTime('copy.header', { time: k.ampm ? `${k.hm} ${k.ampm}` : k.hm, city: labelOf(LOCAL_ZONE) }, parseInt(k.hm, 10)); }
    const zones = settings.zones.filter((z) => supportsZone(z) && (!onlyZone || z === onlyZone));
    const rows = zones.map((z) => {
      const k = clock(z, date);
      const day = T.fmt(z, { weekday: 'short', month: 'short', day: 'numeric' }, locale()).format(date);
      const marker = dayMarker(T.dayDiff(z, date, refZone));
      return [labelOf(z), k.ampm ? `${k.hm} ${k.ampm}` : k.hm, `${day}${marker ? ' ' + marker : ''}`];
    });
    return { text: [header, ...rows.map(([city, time, day]) => `${time} ${city} · ${day}`)].join('\n'), rows };
  }
  const copyLines = (onlyZone) => copyData(onlyZone).text;
  // The instant on screen: the converted one, or now to the minute.
  const shownEpoch = () => (convert ? convert.epochMs : Math.floor(Date.now() / 60000) * 60000);
  // Discord shows <t:...> in each reader's own time zone: the full date and time, then "in 3 hours".
  function discordText() { const sec = Math.floor(shownEpoch() / 1000); return `<t:${sec}:F> (<t:${sec}:R>)`; }
  // ISO 8601 in UTC (no milliseconds), then the same instant as the clock shows it: "15:00 UTC, Thu, Sep 24".
  function utcText() {
    const d = new Date(shownEpoch());
    const day = T.fmt('UTC', { weekday: 'short', month: 'short', day: 'numeric' }, locale()).format(d);
    return `${d.toISOString().replace(/\.\d{3}Z$/, 'Z')}\n${formatTime(d.getUTCHours(), d.getUTCMinutes())} UTC, ${day}`;
  }
  let copiedTimer = null;
  // A short status in the hint line (or the toast under the time field); `say` is what a screen reader hears.
  function flashStatus(text, say) {
    announce(say || text);
    clearTimeout(copiedTimer);
    el.convHint.textContent = text;
    toast(text, 1500);
    copiedTimer = setTimeout(refreshHint, 1500);
  }
  function copyOut(payload, onlyZone) {
    Promise.resolve(window.wc.copyText(payload)).then((ok) => {
      if (ok === false) return;
      flashStatus(t('hint.copied'), t('say.copied'));
      emit('copied', { onlyZone });
    }).catch(onIpcError);
  }
  function doCopy(onlyZone) {
    if (!settings || !settings.zones.some(supportsZone)) return; // a header with no cities is not worth copying
    const d = copyData(onlyZone);
    copyOut(onlyZone || settings.web ? d.text : d, onlyZone); // the web app's clipboard takes plain text
  }
  // A calendar invite (.ics) from startMs to endMs; main checks it, asks where to save it and writes the file.
  function saveInvite(startMs, endMs, description) {
    if (!settings || typeof window.wc.saveIcs !== 'function') return;
    Promise.resolve(window.wc.saveIcs({ startMs, endMs, title: t('ics.title'), description: String(description || '').slice(0, 2000) }))
      .then((r) => { if (r === 'saved') flashStatus(t('say.icsSaved')); }).catch(onIpcError);
  }

  // Copy menu (#btnCopy, shown while converting): the times, a Discord timestamp, UTC, or a calendar invite.
  const copyItems = () => [...el.copyMenu.querySelectorAll('[role="menuitem"]')].filter((b) => !b.hidden && !b.disabled);
  function openCopyMenu() {
    if (!settings || !settings.zones.some(supportsZone)) return;
    closeMenu(false); closeChips(false); closeHours(false);
    el.copyMenu.querySelector('[data-copy="ics"]').hidden = typeof window.wc.saveIcs !== 'function';
    el.copyMenu.hidden = false;
    el.btnCopy.setAttribute('aria-expanded', 'true');
    placePopover(el.copyMenu, el.btnCopy.getBoundingClientRect());
    const first = copyItems()[0]; if (first) first.focus();
    emit('menu', { open: true, menu: el.copyMenu, anchor: el.btnCopy });
  }
  function closeCopyMenu(returnFocus) {
    if (el.copyMenu.hidden) return;
    emit('menu', { open: false, menu: el.copyMenu });
    el.copyMenu.hidden = true;
    el.btnCopy.setAttribute('aria-expanded', 'false');
    if (returnFocus && !el.btnCopy.hidden) el.btnCopy.focus();
  }
  el.btnCopy.addEventListener('click', guard((e) => { e.stopPropagation(); if (el.copyMenu.hidden) openCopyMenu(); else closeCopyMenu(true); }));
  el.copyMenu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b || !settings) return;
    const what = b.dataset.copy;
    closeCopyMenu(true);
    if (what === 'text') doCopy(null);
    else if (what === 'discord') copyOut(discordText(), null);
    else if (what === 'utc') copyOut(utcText(), null);
    else if (what === 'ics') { const at = shownEpoch(); saveInvite(at, at + 3600000, copyLines(null)); }
  });
  el.copyMenu.addEventListener('keydown', (e) => {
    const items = copyItems(); if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCopyMenu(true); }
    else if (e.key === 'Tab') { e.preventDefault(); closeCopyMenu(true); }
  });
  document.addEventListener('mousedown', (e) => { if (!el.copyMenu.hidden && !el.copyMenu.contains(e.target) && !el.btnCopy.contains(e.target)) closeCopyMenu(false); });
  window.addEventListener('blur', () => closeCopyMenu(false));

  // ---------- card menu ----------
  const menuItems = () => [...el.menu.querySelectorAll('[role="menuitem"]')].filter((b) => !b.disabled && !b.hidden);
  function openMenu(zone, anchor, x, y) {
    if (!settings) return;
    if (!el.menu.hidden) closeMenu(false);
    menuZone = zone;
    menuAnchor = anchor || cardEl(zone);
    const i = settings.zones.indexOf(zone);
    const vertical = layout() === 'vertical';
    const left = el.menu.querySelector('[data-act="left"]'), right = el.menu.querySelector('[data-act="right"]');
    left.textContent = t(vertical ? 'menu.up' : 'menu.left');
    right.textContent = t(vertical ? 'menu.down' : 'menu.right');
    left.disabled = i <= 0;
    right.disabled = i >= settings.zones.length - 1;
    el.menu.hidden = false;
    if (anchor) anchor.setAttribute('aria-expanded', 'true');
    placePopover(el.menu, anchor ? anchor.getBoundingClientRect() : null, x, y);
    const first = menuItems()[0]; if (first) first.focus();
    emit('menu', { open: true, menu: el.menu, anchor });
  }
  // Popover placement that never covers its own anchor: below it, else above, else beside it (left, then right).
  // A menu taller than the window switches to two columns (.menu-grid) first; past that it scrolls (CSS max-height).
  function placePopover(pop, r, x, y) {
    const W = window.innerWidth, H = window.innerHeight, M = 6;
    pop.classList.remove('menu-grid');
    pop.style.left = '0px'; pop.style.top = '0px';
    // scrollHeight: offsetHeight is already capped by the CSS max-height
    if (pop === el.menu && (layout() === 'compact' || pop.scrollHeight > H - 2 * M)) pop.classList.add('menu-grid');
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const clampX = (v) => Math.max(M, Math.min(v, W - w - M));
    const clampY = (v) => Math.max(M, Math.min(v, H - h - M));
    let lx, ty;
    if (!r) { lx = clampX(x); ty = clampY(y); }
    else if (r.bottom + 4 + h <= H - M) { lx = clampX(r.right - w); ty = r.bottom + 4; }
    else if (r.top - 4 - h >= M) { lx = clampX(r.right - w); ty = r.top - 4 - h; }
    else {
      ty = clampY(r.top - 8);
      lx = clampX(r.left - 4 - w >= M ? r.left - 4 - w : r.right + 4 + w <= W - M ? r.right + 4 : r.right - w);
    }
    pop.style.left = lx + 'px'; pop.style.top = ty + 'px';
  }
  function closeMenu(returnFocus) {
    if (!el.menu.hidden) emit('menu', { open: false, menu: el.menu });
    if (el.menu.hidden) return;
    el.menu.hidden = true;
    el.strip.querySelectorAll('.more[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    const anchor = menuAnchor;
    menuZone = null; menuAnchor = null;
    if (returnFocus && anchor && anchor.isConnected) anchor.focus();
  }
  el.menu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || !settings || !menuZone) return;
    const act = btn.dataset.act; const zone = menuZone;
    closeMenu(act !== 'source' && act !== 'rename' && act !== 'remove' && act !== 'hours');
    if (act === 'remove') removeZone(zone);
    else if (act === 'left') moveZone(zone, -1);
    else if (act === 'right') moveZone(zone, 1);
    else if (act === 'source') convertFrom(zone);
    else if (act === 'rename') startRename(zone);
    else if (act === 'copy') doCopy(zone);
    else if (act === 'hours') openHours(zone, cardEl(zone));
  });
  el.menu.addEventListener('keydown', (e) => {
    const items = menuItems(); if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    else if (e.key === 'Tab') { e.preventDefault(); closeMenu(true); }
  });
  document.addEventListener('mousedown', (e) => { if (!el.menu.hidden && !el.menu.contains(e.target) && !e.target.closest('.more')) closeMenu(false); });
  window.addEventListener('blur', () => closeMenu(false));

  // ---------- drag reorder ----------
  let dragZone = null;
  function attachDrag(card) {
    card.addEventListener('dragstart', (e) => { if (!settings || arcScrub) { e.preventDefault(); return; } dragZone = card.dataset.zone; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); clearDrop(); dragZone = null; });
    card.addEventListener('dragover', (e) => {
      if (!dragZone || dragZone === card.dataset.zone) return;
      e.preventDefault(); clearDrop();
      const r = card.getBoundingClientRect();
      const before = layout() === 'vertical' ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
      card.classList.add(before ? 'drop-before' : 'drop-after');
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!settings || !dragZone || dragZone === card.dataset.zone) { clearDrop(); return; }
      const before = card.classList.contains('drop-before');
      clearDrop();
      const moved = dragZone;
      const z = settings.zones.filter((x) => x !== moved);
      z.splice(z.indexOf(card.dataset.zone) + (before ? 0 : 1), 0, moved);
      saveZones(z);
      announce(t('say.moved', { city: labelOf(moved), n: z.indexOf(moved) + 1 }));
    });
  }
  const clearDrop = () => el.strip.querySelectorAll('.drop-before,.drop-after').forEach((c) => c.classList.remove('drop-before', 'drop-after'));

  // ---------- zones ----------
  let saveSeq = 0;
  function saveZones(z) {
    if (!settings) return;
    const prevZones = settings.zones;
    emit('zones-before', { from: prevZones, to: z });
    settings.zones = z;
    fillConvZones();
    // If the converter's source city was removed, re-run the conversion from the fallback source.
    if (convert && convert.zone !== el.convZone.value) applyConvert(); else render();
    emit('zones-after', { from: prevZones, to: z });
    // Main validates and may drop unknown zones; adopt its copy if it differs. Only the latest reply counts,
    // so a slow reply to an older save cannot clobber newer local changes.
    const seq = ++saveSeq;
    window.wc.setSettings({ zones: z }).then((s) => {
      if (seq === saveSeq && s && JSON.stringify(s.zones) !== JSON.stringify(settings.zones)) saveZones(s.zones);
    }).catch(onIpcError);
  }
  function addZone(zone) {
    if (settings.zones.includes(zone)) return;
    saveZones([...settings.zones, zone]);
    announce(t('say.added', { city: labelOf(zone) }));
  }

  // Abbreviations map to representative zones (first = most common meaning).
  const ABBR = {
    est: ['America/New_York', 'America/Toronto'], edt: ['America/New_York', 'America/Toronto'], et: ['America/New_York'],
    cst: ['America/Chicago', 'America/Mexico_City'], cdt: ['America/Chicago'], ct: ['America/Chicago'],
    mst: ['America/Denver', 'America/Phoenix'], mdt: ['America/Denver'], mt: ['America/Denver'],
    pst: ['America/Los_Angeles', 'America/Vancouver'], pdt: ['America/Los_Angeles', 'America/Vancouver'], pt: ['America/Los_Angeles'],
    akst: ['America/Anchorage'], akdt: ['America/Anchorage'], hst: ['Pacific/Honolulu'],
    ast: ['America/Halifax'], adt: ['America/Halifax'], nst: ['America/St_Johns'], ndt: ['America/St_Johns'],
    brt: ['America/Sao_Paulo'], art: ['America/Argentina/Buenos_Aires'], clt: ['America/Santiago'], cot: ['America/Bogota'], pet: ['America/Lima'],
    gmt: ['Europe/London', 'Europe/Dublin'], bst: ['Europe/London'], wet: ['Europe/Lisbon'], west: ['Europe/Lisbon'],
    cet: ['Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome'], cest: ['Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome'],
    eet: ['Europe/Athens', 'Europe/Helsinki', 'Africa/Cairo'], eest: ['Europe/Athens', 'Europe/Helsinki'], msk: ['Europe/Moscow'],
    wat: ['Africa/Lagos'], cat: ['Africa/Johannesburg'], sast: ['Africa/Johannesburg'], eat: ['Africa/Nairobi'],
    gst: ['Asia/Dubai'], pkt: ['Asia/Karachi'], ist: ['Asia/Kolkata', 'Europe/Dublin', 'Asia/Jerusalem'], npt: ['Asia/Kathmandu'],
    ict: ['Asia/Bangkok', 'Asia/Ho_Chi_Minh'], wib: ['Asia/Jakarta'], sgt: ['Asia/Singapore'], hkt: ['Asia/Hong_Kong'], pht: ['Asia/Manila'],
    jst: ['Asia/Tokyo'], kst: ['Asia/Seoul'], awst: ['Australia/Perth'],
    acst: ['Australia/Adelaide'], acdt: ['Australia/Adelaide'], aest: ['Australia/Sydney', 'Australia/Brisbane'], aedt: ['Australia/Sydney', 'Australia/Melbourne'],
    nzst: ['Pacific/Auckland'], nzdt: ['Pacific/Auckland'],
  };
  // "+3", "-5", "UTC+5:30", "GMT-3", "utc" -> offset in minutes, else null. A lone "z" is not an offset: it is the
  // start of Zurich, Zagreb...
  function parseOffsetQuery(q) {
    const s = q.replace(/\s+/g, '').replace(/−/g, '-');
    if (/^(utc|gmt)$/.test(s)) return 0;
    const m = /^(?:utc|gmt)?([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(s);
    if (!m || +m[2] > 14 || (m[3] && +m[3] >= 60)) return null;
    return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + (m[3] ? +m[3] : 0));
  }
  // Case- and accent-insensitive text for matching ("sao" finds São Paulo, "zurich" finds Zúrich).
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let lastOffsetQuery = null; // { off } when the current results come from an offset / abbreviation match
  function searchZones(q) {
    q = fold(q.trim());
    lastOffsetQuery = null;
    if (!q || !settings) return [];
    const now = new Date();
    const off = parseOffsetQuery(q);
    if (off !== null) {
      lastOffsetQuery = { off };
      // One pass over every zone with throwaway formatters, kept for this minute (and dropped when the search field
      // loses focus), so a "+5" search does not fill the shared formatter cache with ~400 zones.
      const minute = Math.floor(now.getTime() / 60000);
      if (!searchZones.offsets || searchZones.offsets.minute !== minute) {
        const byZone = new Map();
        for (const z of ALL_ZONES) byZone.set(z, T.offsetMinutesUncached(z, now));
        searchZones.offsets = { minute, byZone };
      }
      const offs = searchZones.offsets.byZone;
      return ALL_ZONES.filter((z) => !settings.zones.includes(z) && offs.get(z) === off)
        .sort((a, b) => (window.ZONE_META[a] ? 0 : 1) - (window.ZONE_META[b] ? 0 : 1) || cityOf(a).localeCompare(cityOf(b)))
        .slice(0, 10);
    }
    const abbr = (ABBR[q] || []).filter((z) => supportsZone(z) && !settings.zones.includes(z));
    if (abbr.length) lastOffsetQuery = { abbr: true };
    const scored = abbr.map((z) => ({ z, score: -1 }));
    for (const z of ALL_ZONES) {
      if (settings.zones.includes(z)) continue;
      const m = window.ZONE_META[z];
      const city = fold(cityOf(z)), en = fold(englishCity(z));
      const label = fold(customLabel(z));
      const hay = fold(`${z} ${city} ${en} ${label} ${regionOf(z)} ${m ? m.country + ' ' + (m.alias || '') : ''}`).replace(/_/g, ' ');
      let score = -1;
      if (city.startsWith(q) || en.startsWith(q) || (label && label.startsWith(q))) score = 0;
      else if (city.includes(q) || en.includes(q) || (label && label.includes(q))) score = 1;
      else if (hay.includes(q)) score = m ? 2 : 3;
      if (score >= 0 && !abbr.includes(z)) scored.push({ z, score });
    }
    scored.sort((a, b) => a.score - b.score || (a.score < 0 ? 0 : cityOf(a.z).localeCompare(cityOf(b.z))));
    return scored.slice(0, 10).map((s) => s.z);
  }
  // Nothing to add for this query: say why (the city is already on the list, or nothing matches).
  function emptySearchText(q) {
    const f = fold(q.trim());
    if (!f) return '';
    const have = settings.zones.find((z) => [cityOf(z), englishCity(z), customLabel(z)].some((s) => s && fold(s).startsWith(f)));
    return have ? t('search.already', { city: labelOf(have) }) : t('search.none');
  }
  let sel = -1;
  // Combobox state: aria-expanded follows the popup, aria-activedescendant the highlighted option.
  function syncCombo() {
    const open = !el.results.hidden;
    el.search.setAttribute('aria-expanded', String(open));
    const act = open && sel >= 0 ? document.getElementById('zr-' + sel) : null;
    if (act) el.search.setAttribute('aria-activedescendant', act.id); else el.search.removeAttribute('aria-activedescendant');
  }
  // "No matching cities" / "<City> is already on your list" are spoken once per message (debounced while typing).
  let emptySaid = '', emptyTimer = null;
  function sayEmpty(text) {
    clearTimeout(emptyTimer);
    if (!text) { emptySaid = ''; return; }
    if (text === emptySaid) return;
    emptyTimer = setTimeout(() => { emptySaid = text; announce(text); }, 450);
  }
  function renderResults() {
    renderResultsList();
    syncCombo();
  }
  function renderResultsList() {
    if (!settings) return;
    const list = searchZones(el.search.value);
    const emptyText = list.length || document.activeElement !== el.search ? '' : emptySearchText(el.search.value);
    const wasHidden = el.results.hidden;
    el.results.hidden = list.length === 0 && !emptyText;
    if (!el.results.hidden && wasHidden) queueMicrotask(() => emit('results', { open: true, list: el.results }));
    if (!el.results.hidden) {
      const r = el.search.getBoundingClientRect();
      el.results.style.left = Math.max(6, Math.min(r.right - 260, window.innerWidth - 266)) + 'px';
      el.results.style.top = (r.bottom + 6) + 'px';
      el.results.style.maxHeight = Math.max(80, window.innerHeight - r.bottom - 14) + 'px';
    }
    sel = list.length ? Math.max(0, Math.min(sel, list.length - 1)) : -1;
    sayEmpty(emptyText);
    const now = new Date();
    if (!list.length) {
      if (!emptyText) { el.results.replaceChildren(); return; }
      const li = document.createElement('li');
      li.id = 'zr-empty'; li.className = 'results-empty'; li.setAttribute('role', 'option'); li.setAttribute('aria-disabled', 'true');
      li.textContent = emptyText;
      li.addEventListener('mousedown', (e) => e.preventDefault());
      el.results.replaceChildren(li);
      return;
    }
    el.results.replaceChildren(...list.map((z, i) => {
      const li = document.createElement('li');
      li.id = 'zr-' + i; li.setAttribute('role', 'option'); li.className = i === sel ? 'sel' : '';
      li.setAttribute('aria-selected', String(i === sel));
      const tm = clock(z, now);
      li.innerHTML = '<span><b></b> <span class="muted"></span></span><span class="z"></span>';
      li.querySelector('b').textContent = cityOf(z);
      const region = customLabel(z) ? `${customLabel(z)} · ${regionOf(z)}` : regionOf(z);
      li.querySelector('.muted').textContent = lastOffsetQuery ? `${region} · UTC${T.formatOffset(T.offsetMinutes(z, now))}` : region;
      li.querySelector('.z').textContent = tm.ampm ? `${tm.hm} ${tm.ampm}` : tm.hm;
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(z); });
      return li;
    }));
  }
  function pick(z) {
    addZone(z); el.search.value = ''; sel = -1; renderResults();
    // Focus moves to the new card (Enter then converts from it), not to the page body. With the planner or the map
    // open the cards are hidden, so it stays in the search field.
    requestAnimationFrame(() => {
      const c = el.strip.querySelector(`.card[data-zone="${CSS.escape(z)}"]`);
      if (c && c.offsetParent !== null) c.focus({ preventScroll: true }); else el.search.focus();
    });
    const behavior = reducedMotion() ? 'auto' : 'smooth';
    if (layout() === 'vertical') el.strip.scrollTo({ top: el.strip.scrollHeight, behavior });
    else el.strip.scrollTo({ left: el.strip.scrollWidth, behavior });
  }
  el.search.addEventListener('input', guard(() => { sel = 0; renderResults(); }));
  el.search.addEventListener('focus', guard(renderResults));
  el.search.addEventListener('blur', () => setTimeout(() => { el.results.hidden = true; sayEmpty(''); syncCombo(); searchZones.offsets = null; }, 120));
  el.search.addEventListener('keydown', guard((e) => {
    const n = el.results.querySelectorAll('li').length;
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, n - 1); renderResults(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); renderResults(); e.preventDefault(); }
    else if (e.key === 'Enter') { const list = searchZones(el.search.value); if (list[sel]) pick(list[sel]); }
    else if (e.key === 'Escape') { el.search.value = ''; renderResults(); el.search.blur(); }
  }));
  // Horizontal wheel scrolling for the strip and compact layouts (vertical and wrapped rows scroll natively). A card
  // marks the wheel defaultPrevented when it scrubs the time (its digits or day line, or anywhere on it when every card
  // fits); otherwise the wheel lands here and scrolls to the hidden cards. Ctrl+wheel zooms.
  let stripWheelAcc = 0;
  el.strip.addEventListener('wheel', (e) => {
    if (layout() === 'vertical' || el.strip.classList.contains('rows') || e.defaultPrevented || e.ctrlKey) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || e.target.closest('.results')) return;
    e.preventDefault();
    // One notch = one card (like one notch = 15 minutes on the digits); small deltas (touchpads) add up to a notch first.
    // The strip snaps to cards, and scrolling by less than a card snaps back to the card it started on, so each step is
    // a whole card: scrollBy lands on the next card in the wheel's direction.
    const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 100 : 1);
    let steps;
    if (Math.abs(dy) >= 50) { stripWheelAcc = 0; steps = Math.sign(dy) * Math.max(1, Math.round(Math.abs(dy) / 120)); }
    else {
      if (Math.sign(dy) !== Math.sign(stripWheelAcc)) stripWheelAcc = 0;
      stripWheelAcc += dy;
      steps = Math.trunc(stripWheelAcc / 80);
      stripWheelAcc -= steps * 80;
    }
    if (!steps) return;
    // Already at that end: nothing to scroll to (scrollBy would only snap the strip a few pixels back to a card).
    const s = el.strip;
    if (steps > 0 ? s.scrollLeft + s.clientWidth >= s.scrollWidth - 1 : s.scrollLeft <= 0) return;
    const card = el.strip.querySelector('.card[data-zone]');
    const pitch = card ? card.offsetWidth + (parseFloat(getComputedStyle(el.strip).columnGap) || 12) : CARD_MIN_W;
    el.strip.scrollBy({ left: steps * pitch, behavior: 'instant' });
  }, { passive: false });

  // Edge fades while more cards sit past an edge (start fade once scrolled, so cards never slide under a hard edge).
  function updateOverflow() {
    const s = el.strip;
    const vertical = layout() === 'vertical';
    const down = vertical || s.classList.contains('rows');
    const more = down ? s.scrollTop + s.clientHeight < s.scrollHeight - 2 : s.scrollLeft + s.clientWidth < s.scrollWidth - 2;
    s.classList.toggle('overflow-end', more);
    s.classList.toggle('overflow-start', down ? s.scrollTop > 2 : s.scrollLeft > 2);
  }
  // After a render, read the overflow once the frame is laid out (a timer after the next animation frame), so a minute
  // tick or a scrub step never forces a layout. One read per frame at most.
  let overflowQueued = false;
  function queueOverflow() {
    if (overflowQueued) return;
    overflowQueued = true;
    requestAnimationFrame(() => setTimeout(() => { overflowQueued = false; updateOverflow(); }, 0));
  }
  // The strip's rows and fades depend on its size: this catches every size change, including the strip coming back
  // after the planner or map (no window resize then). The callback runs after layout, so its reads are cheap.
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (settings) updateStripRows(); updateOverflow(); }).observe(el.strip);
  el.strip.addEventListener('scroll', updateOverflow, { passive: true });
  let lastNarrow = window.innerWidth < 400;
  window.addEventListener('resize', () => {
    if (settings) { applyBarStack(); updateStripRows(); }
    updateOverflow();
    fitPlanner();
    syncLayoutSwitch(); fixLayoutFocus();
    if (!el.convToast.hidden) el.convToast.hidden = true;
    const narrow = window.innerWidth < 400;
    if (narrow !== lastNarrow) { lastNarrow = narrow; fillConvZones(); }
  });

  // ---------- converter ----------
  function fillConvZones() {
    if (!settings) return;
    const cur = el.convZone.value || LOCAL_ZONE;
    const list = [LOCAL_ZONE, ...settings.zones.filter((z) => z !== LOCAL_ZONE)];
    el.convZone.replaceChildren(...list.map((z) => {
      const o = document.createElement('option'); o.value = z; o.textContent = z === LOCAL_ZONE && window.innerWidth >= 400 ? t('conv.local', { city: labelOf(z) }) : labelOf(z); return o;
    }));
    el.convZone.value = list.includes(cur) ? cur : LOCAL_ZONE;
  }
  function todayIn(zone) { const p = parts(zone, new Date(), { year: 'numeric', month: '2-digit', day: '2-digit' }); return `${p.year}-${p.month}-${p.day}`; }
  // 'YYYY-MM-DD' -> localized "Thu, Sep 24" (the calendar date itself, no zone shift).
  const ymdDate = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
  const ymdLabel = (ymd) => T.fmt('UTC', { weekday: 'short', month: 'short', day: 'numeric' }, locale()).format(ymdDate(ymd));
  const addDays = (ymd, n) => new Date(ymdDate(ymd).getTime() + n * DAY_MS).toISOString().slice(0, 10);
  function setInvalid(on) {
    el.convTime.classList.toggle('invalid', on);
    // The format hint (#convFormat) is always attached; while invalid, the hint line says the same thing.
    if (on) { el.convTime.setAttribute('aria-invalid', 'true'); el.convTime.setAttribute('aria-describedby', 'convHint'); }
    else { el.convTime.removeAttribute('aria-invalid'); el.convTime.setAttribute('aria-describedby', 'convFormat'); }
  }
  function refreshHint() {
    clearTimeout(copiedTimer);
    if (!settings) return;
    if (convert) {
      const ymd = el.convDate.value;
      const sh = shownHour(convert.h);
      if (ymd && ymd !== todayIn(convert.zone)) el.convHint.textContent = atTime('hint.whenOn', { time: formatTime(convert.h, convert.mi), city: labelOf(convert.zone), date: ymdLabel(ymd) }, sh);
      else el.convHint.textContent = atTime('hint.when', { time: formatTime(convert.h, convert.mi), city: labelOf(convert.zone) }, sh);
    }
    else if (el.convTime.value.trim() && !T.parseTime(el.convTime.value)) el.convHint.textContent = t('hint.invalid');
    else el.convHint.textContent = '';
  }
  // Below 1400px (and in the vertical bar) the hint line is hidden, so short status messages (invalid time, Copied)
  // appear as a small toast under the time field instead of only a red outline or nothing.
  const hintShown = () => getComputedStyle(el.convHint).display !== 'none';
  let toastTimer = null;
  function toast(text, ms, error) {
    clearTimeout(toastTimer);
    if (!text || hintShown()) { el.convToast.hidden = true; return; }
    el.convToast.textContent = text;
    el.convToast.classList.toggle('error', !!error);
    el.convToast.hidden = false;
    const r = el.convTime.getBoundingClientRect();
    el.convToast.style.left = `${Math.max(6, Math.min(r.left, window.innerWidth - el.convToast.offsetWidth - 6))}px`;
    el.convToast.style.top = `${r.bottom + 6}px`;
    if (ms) toastTimer = setTimeout(() => { el.convToast.hidden = true; }, ms);
  }
  let convAnnounceTimer = null;
  // A place typed with the time ("3pm Tokyo", "15:00 EST", "tokyo 3pm"): resolved against the cities on the list first
  // (label, city name in any language, prefix match), then a time zone abbreviation on the list, then an exact city
  // name anywhere. { zone } when it can be the source, { known } for a city that is not on the list, {} otherwise.
  function namesOf(z) {
    const tr = window.ZONE_I18N || {};
    return [customLabel(z), cityOf(z), englishCity(z), tr.pt && tr.pt[z], tr.es && tr.es[z]].filter(Boolean).map(fold);
  }
  function placeZone(place) {
    const q = fold(place).replace(/\s+/g, ' ').trim();
    if (!q) return {};
    const onList = [...new Set([LOCAL_ZONE, ...settings.zones])].filter(supportsZone);
    let z = onList.find((x) => namesOf(x).some((n) => n.startsWith(q)));
    if (z) return { zone: z };
    const abbr = (ABBR[q.replace(/\s/g, '')] || []).filter(supportsZone);
    z = abbr.find((x) => onList.includes(x));
    if (z) return { zone: z };
    const known = abbr[0] || ALL_ZONES.find((x) => namesOf(x).includes(q));
    return known ? { known } : {};
  }
  // The time in the field: a plain time, or the time of "<time> <place>" when that place can be the source.
  function fieldTime() {
    const v = el.convTime.value, p = T.parseTime(v);
    if (p) return p;
    const sp = T.splitTimePlace(v);
    return sp && placeZone(sp.place).zone ? sp.time : null;
  }
  // Conversions go back to now on their own: 5 minutes after the last change while the window is unfocused (checked
  // again every 5 minutes while it has focus), and when the window comes back after more than 5 minutes hidden.
  const CONV_IDLE_MS = 5 * 60000;
  const convIdleMs = () => (typeof window.__wcConvIdleMs === 'number' ? window.__wcConvIdleMs : CONV_IDLE_MS); // tests shorten it
  let convIdle = null, hiddenSince = 0;
  function clearConversion() { el.convTime.value = ''; applyConvert(true); }
  function armConvIdle() {
    clearTimeout(convIdle); convIdle = null;
    if (!convert) return;
    convIdle = setTimeout(() => {
      convIdle = null;
      if (!convert) return;
      if (!document.hasFocus()) clearConversion(); else armConvIdle();
    }, convIdleMs());
  }
  window.addEventListener('blur', () => armConvIdle());
  function applyConvert(announceNow) {
    if (!settings) return;
    const pin = pinnedEpoch; pinnedEpoch = null; // only the scrub step that set it (setConvEpoch) may use it
    const raw = el.convTime.value;
    const wasConverting = !!convert;
    if (!raw.trim()) {
      closeCopyMenu(false);
      convert = null; el.convDate.value = ''; delete el.convDate.dataset.auto; setInvalid(false); toast(''); el.convClear.hidden = true; el.btnCopy.hidden = true; refreshHint(); render();
      armConvIdle();
      if (wasConverting) emit('convert', { on: false });
      if (wasConverting) { clearTimeout(convAnnounceTimer); announce(t('say.now')); }
      return;
    }
    let parsed = T.parseTime(raw);
    if (!parsed) {
      // "3pm Tokyo": the place becomes the source when it is on the list; otherwise say why nothing converts.
      const sp = T.splitTimePlace(raw);
      let msg = t('hint.invalid');
      if (sp) {
        const r = placeZone(sp.place);
        if (r.zone) {
          if (el.convZone.value !== r.zone) { el.convZone.value = r.zone; if (el.convDate.dataset.auto) el.convDate.value = ''; }
          parsed = sp.time;
        } else msg = r.known ? t('hint.addFirst', { city: cityOf(r.known) }) : t('hint.noPlace', { place: sp.place });
      }
      if (!parsed) {
        setInvalid(true); el.convHint.textContent = msg; toast(msg, 0, true); emit('invalid', { input: el.convTime });
        clearTimeout(convAnnounceTimer); convAnnounceTimer = setTimeout(() => announce(msg), 700); // debounced while typing
        return;
      }
    }
    setInvalid(false);
    if (el.convToast.classList.contains('error')) toast('');
    const [h, mi] = parsed;
    const zone = el.convZone.value || LOCAL_ZONE;
    // Pin the date the conversion is for (today in the source zone) so it stays right across midnight. Marked
    // automatic, so switching the source zone re-picks that zone's today; explicit dates (chips, scrubbing) stay.
    if (!el.convDate.value) { el.convDate.value = todayIn(zone); el.convDate.dataset.auto = '1'; }
    const [y, m, d] = el.convDate.value.split('-').map(Number);
    // A typed time takes the first occurrence of a repeated wall time; a scrub step keeps the instant it landed on
    // (the second 01:30 of a fall-back night) when that is the same wall time, at most an hour from the first.
    const wallEpoch = T.zonedToEpoch(zone, y, m, d, h, mi);
    const epochMs = pin !== null && Math.abs(pin - wallEpoch) <= 3600000 ? pin : wallEpoch;
    convert = { zone, h, mi, epochMs };
    if (document.activeElement !== el.convSlider) el.convSlider.value = h * 60 + Math.round(mi / 15) * 15;
    el.convClear.hidden = false;
    el.btnCopy.hidden = !settings.zones.some(supportsZone); // nothing to copy without cities
    refreshHint();
    render();
    armConvIdle();
    if (!wasConverting) emit('convert', { on: true });
    // Debounced so typing or sliding does not flood the screen reader.
    clearTimeout(convAnnounceTimer);
    let msg = t('say.converted', { time: formatTime(h, mi), city: labelOf(zone) });
    // Scrubbing from a focused card ([ ], PageUp/PageDown): also say that card's new time (its name stays put).
    const fc = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.card[data-zone]') : null;
    if (fc && fc.dataset.zone !== zone && supportsZone(fc.dataset.zone)) {
      const k = clock(fc.dataset.zone, new Date(convert.epochMs));
      msg += `. ${labelOf(fc.dataset.zone)}: ${k.ampm ? `${k.hm} ${k.ampm}` : k.hm}`;
    }
    if (announceNow === true) announce(msg); else convAnnounceTimer = setTimeout(() => announce(msg), 800);
  }
  // A newly typed time means today: an automatic date left over from yesterday (a conversion left open across
  // midnight) is dropped and re-picked. A conversion already on screen keeps its date (slider and scrub paths).
  el.convTime.addEventListener('input', guard(() => {
    if (el.convDate.dataset.auto && el.convDate.value && el.convDate.value !== todayIn(el.convZone.value || LOCAL_ZONE)) el.convDate.value = '';
    applyConvert();
  }));
  el.convTime.addEventListener('blur', guard(() => { const p = fieldTime(); if (p) { el.convTime.value = formatInput(...p); } }));
  el.convTime.addEventListener('keydown', guard((e) => {
    // Up/Down nudge by 15 minutes, Escape returns to live.
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const p = fieldTime() || [9, 0];
      const mins = (p[0] * 60 + p[1] + (e.key === 'ArrowUp' ? 15 : -15) + 1440) % 1440;
      el.convTime.value = formatInput(Math.floor(mins / 60), mins % 60); applyConvert(); e.preventDefault();
    } else if (e.key === 'Escape') { e.stopPropagation(); el.convTime.value = ''; applyConvert(); el.convTime.blur(); }
  }));
  el.convSlider.addEventListener('input', guard(() => {
    // The field and the slider's spoken value follow at once; the conversion itself runs once per frame (flushScrub),
    // however many input events a drag fires.
    const v = +el.convSlider.value; el.convTime.value = formatInput(Math.floor(v / 60), v % 60); syncSliderText();
    pendingSlider = v; queueScrub();
  }));
  el.convDate.addEventListener('input', guard(applyConvert));
  el.convZone.addEventListener('change', guard(() => { if (el.convDate.dataset.auto) el.convDate.value = ''; applyConvert(); }));
  el.convClear.addEventListener('click', guard(() => { el.convTime.value = ''; applyConvert(); el.convTime.focus(); }));

  // ---------- time scrubber (wheel / arc drag / keys) ----------
  // Every path ends in setConvEpoch -> applyConvert, so hint, copy, events and announcements stay consistent.
  const STEP = 15 * 60000;
  // The exact instant a scrub step asked for. In the repeated hour of a fall-back day a wall time happens twice and
  // typing it picks the first; a scrub step that lands on the second one keeps it, so stepping moves through the
  // repeated hour instead of falling back to the first 01:30 forever. Used once, by the next applyConvert.
  let pinnedEpoch = null;
  function setConvEpoch(ms) {
    const zone = el.convZone.value || LOCAL_ZONE;
    const p = parts(zone, new Date(ms), { year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
    el.convDate.value = `${p.year}-${p.month}-${p.day}`;
    delete el.convDate.dataset.auto;
    el.convTime.value = formatInput(+p.hour % 24, +p.minute);
    pinnedEpoch = ms;
    applyConvert();
  }
  const baseEpoch = () => (convert ? convert.epochMs : Math.round(Date.now() / STEP) * STEP);
  let pendingMin = 0, pendingAbs = null, pendingSlider = null, frame = 0, frameTimer = null;
  // Continuous scrubbing (steps less than 300 ms apart: a slider or day-line drag, a spun wheel): .app gets
  // .scrub-live, and the day-line dots and the planner line follow each step directly instead of restarting a 'left'
  // transition (a layout on every frame) for every step. A single step (one notch, a key) still glides.
  const SCRUB_GAP = 300;
  let lastScrubAt = 0, scrubLiveTimer = null;
  function markScrub() {
    const now = performance.now();
    if (now - lastScrubAt < SCRUB_GAP && !el.app.classList.contains('scrub-live')) el.app.classList.add('scrub-live');
    lastScrubAt = now;
    clearTimeout(scrubLiveTimer);
    scrubLiveTimer = setTimeout(() => el.app.classList.remove('scrub-live'), SCRUB_GAP);
  }
  function flushScrub() {
    if (frame) cancelAnimationFrame(frame);
    clearTimeout(frameTimer);
    frame = 0; frameTimer = null;
    if (!settings) return;
    markScrub();
    // Slider: #convTime already holds its latest value; convert once for all the input events of this frame.
    if (pendingSlider !== null) { pendingSlider = null; applyConvert(); }
    if (pendingAbs !== null) { const a = pendingAbs; pendingAbs = null; setConvEpoch(a); }
    if (pendingMin) { const m = pendingMin; pendingMin = 0; setConvEpoch(baseEpoch() + m * 60000); }
  }
  function queueScrub() {
    if (frame || frameTimer) return;
    frame = requestAnimationFrame(flushScrub);
    frameTimer = setTimeout(flushScrub, 60); // rAF stalls while the window is occluded
  }
  function scrubBy(min) { if (!settings) return; pendingMin += min; queueScrub(); }
  let wheelAcc = 0;
  function onCardWheel(e) {
    if (!settings || e.shiftKey || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.target.closest('input')) return; // Ctrl+wheel zooms
    // More cards than fit: the wheel scrolls to them, and only the digits and the day line scrub the time. The vertical
    // layout and wrapped rows scroll natively; the strip and compact layouts through the #strip wheel handler (the event
    // is not defaultPrevented). With every card on screen, the whole card scrubs.
    const s = el.strip, down = layout() === 'vertical' || s.classList.contains('rows');
    const canScroll = down ? s.scrollHeight > s.clientHeight + 1 : s.scrollWidth > s.clientWidth + 1;
    if (canScroll && !e.target.closest('.display, .arc')) { wheelAcc = 0; return; }
    e.preventDefault();
    // One wheel notch = one 15-minute step, whatever the display scaling (a notch is ~87px at 115%, 120px at 100%).
    // Small deltas (touchpads, smooth scrolling) accumulate to a notch's worth before stepping.
    const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 100 : 1);
    if (Math.abs(dy) >= 50) { wheelAcc = 0; scrubBy(Math.sign(dy) * 15 * Math.max(1, Math.round(Math.abs(dy) / 120))); return; }
    if (Math.sign(dy) !== Math.sign(wheelAcc)) wheelAcc = 0;
    wheelAcc += dy;
    const steps = Math.trunc(wheelAcc / 80);
    if (!steps) return;
    wheelAcc -= steps * 80;
    scrubBy(steps * 15);
  }
  let arcScrub = null;
  function attachArcScrub(card, zone) {
    const arc = card.querySelector('.arc');
    const at = (e) => {
      const r = arc.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1)));
      const mins = Math.min(1425, Math.round((f * 1440) / 15) * 15);
      const d = arcScrub.day;
      pendingAbs = T.zonedToEpoch(zone, d[0], d[1], d[2], Math.floor(mins / 60), mins % 60);
      pendingMin = 0;
      queueScrub();
    };
    arc.addEventListener('pointerdown', (e) => {
      if (!settings || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      // Scrubbing a card's day line converts from that card's city (not the previous source).
      if (el.convZone.value !== zone && [...el.convZone.options].some((o) => o.value === zone)) {
        const at = baseEpoch();
        el.convZone.value = zone;
        if (convert) setConvEpoch(at);
      }
      const p = parts(zone, new Date(baseEpoch()), { year: 'numeric', month: '2-digit', day: '2-digit' });
      arcScrub = { id: e.pointerId, day: [+p.year, +p.month, +p.day] };
      card.draggable = false; card.classList.add('scrubbing');
      try { arc.setPointerCapture(e.pointerId); } catch {}
      at(e);
    });
    arc.addEventListener('pointermove', (e) => { if (arcScrub && e.pointerId === arcScrub.id) at(e); });
    const end = (e) => {
      if (!arcScrub || e.pointerId !== arcScrub.id) return;
      arcScrub = null; card.draggable = true; card.classList.remove('scrubbing');
      try { arc.releasePointerCapture(e.pointerId); } catch {}
    };
    arc.addEventListener('pointerup', end);
    arc.addEventListener('pointercancel', end);
  }

  // ---------- meeting planner ----------
  // One row per city; 24 columns = the hours of the converter's date in the SOURCE zone. A cell is "work" when the
  // city is inside its working hours for that whole hour, "night" when its local hour is 22-07, else neutral.
  let planKey = null, planYmd = null, planFocusH = null, planRoving = null;
  // Selected meeting slot in source hours ({ start, end }, end exclusive): a click (one hour), a drag across cells,
  // Shift+Left/Right from the focused hour, or the Best button. Cleared when the planner is rebuilt (another day,
  // source, city list...) and when the conversion goes back to now.
  let planSel = null, planSelAnchor = null, planCols = null, planSelDrag = null;
  const plannerOn = () => !!(settings && settings.planner);
  const plannerSource = () => el.convZone.value || LOCAL_ZONE;
  const stripDot = (s) => s.replace(/\.$/, '');
  function cellState(zone, ms) {
    if (isWorking(zone, new Date(ms)) && isWorking(zone, new Date(ms + 59 * 60000))) return 'work';
    const h = localWall(zone, new Date(ms + 30 * 60000)).min / 60;
    return h >= 22 || h < 7 ? 'night' : 'off';
  }
  // The day period Intl writes for local hour `h` in the app locale ('AM' / 'PM', 'a. m.' / 'p. m.'), spaces dropped
  // so it fits a planner cell.
  const dayPeriod = (h) => {
    const p = T.fmt('UTC', { hour: 'numeric', hour12: true }, locale()).formatToParts(new Date(Date.UTC(2000, 0, 1, h))).find((x) => x.type === 'dayPeriod');
    return p ? p.value.replace(/\s+/g, '') : '';
  };
  function buildPlanner(src, ymd, zones) {
    const [y, m, d] = ymd.split('-').map(Number);
    const cols = [];
    for (let h = 0; h < 24; h++) cols.push({ h, ms: T.zonedToEpoch(src, y, m, d, h, 0) });
    const srcLabel = labelOf(src);
    const allWork = cols.map(() => zones.length > 0);
    const states = []; // one row of 24 cell states per city, for the best-hours fallback
    const rows = zones.map((zone) => {
      const rowStates = [];
      states.push(rowStates);
      const row = document.createElement('div');
      row.className = 'plan-row' + (zone === src ? ' source' : '') + (zone === LOCAL_ZONE ? ' home' : '');
      row.dataset.zone = zone;
      const label = document.createElement('button');
      label.type = 'button'; label.className = 'plan-label'; label.title = t('plan.edit', { city: displayName(zone) });
      const city = document.createElement('span'); city.className = 'plan-city'; city.textContent = labelOf(zone);
      const tm = document.createElement('span'); tm.className = 'plan-time';
      label.append(city, tm);
      const cells = document.createElement('div');
      cells.className = 'plan-cells'; cells.setAttribute('role', 'group'); cells.setAttribute('aria-label', displayName(zone));
      cols.forEach((col, i) => {
        const st = cellState(zone, col.ms);
        if (st !== 'work') allWork[i] = false;
        rowStates.push(st);
        const p = parts(zone, new Date(col.ms), { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
        const lh = +p.hour % 24, lm = +p.minute;
        const b = document.createElement('button');
        b.type = 'button'; b.className = `plan-cell ${st}`; b.dataset.h = String(col.h); b.tabIndex = -1;
        const s = document.createElement('span');
        if (lh === 0 && lm === 0) { b.classList.add('midnight'); s.textContent = stripDot(T.fmt(zone, { weekday: 'short' }, locale()).format(new Date(col.ms))); }
        else { const hs = settings.hour12 ? String(lh % 12 || 12) : String(lh); s.textContent = lm ? `${hs}:${pad2(lm)}` : hs; }
        // 12-hour clock: 9 in the morning and 9 at night look the same, so the cells at 6, 12 and 18 (and a 0 that is not
        // midnight, which shows the weekday) carry the day period from Intl in the app locale (AM, PM, a.m., p.m.).
        if (settings.hour12 && (lh === 6 || lh === 12 || lh === 18 || (lh === 0 && lm))) {
          const ap = document.createElement('small'); ap.className = 'ap'; ap.textContent = dayPeriod(lh);
          if (ap.textContent) s.append(ap);
        }
        b.append(s);
        b.setAttribute('aria-label', t('plan.cell', { time: formatTime(col.h, 0), src: srcLabel, local: formatTime(lh, lm), city: labelOf(zone), state: t('plan.state.' + st) }));
        cells.append(b);
      });
      row.append(label, cells);
      return row;
    });
    // Contiguous runs of hours where every city is working.
    const runs = []; let start = -1;
    for (let i = 0; i <= 24; i++) {
      const on = i < 24 && allWork[i];
      if (on && start < 0) start = i;
      if (!on && start >= 0) { runs.push([start, i]); start = -1; }
    }
    const layer = document.createElement('div'); layer.className = 'plan-layer'; layer.setAttribute('aria-hidden', 'true');
    for (const [a, b] of runs) {
      const o = document.createElement('div'); o.className = 'plan-overlap';
      o.style.left = `${(a / 24) * 100}%`; o.style.width = `${((b - a) / 24) * 100}%`;
      layer.append(o);
    }
    const now = document.createElement('div'); now.className = 'plan-now'; now.hidden = true; layer.append(now);
    if (rows.length) {
      const grid = document.createElement('div'); grid.className = 'plan-grid'; grid.append(...rows, layer);
      // Hour scale under the rows (shown in the vertical and compact layouts, whose cells carry no numbers): the source
      // city's 0, 6, 12, 18 and 24 h, as the clock shows them, cut to the hour (24 on the 24-hour clock).
      const axis = document.createElement('div'); axis.className = 'plan-axis'; axis.setAttribute('aria-hidden', 'true');
      axis.append(...[0, 6, 12, 18, 24].map((h) => { const sp = document.createElement('span'); sp.textContent = h === 24 && !settings.hour12 ? '24' : formatTime(h % 24, 0).replace(/[:.]00/, ''); return sp; }));
      el.planBody.replaceChildren(grid, axis);
    }
    else {
      const e = document.createElement('div'); e.className = 'plan-empty';
      const msg = document.createElement('div'); msg.textContent = t('plan.empty');
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pill'; btn.textContent = t('empty.add');
      btn.addEventListener('click', () => el.search.focus());
      e.append(msg, btn);
      el.planBody.replaceChildren(e);
    }
    el.planner.classList.toggle('empty', !rows.length); // no summary or legend without cities
    const total = runs.reduce((n, [a, b]) => n + b - a, 0);
    // No hour works for everyone: point at the hours where the most cities work (the home city and the source first).
    const bestPart = zones.length && !total ? T.bestHours(states, [...new Set([zones.indexOf(LOCAL_ZONE), zones.indexOf(src)])].filter((i) => i >= 0)) : null;
    if (bestPart && rows.length) {
      const o = document.createElement('div'); o.className = 'plan-best';
      o.style.left = `${(bestPart.start / 24) * 100}%`; o.style.width = `${((bestPart.end - bestPart.start) / 24) * 100}%`;
      layer.insertBefore(o, now);
    }
    renderPlanBest(bestPart, cols, zones, srcLabel);
    let summary;
    if (!zones.length) summary = '';
    else if (!total) summary = t('plan.none');
    else {
      const best = runs.reduce((x, r) => (r[1] - r[0] > x[1] - x[0] ? r : x));
      summary = `${t('plan.overlap', { n: total })} · ${t('plan.range', { start: formatTime(best[0], 0), end: formatTime(best[1] % 24, 0) })} (${srcLabel})`;
      if (runs.length > 1) summary += ' ' + t('plan.more', { n: runs.length - 1 });
    }
    setText(el.plannerSummary, summary);
    el.plannerSummary.classList.toggle('none', !total);
    setText(el.plannerCaption, t('plan.caption', { city: srcLabel, date: ymdLabel(ymd) }));
    planRoving = null;
    planCols = cols; planSel = null; planSelAnchor = null; planSelDrag = null;
  }
  // #plannerBest: "Best: 12:00 to 13:00 (New York), 4 of 5 working"; the title and name add up to three cities outside
  // their hours with their local times. Hidden with a full overlap, with no cities, or when no two cities ever work together.
  function renderPlanBest(best, cols, zones, srcLabel) {
    const b = el.plannerBest;
    if (!best) { b.hidden = true; b.textContent = ''; b.removeAttribute('title'); b.removeAttribute('aria-label'); delete b.dataset.h; delete b.dataset.end; return; }
    const text = t('plan.best', { range: t('plan.range', { start: formatTime(best.start, 0), end: formatTime(best.end % 24, 0) }), city: srcLabel, n: best.working, total: best.total });
    const ms = cols[best.start].ms;
    const outside = best.out.slice(0, 3).map((i) => {
      const p = parts(zones[i], new Date(ms), { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
      return `${labelOf(zones[i])} ${formatTime(+p.hour % 24, +p.minute)}`;
    });
    let list = outside.join(', ');
    if (best.out.length > 3) list += ' ' + t('plan.more', { n: best.out.length - 3 });
    const full = best.out.length ? `${text}. ${t('plan.bestOut', { list })}` : text;
    setText(b, text);
    b.title = full; b.setAttribute('aria-label', full);
    b.dataset.h = String(best.start); b.dataset.end = String(best.end);
    b.hidden = false;
  }
  el.plannerBest.addEventListener('click', () => {
    if (!settings || el.plannerBest.hidden || !el.plannerBest.dataset.h) return;
    planFocusH = +el.plannerBest.dataset.h;
    planSel = { start: planFocusH, end: +el.plannerBest.dataset.end || planFocusH + 1 }; planSelAnchor = planFocusH; // the whole best run
    pickHour(planFocusH);
  });
  function updatePlanner(date) {
    const src = plannerSource();
    const p = parts(src, date, { ...YMD_OPTS, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
    const sameDay = `${p.year}-${p.month}-${p.day}` === planYmd;
    const curH = sameDay ? +p.hour % 24 : null;
    const now = el.planBody.querySelector('.plan-now');
    if (now) {
      if (now.hidden === sameDay) now.hidden = !sameDay;
      const left = `${((((+p.hour % 24) * 60 + +p.minute) / 1440) * 100).toFixed(3)}%`;
      if (now.style.left !== left) now.style.left = left;
      now.classList.toggle('converted', !!convert);
    }
    for (const row of el.planBody.querySelectorAll('.plan-row')) {
      const k = clock(row.dataset.zone, date);
      setText(row.querySelector('.plan-time'), k.ampm ? `${k.hm} ${k.ampm}` : k.hm);
    }
    syncPlanSel();
    for (const c of el.planBody.querySelectorAll('.plan-cell.sel')) if (!convert || +c.dataset.h !== curH) c.classList.remove('sel');
    if (convert && curH !== null) for (const c of el.planBody.querySelectorAll(`.plan-cell[data-h="${curH}"]`)) c.classList.add('sel');
    // Roving tabindex: one tabbable hour per row (the focused hour, else the marker hour, else 09:00).
    const fh = planFocusH !== null ? planFocusH : curH !== null ? curH : 9;
    if (planRoving !== fh) {
      planRoving = fh;
      for (const c of el.planBody.querySelectorAll('.plan-cell')) c.tabIndex = +c.dataset.h === fh ? 0 : -1;
    }
  }
  function renderPlanner(date) {
    const on = plannerOn();
    el.app.classList.toggle('planner-on', on);
    if (el.planner.hidden === on) el.planner.hidden = !on;
    if (el.btnPlanner.getAttribute('aria-pressed') !== String(on)) el.btnPlanner.setAttribute('aria-pressed', String(on));
    if (!on) { planKey = null; planFitSent = null; return; }
    if (!convert && planSel) { planSel = null; planSelAnchor = null; } // back to now: the slot goes too
    const src = plannerSource();
    const ymd = el.convDate.value || todayIn(src);
    const zones = settings.zones.filter(supportsZone);
    const key = JSON.stringify([zones, zones.map(labelOf), src, labelOf(src), ymd, !!settings.hour12, I.lang, zones.map(hoursOf)]);
    if (key !== planKey) { planKey = key; planYmd = ymd; buildPlanner(src, ymd, zones); fitPlanner(); }
    updatePlanner(date);
  }
  // Rows are always 24px (the labels' target size), so the planner has one natural size: the window is made that size
  // (fitWindow) and a taller one only leaves room below the grid. When the work area caps the window, the body
  // scrolls and a bottom fade shows there is more.
  function fitPlanner() {
    if (!plannerOn()) return;
    updatePlanFade();
    fitWindow();
  }
  // The planner's natural size in CSS px, read from the real elements: everything above it (bar, tip), its padding, the
  // head, the grid with its hour scale (the body's scrollHeight, even while the body is scrolling). Width: the label
  // column (the minimum of --plan-label) and 24 cells at a readable minimum; the vertical planner has no label column
  // and only asks for a minimum width (a wider window stays as it is).
  const PLAN_CELL_MIN = { strip: 34, compact: 22, vertical: 14 };
  function measurePlanner() {
    const p = el.planner, cs = getComputedStyle(p), px = (v) => parseFloat(v) || 0;
    const head = p.querySelector('.plan-head'), lay = layout();
    const headH = head && head.offsetParent ? head.offsetHeight + px(cs.rowGap) : 0;
    const height = Math.ceil(p.offsetTop + px(cs.paddingTop) + headH + el.planBody.scrollHeight + px(cs.paddingBottom)) + 1;
    const label = lay === 'vertical' ? 0 : (lay === 'compact' ? 140 : 150) + 12;
    const width = Math.ceil(px(cs.paddingLeft) + px(cs.paddingRight) + label + 24 * PLAN_CELL_MIN[lay] + 23 * (lay === 'vertical' ? 1 : 2));
    return { width, height, keepWidth: lay === 'vertical' };
  }
  // Tell main the size when it changed by more than 2px. The first one goes out at once, later ones after the layout
  // settles (a head line that wraps, the bar stacking at the new width). main ignores them while the user drags the frame.
  let planFitSent = null, planFitTimer = 0;
  function sendPlanFit() {
    planFitTimer = 0;
    if (!plannerOn() || !window.wc.fitView || !el.planner.offsetParent) return;
    const m = measurePlanner(), s = planFitSent;
    if (s && Math.abs(m.width - s.width) <= 2 && Math.abs(m.height - s.height) <= 2) return;
    planFitSent = m;
    window.wc.fitView(m);
  }
  function fitWindow() {
    if (!planFitSent) { clearTimeout(planFitTimer); sendPlanFit(); return; }
    if (!planFitTimer) planFitTimer = setTimeout(sendPlanFit, 80);
  }
  if (typeof ResizeObserver === 'function') {
    // Anything that changes the natural height: the bar and tip above, the head, the rows and the hour scale.
    const ro = new ResizeObserver(() => { if (settings && plannerOn()) fitWindow(); });
    const watch = () => {
      ro.disconnect();
      for (const n of [document.querySelector('.bar'), $('tip'), el.planner.querySelector('.plan-head'), el.planBody, ...el.planBody.children]) if (n) ro.observe(n);
    };
    watch();
    new MutationObserver(() => { watch(); if (plannerOn()) fitWindow(); }).observe(el.planBody, { childList: true });
  }
  function updatePlanFade() {
    const b = el.planBody;
    el.planner.classList.toggle('more-below', b.scrollTop + b.clientHeight < b.scrollHeight - 2);
    el.planner.classList.toggle('more-above', b.scrollTop > 2);
  }
  el.planBody.addEventListener('scroll', updatePlanFade, { passive: true });
  // Converter to hour h (on the planner's date, in the source zone).
  function pickHour(h) {
    if (!settings) return;
    const src = plannerSource();
    if (!el.convDate.value) { el.convDate.value = todayIn(src); el.convDate.dataset.auto = '1'; }
    el.convTime.value = formatInput(h, 0);
    applyConvert(true);
  }
  // End of the slot: the start of hour `end` in the source zone (hour 24 is the next midnight).
  const slotEndMs = () => (planSel.end < 24 ? planCols[planSel.end].ms : planCols[23].ms + 3600000);
  const slotLabel = () => `${ymdLabel(planYmd)}, ${t('plan.range', { start: formatTime(planSel.start, 0), end: formatTime(planSel.end % 24, 0) })} (${labelOf(plannerSource())})`;
  // The slot as text: "Thu, Sep 24, 12:00 to 14:00 (New York)", then each city with its own start and end.
  function slotText() {
    const a = new Date(planCols[planSel.start].ms), b = new Date(slotEndMs());
    const hm = (z, d) => { const k = clock(z, d); return k.ampm ? `${k.hm} ${k.ampm}` : k.hm; };
    const lines = settings.zones.filter(supportsZone).map((z) => {
      const day = T.fmt(z, { weekday: 'short', month: 'short', day: 'numeric' }, locale()).format(a);
      return `${labelOf(z)}: ${t('plan.range', { start: hm(z, a), end: hm(z, b) })}, ${day}`;
    });
    return [slotLabel(), ...lines].join('\n');
  }
  // The filled band over the selected hours and the "Copy slot" / "Save invite" line in the planner head.
  function syncPlanSel() {
    const layer = el.planBody.querySelector('.plan-layer');
    let band = layer ? layer.querySelector('.plan-sel') : null;
    const on = !!(planSel && layer && planCols);
    if (!on) { if (band) band.remove(); }
    else {
      if (!band) { band = document.createElement('div'); band.className = 'plan-sel'; layer.insertBefore(band, layer.querySelector('.plan-now')); }
      const left = `${(planSel.start / 24) * 100}%`, width = `${((planSel.end - planSel.start) / 24) * 100}%`;
      if (band.style.left !== left) band.style.left = left;
      if (band.style.width !== width) band.style.width = width;
      setText(el.planSel, slotLabel());
      el.planIcs.hidden = typeof window.wc.saveIcs !== 'function';
    }
    if (el.planSelBar.hidden === on) {
      el.planSelBar.hidden = !on;
      el.planner.classList.toggle('has-sel', on);
      fitPlanner(); // the head line changed
    }
  }
  el.planCopy.addEventListener('click', () => { if (settings && planSel && planCols) copyOut(slotText(), null); });
  el.planIcs.addEventListener('click', () => { if (settings && planSel && planCols) saveInvite(planCols[planSel.start].ms, slotEndMs(), slotText()); });
  // Drag across the cells of a row: the slot follows the pointer (captured once it leaves the first hour, so a plain
  // click still reaches its cell), and letting go converts at the slot's first hour.
  el.planBody.addEventListener('pointerdown', (e) => {
    const cell = e.target.closest('.plan-cell');
    if (!cell || e.button !== 0 || !settings) return;
    const cells = cell.closest('.plan-cells');
    planSelDrag = { id: e.pointerId, from: +cell.dataset.h, to: +cell.dataset.h, moved: false, rect: cells.getBoundingClientRect() };
  });
  el.planBody.addEventListener('pointermove', (e) => {
    const d = planSelDrag;
    if (!d || e.pointerId !== d.id || !planCols) return;
    const h = Math.max(0, Math.min(23, Math.floor(((e.clientX - d.rect.left) / (d.rect.width || 1)) * 24)));
    if (h === d.to) return;
    d.to = h;
    if (!d.moved) { d.moved = true; try { el.planBody.setPointerCapture(e.pointerId); } catch { /* not capturable */ } }
    planSel = { start: Math.min(d.from, h), end: Math.max(d.from, h) + 1 }; planSelAnchor = d.from;
    syncPlanSel();
  });
  const endSelDrag = (e) => {
    const d = planSelDrag;
    if (!d || e.pointerId !== d.id) return;
    planSelDrag = null;
    try { el.planBody.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (!d.moved || !settings || e.type === 'pointercancel') return;
    planFocusH = d.to;
    pickHour(planSel.start);
  };
  el.planBody.addEventListener('pointerup', endSelDrag);
  el.planBody.addEventListener('pointercancel', endSelDrag);
  el.planBody.addEventListener('click', (e) => {
    if (!settings) return;
    const cell = e.target.closest('.plan-cell');
    if (cell) { planFocusH = +cell.dataset.h; planSel = { start: planFocusH, end: planFocusH + 1 }; planSelAnchor = planFocusH; pickHour(planFocusH); return; }
    const label = e.target.closest('.plan-label');
    if (label) openHours(label.closest('.plan-row').dataset.zone, label);
  });
  el.planBody.addEventListener('keydown', (e) => {
    const cell = e.target.closest && e.target.closest('.plan-cell');
    if (!cell || !settings) return;
    const rows = [...el.planBody.querySelectorAll('.plan-row')];
    let h = +cell.dataset.h, ri = rows.indexOf(cell.closest('.plan-row')), pick = true;
    // Shift+Left/Right grows or shrinks the slot from where it started (the anchor); focus follows the moving edge.
    if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      if (!planSel || planSelAnchor === null) planSelAnchor = h;
      h = Math.max(0, Math.min(23, h + (e.key === 'ArrowRight' ? 1 : -1)));
      planSel = { start: Math.min(planSelAnchor, h), end: Math.max(planSelAnchor, h) + 1 };
      planFocusH = h;
      if (!convert || convert.h !== planSel.start || convert.mi) pickHour(planSel.start); else render();
      const tc = rows[ri] && rows[ri].querySelector(`.plan-cell[data-h="${h}"]`);
      if (tc) tc.focus();
      return;
    }
    if (e.key === 'ArrowLeft') h = Math.max(0, h - 1);
    else if (e.key === 'ArrowRight') h = Math.min(23, h + 1);
    else if (e.key === 'Home') h = 0;
    else if (e.key === 'End') h = 23;
    else if (e.key === 'ArrowUp') { ri = Math.max(0, ri - 1); pick = false; }
    else if (e.key === 'ArrowDown') { ri = Math.min(rows.length - 1, ri + 1); pick = false; }
    else return;
    e.preventDefault();
    planFocusH = h;
    if (pick) { planSel = { start: h, end: h + 1 }; planSelAnchor = h; pickHour(h); } else render();
    const target = rows[ri] && rows[ri].querySelector(`.plan-cell[data-h="${h}"]`);
    if (target) target.focus();
  });
  el.btnPlanner.addEventListener('click', guard(() => {
    closeHours(false);
    if (!settings.planner) mapOn = false; // planner and map are mutually exclusive views
    if (window.wc.setView) window.wc.setView(settings.planner ? null : 'planner'); // before set(): one resize, straight to the new view
    set({ planner: !settings.planner });
    emit('planner', { on: settings.planner, planner: el.planner });
  }));

  // ---------- date shortcuts ----------
  // Chips: Today, Tomorrow, then the next five days by weekday name, counted from today in the home zone.
  // Counted from today in the converter's source zone (the zone the picked date is read in), so "Tomorrow" always
  // means the source city's tomorrow, even when home is already a day ahead or behind.
  const homeDay = (n) => addDays(todayIn(plannerSource()), n);
  const effectiveYmd = () => (convert ? el.convDate.value || todayIn(convert.zone) : null);
  function chipLabel(n, ymd) {
    if (n === 0) return t('day.today');
    if (n === 1) return t('day.tomorrow');
    const s = stripDot(T.fmt('UTC', { weekday: 'short' }, locale()).format(ymdDate(ymd)));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function renderChips() {
    const cur = effectiveYmd() || homeDay(0);
    const full = T.fmt('UTC', { weekday: 'long', month: 'long', day: 'numeric' }, locale());
    el.dateChips.replaceChildren(...Array.from({ length: 7 }, (_, n) => {
      const ymd = homeDay(n);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'date-chip'; b.dataset.day = String(n); b.dataset.date = ymd;
      b.textContent = chipLabel(n, ymd); b.title = full.format(ymdDate(ymd));
      b.setAttribute('aria-pressed', String(ymd === cur));
      return b;
    }));
  }
  function updateDayButton() {
    const ymd = effectiveYmd();
    let label = t('day.today');
    if (ymd) {
      const today = homeDay(0);
      let n = -1;
      for (let i = 0; i < 7; i++) if (addDays(today, i) === ymd) { n = i; break; }
      label = n >= 0 ? chipLabel(n, ymd) : T.fmt('UTC', { month: 'short', day: 'numeric' }, locale()).format(ymdDate(ymd));
    }
    setText(el.btnDayText, label);
    el.btnDay.classList.toggle('set', !!ymd && ymd !== homeDay(0));
    if (!el.dateChips.hidden) {
      const cur = ymd || homeDay(0);
      for (const b of el.dateChips.querySelectorAll('[data-day]')) b.setAttribute('aria-pressed', String(b.dataset.date === cur));
    }
  }
  function openChips() {
    if (!settings) return;
    closeMenu(false); closeHours(false);
    renderChips();
    el.dateChips.hidden = false;
    el.btnDay.setAttribute('aria-expanded', 'true');
    const r = el.btnDay.getBoundingClientRect();
    el.dateChips.style.left = `${Math.max(6, Math.min(r.left, window.innerWidth - el.dateChips.offsetWidth - 6))}px`;
    el.dateChips.style.top = `${r.bottom + 6}px`;
    const target = el.dateChips.querySelector('[aria-pressed="true"]') || el.dateChips.querySelector('[data-day]');
    if (target) target.focus();
    emit('menu', { open: true, menu: el.dateChips, anchor: el.btnDay });
  }
  function closeChips(returnFocus) {
    if (el.dateChips.hidden) return;
    emit('menu', { open: false, menu: el.dateChips });
    el.dateChips.hidden = true;
    el.btnDay.setAttribute('aria-expanded', 'false');
    if (returnFocus) el.btnDay.focus();
  }
  function pickDay(n) {
    if (!settings) return;
    const ymd = homeDay(n);
    if (!fieldTime()) {
      if (n === 0 && !convert) { closeChips(true); return; }
      // Not converting yet: keep the current time of day in the source zone, rounded to 15 minutes.
      const mins = (Math.round(localWall(plannerSource(), new Date()).min / 15) * 15) % 1440;
      el.convTime.value = formatInput(Math.floor(mins / 60), mins % 60);
    }
    el.convDate.value = ymd;
    delete el.convDate.dataset.auto; // a picked day stays when the source zone changes
    applyConvert(true);
    closeChips(true);
  }
  el.btnDay.addEventListener('click', guard((e) => { e.stopPropagation(); if (el.dateChips.hidden) openChips(); else closeChips(true); }));
  el.dateChips.addEventListener('click', (e) => { const b = e.target.closest('[data-day]'); if (b) pickDay(+b.dataset.day); });
  el.dateChips.addEventListener('keydown', (e) => {
    const items = [...el.dateChips.querySelectorAll('[data-day]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeChips(true); }
    else if (e.key === 'Tab') { e.preventDefault(); closeChips(true); }
  });
  document.addEventListener('mousedown', (e) => { if (!el.dateChips.hidden && !el.dateChips.contains(e.target) && !el.btnDay.contains(e.target)) closeChips(false); });
  window.addEventListener('blur', () => closeChips(false));

  // ---------- working hours editor ----------
  let hoursZone = null, hoursAnchor = null, hoursDays = [];
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
  function buildDayPills() {
    const short = T.fmt('UTC', { weekday: 'short' }, locale()), long = T.fmt('UTC', { weekday: 'long' }, locale());
    el.hoursDays.replaceChildren(...DAY_ORDER.map((wd) => {
      const d = new Date(Date.UTC(2026, 0, 4 + wd, 12)); // 2026-01-04 is a Sunday
      const s = stripDot(short.format(d));
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'day-pill'; b.dataset.wd = String(wd);
      b.textContent = s.charAt(0).toUpperCase() + s.slice(1); b.title = long.format(d);
      b.setAttribute('aria-label', long.format(d));
      b.setAttribute('aria-pressed', String(hoursDays.includes(wd)));
      return b;
    }));
  }
  const splitHM = (s) => [+s.slice(0, 2), +s.slice(3, 5)];
  function readHours() {
    const a = T.parseTime(el.hoursStart.value), b = T.parseTime(el.hoursEnd.value);
    const bad = { start: !a, end: !b };
    if (!a || !b) return { error: 'hours.invalid', bad };
    const start = hhmm(a[0] * 60 + a[1]), end = hhmm(b[0] * 60 + b[1]);
    if (start === end) return { error: 'hours.invalid', bad: { start: false, end: true } };
    if (!hoursDays.length) return { error: 'hours.noDays', bad };
    return { value: { start, end, days: [...hoursDays].sort((x, y) => x - y) }, bad };
  }
  function validateHours() {
    const r = readHours();
    el.hoursStart.classList.toggle('invalid', !!r.bad.start);
    el.hoursEnd.classList.toggle('invalid', !!r.bad.end);
    for (const [inp, bad] of [[el.hoursStart, r.bad.start], [el.hoursEnd, r.bad.end]]) {
      if (bad) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
      inp.setAttribute('aria-describedby', 'hoursNote');
    }
    el.hoursSave.disabled = !!r.error;
    el.hoursNote.classList.toggle('error', !!r.error);
    el.hoursNote.textContent = r.error ? t(r.error) : (toMin(r.value.end) < toMin(r.value.start) ? t('hours.overnight') : '');
    return r;
  }
  function openHours(zone, anchor) {
    if (!settings || !zone) return;
    closeMenu(false); closeChips(false); closeHours(false);
    hoursZone = zone; hoursAnchor = anchor || cardEl(zone);
    const h = hoursOf(zone);
    hoursDays = [...h.days];
    el.hoursStart.value = formatInput(...splitHM(h.start));
    el.hoursEnd.value = formatInput(...splitHM(h.end));
    el.hoursCity.textContent = labelOf(zone); // the dialog is labelled by "Working hours" + this city (aria-labelledby)
    buildDayPills();
    validateHours();
    el.hoursEditor.hidden = false;
    const card = cardEl(zone);
    if (card) card.classList.add('editing-hours');
    const r = hoursAnchor && hoursAnchor.isConnected ? hoursAnchor.getBoundingClientRect() : { left: 12, top: 60, width: 0, height: 0, bottom: 60 };
    const w = el.hoursEditor.offsetWidth, ht = el.hoursEditor.offsetHeight;
    const overCard = hoursAnchor && hoursAnchor.classList && hoursAnchor.classList.contains('card');
    let left = overCard ? r.left + (r.width - w) / 2 : r.left;
    let top = overCard ? r.top + 6 : r.bottom + 4;
    left = Math.max(6, Math.min(left, window.innerWidth - w - 6));
    top = Math.max(6, Math.min(top, window.innerHeight - ht - 6));
    el.hoursEditor.style.left = `${left}px`; el.hoursEditor.style.top = `${top}px`;
    el.hoursStart.focus(); el.hoursStart.select();
    emit('menu', { open: true, menu: el.hoursEditor, anchor: hoursAnchor });
  }
  function closeHours(returnFocus) {
    if (el.hoursEditor.hidden) return;
    emit('menu', { open: false, menu: el.hoursEditor });
    el.hoursEditor.hidden = true;
    el.strip.querySelectorAll('.card.editing-hours').forEach((c) => c.classList.remove('editing-hours'));
    const anchor = hoursAnchor;
    hoursZone = null; hoursAnchor = null;
    if (returnFocus && anchor && anchor.isConnected) anchor.focus();
  }
  function saveHours(value) {
    const zone = hoursZone;
    const hours = { ...(settings.hours || {}) };
    const isDefault = value && value.start === DEFAULT_HOURS.start && value.end === DEFAULT_HOURS.end && value.days.join() === DEFAULT_HOURS.days.join();
    if (!value || isDefault) delete hours[zone]; else hours[zone] = value;
    set({ hours });
    announce(t(value ? 'say.hoursSaved' : 'say.hoursReset', { city: labelOf(zone) }));
    closeHours(true);
  }
  el.hoursSave.addEventListener('click', () => { if (!settings || !hoursZone) return; const r = validateHours(); if (!r.error) saveHours(r.value); });
  el.hoursReset.addEventListener('click', () => { if (settings && hoursZone) saveHours(null); });
  el.hoursDays.addEventListener('click', (e) => {
    const b = e.target.closest('.day-pill'); if (!b) return;
    const wd = +b.dataset.wd;
    hoursDays = hoursDays.includes(wd) ? hoursDays.filter((x) => x !== wd) : [...hoursDays, wd];
    b.setAttribute('aria-pressed', String(hoursDays.includes(wd)));
    validateHours();
  });
  for (const inp of [el.hoursStart, el.hoursEnd]) {
    inp.addEventListener('input', validateHours);
    inp.addEventListener('blur', () => { const p = T.parseTime(inp.value); if (p && settings) inp.value = formatInput(...p); });
  }
  const hoursFocusables = () => [...el.hoursEditor.querySelectorAll('input, button:not([disabled])')];
  el.hoursEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeHours(true); }
    else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); el.hoursSave.click(); }
    else if (e.key === 'Tab') {
      const f = hoursFocusables(); const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (!el.hoursEditor.hidden && !el.hoursEditor.contains(e.target) && !el.menu.contains(e.target)) closeHours(false);
  });

  // ---------- layout switch (top bar) ----------
  // Segmented control: a toolbar of toggle buttons (aria-pressed), one per layout. Arrow keys move focus between
  // segments (roving tabindex); Enter/Space picks one (picking resizes the window, so it never happens on an arrow press). In narrow windows (vertical layout,
  // or 1120px and under) the control collapses to one button showing the current layout, which opens it as a popover.
  const LAYOUTS = ['strip', 'compact', 'vertical'];
  const layoutRadios = () => [...el.layoutSwitch.querySelectorAll('[data-layout]')];
  const layoutCollapsed = () => el.app.classList.contains('ls-collapsed');
  const layoutPopOpen = () => el.layoutWrap.classList.contains('open');
  function syncLayoutSwitch() {
    const l = layout();
    for (const b of layoutRadios()) {
      const on = b.dataset.layout === l;
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
      if (document.activeElement !== b || on) b.tabIndex = on ? 0 : -1;
    }
    const collapsed = l === 'vertical' || window.innerWidth <= 1120;
    if (collapsed !== layoutCollapsed()) el.app.classList.toggle('ls-collapsed', collapsed);
    if (!collapsed) setLayoutPop(false);
    const label = t('layout.current', { name: t('opt.layout.' + l) });
    if (el.btnLayout.title !== label) { el.btnLayout.title = label; el.btnLayout.setAttribute('aria-label', label); }
  }
  function setLayoutPop(open) {
    open = !!open && layoutCollapsed();
    if (layoutPopOpen() === open) return;
    el.layoutWrap.classList.toggle('open', open);
    el.btnLayout.setAttribute('aria-expanded', String(open));
    if (open) emit('menu', { open: true, menu: el.layoutSwitch, anchor: el.btnLayout });
  }
  // Keep keyboard focus on a visible control when the switch collapses or expands under it.
  function fixLayoutFocus() {
    const a = document.activeElement;
    if (!a || !el.layoutWrap.contains(a) || a.offsetParent !== null) return;
    const target = layoutCollapsed() && !layoutPopOpen() ? el.btnLayout : layoutRadios().find((b) => b.dataset.layout === layout());
    if (target) target.focus();
  }
  function pickLayout(l) {
    if (!settings || !LAYOUTS.includes(l)) return;
    setLayoutPop(false);
    changeLayout(l);
    fixLayoutFocus();
  }
  // Picking a layout shows that layout: an open map or planner closes, so the window takes the layout's own size
  // (main drops the overlay when the layout changes) instead of squeezing the overlay into another layout's size.
  function changeLayout(l) {
    if (!settings || l === layout()) return;
    const patch = { layout: l };
    const closeMap = mapOn, closePlanner = !!settings.planner;
    if (closeMap || closePlanner) {
      closeHours(false);
      mapOn = false;
      if (closePlanner) patch.planner = false;
    }
    set(patch);
    if (closeMap) emit('map', { on: false, map: el.mapView });
    if (closePlanner) emit('planner', { on: false, planner: el.planner });
  }
  el.layoutSwitch.addEventListener('click', (e) => { const b = e.target.closest('[data-layout]'); if (b) pickLayout(b.dataset.layout); });
  el.layoutSwitch.addEventListener('keydown', (e) => {
    const rs = layoutRadios(); const i = rs.indexOf(document.activeElement);
    if (i < 0) return;
    let j;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % rs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + rs.length - 1) % rs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = rs.length - 1;
    else return;
    e.preventDefault();
    rs.forEach((b, k) => { b.tabIndex = k === j ? 0 : -1; });
    rs[j].focus();
  });
  el.btnLayout.addEventListener('click', () => {
    setLayoutPop(!layoutPopOpen());
    if (layoutPopOpen()) { const cur = layoutRadios().find((b) => b.dataset.layout === layout()); if (cur) cur.focus(); }
  });
  document.addEventListener('mousedown', (e) => { if (layoutPopOpen() && !el.layoutWrap.contains(e.target)) setLayoutPop(false); });

  // ---------- world map view ----------
  // Renderer-only state (not a setting). Map and planner are mutually exclusive; the strip hides while either is on.
  // The view lives in views/map.js (window.WCMap); every call is guarded so a missing or failing module is harmless.
  let mapOn = false, mapMounted = false, mapHover = null, mapWarned = false;
  const mapApi = () => (window.WCMap && typeof window.WCMap.mount === 'function' ? window.WCMap : null);
  const mapFail = (what, e) => { if (!mapWarned) { mapWarned = true; console.warn(`world-clock: map ${what} failed`, e); } };
  function renderMap(date) {
    el.app.classList.toggle('map-on', mapOn);
    if (el.mapView.hidden === mapOn) el.mapView.hidden = !mapOn;
    if (el.btnMap.getAttribute('aria-pressed') !== String(mapOn)) el.btnMap.setAttribute('aria-pressed', String(mapOn));
    const api = mapApi();
    if (!mapOn) {
      if (mapMounted) {
        mapMounted = false; mapHover = null;
        try { if (api && typeof api.unmount === 'function') api.unmount(); } catch (e) { mapFail('unmount', e); }
      }
      return;
    }
    if (!api) return;
    if (!mapMounted) {
      try {
        api.mount(el.mapView, {
          setSource: (z) => { if (settings && settings.zones.includes(z)) convertFrom(z); },
          labelOf,
          onHover: (z) => { mapHover = z || null; el.mapView.dataset.hover = mapHover || ''; },
        });
        mapMounted = true;
      } catch (e) { mapFail('mount', e); return; }
    }
    try {
      if (typeof api.update === 'function') {
        api.update({
          zones: settings.zones.filter(supportsZone), localZone: LOCAL_ZONE, date, converting: !!convert,
          sourceZone: convert ? convert.zone : plannerSource(), hour12: !!settings.hour12, lang: I.lang, locale: I.locale,
        });
      }
    } catch (e) { mapFail('update', e); }
  }
  el.btnMap.addEventListener('click', guard(() => {
    closeHours(false);
    mapOn = !mapOn;
    if (window.wc.setView) window.wc.setView(mapOn ? 'map' : null); // main resizes to the map's remembered size
    if (mapOn && settings.planner) set({ planner: false }); // set() re-renders
    else render();
    emit('map', { on: mapOn, map: el.mapView });
  }));

  // ---------- settings ----------
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const th = settings.theme || 'system';
    document.documentElement.dataset.theme = th;
    document.documentElement.classList.toggle('sys-dark', th === 'system' && sysDark.matches);
  }
  sysDark.addEventListener('change', () => settings && applyTheme());
  function applyOpacity(v) {
    document.documentElement.style.setProperty('--bg-alpha', v);
    el.optOpacityValue.textContent = `${Math.round(+v * 100)}%`;
    el.optOpacity.setAttribute('aria-valuetext', `${Math.round(+v * 100)}%`);
    // Accent fill left of the thumb (range 0.6..1).
    el.optOpacity.style.setProperty('--pct', `${Math.max(0, Math.min(100, ((+v - 0.6) / 0.4) * 100)).toFixed(1)}%`);
  }
  function applyLayout() {
    const l = layout();
    if (!el.app.classList.contains(`layout-${l}`)) emit('layout', { layout: l });
    for (const n of ['strip', 'compact', 'vertical']) el.app.classList.toggle(`layout-${n}`, n === l);
    el.app.classList.toggle('h12', !!settings.hour12);
    applyBarStack();
    updateStripRows();
  }
  // Stacked two-row top bar: always in the vertical layout, and in the strip/compact layouts once the window is
  // too narrow (<= 760px) for one row of controls.
  function applyBarStack() {
    const on = layout() === 'vertical' || window.innerWidth <= 760;
    if (el.app.classList.contains('bar-stack') !== on) el.app.classList.toggle('bar-stack', on);
  }
  function syncPanel() {
    if (!settings) return;
    el.optHour24.checked = !settings.hour12;
    el.optSeconds.checked = !!settings.showSeconds;
    el.optTop.checked = !!settings.alwaysOnTop;
    el.btnPin.setAttribute('aria-pressed', String(!!settings.alwaysOnTop));
    el.btnPin.title = settings.alwaysOnTop ? t('btn.pinned') : t('btn.pin');
    el.optLogin.checked = !!settings.launchAtLogin;
    // Microsoft Store build: launch at login is the appx startup task, which only Windows Settings controls. There is no
    // switch there (an always-off switch looks broken), only the row label, a visible note and a button that opens
    // Settings > Apps > Startup. The switch stays disabled too, so a click on the label cannot toggle it.
    const store = !!settings.store;
    if (el.optLogin.disabled !== store) el.optLogin.disabled = store;
    if (el.optLogin.hidden !== store) el.optLogin.hidden = store;
    if (el.optLoginNote.hidden !== !store) el.optLoginNote.hidden = !store;
    if (el.optLoginOpen.hidden !== !store) el.optLoginOpen.hidden = !store;
    if (store) el.optLogin.setAttribute('aria-describedby', 'optLoginNote'); else el.optLogin.removeAttribute('aria-describedby');
    const loginRow = el.optLogin.closest('.row');
    if (!store && settings.portable) loginRow.title = t('opt.login.portable');
    else loginRow.removeAttribute('title');
    if (document.activeElement !== el.optOpacity) { el.optOpacity.value = settings.opacity; applyOpacity(settings.opacity); }
    el.optTheme.value = settings.theme || 'system';
    el.optLayout.value = layout();
    el.optLanguage.value = settings.language || 'auto';
    // Microsoft Store policy restricts external payment links: no Ko-fi link in the Store build. The link is hidden in
    // the HTML and shown only once main has said this is not the Store build (store === false), so it never flashes.
    const kofiHidden = settings.store !== false;
    if (el.kofiLink.hidden !== kofiHidden) el.kofiLink.hidden = kofiHidden;
    syncAbout();
    applyTheme();
    applyLayout();
    syncLayoutSwitch();
  }
  // About row: Website, Report a problem (the bug form with this version and build filled in) and Check for updates
  // (not in the Store build, which the Store updates, nor in the web app, which is always current). Plain links opened
  // in the browser through main's openExternalSafe; no tracking parameters, and the app makes no request itself.
  const REPORT_URL = 'https://github.com/joaoCarvalho1000/open-world-clock/issues/new?template=bug.yml';
  function syncAbout() {
    const q = new URLSearchParams();
    const build = settings.web ? 'Web app (openworldclock.com)' : settings.store ? 'Microsoft Store' : settings.portable ? 'Portable' : 'Installer';
    q.set('build', build);
    if (settings.version) q.set('version', `v${settings.version}`);
    const href = `${REPORT_URL}&${q.toString()}`;
    if (el.reportLink.getAttribute('href') !== href) el.reportLink.setAttribute('href', href);
    const noUpdates = settings.store !== false || !!settings.web;
    if (el.updatesLink.hidden !== noUpdates) el.updatesLink.hidden = noUpdates;
  }
  let setSeq = 0;
  function set(patch) {
    if (!settings) return;
    const langBefore = settings.language;
    Object.assign(settings, patch);
    if (settings.language !== langBefore) applyLanguage();
    syncPanel(); render();
    if ('showSeconds' in patch) scheduleTick();
    const seq = ++setSeq;
    window.wc.setSettings(patch).then((s) => {
      if (seq !== setSeq || !s) return; // a newer change is in flight; its reply will carry the final state
      const { zones, ...rest } = s; // zones are owned by saveZones
      const lb = settings.language;
      settings = { ...settings, ...rest };
      if (settings.language !== lb) applyLanguage();
      syncPanel(); render();
    }).catch(onIpcError);
  }
  el.optHour24.addEventListener('change', guard(() => { set({ hour12: !el.optHour24.checked }); refreshHint(); }));
  el.optSeconds.addEventListener('change', guard(() => set({ showSeconds: el.optSeconds.checked })));
  el.optTop.addEventListener('change', guard(() => set({ alwaysOnTop: el.optTop.checked })));
  el.optLogin.addEventListener('change', guard(() => set({ launchAtLogin: el.optLogin.checked })));
  el.optLoginOpen.addEventListener('click', guard(() => { if (settings.store && window.wc.openStartupSettings) window.wc.openStartupSettings(); }));
  el.optOpacity.addEventListener('input', guard(() => applyOpacity(+el.optOpacity.value)));
  el.optOpacity.addEventListener('change', guard(() => set({ opacity: +el.optOpacity.value })));
  el.optTheme.addEventListener('change', guard(() => set({ theme: el.optTheme.value })));
  el.optLayout.addEventListener('change', guard(() => changeLayout(el.optLayout.value)));
  el.optLanguage.addEventListener('change', guard(() => set({ language: el.optLanguage.value })));
  el.btnPin.addEventListener('click', guard(() => { set({ alwaysOnTop: !settings.alwaysOnTop }); emit('pin', { on: settings.alwaysOnTop, button: el.btnPin }); }));

  // Settings panel: a modal dialog. Focus management, Tab trap, and everything behind it inert (bar, cards, planner,
  // map, popovers), not only the top bar.
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const panelFocusables = () => [...el.panel.querySelectorAll(FOCUSABLE)].filter((n) => !n.hidden && n.offsetParent !== null);
  function openPanel() {
    closeMenu(false); closeHours(false); closeChips(false); closeCopyMenu(false);
    el.panel.hidden = false;
    emit('panel', { open: true, panel: el.panel });
    for (const n of el.app.children) if (n !== el.panel && n !== el.announce && !n.inert) { n.inert = true; n.dataset.panelInert = '1'; }
    window.wc.panel(true);
    el.btnSettings.setAttribute('aria-expanded', 'true');
    const first = el.panel.querySelector('.panel-grid input, .panel-grid select') || panelFocusables()[0];
    if (first) first.focus();
  }
  function closePanel() {
    if (el.panel.hidden) return;
    emit('panel', { open: false, panel: el.panel });
    el.panel.hidden = true;
    for (const n of el.app.querySelectorAll('[data-panel-inert]')) { n.inert = false; delete n.dataset.panelInert; }
    window.wc.panel(false);
    el.btnSettings.setAttribute('aria-expanded', 'false');
    el.btnSettings.focus();
  }
  el.panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = panelFocusables(); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    else if (i < 0) { e.preventDefault(); f[0].focus(); }
  });
  el.btnSettings.addEventListener('click', guard(() => { if (el.panel.hidden) openPanel(); else closePanel(); }));
  $('panelClose').addEventListener('click', closePanel);
  $('btnMin').addEventListener('click', () => window.wc.minimize());
  // X keeps the app running in the tray (like Alt+F4); Quit lives in the tray menu.
  $('btnClose').addEventListener('click', () => window.wc.hide());
  const isField = (n) => !!n && (n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || (n.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(n.type)) || n.isContentEditable);
  document.addEventListener('keydown', (e) => {
    // App-wide shortcuts, while no dialog, menu or popover is open: Ctrl+F add a city, Ctrl+T the time field (both
    // also from a text field), Ctrl+M map, Ctrl+P planner, Ctrl+Comma settings. main reserves only the zoom keys.
    if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && settings) {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!['f', 't', 'm', 'p', ','].includes(k)) return;
      if (!el.panel.hidden || !el.menu.hidden || !el.copyMenu.hidden || !el.hoursEditor.hidden || !el.dateChips.hidden || layoutPopOpen()) return;
      if ((k === 'm' || k === 'p' || k === ',') && isField(e.target)) return;
      e.preventDefault();
      if (!el.tip.hidden) setHelp(false);
      if (k === 'f') el.search.focus();
      else if (k === 't') { el.convTime.focus(); el.convTime.select(); }
      else if (k === 'm') el.btnMap.click();
      else if (k === 'p') el.btnPlanner.click();
      else openPanel();
      return;
    }
    if (e.key !== 'Escape') return;
    if (layoutPopOpen()) { setLayoutPop(false); el.btnLayout.focus(); return; }
    if (!el.dateChips.hidden) { closeChips(true); return; }
    if (!el.hoursEditor.hidden) { closeHours(true); return; }
    if (!el.menu.hidden) { closeMenu(true); return; }
    if (!el.copyMenu.hidden) { closeCopyMenu(true); return; }
    if (!el.panel.hidden) { closePanel(); return; }
    // Escape anywhere else (a card, a button, the page) goes back to now; text fields and selects keep their own
    // Escape (the time field clears itself, the search field empties, a rename is cancelled).
    if (el.tip.hidden && convert && !isField(e.target)) clearConversion();
  });

  // ---------- one-time tip ----------
  // Help lives behind the "?" button; nothing is shown on the main view.
  // Card, app-wide and zoom shortcuts, listed in the Help popover in two groups (key label, what it does). In a wide
  // strip window the groups sit side by side (the group and row set their grid place), so the popover fits the default
  // 250 px tall window without scrolling; narrow windows keep one column.
  const HELP_GROUPS = [
    ['help.keysCard', [['kbd.enter', 'keys.enter'], ['kbd.type', 'keys.type'], ['kbd.f2', 'keys.f2'], ['kbd.del', 'keys.del'], ['kbd.move', 'keys.move'],
      ['kbd.scrub', 'keys.scrub'], ['kbd.hour', 'keys.hour'], ['kbd.menu', 'keys.menu']]],
    ['help.keysAny', [['kbd.ctrlF', 'keys.ctrlF'], ['kbd.ctrlT', 'keys.ctrlT'], ['kbd.ctrlM', 'keys.ctrlM'], ['kbd.ctrlP', 'keys.ctrlP'], ['kbd.ctrlComma', 'keys.ctrlComma'],
      ['kbd.zoomIn', 'keys.zoomIn'], ['kbd.zoomOut', 'keys.zoomOut'], ['kbd.zoomReset', 'keys.zoomReset']]],
  ];
  // "[ and ]" is two keys: each gets its own <kbd>, the connector word stays plain text.
  function keyLabel(k) {
    const txt = t(k), m = k === 'kbd.scrub' ? /^(\S+) (.+) (\S+)$/.exec(txt) : null;
    const kbd = (s) => { const n = document.createElement('kbd'); n.textContent = s; return n; };
    return m ? [kbd(m[1]), ` ${m[2]} `, kbd(m[3])] : [kbd(txt)];
  }
  function renderTip() {
    if (!settings) return;
    const items = [t('tip.chip1'), t('tip.chip2'), t('tip.chip3'), t('tip.chip4'), t('tip.chip5')];
    const key = items.join('|') + I.lang;
    if (el.tipText._key === key) return;
    el.tipText._key = key;
    el.tipText.replaceChildren(...items.map((c) => { const s = document.createElement('span'); s.className = 'chip'; s.textContent = c; return s; }));
    el.helpKeys.replaceChildren(...HELP_GROUPS.flatMap(([title, rows], g) => {
      const note = document.createElement('div'); note.className = `help-note g${g + 1}`; note.textContent = t(title); note.style.setProperty('--hr', '1');
      return [note, ...rows.flatMap(([k, d], i) => {
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.append(...keyLabel(k)); dd.textContent = t(d);
        for (const n of [dt, dd]) { n.className = `g${g + 1}`; n.style.setProperty('--hr', String(i + 2)); }
        if (k === 'kbd.zoomIn') { dt.classList.add('first-zoom'); dd.classList.add('first-zoom'); }
        return [dt, dd];
      })];
    }));
  }
  const btnHelp = $('btnHelp');
  function setHelp(open) {
    if (open === !el.tip.hidden) return;
    if (open) { renderTip(); el.tip.hidden = false; el.tip.style.right = 'auto'; placePopover(el.tip, btnHelp.getBoundingClientRect()); }
    else { emit('tip-dismiss', { tip: el.tip }); el.tip.hidden = true; }
    btnHelp.setAttribute('aria-expanded', String(open));
    // The dialog takes focus on open; Escape and the close button return it to the ? button.
    if (open) { el.tipClose.focus({ preventScroll: true }); emit('menu', { open: true, menu: el.tip, anchor: btnHelp }); }
  }
  btnHelp.addEventListener('click', (e) => { e.stopPropagation(); setHelp(el.tip.hidden); });
  document.addEventListener('mousedown', (e) => { if (!el.tip.hidden && !el.tip.contains(e.target) && !btnHelp.contains(e.target)) setHelp(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.tip.hidden) { setHelp(false); btnHelp.focus(); } });
  el.tipClose.addEventListener('click', () => { setHelp(false); btnHelp.focus(); });

  // ---------- move the window by dragging any non-interactive area ----------
  const INTERACTIVE = 'input, select, button, textarea, a, output, .results, .menu, .panel, .tip, .card[data-zone], .hours-pop, .date-chips, .plan-cells, .seg, .map-view';
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest(INTERACTIVE)) return;
    drag = { x: e.screenX, y: e.screenY, id: e.pointerId, moved: false };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.screenX - drag.x, dy = e.screenY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      drag.moved = true; window.wc.dragStart();
      document.documentElement.classList.add('moving');
      try { document.documentElement.setPointerCapture(e.pointerId); } catch {}
    }
    window.wc.dragMove(dx, dy);
  });
  const endDrag = () => { drag = null; document.documentElement.classList.remove('moving'); };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  // ---------- tick ----------
  // Aligned to the next second (seconds shown) or the next minute; paused while the window is hidden.
  function scheduleTick() {
    clearTimeout(tick); tick = null;
    if (!settings || document.visibilityState === 'hidden') return;
    const period = settings.showSeconds ? 1000 : 60000;
    const delay = period - (Date.now() % period) + 15;
    tick = setTimeout(() => { tickNow(); scheduleTick(); }, delay);
  }
  // Full render once a minute (and on every state change); in between, a seconds tick only rewrites the .sec digits.
  // Every zone shares the same seconds (all UTC offsets are whole minutes), so one value serves all cards.
  function tickNow() {
    const now = Date.now();
    if (Math.floor(now / 60000) !== lastMinute) { checkLocalZone(); render(); return; }
    if (convert || !settings.showSeconds) return;
    const sec = String(new Date(now).getUTCSeconds()).padStart(2, '0');
    for (const s of el.strip.querySelectorAll('.card[data-zone] .sec')) setText(s, sec);
  }
  // The OS time zone changed (travel, manual change): rebuild with the new home city.
  function checkLocalZone() {
    const z = readLocalZone();
    if (z === LOCAL_ZONE) return;
    const wasSource = el.convZone.value === LOCAL_ZONE;
    LOCAL_ZONE = z;
    structKey = null; planKey = null;
    if (wasSource) el.convZone.value = '';
    fillConvZones();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { clearTimeout(tick); tick = null; hiddenSince = Date.now(); }
    else if (settings) {
      // Back after more than 5 minutes hidden: a conversion left open goes back to now before the first frame.
      const away = hiddenSince ? Date.now() - hiddenSince : 0;
      hiddenSince = 0;
      if (convert && away > convIdleMs()) clearConversion();
      checkLocalZone(); render(); scheduleTick();
    }
  });

  // ---------- boot ----------
  I.setLang('auto');
  applyStatic();
  let booted = false, bootMsg = null;
  const unsubscribe = window.wc.onSettings((s) => adopt(s));
  window.addEventListener('beforeunload', () => { if (typeof unsubscribe === 'function') unsubscribe(); });
  // Settings load: a refused or failed answer (null, no zones, an IPC error) is retried after 500 ms and 1500 ms. If it
  // still fails, the strip shows one message with a Retry button (one more try). settings stays null the whole time, so
  // guard() keeps every handler from running on a half-built object; there is no read-only fallback.
  const BOOT_RETRY_MS = [500, 1500];
  function loadSettings(attempt) {
    window.wc.getSettings().then((s) => {
      if (booted) return;
      if (!validSettings(s)) throw new Error(`settings:get returned ${s === null ? 'null' : typeof s === 'object' ? 'no zones' : typeof s}`);
      boot(s);
    }).catch((e) => {
      if (booted) { console.error('world-clock: startup failed', e); return; }
      if (attempt < BOOT_RETRY_MS.length) { setTimeout(() => loadSettings(attempt + 1), BOOT_RETRY_MS[attempt]); return; }
      console.error('world-clock: could not load settings', e);
      showBootFailed();
    });
  }
  function showBootFailed() {
    if (bootMsg) return;
    bootMsg = document.createElement('div');
    bootMsg.className = 'boot-failed';
    bootMsg.setAttribute('role', 'alert');
    const p = document.createElement('p');
    p.textContent = t('boot.failed');
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'bootRetry'; b.className = 'pill';
    b.textContent = t('boot.retry');
    // Asks main again (the page itself cannot reload: main refuses page navigations). The message stays until it works.
    b.addEventListener('click', () => { b.disabled = true; loadSettings(BOOT_RETRY_MS.length); setTimeout(() => { b.disabled = false; }, 1000); });
    bootMsg.append(p, b);
    el.strip.prepend(bootMsg);
  }
  function boot(s) {
    if (booted) return;
    booted = true;
    if (bootMsg) { bootMsg.remove(); bootMsg = null; }
    applyBackdrop(s);
    settings = { ...s };
    if (!settings.labels || typeof settings.labels !== 'object') settings.labels = {};
    if (!settings.hours || typeof settings.hours !== 'object') settings.hours = {};
    // Saved legacy ids (e.g. Asia/Tel_Aviv from older versions) move to their canonical zone, keeping their custom
    // labels and working hours (the canonical entry wins when both exist).
    const canon = [...new Set((settings.zones || []).map(canonical))];
    if (!s.firstRun && JSON.stringify(canon) !== JSON.stringify(settings.zones)) {
      const remap = (obj) => {
        const out = {};
        for (const [k, v] of Object.entries(obj)) if (canonical(k) === k) out[k] = v;
        for (const [k, v] of Object.entries(obj)) if (canonical(k) !== k && !(canonical(k) in out)) out[canonical(k)] = v;
        return out;
      };
      const labels = remap(settings.labels), hours = remap(settings.hours);
      settings.zones = canon; settings.labels = labels; settings.hours = hours;
      window.wc.setSettings({ zones: canon, labels, hours }).catch(onIpcError);
    }
    if (s.firstRun) {
      // The local city joins the defaults, and a default city that shows the same time as another all year is left
      // out (a London or Lisbon card twice), so every first-run card fits the default strip. The local city is the
      // Home card, so it wins its group; the others keep their order.
      const base = s.zones.includes(LOCAL_ZONE) ? s.zones : [LOCAL_ZONE, ...s.zones];
      const keep = new Set(T.uniqueClocks([LOCAL_ZONE, ...base.filter((z) => z !== LOCAL_ZONE)], Date.now()));
      const zones = base.filter((z) => keep.has(z));
      settings.zones = zones; settings.firstRun = false;
      window.wc.setSettings({ zones, firstRun: false }).catch(onIpcError);
    }
    applyLanguage();
    el.ver.textContent = s.version ? `v${s.version}` : '';
    syncPanel();
    fillConvZones();
    renderTip();
    render();
    el.strip.scrollLeft = 0;
    emit('boot', { strip: el.strip });
    scheduleTick();
  }
  loadSettings(0);
})();
} catch (e) { console.error('Open World Clock: app.js failed to start', e); }


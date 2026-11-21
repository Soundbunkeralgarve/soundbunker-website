// City landing pages (theticketbunker.com/<slug>). Each page is the homepage preset to that
// place, with its own title, description and a server-rendered list of what is on.
// [slug, name, country code, feed query, short pitch]
export const CITY_PAGES = Object.freeze([
  ['london', 'London', 'GB', 'London', 'West End shows, gigs, club nights, comedy and days out across the capital'],
  ['manchester', 'Manchester', 'GB', 'Manchester', 'warehouse raves, gigs, comedy and family days out'],
  ['liverpool', 'Liverpool', 'GB', 'Liverpool', 'gigs, club nights, comedy and family days out on the Mersey'],
  ['glasgow', 'Glasgow', 'GB', 'Glasgow', 'gigs, club nights and comedy in Scotland’s music city'],
  ['edinburgh', 'Edinburgh', 'GB', 'Edinburgh', 'gigs, comedy, theatre and festivals in the capital of Scotland'],
  ['birmingham', 'Birmingham', 'GB', 'Birmingham', 'gigs, club nights, comedy and family days out'],
  ['brighton', 'Brighton', 'GB', 'Brighton', 'gigs, club nights and comedy by the sea'],
  ['bristol', 'Bristol', 'GB', 'Bristol', 'gigs, raves and comedy across the city'],
  ['leeds', 'Leeds', 'GB', 'Leeds', 'gigs, club nights and comedy in Yorkshire'],
  ['newcastle', 'Newcastle', 'GB', 'Newcastle', 'gigs, club nights and comedy on the Tyne'],
  ['sheffield', 'Sheffield', 'GB', 'Sheffield', 'gigs, club nights and comedy'],
  ['nottingham', 'Nottingham', 'GB', 'Nottingham', 'gigs, club nights and comedy'],
  ['cardiff', 'Cardiff', 'GB', 'Cardiff', 'gigs, comedy and nights out in the Welsh capital'],
  ['belfast', 'Belfast', 'GB', 'Belfast', 'gigs, club nights and comedy'],
  ['dublin', 'Dublin', 'IE', 'Dublin', 'gigs, club nights, comedy and tours'],
  ['algarve', 'the Algarve', 'PT', 'Algarve', 'boat trips, caves, gigs, club nights and family days out'],
  ['lisbon', 'Lisbon', 'PT', 'Lisbon', 'fado, gigs, tours and days out'],
  ['porto', 'Porto', 'PT', 'Porto', 'gigs, river cruises, port tastings and tours'],
  ['madeira', 'Madeira', 'PT', 'Madeira', 'tours, boat trips and island days out'],
  ['barcelona', 'Barcelona', 'ES', 'Barcelona', 'gigs, club nights, tours and days out'],
  ['madrid', 'Madrid', 'ES', 'Madrid', 'gigs, shows, tours and days out'],
  ['seville', 'Seville', 'ES', 'Seville', 'flamenco, tours and days out'],
  ['malaga', 'Málaga', 'ES', 'Malaga', 'tours, boat trips and days out on the Costa del Sol'],
  ['ibiza', 'Ibiza', 'ES', 'Ibiza', 'club nights, boat parties and island days out'],
  ['tenerife', 'Tenerife', 'ES', 'Costa Adeje', 'club nights, whale watching and island days out'],
  ['mallorca', 'Mallorca', 'ES', 'Mallorca', 'boat trips, tours and island days out'],
  ['paris', 'Paris', 'FR', 'Paris', 'tours, shows and days out'],
  ['amsterdam', 'Amsterdam', 'NL', 'Amsterdam', 'canal cruises, tours and days out'],
  ['berlin', 'Berlin', 'DE', 'Berlin', 'club nights, tours and days out'],
  ['rome', 'Rome', 'IT', 'Rome', 'tours, shows and days out'],
  ['prague', 'Prague', 'CZ', 'Prague', 'tours, river cruises and days out'],
  ['vienna', 'Vienna', 'AT', 'Vienna', 'concerts, tours and days out'],
  ['budapest', 'Budapest', 'HU', 'Budapest', 'thermal baths, river cruises and tours']
]);
export const cityBySlug = slug => CITY_PAGES.find(([s]) => s === slug) || null;

// Booking organisers are independent of catalogue/affiliate approval. An entry
// here lets a customer organise their own confirmation; it enables no sales feed.
export const PARTNER_SUPPLIERS = Object.freeze([
  {id:'viator',name:'Viator',hosts:['viator.com']},
  {id:'skiddle',name:'Skiddle',hosts:['skiddle.com']},
  {id:'theatre-tickets-direct',name:'Theatre Tickets Direct',hosts:['theatreticketsdirect.co.uk'],awin:1936},
  {id:'entradas',name:'Entradas.com',hosts:['entradas.com'],awin:24761},
  {id:'plopsaland',name:'Plopsaland Deutschland',hosts:['plopsalanddeutschland.de','holidaypark.de'],awin:116511},
  {id:'tripcom',name:'Trip.com',hosts:['trip.com']},
  {id:'aviasales',name:'Aviasales',hosts:['aviasales.com','aviasales.co.uk','aviasales.ru']},
  {id:'kayak',name:'KAYAK',hosts:['kayak.com','kayak.co.uk','kayak.pt','kayak.es','kayak.fr','kayak.de']},
  {id:'trainline',name:'Trainline',hosts:['thetrainline.com','trainline.com']},
  {id:'omio',name:'Omio',hosts:['omio.com','omio.co.uk','omio.pt','omio.es','omio.fr','omio.de']},
  {id:'eurostar',name:'Eurostar',hosts:['eurostar.com']},
  {id:'northern',name:'Northern',hosts:['northernrailway.co.uk'],awin:24353},
  {id:'tpexpress',name:'TransPennine Express',hosts:['tpexpress.co.uk'],awin:2829},
  {id:'ferryhopper',name:'Ferryhopper',hosts:['ferryhopper.com'],awin:129345},
  {id:'expedia',name:'Expedia',hosts:['expedia.co.uk','expedia.com','expedia.pt','expedia.es','expedia.fr','expedia.de']},
  {id:'booking',name:'Booking.com',hosts:['booking.com']},
  {id:'hotel-info',name:'Hotel.info',hosts:['hotel.info'],awin:16634},
  {id:'hotel-de',name:'Hotel.de',hosts:['hotel.de'],awin:16018},
  {id:'thefork',name:'TheFork',hosts:['thefork.co.uk','thefork.pt','thefork.es','thefork.fr','thefork.it'],awin:127369},
  {id:'tastecard',name:'tastecard',hosts:['tastecard.co.uk'],awin:16164},
  {id:'blacklane',name:'Blacklane',hosts:['blacklane.com']},
  {id:'welcome-pickups',name:'Welcome Pickups',hosts:['welcomepickups.com']},
  {id:'stagweb',name:'StagWeb',hosts:['stagweb.co.uk']},
  {id:'gohen',name:'GoHen',hosts:['gohen.com']},
  {id:'ticketmaster',name:'Ticketmaster',hosts:['ticketmaster.com','ticketmaster.co.uk','ticketmaster.ie','ticketmaster.es','ticketmaster.fr','ticketmaster.de','ticketmaster.nl']},
  {id:'tiqets',name:'Tiqets',hosts:['tiqets.com']},
  {id:'getyourguide',name:'GetYourGuide',hosts:['getyourguide.com','getyourguide.co.uk','getyourguide.pt','getyourguide.es']},
  {id:'fareharbor',name:'FareHarbor',hosts:['fareharbor.com']},
  {id:'nos',name:'Cinemas NOS',hosts:['cinemas.nos.pt']},
  {id:'coras',name:'CORAS',hosts:['coras.io']}
].map(s=>Object.freeze({...s,hosts:Object.freeze(s.hosts)})));

const hostMatches = (host,allowed)=>host===allowed||host.endsWith('.'+allowed);
export function supplierForUrl(value) {
  try {
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
    if(hostMatches(u.hostname,'awin1.com')) {
      // Identify the merchant, not the affiliate network. Never use an arbitrary
      // destination parameter to attribute one merchant's link to another.
      const merchant=u.searchParams.get('awinmid')||u.searchParams.get('mid');
      return PARTNER_SUPPLIERS.find(s=>s.awin===Number(merchant))||null;
    }
    return PARTNER_SUPPLIERS.find(s=>s.hosts.some(h=>hostMatches(u.hostname,h)))||null;
  }catch{return null;}
}

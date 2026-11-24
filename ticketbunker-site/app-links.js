// The fan app's store pages. `live` stays false until Apple and Google have both approved
// and published the app, so the site never links to a store page that does not exist yet.
// When it goes live: set live to true and bump ?v= on app-promo.js.
export const APP = Object.freeze({
  live: false,
  name: 'The TicketBunker',
  ios: 'https://apps.apple.com/app/id6837950372',
  android: 'https://play.google.com/store/apps/details?id=pt.soundbunker.theticketbunker'
});
export const APP_PITCH = 'Live Tube and bus times, step-free routes and taxis, wherever you are.';

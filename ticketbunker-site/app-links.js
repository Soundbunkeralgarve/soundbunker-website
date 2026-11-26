// The fan app's store pages. Each store is switched on only once that store has published the
// app, so the site never links to a store page that does not exist yet (Google Play returns 404
// until approval). When Google approves: set android to true and bump ?v= on app-promo.js.
export const APP = Object.freeze({
  live: true,
  store: Object.freeze({ios: true, android: false}),
  name: 'TicketBunker',
  ios: 'https://apps.apple.com/gb/app/id6837950372',
  android: 'https://play.google.com/store/apps/details?id=pt.soundbunker.theticketbunker'
});
export const APP_PITCH = 'Tickets in your pocket, live Get around and trip deals, all in one app.';

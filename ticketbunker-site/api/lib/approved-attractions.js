// Approved Awin programme116511, publisher3163272; membership notification
// 24 Nov 2026. The default Awin redirect was checked to reach the park with
// sv_campaign_id=3163272 and awc=116511_... . This is a reviewed browse offer,
// not an inventory API or a claim of same-day admission.
export function approvedAttractions(now=Date.now()) {
  if(now<Date.parse('2026-11-24T08:28:40Z') || now>=Date.parse('2026-12-24T00:00:00Z'))return [];
  return [{id:'awin:116511:park2027',provider:'awin-116511',seller:'Plopsaland Deutschland',
    title:'Plopsaland Deutschland — 2027 season tickets',category:'family',city:'Hassloch',countryCode:'DE',
    venue:'Plopsaland Deutschland',address:'Holiday-Park-Strasse 1-5, 67454 Hassloch, Germany',
    startsAt:'',endsAt:'',timezone:'Europe/Berlin',priceCents:null,currency:'eur',image:'',thumb:false,
    description:'Main park season starts 19 March 2027. Choose tickets and check opening dates, admission validity and all prices with the park. Winter attractions have separate admission.',
    searchTerms:'Plopsa theme park Hassloch Haßloch Germany family 2027',
    url:'https://www.awin1.com/cread.php?awinmid=116511&awinaffid=3163272'}];
}

// Independently verified in the joined Trip.com affiliate portal on 25 Nov 2026.
// This is a claimable promotion: no generic code is copied or invented.
const RAIL = Object.freeze({
 id:'tripcom-uk-rail-bf-20261130',type:'claim',advertiser:'Trip.com',kind:'travel',code:'',claimRequired:true,
 title:'£8 off UK trains for eligible new rail customers',
 description:'Claim an £8 coupon for UK train ticket bookings over £20, then book with Trip.com. New rail customers only; pay in GBP or EUR.',
 terms:'Only users with no previous train-ticket purchase for routes in the UK, Italy, Spain, France or Germany on Trip.com qualify. UK train booking must exceed £20. Claim and use by 30 November 2026. Once per user, device, email address and payment account; cannot combine with other discounts. Ticket issuance and Trip.com terms apply.',
 starts:'2026-11-25',ends:'2026-11-30',destination:{country:'GB',city:'',label:'UK train journeys',nationwide:true},eligibleCountries:['*'],
 url:'https://uk.trip.com/web-contents/awake/growth/0/1603/1794296773306/?locale=en-GB&currency=GBP&isHideNavBar=YES&transparentbar=1&wkp=1&Allianceid=11489066&SID=336945869&trip_sub1=&trip_sub3=P21562809',
 verifiedAt:'2026-11-25',source:'Trip.com joined affiliate Promo Campaign; UK train coupon terms'
});
export function verifiedPromotions(country,now=Date.now()){
 if(!/^[A-Z]{2}$/.test(country))return [];
 return [RAIL].filter(o=>Date.parse(o.starts+'T00:00:00Z')<=now&&now<=Date.parse(o.ends+'T23:59:59Z')).map(o=>({...o}));
}

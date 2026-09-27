import { json } from './lib/http.js';

async function businessReviews() {
  const account = process.env.GOOGLE_BUSINESS_ACCOUNT_ID, location = process.env.GOOGLE_BUSINESS_LOCATION_ID;
  const refresh = process.env.GOOGLE_BUSINESS_REFRESH_TOKEN;
  const key = process.env.GOOGLE_OAUTH_CLIENT_ID, secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!account || !location || !refresh || !key || !secret) return null;
  const tokenRequest = await fetch('https://oauth2.googleapis.com/token', { method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:key,client_secret:secret,refresh_token:refresh,grant_type:'refresh_token'}) });
  if (!tokenRequest.ok) throw new Error('Google Business Profile authentication failed');
  const token = (await tokenRequest.json()).access_token;
  let next = '', reviews = [], total = null, average = null, pages = 0;
  do {
    const url = new URL(`https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(account)}/locations/${encodeURIComponent(location)}/reviews`);
    url.searchParams.set('pageSize','50');
    if (next) url.searchParams.set('pageToken',next);
    const response = await fetch(url,{headers:{authorization:`Bearer ${token}`}});
    if (!response.ok) throw new Error('Google Business Profile reviews unavailable');
    const data = await response.json();
    total = data.totalReviewCount ?? total; average = data.averageRating ?? average;
    reviews.push(...(data.reviews || []));
    next = data.nextPageToken || '';
    pages++;
  } while (next && pages < 20 && reviews.filter(x=>x.starRating==='FIVE' && x.comment).length < 15);
  const five = reviews.filter(item => item.starRating === 'FIVE' && item.comment).slice(0,15)
    .map(item => ({author:item.reviewer?.displayName || 'Google reviewer',text:item.comment,
      rating:5, date:item.createTime || null}));
  return { source:'business', rating:average, reviewCount:total, fiveStarShown:five.length, reviews:five };
}
async function placeReviews() {
  const placeId = process.env.GOOGLE_PLACE_ID, key = process.env.GOOGLE_MAPS_API_KEY;
  if (!placeId || !key) return null;
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'displayName,rating,userRatingCount,reviews,googleMapsUri'} });
  if (!response.ok) throw new Error('Google Places reviews unavailable');
  const data = await response.json();
  const five = (data.reviews || []).filter(item=>item.rating===5 && item.text?.text).slice(0,5)
    .map(item=>({author:item.authorAttribution?.displayName || 'Google reviewer',text:item.text.text,
      rating:5,date:item.publishTime || null}));
  return {source:'places',rating:data.rating,reviewCount:data.userRatingCount,
    fiveStarShown:five.length,reviews:five,mapsUrl:data.googleMapsUri};
}
export default async function handler(request,response) {
  if(request.method!=='GET') return json(response,{error:'Method not allowed'},405);
  try {
    let data;
    try { data = await businessReviews(); }
    catch (err) { console.error('Business Profile reviews unavailable', err); }
    data ||= await placeReviews();
    if (!data) return json(response,{configured:false,reviews:[]});
    response.setHeader('cache-control','public, s-maxage=3600, stale-while-revalidate=3600');
    response.setHeader('content-type','application/json; charset=utf-8');
    response.end(JSON.stringify({configured:true,...data}));
  } catch (err) {
    console.error('Google reviews failed',err);
    return json(response,{configured:false,reviews:[],error:'Reviews temporarily unavailable'},503);
  }
}

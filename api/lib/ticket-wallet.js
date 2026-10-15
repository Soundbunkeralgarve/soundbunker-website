import {createSign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const origin='https://theticketbunker.com';
const localized=value=>({defaultValue:{language:'en-GB',value:String(value||'')}});
const image=(uri,alt)=>({sourceUri:{uri},contentDescription:localized(alt)});
const pem=value=>String(value||'').replace(/\\n/g,'\n');
const googleCredentials=env=>{
 const dedicated=!!env.GOOGLE_WALLET_CLIENT_EMAIL||!!env.GOOGLE_WALLET_PRIVATE_KEY;
 return dedicated?{email:env.GOOGLE_WALLET_CLIENT_EMAIL,key:env.GOOGLE_WALLET_PRIVATE_KEY}:{email:env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key:env.GOOGLE_PRIVATE_KEY};
};
export function walletAvailability(env=process.env){return {
 apple:env.APPLE_WALLET_ENABLED==='true'&&['APPLE_PASS_TYPE_ID','APPLE_TEAM_ID','APPLE_PASS_CERT_PEM','APPLE_PASS_KEY_PEM','APPLE_WWDR_CERT_PEM'].every(k=>!!env[k]),
 google:env.GOOGLE_WALLET_ENABLED==='true'&&/^\d+$/.test(String(env.GOOGLE_WALLET_ISSUER_ID||''))&&!!googleCredentials(env).email&&!!googleCredentials(env).key
};}
// Check the issuer connection without returning credentials, tokens or Google's raw errors.
// This is also usable before activation, so private rehearsals can check setup safely.
export async function googleWalletReadiness(env=process.env,request=fetch){
 const {email,key}=googleCredentials(env),issuer=String(env.GOOGLE_WALLET_ISSUER_ID||'');
 if(!email||!key||!/^\d+$/.test(issuer))return {connected:false,reason:'credentials_missing'};
 try{
  const now=Math.floor(Date.now()/1000),b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:email,scope:'https://www.googleapis.com/auth/wallet_object.issuer',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+300});
  const assertion=unsigned+'.'+createSign('RSA-SHA256').update(unsigned).end().sign(pem(key)).toString('base64url');
  const auth=await request('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  if(!auth.ok)return {connected:false,reason:auth.status>=500?'temporarily_unavailable':'authentication_failed'};
  const token=(await auth.json()).access_token;
  if(typeof token!=='string'||!token)return {connected:false,reason:'authentication_failed'};
  const result=await request('https://walletobjects.googleapis.com/walletobjects/v1/eventTicketClass?issuerId='+issuer+'&maxResults=1',{redirect:'error',signal:AbortSignal.timeout(5000),headers:{authorization:'Bearer '+token}});
  if(result.ok)return {connected:true,reason:null};
  if(result.status===403){
   const detail=await result.json().catch(()=>({}));
   const disabled=detail.error?.details?.some(item=>item.reason==='SERVICE_DISABLED');
   return {connected:false,reason:disabled?'api_disabled':'issuer_permission_missing'};
  }
  return {connected:false,reason:result.status===401?'authentication_failed':'temporarily_unavailable'};
 }catch{return {connected:false,reason:'temporarily_unavailable'};}
}
// A short-lived, explicitly selected internal event can rehearse the real wallet flow.
// This never converts a test order into commercial admission or changes scan authorisation.
export function walletTestEvent(event,env=process.env){
 const allowed=String(env.WALLET_TEST_EVENT_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
 return event?.internal_free_test===true&&event.status==='published'&&allowed.includes(event.id)&&
  Number.isFinite(Date.parse(event.test_expires_at))&&Date.parse(event.test_expires_at)>Date.now();
}
export function walletTicketUrl(t,sig){return origin+'/event-ticket?id='+encodeURIComponent(t.id)+'&sig='+encodeURIComponent(sig);}
export function assertWalletTicket(t,env=process.env){
 const rehearsal=t?.walletTest===true&&walletTestEvent({id:t.eventId,internal_free_test:t.test,status:'published',test_expires_at:t.testExpiresAt},env);
 if(!t||(t.test&&!rehearsal)||t.used)throw Error('This ticket cannot be added to a wallet.');
 if(!t.date||!Number.isFinite(Date.parse(t.date)))throw Error('Event date is unavailable.');
 if(t.endDate&&Date.parse(t.endDate)<Date.now())throw Error('This event has finished.');
}
export function applePassData(t,sig,env=process.env){
 assertWalletTicket(t,env);
 const when=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:t.timezone||'Europe/Lisbon'}).format(new Date(t.date));
 return {formatVersion:1,passTypeIdentifier:env.APPLE_PASS_TYPE_ID,teamIdentifier:env.APPLE_TEAM_ID,
 serialNumber:t.id+'-v'+(t.version||0),organizationName:'The TicketBunker',description:(t.test?'TEST ONLY — ':'')+t.title+' — '+t.tier,
 backgroundColor:'rgb(0,0,0)',foregroundColor:'rgb(255,255,255)',labelColor:'rgb(0,224,166)',
 relevantDate:t.date,...(t.endDate?{expirationDate:t.endDate}:{}),
 barcodes:[{format:'PKBarcodeFormatQR',message:walletTicketUrl(t,sig),messageEncoding:'iso-8859-1',altText:'Admission '+String(t.admissionNumber||'')}],
 eventTicket:{headerFields:[{key:'ticketType',label:t.test?'TEST ONLY':'ADMISSION',value:t.tier||'General admission'}],
 primaryFields:[{key:'event',label:'EVENT',value:t.title}],
 secondaryFields:[{key:'when',label:'DATE & TIME',value:when},{key:'venue',label:'VENUE',value:t.venue}],
 auxiliaryFields:[{key:'holder',label:'ATTENDEE',value:t.holderName},{key:'number',label:'TICKET',value:String(t.admissionNumber||'')}],
 backFields:[{key:'manage',label:'Manage your ticket',value:origin+'/my-tickets'},
 {key:'organiser',label:'Presented by',value:t.organiserName||'Event organiser'},
 {key:'conditions',label:'Entry conditions',value:(t.test?'Private wallet/scanner rehearsal only. Not valid for admission to a public event. ':'')+'One admission only. Transferred, cancelled, refunded or previously scanned tickets are not valid. Reopen My tickets after changing a name or transferring a ticket.'},
 {key:'support',label:'Customer Services',value:'bookings@theticketbunker.com'},
 {key:'powered',label:'Powered by',value:'SoundBunker Algarve'}]}};
}
// Only fetch artwork from the project's public storage; never arbitrary organiser URLs.
async function trustedArtwork(url,width,height){
 if(!url)return null;let u;try{u=new URL(url)}catch{return null}
 if(u.origin!=='https://mshjykmopgvvupmymgxb.supabase.co'||!u.pathname.startsWith('/storage/v1/object/public/'))return null;
 try{
 const response=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!response.ok||!/^image\//i.test(response.headers.get('content-type')||''))return null;
 const reader=response.body.getReader();const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3_000_000){await reader.cancel();return null;}chunks.push(Buffer.from(value));}
 const {default:sharp}=await import('sharp');
 return await sharp(Buffer.concat(chunks),{limitInputPixels:16000000}).resize(width,height,{fit:'contain',background:{r:255,g:255,b:255,alpha:1}}).png().toBuffer();
 }catch{return null;}
}
export async function createApplePass(t,sig,env=process.env){
 if(!walletAvailability(env).apple)throw Error('Apple Wallet is not enabled.');
 const {PKPass}=await import('passkit-generator');
 const {default:sharp}=await import('sharp');
 const [icon,logo]=await Promise.all([readFile(new URL('../../ticketbunker-site/brand-icon.png',import.meta.url)),readFile(new URL('../../ticketbunker-site/brand-compact.png',import.meta.url))]);
 const files={};
 for(const scale of [1,2,3]){const suffix=scale===1?'':'@'+scale+'x';
  files['icon'+suffix+'.png']=await sharp(icon).resize(29*scale,29*scale,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  files['logo'+suffix+'.png']=await sharp(logo).resize(160*scale,50*scale,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
 }
 files['pass.json']=Buffer.from(JSON.stringify(applePassData(t,sig,env)));
 const [organiserLogo,poster]=await Promise.all([trustedArtwork(t.eventLogo,270,270),trustedArtwork(t.poster,1125,294)]);
 if(organiserLogo)files['thumbnail@3x.png']=organiserLogo;if(poster)files['strip@3x.png']=poster;
 const pass=new PKPass(files,{wwdr:pem(env.APPLE_WWDR_CERT_PEM),signerCert:pem(env.APPLE_PASS_CERT_PEM),signerKey:pem(env.APPLE_PASS_KEY_PEM),...(env.APPLE_PASS_KEY_PASSPHRASE?{signerKeyPassphrase:env.APPLE_PASS_KEY_PASSPHRASE}:{})});
 return pass.getAsBuffer();
}
export function googlePassPayload(t,sig,env=process.env){
 assertWalletTicket(t,env);
 const issuer=env.GOOGLE_WALLET_ISSUER_ID;
 if(!/^\d+$/.test(issuer||''))throw Error('Google Wallet issuer is not configured.');
 const classId=issuer+'.event_'+t.eventId;
 const ticketClass={id:classId,issuerName:'The TicketBunker',reviewStatus:'UNDER_REVIEW',eventName:localized(t.title),
 logo:image(origin+'/brand-icon.png','The TicketBunker'),...(t.venue&&t.venueAddress?{venue:{name:localized(t.venue),address:localized(t.venueAddress)}}:{}),dateTime:{start:t.date,...(t.endDate?{end:t.endDate}:{})}};
 const safeUrl=url=>typeof url==='string'&&/^https:\/\/[^\s<>"]+$/.test(url);
 const ticketObject={id:issuer+'.ticket_'+t.id+'_v'+(t.version||0),classId,state:'ACTIVE',hexBackgroundColor:'#000000',
 ticketHolderName:t.holderName,ticketNumber:String(t.admissionNumber||''),ticketType:localized((t.test?'TEST ONLY — ':'')+t.tier),
 barcode:{type:'QR_CODE',value:walletTicketUrl(t,sig),alternateText:'Admission '+String(t.admissionNumber||'')},
 ...(safeUrl(t.poster)?{heroImage:image(t.poster,'Event artwork')}:{}),
 ...(safeUrl(t.eventLogo)?{imageModulesData:[{id:'organiser-logo',mainImage:image(t.eventLogo,'Event organiser')}]}:{}),
 textModulesData:[...(!t.venueAddress&&t.venue?[{id:'venue',header:'Venue',body:t.venue}]:[]),{id:'organiser',header:'Presented by',body:t.organiserName||'Event organiser'},{id:'terms',header:'Entry conditions',body:(t.test?'Private wallet/scanner rehearsal only. Not valid for admission to a public event. ':'')+'One admission only. Transferred, cancelled, refunded or used tickets are not valid. Reopen My tickets after attendee changes.'}],
 linksModuleData:{uris:[{uri:origin+'/my-tickets',description:'Manage your ticket'},{uri:'mailto:bookings@theticketbunker.com',description:'Customer Services'}]}};
 return {iss:googleCredentials(env).email,aud:'google',typ:'savetowallet',iat:Math.floor(Date.now()/1000),origins:['https://theticketbunker.com','https://www.theticketbunker.com'],payload:{eventTicketClasses:[ticketClass],eventTicketObjects:[ticketObject]}};
}
export function createGoogleWalletLink(t,sig,env=process.env){
 if(!walletAvailability(env).google)throw Error('Google Wallet is not enabled.');
 const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const content=b64({alg:'RS256',typ:'JWT'})+'.'+b64(googlePassPayload(t,sig,env));
 const signature=createSign('RSA-SHA256').update(content).end().sign(pem(googleCredentials(env).key)).toString('base64url');
 return 'https://pay.google.com/gp/v/save/'+content+'.'+signature;
}


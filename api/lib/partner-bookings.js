import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {supplierForUrl} from '../../ticketbunker-site/partner-booking-suppliers.js';

export const PARTNER_BOOKING_BUCKET='tb-partner-bookings';
const TABLE='tb_partner_bookings';
const UUID=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const SELECT='id,provider_id,provider_name,title,starts_at,venue,booking_url,booking_reference,listing_id,status,verification_source,document_path,document_name,created_at,updated_at';
const RESERVED=['userId','user_id','ownerId','owner_id','status','verificationSource','verification_source','documentPath','document_path','providerConfirmed','provider_confirmed'];
export class BookingInputError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const text=(value,max,required=false)=>{if(value!==undefined&&value!==null&&typeof value!=='string')throw new BookingInputError('Please check your booking details.');const result=String(value||'').replace(/[\u0000-\u001f\u007f]/g,'').trim();if(result.length>max||required&&!result)throw new BookingInputError('Please complete your booking details using the indicated lengths.');return result;};
export function bookingUrl(value){
 const raw=text(value,4000);if(!raw)return '';
 try{const u=new URL(raw),host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port||isIP(host.replace(/^\[|\]$/g,''))||!host.includes('.')||/(?:^|\.)(localhost|local|internal|invalid|test)$/.test(host)||/(?:^|\.)(theticketbunker\.com|soundbunker\.pt)$/.test(host))throw Error();
  return u.href;
 }catch{throw new BookingInputError('Use a public HTTPS link to the supplier’s booking or ticket page.');}
}
function date(value){if(!value)return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T[^ ]+)?$/.test(value)||!Number.isFinite(Date.parse(value)))throw new BookingInputError('Choose a valid booking date.');return new Date(value).toISOString();}
function uuid(value){if(!UUID.test(String(value||'')))throw new BookingInputError('Choose a valid saved booking.');return value;}
function rejectReserved(data){if(RESERVED.some(key=>Object.hasOwn(data,key)))throw new BookingInputError('Booking ownership and supplier confirmation cannot be changed here.');}
export function bookingFields(data,{partial=false}={}){
 rejectReserved(data);const fields={};
 for(const [key,column,max] of [['providerName','provider_name',100],['title','title',220],['venue','venue',220],['bookingReference','booking_reference',180],['listingId','listing_id',180]]){
  if(!partial||Object.hasOwn(data,key))fields[column]=text(data[key],max,['providerName','title'].includes(key));
 }
 if(!partial||Object.hasOwn(data,'providerId')){fields.provider_id=text(data.providerId,100,true);if(!/^[a-z0-9][a-z0-9_-]*$/.test(fields.provider_id))throw new BookingInputError('Choose a supplier.');}
 if(!partial||Object.hasOwn(data,'bookingUrl'))fields.booking_url=bookingUrl(data.bookingUrl);
 if(!partial||Object.hasOwn(data,'startsAt'))fields.starts_at=date(data.startsAt);
 if(data.customerReported!==undefined&&typeof data.customerReported!=='boolean')throw new BookingInputError('Please check your booking confirmation.');
 if(data.source==='click'&&!fields.booking_url)throw new BookingInputError('A supplier link is required to save this visit.');
 return fields;
}
export function bookingRecord(row){return {id:row.id,providerId:row.provider_id,providerName:row.provider_name,title:row.title,startsAt:row.starts_at,venue:row.venue,bookingUrl:row.booking_url,bookingReference:row.booking_reference,listingId:row.listing_id,status:row.status,verificationSource:row.verification_source,documentName:row.document_name||'',hasDocument:!!row.document_path,createdAt:row.created_at,updatedAt:row.updated_at};}
export function bookingDocument(data){
 const mime=text(data.mimeType,80),extensions={'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg'};
 if(!extensions[mime])throw new BookingInputError('Choose a PDF, PNG or JPEG file under 2 MB.');
 const encoded=data.base64;if(typeof encoded!=='string'||!encoded.length||encoded.length>2_666_668||encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new BookingInputError('Choose a valid file under 2 MB.');
 const bytes=Buffer.from(encoded,'base64');
 if(bytes.length<12||bytes.length>2_000_000||bytes.toString('base64')!==encoded)throw new BookingInputError('Choose a valid file under 2 MB.');
 const actual=bytes.subarray(0,5).toString('ascii')==='%PDF-'?'application/pdf':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.subarray(0,3).equals(Buffer.from([255,216,255]))?'image/jpeg':'';
 if(actual!==mime)throw new BookingInputError('The file contents do not match its type. Choose a PDF, PNG or JPEG.');
 const name=text(data.fileName,160,true).replace(/[\\/<>:"|?*]/g,'_');
 return {bytes,mime,extension:extensions[mime],name};
}
async function owned(db,userId,id){const result=await db.from(TABLE).select(SELECT).eq('id',uuid(id)).eq('user_id',userId).maybeSingle();if(result.error)throw result.error;if(!result.data)throw new BookingInputError('This booking was not found in your account.',404);return result.data;}
function scopedPath(path,userId,bookingId){if(!path||!path.startsWith(userId+'/'+bookingId+'/')||path.includes('..'))throw new BookingInputError('The saved ticket file is unavailable.',404);return path;}

// Inject dependencies so ownership and file handling can be exercised without live credentials.
export function createPartnerBookingsHandler({requireUser,json,parseJson,logger=console}){
 return async function handler(req,res){
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return json(res,{error:'Method not allowed'},405);}
  const ctx=await requireUser(req,{loadProfile:false});
  if(ctx.error)return json(res,{error:ctx.error},ctx.status);
  if(!ctx.user.email_confirmed_at)return json(res,{error:'Confirm your email address to view your bookings.'},403);
  const db=ctx.admin,userId=ctx.user.id;
  try{
   if(req.method==='GET'){
    const result=await db.from(TABLE).select(SELECT).eq('user_id',userId).order('created_at',{ascending:false}).limit(200);
    if(result.error)throw result.error;return json(res,{bookings:(result.data||[]).map(bookingRecord)});
   }
   if(Number(req.headers?.['content-length']||0)>2_900_000)throw new BookingInputError('Choose a file under 2 MB.',413);
   let data;try{data=await parseJson(req);}catch{throw new BookingInputError('Please send valid booking details.');}
   if(!data||typeof data!=='object'||Array.isArray(data))throw new BookingInputError('Please send valid booking details.');
   if(Buffer.byteLength(JSON.stringify(data))>2_900_000)throw new BookingInputError('Choose a file under 2 MB.',413);
   rejectReserved(data);
   if(data.action==='save'){
    const fields=bookingFields(data),requestId=data.requestId?uuid(data.requestId):randomUUID();
    if(data.source==='click'){
     const supplier=supplierForUrl(fields.booking_url);if(!supplier)throw new BookingInputError('This supplier link cannot be saved automatically. Add the booking in your account.');
     fields.provider_id=supplier.id;fields.provider_name=supplier.name;
     const previous=await db.from(TABLE).select(SELECT).eq('user_id',userId).eq('booking_url',fields.booking_url).limit(1).maybeSingle();
     if(previous.error)throw previous.error;if(previous.data)return json(res,{booking:bookingRecord(previous.data)});
    }
    const existing=await db.from(TABLE).select(SELECT).eq('user_id',userId).eq('request_id',requestId).maybeSingle();
    if(existing.error)throw existing.error;if(existing.data)return json(res,{booking:bookingRecord(existing.data)});
    const customerAdded=data.source!=='click'&&data.customerReported===true;
    const result=await db.from(TABLE).insert({...fields,user_id:userId,request_id:requestId,source:data.source==='click'?'click':'manual',status:customerAdded?'customer_added':'saved',verification_source:customerAdded?'customer':'none'}).select(SELECT).single();
    if(result.error){if(result.error.code==='23505'){let retryQuery=db.from(TABLE).select(SELECT).eq('user_id',userId);retryQuery=data.source==='click'?retryQuery.eq('booking_url',fields.booking_url).limit(1):retryQuery.eq('request_id',requestId);const retry=await retryQuery.maybeSingle();if(!retry.error&&retry.data)return json(res,{booking:bookingRecord(retry.data)});}throw result.error;}
    return json(res,{booking:bookingRecord(result.data)});
   }
   if(!['update','remove','document','download'].includes(data.action))throw new BookingInputError('Choose a valid booking action.');
   const row=await owned(db,userId,data.bookingId);
   if(data.action==='download'){
    const path=scopedPath(row.document_path,userId,row.id);
    const signed=await db.storage.from(PARTNER_BOOKING_BUCKET).createSignedUrl(path,60,{download:row.document_name||'ticket'});
    if(signed.error||!signed.data?.signedUrl)throw signed.error||Error('File signing unavailable');
    return json(res,{url:signed.data.signedUrl,fileName:row.document_name});
   }
   if(data.action==='remove'){
    if(row.document_path){const removed=await db.storage.from(PARTNER_BOOKING_BUCKET).remove([scopedPath(row.document_path,userId,row.id)]);if(removed.error)throw removed.error;}
    const result=await db.from(TABLE).delete().eq('id',row.id).eq('user_id',userId).eq('updated_at',row.updated_at).select('id').maybeSingle();
    if(result.error)throw result.error;if(!result.data)throw new BookingInputError('This booking changed. Refresh your bookings and try again.',409);
    return json(res,{removed:true});
   }
   if(['provider_confirmed','cancelled'].includes(row.status))throw new BookingInputError('This supplier-confirmed booking can only be changed with the supplier.',409);
   let fields,uploadedPath,storage;
   if(data.action==='document'){
    const file=bookingDocument(data);uploadedPath=userId+'/'+row.id+'/'+randomUUID()+'.'+file.extension;
    storage=db.storage.from(PARTNER_BOOKING_BUCKET);
    const upload=await storage.upload(uploadedPath,file.bytes,{contentType:file.mime,upsert:false,cacheControl:'0'});if(upload.error)throw upload.error;
    fields={document_path:uploadedPath,document_name:file.name};
    if(!['provider_confirmed','cancelled'].includes(row.status))Object.assign(fields,{status:'customer_added',verification_source:'customer'});
   }else{
    fields=bookingFields(data,{partial:true});
    if(data.customerReported===true&&!['provider_confirmed','cancelled'].includes(row.status))Object.assign(fields,{status:'customer_added',verification_source:'customer'});
   }
   fields.updated_at=new Date().toISOString();
   const updated=await db.from(TABLE).update(fields).eq('id',row.id).eq('user_id',userId).eq('updated_at',row.updated_at).select(SELECT).maybeSingle();
   if(updated.error||!updated.data){if(uploadedPath)await storage.remove([uploadedPath]);if(updated.error)throw updated.error;throw new BookingInputError('This booking changed. Refresh your bookings and try again.',409);}
   if(uploadedPath&&row.document_path)await storage.remove([scopedPath(row.document_path,userId,row.id)]).catch(error=>logger.error('Old partner ticket cleanup failed',error));
   return json(res,{booking:bookingRecord(updated.data)});
  }catch(error){if(error instanceof BookingInputError)return json(res,{error:error.message},error.status);logger.error('Partner bookings service failed',error);return json(res,{error:'We could not update your partner bookings. Please try again.'},503);}
 };
}

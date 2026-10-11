import ticketHandler from './event-ticket.js';
import {json} from './lib/http.js';
import {walletAvailability,assertWalletTicket,createApplePass,createGoogleWalletLink} from './lib/ticket-wallet.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const provider=String(req.query?.provider||'');
 if(!['apple','google'].includes(provider))return json(res,{error:'Choose Apple Wallet or Google Wallet.'},400);
 // Reuse the existing database status and current QR signature checks.
 let result,status;const capture={statusCode:200,setHeader(){},end(body){status=this.statusCode;result=JSON.parse(body)}};
 await ticketHandler(req,capture);
 if(status!==200)return json(res,result,status);
 try{assertWalletTicket(result.ticket)}catch{return json(res,{error:'This ticket cannot be added to a wallet.'},409)}
 if(!walletAvailability()[provider])return json(res,{error:'Wallet downloads are not available yet. Use your digital ticket or PDF.'},503);
 try{
 if(provider==='google')return json(res,{url:createGoogleWalletLink(result.ticket,req.query.sig)});
 const bytes=await createApplePass(result.ticket,req.query.sig);
 res.statusCode=200;res.setHeader('Content-Type','application/vnd.apple.pkpass');res.setHeader('Content-Disposition','attachment; filename="ticketbunker.pkpass"');res.end(bytes);
 }catch{return json(res,{error:'Unable to create your wallet ticket. Your digital ticket remains valid.'},503)}
}

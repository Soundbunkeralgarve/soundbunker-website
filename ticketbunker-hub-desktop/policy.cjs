const path=require('node:path');
const HUB_ORIGIN='http://127.0.0.1:8788';
function localWindowUrl(value){try{const u=new URL(value);return u.origin===HUB_ORIGIN&&!u.username&&!u.password&&u.pathname==='/';}catch{return false;}}
function eventFromLink(value){try{const u=new URL(value);if(u.protocol!=='ticketbunkerhub:'||u.hostname!=='open')return null;const id=u.searchParams.get('event');return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'')?id:null;}catch{return null;}}
// Store builds own a separate container ledger. Never import or reopen a direct-download ledger implicitly.
function desktopDataDirectory({mas=false,override,userData,home}){
 if(!mas)return override||path.join(home,'.ticketbunker-hub');
 if(!userData||!path.isAbsolute(userData))throw Error('The Mac App Store container path is unavailable.');
 const root=path.resolve(userData),directory=override?path.resolve(override):path.join(root,'ledger');
 const relative=path.relative(root,directory);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Mac App Store data must stay inside its app container.');
 return directory;
}
module.exports={HUB_ORIGIN,localWindowUrl,eventFromLink,desktopDataDirectory};

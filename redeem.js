const $ = selector => document.querySelector(selector);
let services=[],quote=null,activeEmail='';
const money = number => '€'+Number(number||0).toFixed(2);
async function api(path,payload,token='') {
 const response=await fetch(path,{method:payload===undefined?'GET':'POST',
  headers:{...(payload===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:`Bearer ${token}`}:{})},
  body:payload===undefined?undefined:JSON.stringify(payload),cache:'no-store'});
 const result=await response.json();
 if(!response.ok)throw new Error(result.error||'Please try again');
 return result;
}
async function bearer() {
 if(!window.supabase)return '';
 const config=await api('/api/supabase-config').catch(()=>null);
 if(!config?.url||!config?.key)return '';
 const sb=window.supabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true}});
 const {data:{session}}=await sb.auth.getSession();
 activeEmail=session?.user?.email||'';
 return session?.access_token||'';
}
function serviceOptions(selected, giftExperience) {
 const choices=giftExperience?[giftExperience,...services]:services;
 $('#service').innerHTML=choices.map(item=>`<option value="${item.id}">${item.name} · ${money(item.price)}</option>`).join('');
 if(choices.some(item=>item.id===selected))$('#service').value=selected;
}
async function checkCode(useSelectedService=false) {
 const code=$('#voucherCode').value.trim().toUpperCase();
 const status=$('#codeStatus');
 status.textContent='Checking your voucher…';$('#redeemForm').hidden=true;quote=null;
 if(!code){status.textContent='Enter the code shown on your voucher.';return}
 try {
  const result=await api('/api/redeem-code',{code,service:useSelectedService?$('#service').value:''},await bearer());
  quote=result;
  if(result.source==='prize') {
    $('#service').innerHTML=`<option value="${result.serviceId}">${result.serviceName}</option>`;
    $('#service').disabled=true;
  }else{
    $('#service').disabled=false;
    serviceOptions(result.serviceId,result.giftExperience);
  }
  $('#voucherQuote').innerHTML=result.source==='prize'
    ? `<div><span>PRIZE</span><strong>Included</strong></div><div><span>VOUCHER</span><strong>One use</strong></div><div><span>PAY TODAY</span><strong>€0</strong></div>`
    : `<div><span>SESSION PRICE</span><strong>${money(result.price)}</strong></div>
    <div><span>VOUCHER COVERS</span><strong>${money(result.credit)}</strong></div>
    <div><span>PAY TODAY</span><strong>${money(result.due)}</strong></div>`;
  const balance=Math.max(0,Number(result.total)-Number(result.due));
  status.textContent=result.source==='prize'?'Prize code accepted. This session is free.':
    `Gift voucher accepted. ${money(Math.max(0,result.available-result.credit))} will remain on this voucher. ${balance?money(balance)+' session balance is due on the day.':''}`;
  $('#slotFields').hidden=Boolean(result.noSlot);
  $('#date').required=!result.noSlot;$('#time').required=!result.noSlot;
  $('#redeemForm').hidden=false;
  $('#redeemForm button[type=submit]').textContent=result.due===0?'Confirm free booking':`Continue to payment · ${money(result.due)}`;
  if($('#date').value&&!result.noSlot)await loadSlots();
 }catch(error){status.textContent=error.message;}
}
async function loadSlots() {
 const day=$('#date').value;
 $('#time').disabled=true;$('#time').innerHTML='<option value="">Checking availability…</option>';
 if(!day||!quote)return;
 try{
  const result=await api(`/api/availability?date=${encodeURIComponent(day)}&service=${encodeURIComponent(quote.serviceId)}`);
  $('#time').innerHTML=result.slots.length?'<option value="">Choose a time</option>'+
   result.slots.map(item=>`<option value="${item}">${item}</option>`).join(''):'<option value="">No times available</option>';
  $('#time').disabled=!result.slots.length;
 }catch(error){$('#time').innerHTML='<option value="">Could not check times</option>';$('#codeStatus').textContent=error.message;}
}
async function boot() {
 $('#date').min=new Date().toISOString().slice(0,10);
 try{
  const linkedCode=new URLSearchParams(location.search).get('code');
  if(linkedCode)sessionStorage.setItem('voucherCodePending',linkedCode);
  if(!await bearer()){$('#loginGate').hidden=false;return;}
  $('#codeEntry').hidden=false;
  const email=$('#redeemForm [name=email]');
  email.value=activeEmail;email.readOnly=true;
  const result=await api('/api/services');
  services=(result.services||[]).filter(item=>item.enabled&&!item.voucher&&!item.prizeOnly);
  serviceOptions();
  if(!services.length)throw new Error('Bookings are temporarily unavailable.');
  const code=linkedCode||sessionStorage.getItem('voucherCodePending');
  sessionStorage.removeItem('voucherCodePending');
  if(code){$('#voucherCode').value=code;await checkCode();}
 }catch(error){$('#codeStatus').textContent=error.message;$('#checkCode').disabled=true;}
}
$('#checkCode').addEventListener('click',()=>checkCode());
$('#voucherCode').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();checkCode();}});
$('#service').addEventListener('change',()=>checkCode(true));
$('#date').addEventListener('change',loadSlots);
$('#redeemForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!quote||!event.currentTarget.reportValidity())return;
 const button=event.currentTarget.querySelector('button[type=submit]');
 button.disabled=true;$('#redeemStatus').textContent='Securing your session…';
 const form=Object.fromEntries(new FormData(event.currentTarget));
 try{
  const result=await api('/api/create-checkout',{...form,service:quote.serviceId,
    voucherCode:$('#voucherCode').value.trim(),language:'en'},await bearer());
  if(result.url)location.href=result.url;
  else if(result.confirmed)location.href=`redeem-success.html?ref=${encodeURIComponent(result.bookingRef)}`;
  else throw new Error('Booking confirmation was not returned.');
 }catch(error){$('#redeemStatus').textContent=error.message;button.disabled=false;}
});
boot();

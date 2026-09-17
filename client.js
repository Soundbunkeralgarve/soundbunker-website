let supabaseClient;
const $=s=>document.querySelector(s);
const show=(id,on=true)=>{const e=$(id);if(e)e.hidden=!on};
const message=(text,bad=false)=>{const e=$('#authMessage');e.textContent=text||'';e.className=bad?'error':'muted'};
async function boot(){
  try{
    const r=await fetch('/api/supabase-config'); const cfg=await r.json(); if(!r.ok) throw Error(cfg.error||'Login unavailable');
    supabaseClient=window.supabase.createClient(cfg.url,cfg.key);
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(session) await enterPortal(session); else show('#authPanel');
    supabaseClient.auth.onAuthStateChange(async(_event,newSession)=>{ if(newSession) await enterPortal(newSession); });
  }catch(e){show('#authPanel');message(e.message,true)}
}
async function sendLink(ev){
  ev.preventDefault(); const email=$('#email').value.trim(); if(!email)return;
  message('Sending secure login link…'); $('#sendLink').disabled=true;
  const {error}=await supabaseClient.auth.signInWithOtp({email,options:{emailRedirectTo:'https://www.soundbunker.pt/client-login.html'}});
  $('#sendLink').disabled=false;
  if(error)return message(error.message,true);
  message('Check your email. We’ve sent you a secure sign-in link.');
}
async function enterPortal(session){
  show('#authPanel',false); show('#portalPanel');
  const r=await fetch('/api/client-profile',{headers:{authorization:`Bearer ${session.access_token}`}}); const d=await r.json();
  if(!r.ok){await supabaseClient.auth.signOut();show('#portalPanel',false);show('#authPanel');return message(d.error||'Please sign in again',true)}
  const p=d.profile; $('#clientName').textContent=p.full_name||p.email; $('#clientEmail').textContent=p.email;
  $('#goldCount').textContent=String(p.qualifying_booking_count||0); $('#goldState').textContent=p.gold_status?'Gold Card active':'Gold Card progress';
  if(p.role==='admin'){show('#adminCard');$('#roleBadge').textContent='Administrator';}else $('#roleBadge').textContent='Client';
}
async function signOut(){await supabaseClient.auth.signOut();location.reload()}
document.addEventListener('DOMContentLoaded',()=>{$('#loginForm').addEventListener('submit',sendLink);$('#signOut').addEventListener('click',signOut);boot()});

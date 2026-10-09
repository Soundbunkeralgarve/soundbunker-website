(() => {
const $=q=>document.querySelector(q);
let sb,mode='login',role=new URLSearchParams(location.search).get('role')==='organiser'?'organiser':'attendee';
const destination=()=>{
 const params=new URLSearchParams(location.search),next=params.get('next');
 // Only the dedicated scanner link is allowed as an optional destination.
 if(next&&/^\/event-scanner(?:\.html)?(?:\?.*)?$/.test(next)&&!next.includes('#'))return next;
 return role==='organiser'?'/organiser':'/ticket-wallet';
};
function status(message,error=false){const el=$('#loginStatus');el.hidden=false;el.textContent=message;el.style.borderColor=error?'#e7aebc':'#e4d9f5';}
function update(){
 $('#attendeeRole').setAttribute('aria-selected',String(role==='attendee'));
 $('#organiserRole').setAttribute('aria-selected',String(role==='organiser'));
 $('#signInMode').setAttribute('aria-selected',String(mode==='login'));
 $('#signUpMode').setAttribute('aria-selected',String(mode==='signup'));
 $('#roleHelp').textContent=role==='organiser'?'Organisers manage event drafts and authorise scanning staff. Verified staff accounts can enter through their private invitations.':'Guests use this login to access their confirmed tickets and QR codes.';
 $('#nameLabel').hidden=mode!=='signup';$('#fullName').required=mode==='signup';
 $('#password').autocomplete=mode==='signup'?'new-password':'current-password';
 $('#loginButton').textContent=mode==='signup'?'Create free account →':'Sign in →';
}
$('#attendeeRole').onclick=()=>{role='attendee';update();};
$('#organiserRole').onclick=()=>{role='organiser';update();};
$('#signInMode').onclick=()=>{mode='login';update();};
$('#signUpMode').onclick=()=>{mode='signup';update();};
$('#loginForm').addEventListener('submit',async e=>{
 e.preventDefault();const btn=$('#loginButton');btn.disabled=true;const form=new FormData(e.currentTarget);
 const email=String(form.get('email')||'').trim(),password=String(form.get('password')||'');
 try{
  let result;
  if(mode==='signup'){
   const fullName=String(form.get('fullName')||'').trim();
   result=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/ticket-login?role='+role,data:{full_name:fullName,name:fullName}}});
  }else result=await sb.auth.signInWithPassword({email,password});
  if(result.error)throw result.error;
  if(!result.data.session){status('Check your inbox to verify your new account, then sign in.');return;}
  location.assign(destination());
 }catch(error){status(error.message||'Sign in failed',true);}finally{btn.disabled=false;}
});
(async()=>{try{const r=await fetch('/api/supabase-config'),cfg=await r.json();if(!r.ok)throw Error('Authentication is unavailable');sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});const {data:{session}}=await sb.auth.getSession();update();if(session)location.assign(destination());}catch(error){status(error.message,true);$('#loginButton').disabled=true;}})();
})();
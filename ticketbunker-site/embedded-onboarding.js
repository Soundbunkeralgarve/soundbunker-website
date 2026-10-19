import {loadConnectAndInitialize} from './vendor/stripe-connect.js';

let connectInstance;
export async function mountStripeOnboarding({container,fetchSession,onExit,onError}){
 if(!connectInstance){
  const first=await fetchSession();
  if(!/^pk_live_[A-Za-z0-9]+$/.test(first.publishableKey||'')||!first.clientSecret)throw Error('Secure verification is unavailable. Please try again.');
  let initial=first;
  connectInstance=loadConnectAndInitialize({
   publishableKey:first.publishableKey,
   fetchClientSecret:async()=>{
    const next=initial||await fetchSession();initial=null;
    return next.clientSecret;
   },
   appearance:{overlays:'dialog',variables:{colorPrimary:'#137a56',colorBackground:'#ffffff',colorText:'#16291f',fontFamily:'DM Sans, sans-serif',borderRadius:'8px'}}
  });
 }
 const component=connectInstance.create('account-onboarding');
 component.setOnExit(onExit);
 component.setOnLoadError(()=>onError(Error('The secure verification form could not load. Your saved details are safe. Please retry.')));
 container.replaceChildren(component);
 return component;
}

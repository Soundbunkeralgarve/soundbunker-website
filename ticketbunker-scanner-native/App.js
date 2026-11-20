import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,Image,KeyboardAvoidingView,Linking,Modal,Platform,Pressable,SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,useWindowDimensions,View} from 'react-native';
import {CameraView,useCameraPermissions} from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import {createScannerClient,restoreSession,scannerApi} from './lib/backend';
import {withDeadline} from './lib/request';
import {admissionResult,inviteToken,ticketUrl} from './lib/scanLogic';
import {offline,deviceKey} from './lib/offlineStore';
import {createOfflineSync} from './lib/offlineSync';
import {secureSessionStorage} from './lib/secureStorage';
import {localHub} from './lib/localHub';
import {money,qrRuns,sellableTiers,doorSaleResult} from './lib/door';

const C={bg:'#080d10',panel:'#121c20',panel2:'#19272c',edge:'#293a3e',text:'#f3f7f6',muted:'#99adb0',mint:'#20deb0',amber:'#ffd17b',red:'#ff8e9e'};
const QR_SETTINGS={barcodeTypes:['qr']};
const Button=({title,onPress,variant='primary',disabled=false,style})=><Pressable disabled={disabled} onPress={onPress} style={({pressed})=>[s.button,variant==='secondary'&&s.secondary,disabled&&s.disabled,pressed&&s.pressed,style]} accessibilityRole="button" accessibilityState={{disabled}}><Text style={[s.buttonText,variant==='secondary'&&s.secondaryText]}>{title}</Text></Pressable>;
const Input=(props)=><TextInput placeholderTextColor="#71868b" style={s.input} {...props}/>;
const Footer=()=> <View style={s.footer}><Text style={s.powered}>POWERED BY</Text><Image source={require('./assets/soundbunker-wordmark.png')} style={s.partnerLogo} resizeMode="contain" accessibilityLabel="SoundBunker Algarve"/><Pressable onPress={()=>Linking.openURL('https://theticketbunker.com/terms#privacy')} accessibilityRole="link" style={s.privacy}><Text style={s.small}>Privacy</Text></Pressable></View>;

function CameraPermissionPrompt({permission,requestPermission,purpose,manualOption}){
 const needsSettings=permission?.canAskAgain===false;
 return <>
  <Text style={s.bodyCenter}>{needsSettings?`Camera access is off. You can open Settings or ${manualOption}.`:`${purpose} Continue opens your device’s camera permission prompt.`}</Text>
  <Button title={needsSettings?'Open Settings':'Continue'} onPress={needsSettings?()=>Linking.openSettings():requestPermission}/>
 </>;
}

function QrCode({value}){
 const {width}=useWindowDimensions();
 const {size,rows}=useMemo(()=>qrRuns(value),[value]);
 const cell=Math.max(2,Math.floor(Math.min(width-56,360)/(size+8))),edge=cell*(size+8);
 return <View accessibilityRole="image" accessibilityLabel="Payment QR code" style={[s.qr,{width:edge,height:edge,padding:cell*4}]}>{rows.map((runs,r)=><View key={r} style={{height:cell}}>{runs.map(([x,w])=><View key={x} style={{position:'absolute',left:x*cell,width:w*cell,height:cell,backgroundColor:'#000'}}/>)}</View>)}</View>;
}
const Stat=({label,value})=><View style={s.statRow}><Text style={s.small}>{label}</Text><Text style={s.statValue}>{value}</Text></View>;
function DoorCount({door,error,updatedAt,admissions,busy,onAdjust}){
 const inside=door?door.inside:admissions,full=door?.capacity?Math.min(1,door.inside/door.capacity):0;
 return <ScrollView contentContainerStyle={s.doorPage}>
  <View style={s.countHero}>
   <Text style={s.kicker}>{door?'LIVE · EVERY DOOR':'THIS PHONE ONLY'}</Text>
   <Text style={s.countHuge} accessibilityLiveRegion="polite" accessibilityLabel={inside+' people in'}>{inside}</Text>
   <Text style={s.body}>{door?(door.capacity?`in · capacity ${door.capacity}`:'in'):'admitted on this phone'}</Text>
   {!!door?.capacity&&<View style={s.bar}><View style={[s.barFill,{width:`${full*100}%`,backgroundColor:full>=.95?C.red:full>=.8?C.amber:C.mint}]}/></View>}
   <Text style={s.small}>{error?`Live count paused · ${error}`:updatedAt?`Updated ${new Date(updatedAt).toLocaleTimeString()}`:'Connecting…'}</Text>
  </View>
  <Text style={s.panelHeading}>Clicker</Text>
  <Text style={s.small}>Count walk-ins without a ticket, or people leaving. Every phone sees the change.</Text>
  <View style={s.controls}><Button title="−1 Out" variant="secondary" disabled={busy||!door?.open} onPress={()=>onAdjust(-1)} style={[s.flex,s.clicker]}/><Button title="+1 In" disabled={busy||!door?.open} onPress={()=>onAdjust(1)} style={[s.flex,s.clicker]}/></View>
  {!!door&&<View style={s.panel}>
   <Stat label="Tickets scanned in" value={door.admitted}/>
   <Stat label="Clicker" value={(door.manual>0?'+':'')+door.manual}/>
   <Stat label="Tickets sold" value={door.sold}/>
   <Stat label="Door sales · card" value={`${door.doorCard.tickets} · ${money(door.doorCard.cents,door.currency)}`}/>
   <Stat label="Door sales · cash" value={`${door.doorCash.tickets} · ${money(door.doorCash.cents,door.currency)}`}/>
  </View>}
 </ScrollView>;
}
function DoorSale({door,error,busy,onCash,onCard}){
 const tiers=sellableTiers(door);
 const [tierId,setTierId]=useState('');
 const [quantity,setQuantity]=useState(1);
 const tier=tiers.find(t=>t.id===tierId)||tiers[0];
 const max=Math.max(1,Math.min(8,tier?.remaining||1));
 useEffect(()=>{if(quantity>max)setQuantity(max);},[quantity,max]);
 const notice=(heading,detail)=><View style={[s.empty,s.doorNotice]}><Text style={s.panelHeading}>{heading}</Text><Text style={s.bodyCenter}>{detail}</Text></View>;
 if(!door)return error?notice('Door sales need internet',error):<View style={[s.empty,s.doorNotice]}><ActivityIndicator color={C.mint}/></View>;
 if(!door.open)return notice('Door sales are closed','They open with check-in for this event.');
 if(!tier)return notice('Sold out','No tickets are left to sell at the door.');
 return <ScrollView contentContainerStyle={s.doorPage}>
  <Text style={s.panelHeading}>Ticket type</Text>
  {tiers.map(t=><Pressable key={t.id} disabled={busy} onPress={()=>setTierId(t.id)} accessibilityRole="radio" accessibilityState={{checked:t.id===tier.id}} style={[s.event,t.id===tier.id&&s.eventSelected]}><View style={s.flex}><Text style={s.eventName}>{t.name}</Text><Text style={s.small}>{t.remaining} left</Text></View><Text style={s.price}>{money(t.priceCents,door.currency)}</Text></Pressable>)}
  <View style={s.line}><Text style={s.panelHeading}>How many?</Text><View style={s.stepper}>
   <Pressable disabled={busy||quantity<=1} onPress={()=>setQuantity(q=>Math.max(1,q-1))} style={[s.stepButton,quantity<=1&&s.disabled]} accessibilityRole="button" accessibilityLabel="One fewer ticket"><Text style={s.stepText}>−</Text></Pressable>
   <Text style={s.stepValue} accessibilityLabel={quantity+' tickets'}>{quantity}</Text>
   <Pressable disabled={busy||quantity>=max} onPress={()=>setQuantity(q=>Math.min(max,q+1))} style={[s.stepButton,quantity>=max&&s.disabled]} accessibilityRole="button" accessibilityLabel="One more ticket"><Text style={s.stepText}>+</Text></Pressable>
  </View></View>
  <View style={s.totalRow}><Text style={s.body}>To pay</Text><Text style={s.totalValue}>{money(tier.priceCents*quantity,door.currency)}</Text></View>
  <Button title={busy?'Please wait…':'Card · Apple Pay · Google Pay'} disabled={busy||door.rehearsal} onPress={()=>onCard(tier,quantity)}/>
  <Button title="Cash" variant="secondary" disabled={busy} onPress={()=>onCash(tier,quantity)}/>
  <Text style={s.small}>{door.rehearsal?'Rehearsal event: practise with cash. Nothing is charged and card is off.':'Card payments go through Stripe and are paid out with your online sales. Cash stays with you. Door sales are checked in straight away.'}</Text>
 </ScrollView>;
}
const TABS=[['scan','Scan'],['sell','Pay at door'],['count','Door count']];

export default function App(){
 const [client]=useState(createScannerClient);
 const [user,setUser]=useState(null);
 const [offlineStatus,setOfflineStatus]=useState(null);
 const [syncMessage,setSyncMessage]=useState('');
 const [laneCount,setLaneCount]=useState('1');
 const [hubConnection,setHubConnection]=useState(null);
 const [hubPairing,setHubPairing]=useState(false);
 const [hubLink,setHubLink]=useState('');
 const [hubHealth,setHubHealth]=useState(null);
 const [syncer]=useState(()=>createOfflineSync({offline,deviceKey,api:body=>scannerApi(client,'/api/event-scanner-offline',body)}));
 const [loading,setLoading]=useState(true);
 const [startupError,setStartupError]=useState('');
 const [attempt,setAttempt]=useState(0);
 const [busy,setBusy]=useState(false);
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [message,setMessage]=useState('');
 const [events,setEvents]=useState([]);
 const [selected,setSelected]=useState('');
 const [loadingEvents,setLoadingEvents]=useState(false);
 const [working,setWorking]=useState(false);
 const [result,setResult]=useState(null);
 const [feedbackOpen,setFeedbackOpen]=useState(false);
 const [toolsOpen,setToolsOpen]=useState(false);
 const [manualOpen,setManualOpen]=useState(false);
 const [manual,setManual]=useState('');
 const [invite,setInvite]=useState('');
 const [torch,setTorch]=useState(false);
 const [foreground,setForeground]=useState(AppState.currentState!=='background');
 const [permission,requestPermission,getCameraPermission]=useCameraPermissions();
 const [admissions,setAdmissions]=useState(0);
 const [tab,setTab]=useState('scan');
 const [setupOpen,setSetupOpen]=useState(false);
 const [door,setDoor]=useState(null);
 const [doorError,setDoorError]=useState('');
 const [doorAt,setDoorAt]=useState(0);
 const [doorBusy,setDoorBusy]=useState(false);
 const [countBusy,setCountBusy]=useState(false);
 const [cardSale,setCardSale]=useState(null);
 const feedbackTimer=useRef(null);
 const lock=useRef(false);
 const feedbackVisible=useRef(false);
 const last=useRef({code:'',at:0});
 const eventId=useRef('');
 const refreshVersion=useRef(0);
 eventId.current=selected;

 useEffect(()=>{
  let alive=true;
  setLoading(true);setStartupError('');
  const {data:{subscription}}=client.auth.onAuthStateChange((name,session)=>{
   if(!alive)return;
   if(session?.user)setUser(session.user);
   if(session){setMessage('');setStartupError('');setLoading(false);}
   // Preserve downloaded entry if token refresh fails offline. Explicit sign-out is below.
  });
  const fallback=()=>secureSessionStorage.getItem('offline-identity').then(raw=>raw?JSON.parse(raw):null);
  restoreSession(client).then(async({data,error})=>{
   if(!alive)return;
   if(error)throw error;
   const identity=data.session?.user||await fallback();
   if(alive){setUser(identity);setStartupError('');}
  }).catch(async e=>{const identity=await fallback();if(alive){if(identity){setUser(identity);setStartupError('');}else setStartupError(e.message);}}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;subscription.unsubscribe();};
 },[client,attempt]);
 useEffect(()=>{
  const sub=AppState.addEventListener('change',next=>{
   setForeground(next==='active');
   if(next==='active')getCameraPermission().catch(()=>{});
  });
  return()=>{sub.remove();clearTimeout(feedbackTimer.current);client.auth.stopAutoRefresh();};
 },[client,getCameraPermission]);
 useEffect(()=>{
  if(foreground&&!loading&&!startupError)client.auth.startAutoRefresh();
  else client.auth.stopAutoRefresh();
 },[client,foreground,loading,startupError]);

 async function cachedEvents(userId){
  const cached=await offline.cachedEvents(userId);const c=await localHub.connection(userId);
  if(c&&!cached.some(e=>e.id===c.eventId))cached.push({id:c.eventId,title:c.event,venue:c.venue});return cached;
 }
 useEffect(()=>{if(!user?.id){setHubConnection(null);return;}localHub.connection(user.id).then(c=>{setHubConnection(c);if(c)setSelected(c.eventId);}).catch(e=>setMessage(e.message));},[user?.id]);
 useEffect(()=>{
  if(!user?.id||!hubConnection||!foreground)return;
  let alive=true,running=false;
  const ping=async()=>{if(running)return;running=true;try{const health=await localHub.ping(user.id);if(alive)setHubHealth({...health,checkedAt:Date.now()});}catch(e){if(alive)setHubHealth({ready:false,error:'Hub unreachable. Stay on the event Wi-Fi and check the hub laptop.'});}finally{running=false;}};
  ping();const timer=setInterval(ping,5000);return()=>{alive=false;clearInterval(timer);};
 },[user?.id,hubConnection,foreground]);
 async function joinHub(raw){
  if(lock.current||working)return;lock.current=true;setWorking(true);setMessage('');
  try{
   if((await offline.cachedEvents(user.id)).length)throw Error('Sync and finish this phone’s offline lanes before pairing to a shared hub.');
   const c=await localHub.pair(user.id,raw);
   await secureSessionStorage.setItem('offline-identity',JSON.stringify({id:user.id,email:user.email,email_confirmed_at:user.email_confirmed_at}));
   setHubConnection(c);setHubPairing(false);setHubLink('');setToolsOpen(false);setSelected(c.eventId);
   setEvents(old=>[...old.filter(e=>e.id!==c.eventId),{id:c.eventId,title:c.event,venue:c.venue}]);
   setMessage('Connected to '+c.event+'. All ticket checks now use the local hub.');
  }catch(e){setMessage(e.message||'Could not connect to the hub.');}finally{lock.current=false;setWorking(false);}
 }
 async function leaveHub(){
  if(working||lock.current)return;await localHub.forget(user.id);setHubConnection(null);setHubHealth(null);setMessage('Phone disconnected. Event tickets remain protected by the hub.');
 }
 const refresh=useCallback(async()=>{
  const version=++refreshVersion.current;
  setLoadingEvents(true);setMessage('');
  try{
   const response=await scannerApi(client,'/api/event-staff?mode=my');
   if(version!==refreshVersion.current)return;
   const cached=await cachedEvents(user.id);
   const live=Array.isArray(response.events)?response.events:[];
   const next=[...live,...cached.filter(e=>!live.some(v=>v.id===e.id))];
   if(version!==refreshVersion.current)return;
   setEvents(next);setSelected(old=>next.some(e=>e.id===old)?old:(next[0]?.id||''));
  }catch(e){
   if(version!==refreshVersion.current)return;
   const cached=await cachedEvents(user.id);
   if(version!==refreshVersion.current)return;
   setEvents(cached);setSelected(old=>cached.some(e=>e.id===old)?old:(cached[0]?.id||''));
   setMessage(cached.length?'Using your saved offline event.':e.message||'Unable to load your events.');
  }finally{if(version===refreshVersion.current)setLoadingEvents(false);}
 },[client,user?.id]);
 useEffect(()=>{
  if(user?.email_confirmed_at&&!loading&&!startupError)refresh();
  else{refreshVersion.current++;setEvents([]);setSelected('');setLoadingEvents(false);}
 },[user?.id,user?.email_confirmed_at,loading,startupError,refresh]);

 useEffect(()=>{
  if(!user?.id)return;
  let alive=true;
  cachedEvents(user.id).then(cached=>{if(alive&&cached.length){setEvents(old=>old.length?old:cached);setSelected(old=>old||cached[0].id);}}).catch(()=>{});
  return()=>{alive=false;};
 },[user?.id]);
 const refreshOffline=useCallback(async()=>{
  if(!user?.id||!selected){setOfflineStatus(null);return;}
  const m=await offline.manifest(user.id,selected);
  const pending=m?(await offline.pending(m.claimId)).length:0;
  if(eventId.current===selected)setOfflineStatus(m?{...m,pending}:null);
 },[user?.id,selected]);
 useEffect(()=>{setOfflineStatus(null);refreshOffline().catch(()=>{});},[refreshOffline]);
 useEffect(()=>{
  if(!user?.id||!foreground)return;
  let alive=true,running=false;
  const sync=async()=>{
   if(running)return;running=true;
   try{
    for(const e of await offline.cachedEvents(user.id))await syncer.sync(user.id,e.id);
    if(alive){setSyncMessage('');await refreshOffline();}
   }catch(e){if(alive)setSyncMessage(e.status===401||e.status===403?'Sign in again when connected to sync. Saved scans remain safe.':'Waiting for connection · saved scans are safe');}
   finally{running=false;}
  };
  sync();const timer=setInterval(sync,15000);
  return()=>{alive=false;clearInterval(timer);};
 },[user?.id,foreground,syncer,refreshOffline]);
 async function prepareOffline(){
  if(working||lock.current)return;
  setWorking(true);setMessage('');
  try{
   await secureSessionStorage.setItem('offline-identity',JSON.stringify({id:user.id,email:user.email,email_confirmed_at:user.email_confirmed_at}));
   await syncer.prepare(user.id,selected,Number(laneCount));await refreshOffline();setSyncMessage('');
  }catch(e){setMessage(e.message);}finally{setWorking(false);}
 }
 async function finishOffline(){
  if(working||lock.current)return;
  setWorking(true);setMessage('');
  try{await syncer.finish(user.id,selected);await refreshOffline();setSyncMessage('');setMessage('All saved entries synced. Online scanning is ready.');}
  catch(e){await refreshOffline();setMessage(e.message);}finally{setWorking(false);}
 }
 async function signIn(){
  if(busy)return;
  if(!(email.trim()||user?.email)||!password){setMessage('Enter your staff email and password.');return;}
  setBusy(true);setMessage('');
  try{
   const {data,error}=await withDeadline(()=>client.auth.signInWithPassword({email:email.trim()||user?.email,password}),12000,'Sign-in is taking too long. Check your connection and try again.');
   if(error)throw error;
   if(!data.user?.email_confirmed_at)throw Error('Verify your email before using the scanner.');
   setUser(data.user);setPassword('');setSyncMessage('');
  }catch(e){setMessage(e.message||'Sign in failed.');}
  finally{setBusy(false);}
 }
 async function signOut(){
  if(busy)return;
  setBusy(true);
  try{
   if((await offline.cachedEvents(user.id)).length)throw Error('Sync and finish offline mode before signing out.');
   await secureSessionStorage.removeItem('offline-identity');
   await localHub.forget(user.id);setHubConnection(null);setHubHealth(null);
   const {error}=await withDeadline(()=>client.auth.signOut({scope:'local'}),10000);
   if(error)throw error;
   refreshVersion.current++;setUser(null);setEvents([]);setSelected('');setResult(null);setAdmissions(0);setSetupOpen(false);setTab('scan');setPassword('');setMessage('');setToolsOpen(false);
  }catch(e){setMessage(e.message||'Could not sign out. Please try again.');}
  finally{setBusy(false);}
 }
 async function acceptInvite(){
  const token=inviteToken(invite);
  if(!token){setMessage('Paste the invitation link sent by your organiser.');return;}
  setWorking(true);setMessage('');
  try{
   const response=await scannerApi(client,'/api/event-staff',{action:'accept',token});
   setInvite('');await refresh();setSelected(response.eventId||'');setAdmissions(0);setResult(null);setToolsOpen(false);
  }catch(e){setMessage(e.message||'Unable to accept the invitation.');}
  finally{setWorking(false);}
 }
 const dismissFeedback=useCallback(()=>{
  if(lock.current)return;
  clearTimeout(feedbackTimer.current);feedbackVisible.current=false;setFeedbackOpen(false);
 },[]);
 // Live door figures come from the server, so every phone shows the same count.
 const refreshDoor=useCallback(async()=>{
  const id=eventId.current;if(!id)return;
  try{const d=await scannerApi(client,'/api/event-door?eventId='+encodeURIComponent(id));if(eventId.current===id){setDoor(d);setDoorAt(Date.now());setDoorError('');}}
  catch(e){if(eventId.current===id)setDoorError(e.message||'No connection');}
 },[client]);
 const showDoorResult=useCallback(next=>{
  clearTimeout(feedbackTimer.current);setResult(next);feedbackVisible.current=true;setFeedbackOpen(true);
  Haptics.notificationAsync(next.kind==='approved'?Haptics.NotificationFeedbackType.Success:next.kind==='warning'?Haptics.NotificationFeedbackType.Warning:Haptics.NotificationFeedbackType.Error).catch(()=>{});
 },[]);
 const handleScan=useCallback(async(raw,source='camera')=>{
  if(!eventId.current||lock.current||feedbackVisible.current)return;
  const now=Date.now();
  if(source==='camera'&&raw===last.current.code&&now-last.current.at<1800){last.current.at=now;return;}
  lock.current=true;feedbackVisible.current=true;
  setWorking(true);setResult(null);setFeedbackOpen(true);clearTimeout(feedbackTimer.current);
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});
  last.current={code:raw,at:now};
  let next;
  try{
   const code=ticketUrl(raw);
   const saved=await offline.manifest(user.id,eventId.current);
   if(saved&&!saved.active)throw Error('Offline mode is closing. Reconnect and finish syncing before scanning.');
   const parsed=new URL(code);
   const paired=await localHub.connection(user.id);
   const response=paired
    ?await localHub.scan(user.id,eventId.current,code)
    :saved?.active
    ?await offline.admit(user.id,eventId.current,parsed.searchParams.get('id'),parsed.searchParams.get('sig'))
    :await scannerApi(client,'/api/event-scan',{code,eventId:eventId.current});
   if(saved)refreshOffline().catch(()=>{});
   next=admissionResult(response);setResult(next);
   if(response.status==='valid'){setAdmissions(n=>n+1);if(!paired&&!saved?.active)refreshDoor();}
   const tone=next.kind==='approved'?Haptics.NotificationFeedbackType.Success:next.kind==='warning'?Haptics.NotificationFeedbackType.Warning:Haptics.NotificationFeedbackType.Error;
   Haptics.notificationAsync(tone).catch(()=>{});
  }catch(e){
   next={kind:'rejected',heading:'NOT VERIFIED',detail:e.message||'Could not verify ticket. Check your connection and scan again.'};setResult(next);
   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(()=>{});
  }finally{
   setManual('');setWorking(false);lock.current=false;
   if(next?.kind==='approved')feedbackTimer.current=setTimeout(dismissFeedback,900);
  }
 },[client,dismissFeedback,user?.id,refreshOffline,refreshDoor]);
 const onBarcodeScanned=useCallback(({data})=>handleScan(data),[handleScan]);
 useEffect(()=>{setDoor(null);setDoorError('');setDoorAt(0);setCardSale(null);},[selected]);
 useEffect(()=>{
  if(!user?.email_confirmed_at||!selected||!foreground||setupOpen)return;
  let alive=true,running=false;
  const tick=async()=>{if(running||!alive)return;running=true;try{await refreshDoor();}finally{running=false;}};
  tick();const timer=setInterval(tick,tab==='count'?3000:8000);
  return()=>{alive=false;clearInterval(timer);};
 },[user?.email_confirmed_at,selected,foreground,setupOpen,tab,refreshDoor]);
 // A card sale waits for the buyer's phone; checking here admits them without the webhook.
 useEffect(()=>{
  if(!cardSale||!foreground)return;
  let alive=true,running=false;
  const check=async()=>{
   if(running||!alive)return;running=true;
   try{
    const r=await scannerApi(client,'/api/event-door?eventId='+encodeURIComponent(cardSale.eventId)+'&order='+encodeURIComponent(cardSale.orderId));
    if(alive&&r.status!=='reserved'){setCardSale(null);setTimeout(()=>showDoorResult(doorSaleResult('card',{...cardSale,...r})),350);refreshDoor();}
   }catch{}finally{running=false;}
  };
  check();const timer=setInterval(check,2500);
  return()=>{alive=false;clearInterval(timer);};
 },[cardSale,foreground,client,refreshDoor,showDoorResult]);
 async function recordCash(tier,quantity){
  if(doorBusy)return;setDoorBusy(true);
  const body={action:'cash',eventId:selected,tier:tier.id,quantity,requestId:Crypto.randomUUID()};
  try{
   let sale;
   // Retrying with the same reference can never record the sale twice.
   for(let attempt=0;;attempt++){try{sale=await scannerApi(client,'/api/event-door',body);break;}catch(e){if(e.status||attempt>=2)throw e;}}
   showDoorResult(doorSaleResult('cash',sale));refreshDoor();
  }catch(e){showDoorResult({kind:'rejected',heading:'NOT RECORDED',detail:e.message||'The cash sale was not saved. Check your connection and try again.'});}
  finally{setDoorBusy(false);}
 }
 function sellCash(tier,quantity){
  const total=money(tier.priceCents*quantity,door?.currency);
  Alert.alert(door?.rehearsal?'Record practice sale?':`Take ${total} cash?`,`${quantity} × ${tier.name}. Collect the cash first, then confirm.`,[{text:'Cancel',style:'cancel'},{text:door?.rehearsal?'Record':'Cash received',onPress:()=>recordCash(tier,quantity)}]);
 }
 async function sellCard(tier,quantity){
  if(doorBusy)return;setDoorBusy(true);
  try{const sale=await scannerApi(client,'/api/event-door',{action:'card',eventId:selected,tier:tier.id,quantity,requestId:Crypto.randomUUID()});setCardSale({...sale,quantity,tierName:tier.name,eventId:selected});}
  catch(e){Alert.alert('Card sale not started',e.message||'Check your connection and try again.');}
  finally{setDoorBusy(false);}
 }
 function cancelCard(){
  const sale=cardSale;if(!sale)return;
  Alert.alert('Cancel this sale?','Only cancel if the customer has not paid.',[{text:'Keep waiting',style:'cancel'},{text:'Cancel sale',style:'destructive',onPress:async()=>{
   try{const r=await scannerApi(client,'/api/event-door',{action:'cancel',eventId:sale.eventId,orderId:sale.orderId});setCardSale(null);if(r.status==='paid'||r.status==='needs_attention')setTimeout(()=>showDoorResult(doorSaleResult('card',{...sale,...r})),350);}
   catch(e){Alert.alert('Could not cancel',e.message||'Try again.');}
  }}]);
 }
 async function adjustCount(delta){
  if(countBusy)return;setCountBusy(true);Haptics.selectionAsync().catch(()=>{});
  try{const d=await scannerApi(client,'/api/event-door',{action:'count',eventId:selected,delta});setDoor(d);setDoorAt(Date.now());setDoorError('');}
  catch(e){Alert.alert('Count not changed',e.message||'Check your connection.');}
  finally{setCountBusy(false);}
 }
 const myEvent=events.find(e=>e.id===selected);
 const ready=!!myEvent&&(!loadingEvents||offlineStatus?.active||hubConnection)&&!working&&!startupError&&!loading;
 const doorMode=!!user?.email_confirmed_at&&!loading&&!startupError&&!!myEvent&&(!loadingEvents||!!offlineStatus?.active||!!hubConnection)&&!setupOpen;
 const cameraActive=foreground&&doorMode&&tab==='scan'&&!manualOpen&&!hubPairing&&!cardSale;
 const scanMode=hubConnection?(hubHealth?.ready?'Local hub · no internet needed':'Hub lost · check the Wi-Fi'):offlineStatus?.active?`Offline lane ${offlineStatus.lane}${offlineStatus.pending?` · ${offlineStatus.pending} to sync`:''}`:'Live check';
 const offlineExpired=offlineStatus?.active&&Date.now()+offlineStatus.offset>=Date.parse(offlineStatus.expiresAt);
 const statusLabel=hubConnection?(hubHealth?.ready?'HUB READY':'HUB LOST'):!ready?'SIGN IN':offlineExpired?'RECONNECT':offlineStatus?.active?`LANE ${offlineStatus.lane}`:manualOpen?'MANUAL':!cameraActive?'PAUSED':permission?.granted?'READY':'CAMERA OFF';
 return <SafeAreaView style={s.root}><StatusBar barStyle="light-content" backgroundColor="#000"/><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':undefined}>
  {doorMode?<View style={s.doorBar}>
   <Pressable onPress={()=>setSetupOpen(true)} style={s.flex} accessibilityRole="button" accessibilityLabel={'Event settings for '+myEvent.title}><Text style={s.kicker}>{statusLabel}</Text><Text numberOfLines={1} style={s.doorTitle}>{myEvent.title}</Text></Pressable>
   <Pressable onPress={()=>setTab('count')} style={s.livePill} accessibilityRole="button" accessibilityLabel={(door?door.inside:admissions)+' in. Open door count'}><Text style={s.liveNum}>{door?door.inside:admissions}</Text><Text style={s.liveLabel}>{door?'IN · LIVE':'IN · PHONE'}</Text></Pressable>
   <Pressable onPress={()=>setSetupOpen(true)} style={s.gear} accessibilityRole="button" accessibilityLabel="Event settings"><Text style={s.gearText}>⚙︎</Text></Pressable>
  </View>:<View style={s.header}>
   <View style={s.brandLockup}><Image source={require('./assets/brand-icon.png')} style={s.brandIcon} resizeMode="contain" accessibilityLabel="TicketBunker"/><View><Image source={require('./assets/wordmark.png')} style={s.wordmark} resizeMode="contain" accessibilityLabel="TicketBunker"/><Text style={s.subbrand}>SCANNER</Text></View></View>
   <View style={s.statusPill}><View style={[s.dot,{backgroundColor:statusLabel==='READY'?C.mint:C.muted}]}/><Text style={s.statusText}>{statusLabel}</Text></View>
  </View>}
  {loading||startupError?<View style={s.welcome}>
   <View style={s.startupMark}><Image source={require('./assets/brand-icon.png')} style={s.startupIcon} resizeMode="contain"/></View>
   <Text style={s.headline}>{startupError?'Let’s reconnect.':'Ready for the door.'}</Text>
   <Text style={s.bodyCenter}>{startupError||'Restoring your secure sign-in…'}</Text>
   {loading?<ActivityIndicator style={s.loader} color={C.mint}/>:<Button title="Retry connection" onPress={()=>setAttempt(n=>n+1)} style={s.wideButton}/>}
   <Footer/>
  </View>:!user?<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.loginContainer}>
   <View style={s.loginIntro}><Text style={s.kicker}>FOR EVENT ORGANISERS AND DOOR STAFF</Text><Text style={s.headline}>Let them in.</Text><Text style={s.body}>Sign in. Choose your event. Start scanning.</Text></View>
   <View style={s.loginCard}>
    <Text style={s.label}>Email address</Text><Input value={email} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="username" onChangeText={setEmail} placeholder="you@example.com"/>
    <Text style={s.label}>Password</Text><Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" placeholder="Your password" returnKeyType="go" onSubmitEditing={signIn}/>
    {!!message&&<Text accessibilityRole="alert" style={s.alert}>{message}</Text>}
    <Button title={busy?'Signing in…':'Sign in'} disabled={busy} onPress={signIn}/>
    <Pressable style={s.textAction} onPress={()=>Linking.openURL('https://theticketbunker.com/client')} accessibilityRole="link"><Text style={s.link}>Forgot password?</Text></Pressable>
   </View>
   <Text style={s.bodyCenter}>Sign in with your TicketBunker organiser account, or the email an organiser invited you with.</Text><Pressable style={s.textAction} onPress={()=>Linking.openURL('https://theticketbunker.com/organiser?signup=1')} accessibilityRole="link"><Text style={s.link}>New organiser? Create a free account</Text></Pressable><Footer/>
  </ScrollView>:!user.email_confirmed_at?<View style={s.welcome}><Text style={s.headline}>Check your inbox.</Text><Text style={s.bodyCenter}>Verify your email before scanning tickets.</Text><Button title="Sign out" disabled={busy} onPress={signOut}/></View>:
  doorMode?<View style={s.flex}>
   {tab==='scan'&&<View style={s.flex}>
    {permission?.granted?<View style={s.scanStage}><CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch&&cameraActive} active={cameraActive} barcodeScannerSettings={QR_SETTINGS} onBarcodeScanned={cameraActive&&!feedbackOpen&&!working?onBarcodeScanned:undefined}/><View pointerEvents="none" style={s.scanOverlay}><View style={s.target}><View style={[s.corner,s.topLeft]}/><View style={[s.corner,s.topRight]}/><View style={[s.corner,s.bottomLeft]}/><View style={[s.corner,s.bottomRight]}/></View><Text style={s.scanHint}>{manualOpen?'Camera paused for manual entry':'Hold the QR code inside the frame'}</Text></View>
     <View pointerEvents="none" style={s.scanChips}><Text style={s.chip}>{scanMode} · Check ID where required</Text>{!!syncMessage&&<Text style={s.chip}>{syncMessage}</Text>}</View>
    </View>:
    <View style={[s.flex,s.cameraMissing]}>
     <CameraPermissionPrompt permission={permission} requestPermission={requestPermission} purpose="The camera reads ticket QR codes at the door." manualOption="use Enter manually below"/>
    </View>}
    {!!message&&<Text accessibilityRole="alert" style={[s.alert,s.floating]}>{message}</Text>}
    {manualOpen&&<View style={[s.panel,s.manualSheet]}><Text style={s.label}>Ticket link</Text><Input autoCapitalize="none" autoCorrect={false} value={manual} onChangeText={setManual} placeholder="Paste ticket URL"/><Button title={working?'Checking…':'Check ticket'} disabled={working||!manual.trim()} onPress={()=>handleScan(manual.trim(),'manual')}/></View>}
    <View style={s.scanControls}><Button title={torch?'Torch on':'Torch off'} variant="secondary" onPress={()=>setTorch(x=>!x)} disabled={!permission?.granted} style={s.flex}/><Button title={manualOpen?'Close entry':'Enter manually'} variant="secondary" onPress={()=>setManualOpen(x=>!x)} style={s.flex}/></View>
   </View>}
   {tab==='sell'&&<DoorSale door={door} error={doorError} busy={doorBusy||!!cardSale} onCash={sellCash} onCard={sellCard}/>}
   {tab==='count'&&<DoorCount door={door} error={doorError} updatedAt={doorAt} admissions={admissions} busy={countBusy} onAdjust={adjustCount}/>}
   <View style={s.tabs} accessibilityRole="tablist">{TABS.map(([id,label])=><Pressable key={id} onPress={()=>{setTab(id);setManualOpen(false);}} accessibilityRole="tab" accessibilityState={{selected:tab===id}} style={[s.tab,tab===id&&s.tabOn]}><Text style={[s.tabLabel,tab===id&&s.tabTextOn]}>{label}</Text></Pressable>)}</View>
  </View>:
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.container}>
   {!!myEvent&&(!loadingEvents||offlineStatus?.active||hubConnection)&&<Button title="Back to the door" onPress={()=>{setSetupOpen(false);setToolsOpen(false);}}/>}
   <View style={s.panel}>
    <Text style={s.panelHeading}>Local check-in hub</Text>
    <Text style={s.small}>{hubConnection?(hubHealth?.ready?'Connected · shared duplicate checks active':hubHealth?.error||'Connecting to your local hub…'):'Scan any ticket at any door over your event Wi-Fi, even without internet.'}</Text>
    {hubConnection?<Button title="Disconnect this phone from hub" variant="secondary" disabled={working} onPress={leaveHub}/>:<Button title={hubPairing?'Cancel pairing':'Connect to local hub'} variant="secondary" disabled={working} onPress={()=>setHubPairing(x=>!x)}/>}
    {hubPairing&&<>
     <Text style={s.small}>Join the hub’s Wi-Fi. Ask the organiser to show your private pairing QR.</Text>
     {permission?.granted?<CameraView style={{height:230}} facing="back" barcodeScannerSettings={QR_SETTINGS} onBarcodeScanned={!working?({data})=>joinHub(data):undefined}/>:
      <CameraPermissionPrompt permission={permission} requestPermission={requestPermission} purpose="The camera reads the hub’s pairing QR code." manualOption="paste the hub pairing link below"/>}
     <Input value={hubLink} onChangeText={setHubLink} autoCapitalize="none" autoCorrect={false} placeholder="Or paste hub pairing link"/>
     <Button title={working?'Connecting…':'Pair with hub'} disabled={working||!hubLink.trim()} onPress={()=>joinHub(hubLink.trim())}/>
    </>}
   </View>
   <View style={s.eventCard}>
    <View style={s.line}><View style={s.flex}><Text style={s.kicker}>YOUR EVENT</Text><Text numberOfLines={2} accessibilityLabel={myEvent?.title} style={s.eventTitle}>{loadingEvents&&!hubConnection&&!offlineStatus?.active?'Loading your events…':myEvent?.title||'Choose your event'}</Text>{!!myEvent?.venue&&<Text numberOfLines={1} style={s.small}>{myEvent.venue}</Text>}</View>
     {myEvent&&<View style={s.countBox}><Text style={s.counter}>{admissions}</Text><Text style={s.countLabel}>ADMITTED</Text></View>}
    </View>
    <Pressable disabled={working} onPress={()=>setToolsOpen(x=>!x)} style={s.eventSettings} accessibilityRole="button" accessibilityState={{expanded:toolsOpen}}><Text style={s.link}>{toolsOpen?'Close event settings':'Change event / crew settings'}</Text><Text style={s.link}>{toolsOpen?'−':'+'}</Text></Pressable>
   </View>
   {toolsOpen&&<View style={s.panel}>
    <View style={s.line}><Text style={[s.small,s.flex]}>{user.email}</Text><Pressable onPress={signOut} disabled={busy||working} accessibilityRole="button" style={s.signOut}><Text style={s.link}>Sign out</Text></Pressable></View>
    <Button title={loadingEvents?'Refreshing…':'Refresh events'} variant="secondary" disabled={working||loadingEvents} onPress={refresh}/>
    {events.map(e=><Pressable key={e.id} disabled={working} onPress={()=>{setSelected(e.id);setResult(null);setAdmissions(0);last.current={code:'',at:0};setToolsOpen(false);setSetupOpen(false);setTab('scan');}} accessibilityRole="radio" accessibilityState={{checked:e.id===selected}} style={[s.event,e.id===selected&&s.eventSelected]}><Text style={[s.eventName,s.flex]}>{e.title}</Text>{e.id===selected&&<Text style={s.link}>✓</Text>}</Pressable>)}
    <Text style={s.label}>Have a crew invitation?</Text><Input autoCapitalize="none" autoCorrect={false} value={invite} onChangeText={setInvite} placeholder="Paste invitation link"/><Button title={working?'Accepting…':'Accept invitation'} disabled={working||!invite.trim()} onPress={acceptInvite}/>
   </View>}
   {!!message&&<Text accessibilityRole="alert" style={s.alert}>{message}</Text>}
   {loadingEvents&&!offlineStatus?.active&&!hubConnection&&<View style={s.empty}><ActivityIndicator color={C.mint}/><Text style={s.bodyCenter}>Checking your assigned events…</Text></View>}
   {!loadingEvents&&!myEvent&&<View style={s.empty}><Text style={s.panelHeading}>{message?'Couldn’t load events':'No event open yet'}</Text><Text style={s.bodyCenter}>{message?'Check your connection and try again.':'Accept your crew invitation in event settings. Your event appears when check-in opens.'}</Text><Button title="Try again" variant="secondary" onPress={refresh}/></View>}
   {myEvent&&(!loadingEvents||offlineStatus?.active||hubConnection)&&<>
    {!hubConnection&&<View style={s.panel}>
     <Text style={s.panelHeading}>{offlineStatus?.active?`Offline lane ${offlineStatus.lane} of ${offlineStatus.laneCount}`:offlineStatus?'Finish syncing':'Offline entry'}</Text>
     <Text style={s.small}>{offlineStatus?`${offlineStatus.pending}${offlineStatus.pending===200?'+':''} saved scans waiting · ${offlineStatus.ticketCount} downloaded tickets. Permit ends ${new Date(offlineStatus.expiresAt).toLocaleTimeString()}.`:'Choose the total number of offline scanners. Use the same number on every phone. Each ticket belongs to one numbered lane.'}</Text>
     {!!syncMessage&&<Text accessibilityRole="alert" style={s.small}>{syncMessage}</Text>}
     {syncMessage.startsWith('Sign in')&&<><Text style={s.label}>Reconnect {user.email}</Text><Input value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password"/><Button title={busy?'Signing in…':'Reconnect account'} disabled={busy} onPress={signIn}/></>}
     {offlineStatus?<><Text style={s.small}>Show your lane number at the door. Tickets for another lane must go to its scanner. New sales, refunds and access changes need a refresh.</Text><Button title={working?'Please wait…':'Sync and finish offline mode'} variant="secondary" disabled={working} onPress={finishOffline}/>{offlineStatus.active&&<Button title="Sync and refresh download" variant="secondary" disabled={working} onPress={prepareOffline}/>}</>:<><Text style={s.label}>Total offline scanners (1–16)</Text><Input value={laneCount} onChangeText={setLaneCount} keyboardType="number-pad" maxLength={2}/><Button title={working?'Downloading…':'Prepare this phone for offline entry'} disabled={working} onPress={prepareOffline}/></>}
    </View>}
   </>}
   <Footer/>
  </ScrollView>}
 </KeyboardAvoidingView>
 <Modal visible={feedbackOpen} animationType="none" statusBarTranslucent onRequestClose={dismissFeedback}>
  <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[s.feedback,{backgroundColor:!result?C.bg:result.kind==='approved'?'#20deb0':result.kind==='warning'?'#ffd17b':'#ef3856'}]}>
   {!result?<ActivityIndicator size="large" color={C.mint}/>:<Text style={[s.feedbackIcon,{color:result.kind==='rejected'?'#fff':'#062a23'}]}>{result.kind==='approved'?'✓':result.kind==='warning'?'!':'×'}</Text>}
   <Text style={[s.feedbackHeading,{color:!result||result.kind==='rejected'?'#fff':'#062a23'}]}>{result?.heading||'Checking ticket…'}</Text>
   <Text style={[s.feedbackDetail,{color:!result||result.kind==='rejected'?'#fff':'#062a23'}]}>{result?.detail||(hubConnection?'Confirming with your local hub':offlineStatus?.active?'Saving and checking on this phone':'Waiting for live confirmation')}</Text>
   {result&&<Pressable accessibilityRole="button" onPress={dismissFeedback} style={s.feedbackNext}><Text style={s.feedbackNextText}>{tab==='scan'?'Scan next ticket':'Done'}</Text></Pressable>}
  </View>
 </Modal>
 <Modal visible={!!cardSale} animationType="slide" onRequestClose={cancelCard}>
  {!!cardSale&&<SafeAreaView style={s.root}><ScrollView contentContainerStyle={s.payPage}>
   <Text style={s.kicker}>CARD PAYMENT</Text>
   <Text style={s.payAmount}>{money(cardSale.totalCents,cardSale.currency)}</Text>
   <Text style={s.body}>{cardSale.quantity} × {cardSale.tierName}</Text>
   <QrCode value={cardSale.url}/>
   <Text style={s.bodyCenter}>Customer scans this with their phone camera and pays by Apple Pay, Google Pay or card.</Text>
   <View style={s.line}><ActivityIndicator color={C.mint}/><Text style={[s.small,s.flex]}>Waiting for payment. This screen turns green when it’s paid.</Text></View>
   <Button title="Customer pays on this phone" variant="secondary" onPress={()=>Linking.openURL(cardSale.url)}/>
   <Button title="Cancel sale" variant="secondary" onPress={cancelCard}/>
  </ScrollView></SafeAreaView>}
 </Modal></SafeAreaView>;
}
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:C.bg},flex:{flex:1},
 header:{backgroundColor:'#000',paddingHorizontal:18,paddingVertical:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:C.edge,gap:12},
 brandLockup:{flexDirection:'row',alignItems:'center',gap:10,flexShrink:1},brandIcon:{width:34,height:34},wordmark:{width:164,height:19},subbrand:{color:C.muted,fontSize:9,letterSpacing:3.2,marginTop:6,fontWeight:'600'},
 statusPill:{flexDirection:'row',alignItems:'center',gap:5,flexShrink:0},dot:{width:5,height:5,borderRadius:3},statusText:{fontSize:8,fontWeight:'700',letterSpacing:.6,color:C.muted},
 welcome:{flex:1,justifyContent:'center',alignItems:'center',padding:28,gap:16},startupMark:{width:86,height:86,borderRadius:24,backgroundColor:'#000',alignItems:'center',justifyContent:'center',marginBottom:12,borderWidth:1,borderColor:C.edge},startupIcon:{width:54,height:54},loader:{marginTop:12},wideButton:{alignSelf:'stretch'},
 container:{padding:18,paddingBottom:24,gap:14,width:'100%',maxWidth:580,alignSelf:'center'},loginContainer:{padding:24,paddingTop:42,gap:24,flexGrow:1,width:'100%',maxWidth:500,alignSelf:'center'},loginIntro:{gap:12},loginCard:{backgroundColor:C.panel,padding:20,borderWidth:1,borderColor:C.edge,borderRadius:22,gap:12},
 kicker:{color:C.mint,fontSize:10,letterSpacing:1.8,fontWeight:'800'},headline:{color:C.text,fontSize:34,fontWeight:'800',letterSpacing:-1.2},body:{color:C.muted,fontSize:15,lineHeight:23},bodyCenter:{color:C.muted,fontSize:14,lineHeight:22,textAlign:'center'},small:{color:C.muted,fontSize:12,lineHeight:18},label:{fontSize:12,color:C.text,fontWeight:'600',marginTop:4},
 input:{borderWidth:1,borderColor:C.edge,borderRadius:12,color:C.text,paddingHorizontal:15,paddingVertical:14,fontSize:16,backgroundColor:C.bg,minHeight:52},
 button:{minHeight:52,backgroundColor:C.mint,paddingVertical:15,paddingHorizontal:14,borderRadius:13,alignItems:'center',justifyContent:'center'},buttonText:{fontWeight:'700',color:'#042a20',fontSize:15},secondary:{backgroundColor:C.panel2,borderWidth:1,borderColor:C.edge},secondaryText:{color:C.text},disabled:{opacity:.4},pressed:{opacity:.75},
 textAction:{alignItems:'center',padding:12},link:{color:C.mint,fontWeight:'600',fontSize:13},alert:{backgroundColor:'#351d25',padding:14,borderRadius:12,color:C.red,fontSize:14,lineHeight:21},
 footer:{alignItems:'center',gap:8,marginTop:14,paddingTop:20,paddingBottom:8},powered:{fontSize:8,fontWeight:'600',letterSpacing:1.7,color:C.muted},partnerLogo:{width:122,height:20,opacity:.8},privacy:{padding:10,minHeight:40,justifyContent:'center'},
 eventCard:{borderRadius:18,borderWidth:1,borderColor:C.edge,backgroundColor:C.panel,padding:17,gap:12},line:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:14},eventTitle:{fontSize:20,lineHeight:25,fontWeight:'700',color:C.text,marginTop:6,marginBottom:4},countBox:{minWidth:58,alignItems:'center'},counter:{fontSize:31,fontWeight:'700',color:C.mint},countLabel:{fontSize:8,color:C.muted,letterSpacing:.8,marginTop:2},eventSettings:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingTop:12,borderTopWidth:1,borderTopColor:C.edge,minHeight:40},
 panel:{backgroundColor:C.panel,borderWidth:1,borderColor:C.edge,borderRadius:18,padding:16,gap:12},panelHeading:{fontWeight:'700',color:C.text,fontSize:16},signOut:{minHeight:44,justifyContent:'center'},event:{flexDirection:'row',alignItems:'center',padding:14,borderRadius:12,backgroundColor:C.panel2,borderWidth:1,borderColor:'transparent',minHeight:48},eventSelected:{borderColor:C.mint},eventName:{color:C.text,fontSize:14,fontWeight:'600'},empty:{padding:24,gap:20,backgroundColor:C.panel,borderRadius:18,alignItems:'stretch'},
 scanHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:4},cameraFrame:{overflow:'hidden',borderRadius:24,width:'100%',aspectRatio:1,borderWidth:1,borderColor:C.edge,backgroundColor:'#000'},camera:{width:'100%',height:'100%'},scanOverlay:{position:'absolute',top:0,left:0,right:0,bottom:0,alignItems:'center',justifyContent:'center'},target:{width:'68%',aspectRatio:1},corner:{position:'absolute',width:32,height:32,borderColor:C.mint},topLeft:{top:0,left:0,borderTopWidth:3,borderLeftWidth:3,borderTopLeftRadius:14},topRight:{top:0,right:0,borderTopWidth:3,borderRightWidth:3,borderTopRightRadius:14},bottomLeft:{bottom:0,left:0,borderBottomWidth:3,borderLeftWidth:3,borderBottomLeftRadius:14},bottomRight:{bottom:0,right:0,borderBottomWidth:3,borderRightWidth:3,borderBottomRightRadius:14},scanHint:{position:'absolute',bottom:18,color:'#fff',fontSize:12,fontWeight:'500',backgroundColor:'#000b',paddingVertical:8,paddingHorizontal:14,borderRadius:16,overflow:'hidden'},cameraMissing:{padding:28,gap:16,backgroundColor:C.panel,borderRadius:22,alignItems:'stretch'},controls:{flexDirection:'row',gap:12},scanFoot:{color:C.muted,fontSize:10,textAlign:'center',lineHeight:16},
 result:{borderRadius:14,borderLeftWidth:3,padding:15,gap:6,backgroundColor:C.panel},resultHeading:{fontSize:13,fontWeight:'800',letterSpacing:.3},resultDetail:{color:C.text,fontSize:13,lineHeight:19},
 doorBar:{backgroundColor:'#000',paddingHorizontal:16,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:C.edge},doorTitle:{color:C.text,fontSize:16,fontWeight:'700',marginTop:3},livePill:{minWidth:72,alignItems:'center',paddingVertical:6,paddingHorizontal:10,borderRadius:12,backgroundColor:C.panel2,borderWidth:1,borderColor:C.edge},liveNum:{color:C.mint,fontSize:22,fontWeight:'800'},liveLabel:{color:C.muted,fontSize:8,fontWeight:'700',letterSpacing:.8},gear:{width:44,height:44,alignItems:'center',justifyContent:'center'},gearText:{color:C.text,fontSize:22},
 scanStage:{flex:1,backgroundColor:'#000',overflow:'hidden'},scanChips:{position:'absolute',top:12,left:12,right:12,alignItems:'center',gap:6},chip:{color:'#fff',fontSize:12,fontWeight:'600',backgroundColor:'#000b',paddingVertical:7,paddingHorizontal:12,borderRadius:14,overflow:'hidden',textAlign:'center'},floating:{position:'absolute',top:56,left:16,right:16},manualSheet:{position:'absolute',left:12,right:12,bottom:84},scanControls:{position:'absolute',left:12,right:12,bottom:12,flexDirection:'row',gap:12},
 tabs:{flexDirection:'row',backgroundColor:'#000',borderTopWidth:1,borderTopColor:C.edge,paddingBottom:Platform.OS==='android'?6:0},tab:{flex:1,alignItems:'center',justifyContent:'center',minHeight:58,borderTopWidth:3,borderTopColor:'transparent'},tabOn:{borderTopColor:C.mint},tabLabel:{color:C.muted,fontSize:14,fontWeight:'700'},tabTextOn:{color:C.mint},
 doorPage:{padding:18,gap:14,width:'100%',maxWidth:580,alignSelf:'center'},doorNotice:{flex:1,justifyContent:'center',margin:18},countHero:{alignItems:'center',paddingVertical:22,gap:6,backgroundColor:C.panel,borderRadius:22,borderWidth:1,borderColor:C.edge},countHuge:{color:C.text,fontSize:96,lineHeight:104,fontWeight:'800',letterSpacing:-3},bar:{alignSelf:'stretch',height:8,borderRadius:4,backgroundColor:C.panel2,marginHorizontal:24,overflow:'hidden'},barFill:{height:8,borderRadius:4},clicker:{minHeight:76},statRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',minHeight:30},statValue:{color:C.text,fontSize:15,fontWeight:'700'},
 price:{color:C.mint,fontSize:16,fontWeight:'800'},stepper:{flexDirection:'row',alignItems:'center',gap:16},stepButton:{width:52,height:52,borderRadius:14,backgroundColor:C.panel2,borderWidth:1,borderColor:C.edge,alignItems:'center',justifyContent:'center'},stepText:{color:C.text,fontSize:26,fontWeight:'700'},stepValue:{color:C.text,fontSize:28,fontWeight:'800',minWidth:34,textAlign:'center'},totalRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:12,borderTopWidth:1,borderTopColor:C.edge},totalValue:{color:C.text,fontSize:30,fontWeight:'800'},
 payPage:{padding:24,gap:16,alignItems:'stretch',width:'100%',maxWidth:520,alignSelf:'center'},payAmount:{color:C.text,fontSize:48,fontWeight:'800',letterSpacing:-1.5},qr:{backgroundColor:'#fff',borderRadius:18,alignSelf:'center',marginVertical:6},
 feedback:{flex:1,justifyContent:'center',alignItems:'center',padding:28,gap:22},feedbackIcon:{fontSize:110,fontWeight:'600',lineHeight:120},feedbackHeading:{fontSize:40,lineHeight:45,fontWeight:'800',textAlign:'center',letterSpacing:-1},feedbackDetail:{fontSize:18,lineHeight:26,fontWeight:'500',textAlign:'center'},feedbackNext:{minHeight:54,padding:17,borderRadius:14,backgroundColor:'#ffffffed',marginTop:16},feedbackNextText:{fontSize:16,fontWeight:'700',color:'#10231e'}
});

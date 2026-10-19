import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Image,KeyboardAvoidingView,Linking,Modal,Platform,Pressable,SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import {CameraView,useCameraPermissions} from 'expo-camera';
import * as Haptics from 'expo-haptics';
import {createScannerClient,restoreSession,scannerApi} from './lib/backend';
import {withDeadline} from './lib/request';
import {admissionResult,inviteToken,ticketUrl} from './lib/scanLogic';
import {offline,deviceKey} from './lib/offlineStore';
import {createOfflineSync} from './lib/offlineSync';
import {secureSessionStorage} from './lib/secureStorage';

const C={bg:'#080d10',panel:'#121c20',panel2:'#19272c',edge:'#293a3e',text:'#f3f7f6',muted:'#99adb0',mint:'#20deb0',amber:'#ffd17b',red:'#ff8e9e'};
const QR_SETTINGS={barcodeTypes:['qr']};
const Button=({title,onPress,variant='primary',disabled=false,style})=><Pressable disabled={disabled} onPress={onPress} style={({pressed})=>[s.button,variant==='secondary'&&s.secondary,disabled&&s.disabled,pressed&&s.pressed,style]} accessibilityRole="button" accessibilityState={{disabled}}><Text style={[s.buttonText,variant==='secondary'&&s.secondaryText]}>{title}</Text></Pressable>;
const Input=(props)=><TextInput placeholderTextColor="#71868b" style={s.input} {...props}/>;
const Footer=()=> <View style={s.footer}><Text style={s.powered}>POWERED BY</Text><Image source={require('./assets/soundbunker-wordmark.png')} style={s.partnerLogo} resizeMode="contain" accessibilityLabel="SoundBunker Algarve"/><Pressable onPress={()=>Linking.openURL('https://theticketbunker.com/terms#privacy')} accessibilityRole="link" style={s.privacy}><Text style={s.small}>Privacy</Text></Pressable></View>;

export default function App(){
 const [client]=useState(createScannerClient);
 const [user,setUser]=useState(null);
 const [offlineStatus,setOfflineStatus]=useState(null);
 const [syncMessage,setSyncMessage]=useState('');
 const [laneCount,setLaneCount]=useState('1');
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
 const [permission,requestPermission]=useCameraPermissions();
 const [admissions,setAdmissions]=useState(0);
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
  const sub=AppState.addEventListener('change',next=>setForeground(next==='active'));
  return()=>{sub.remove();clearTimeout(feedbackTimer.current);client.auth.stopAutoRefresh();};
 },[client]);
 useEffect(()=>{
  if(foreground&&!loading&&!startupError)client.auth.startAutoRefresh();
  else client.auth.stopAutoRefresh();
 },[client,foreground,loading,startupError]);

 const refresh=useCallback(async()=>{
  const version=++refreshVersion.current;
  setLoadingEvents(true);setMessage('');
  try{
   const response=await scannerApi(client,'/api/event-staff?mode=my');
   if(version!==refreshVersion.current)return;
   const cached=await offline.cachedEvents(user.id);
   const live=Array.isArray(response.events)?response.events:[];
   const next=[...live,...cached.filter(e=>!live.some(v=>v.id===e.id))];
   if(version!==refreshVersion.current)return;
   setEvents(next);setSelected(old=>next.some(e=>e.id===old)?old:(next[0]?.id||''));
  }catch(e){
   if(version!==refreshVersion.current)return;
   const cached=await offline.cachedEvents(user.id);
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
  offline.cachedEvents(user.id).then(cached=>{if(alive&&cached.length){setEvents(old=>old.length?old:cached);setSelected(old=>old||cached[0].id);}}).catch(()=>{});
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
   const {error}=await withDeadline(()=>client.auth.signOut({scope:'local'}),10000);
   if(error)throw error;
   refreshVersion.current++;setUser(null);setEvents([]);setSelected('');setResult(null);setAdmissions(0);setPassword('');setMessage('');setToolsOpen(false);
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
   const response=saved?.active
    ?await offline.admit(user.id,eventId.current,parsed.searchParams.get('id'),parsed.searchParams.get('sig'))
    :await scannerApi(client,'/api/event-scan',{code,eventId:eventId.current});
   if(saved)refreshOffline().catch(()=>{});
   next=admissionResult(response);setResult(next);
   if(response.status==='valid')setAdmissions(n=>n+1);
   const tone=next.kind==='approved'?Haptics.NotificationFeedbackType.Success:next.kind==='warning'?Haptics.NotificationFeedbackType.Warning:Haptics.NotificationFeedbackType.Error;
   Haptics.notificationAsync(tone).catch(()=>{});
  }catch(e){
   next={kind:'rejected',heading:'NOT VERIFIED',detail:e.message||'Could not verify ticket. Check your connection and scan again.'};setResult(next);
   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(()=>{});
  }finally{
   setManual('');setWorking(false);lock.current=false;
   if(next?.kind==='approved')feedbackTimer.current=setTimeout(dismissFeedback,900);
  }
 },[client,dismissFeedback,user?.id,refreshOffline]);
 const onBarcodeScanned=useCallback(({data})=>handleScan(data),[handleScan]);
 const myEvent=events.find(e=>e.id===selected);
 const ready=!!myEvent&&(!loadingEvents||offlineStatus?.active)&&!working&&!startupError&&!loading;
 const cameraActive=foreground&&!toolsOpen&&!manualOpen;
 const offlineExpired=offlineStatus?.active&&Date.now()+offlineStatus.offset>=Date.parse(offlineStatus.expiresAt);
 const statusLabel=!ready?'DOOR CREW':offlineExpired?'RECONNECT':offlineStatus?.active?`LANE ${offlineStatus.lane}`:manualOpen?'MANUAL':!cameraActive?'PAUSED':permission?.granted?'READY':'CAMERA OFF';
 const resultColor=result?.kind==='approved'?C.mint:result?.kind==='warning'?C.amber:C.red;
 return <SafeAreaView style={s.root}><StatusBar barStyle="light-content" backgroundColor="#000"/><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':undefined}>
  <View style={s.header}>
   <View style={s.brandLockup}><Image source={require('./assets/brand-icon.png')} style={s.brandIcon} resizeMode="contain" accessibilityLabel="TicketBunker"/><View><Image source={require('./assets/wordmark.png')} style={s.wordmark} resizeMode="contain" accessibilityLabel="TicketBunker"/><Text style={s.subbrand}>SCANNER</Text></View></View>
   <View style={s.statusPill}><View style={[s.dot,{backgroundColor:statusLabel==='READY'?C.mint:C.muted}]}/><Text style={s.statusText}>{statusLabel}</Text></View>
  </View>
  {loading||startupError?<View style={s.welcome}>
   <View style={s.startupMark}><Image source={require('./assets/brand-icon.png')} style={s.startupIcon} resizeMode="contain"/></View>
   <Text style={s.headline}>{startupError?'Let’s reconnect.':'Ready for the door.'}</Text>
   <Text style={s.bodyCenter}>{startupError||'Restoring your secure sign-in…'}</Text>
   {loading?<ActivityIndicator style={s.loader} color={C.mint}/>:<Button title="Retry connection" onPress={()=>setAttempt(n=>n+1)} style={s.wideButton}/>}
   <Footer/>
  </View>:!user?<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.loginContainer}>
   <View style={s.loginIntro}><Text style={s.kicker}>WELCOME, DOOR CREW</Text><Text style={s.headline}>Let them in.</Text><Text style={s.body}>Sign in. Choose your event. Start scanning.</Text></View>
   <View style={s.loginCard}>
    <Text style={s.label}>Email address</Text><Input value={email} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="username" onChangeText={setEmail} placeholder="you@example.com"/>
    <Text style={s.label}>Password</Text><Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" placeholder="Your password" returnKeyType="go" onSubmitEditing={signIn}/>
    {!!message&&<Text accessibilityRole="alert" style={s.alert}>{message}</Text>}
    <Button title={busy?'Signing in…':'Sign in'} disabled={busy} onPress={signIn}/>
    <Pressable style={s.textAction} onPress={()=>Linking.openURL('https://theticketbunker.com/client')} accessibilityRole="link"><Text style={s.link}>Forgot password?</Text></Pressable>
   </View>
   <Text style={s.bodyCenter}>Use the email your organiser invited.</Text><Footer/>
  </ScrollView>:!user.email_confirmed_at?<View style={s.welcome}><Text style={s.headline}>Check your inbox.</Text><Text style={s.bodyCenter}>Verify your email before scanning tickets.</Text><Button title="Sign out" disabled={busy} onPress={signOut}/></View>:
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.container}>
   <View style={s.eventCard}>
    <View style={s.line}><View style={s.flex}><Text style={s.kicker}>YOUR EVENT</Text><Text numberOfLines={2} accessibilityLabel={myEvent?.title} style={s.eventTitle}>{loadingEvents?'Loading your events…':myEvent?.title||'Choose your event'}</Text>{!!myEvent?.venue&&<Text numberOfLines={1} style={s.small}>{myEvent.venue}</Text>}</View>
     {myEvent&&<View style={s.countBox}><Text style={s.counter}>{admissions}</Text><Text style={s.countLabel}>ADMITTED</Text></View>}
    </View>
    <Pressable disabled={working} onPress={()=>setToolsOpen(x=>!x)} style={s.eventSettings} accessibilityRole="button" accessibilityState={{expanded:toolsOpen}}><Text style={s.link}>{toolsOpen?'Close event settings':'Change event / crew settings'}</Text><Text style={s.link}>{toolsOpen?'−':'+'}</Text></Pressable>
   </View>
   {toolsOpen&&<View style={s.panel}>
    <View style={s.line}><Text style={[s.small,s.flex]}>{user.email}</Text><Pressable onPress={signOut} disabled={busy||working} accessibilityRole="button" style={s.signOut}><Text style={s.link}>Sign out</Text></Pressable></View>
    <Button title={loadingEvents?'Refreshing…':'Refresh events'} variant="secondary" disabled={working||loadingEvents} onPress={refresh}/>
    {events.map(e=><Pressable key={e.id} disabled={working} onPress={()=>{setSelected(e.id);setResult(null);setAdmissions(0);last.current={code:'',at:0};setToolsOpen(false);}} accessibilityRole="radio" accessibilityState={{checked:e.id===selected}} style={[s.event,e.id===selected&&s.eventSelected]}><Text style={[s.eventName,s.flex]}>{e.title}</Text>{e.id===selected&&<Text style={s.link}>✓</Text>}</Pressable>)}
    <Text style={s.label}>Have a crew invitation?</Text><Input autoCapitalize="none" autoCorrect={false} value={invite} onChangeText={setInvite} placeholder="Paste invitation link"/><Button title={working?'Accepting…':'Accept invitation'} disabled={working||!invite.trim()} onPress={acceptInvite}/>
   </View>}
   {!!message&&<Text accessibilityRole="alert" style={s.alert}>{message}</Text>}
   {loadingEvents&&!offlineStatus?.active&&<View style={s.empty}><ActivityIndicator color={C.mint}/><Text style={s.bodyCenter}>Checking your assigned events…</Text></View>}
   {!loadingEvents&&!myEvent&&<View style={s.empty}><Text style={s.panelHeading}>{message?'Couldn’t load events':'No event open yet'}</Text><Text style={s.bodyCenter}>{message?'Check your connection and try again.':'Accept your crew invitation in event settings. Your event appears when check-in opens.'}</Text><Button title="Try again" variant="secondary" onPress={refresh}/></View>}
   {myEvent&&(!loadingEvents||offlineStatus?.active)&&<>
    <View style={s.panel}>
     <Text style={s.panelHeading}>{offlineStatus?.active?`Offline lane ${offlineStatus.lane} of ${offlineStatus.laneCount}`:offlineStatus?'Finish syncing':'Offline entry'}</Text>
     <Text style={s.small}>{offlineStatus?`${offlineStatus.pending}${offlineStatus.pending===200?'+':''} saved scans waiting · ${offlineStatus.ticketCount} downloaded tickets. Permit ends ${new Date(offlineStatus.expiresAt).toLocaleTimeString()}.`:'Choose the total number of offline scanners. Use the same number on every phone. Each ticket belongs to one numbered lane.'}</Text>
     {!!syncMessage&&<Text accessibilityRole="alert" style={s.small}>{syncMessage}</Text>}
     {syncMessage.startsWith('Sign in')&&<><Text style={s.label}>Reconnect {user.email}</Text><Input value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password"/><Button title={busy?'Signing in…':'Reconnect account'} disabled={busy} onPress={signIn}/></>}
     {offlineStatus?<><Text style={s.small}>Show your lane number at the door. Tickets for another lane must go to its scanner. New sales, refunds and access changes need a refresh.</Text><Button title={working?'Please wait…':'Sync and finish offline mode'} variant="secondary" disabled={working} onPress={finishOffline}/>{offlineStatus.active&&<Button title="Sync and refresh download" variant="secondary" disabled={working} onPress={prepareOffline}/>}</>:<><Text style={s.label}>Total offline scanners (1–16)</Text><Input value={laneCount} onChangeText={setLaneCount} keyboardType="number-pad" maxLength={2}/><Button title={working?'Downloading…':'Prepare this phone for offline entry'} disabled={working} onPress={prepareOffline}/></>}
    </View>
    <View style={s.scanHeading}><Text style={s.panelHeading}>Scan ticket</Text><Text style={s.small}>One ticket. One entry.</Text></View>
    {permission?.granted?<View style={s.cameraFrame}><CameraView style={s.camera} facing="back" enableTorch={torch&&cameraActive} active={cameraActive} barcodeScannerSettings={QR_SETTINGS} onBarcodeScanned={cameraActive&&!feedbackOpen?onBarcodeScanned:undefined}/><View pointerEvents="none" style={s.scanOverlay}><View style={s.target}><View style={[s.corner,s.topLeft]}/><View style={[s.corner,s.topRight]}/><View style={[s.corner,s.bottomLeft]}/><View style={[s.corner,s.bottomRight]}/></View><Text style={s.scanHint}>{manualOpen?'Camera paused for manual entry':toolsOpen?'Camera paused in settings':'Hold the QR code inside the frame'}</Text></View></View>:
    <View style={s.cameraMissing}><Text style={s.panelHeading}>Enable your camera</Text><Text style={s.bodyCenter}>Point your camera at a ticket QR code to check it in.</Text><Button title={permission?.canAskAgain===false?'Open camera settings':'Allow camera access'} onPress={()=>permission?.canAskAgain===false?Linking.openSettings():requestPermission()}/></View>}
    <View style={s.controls}><Button title={torch?'Torch on':'Torch off'} variant="secondary" onPress={()=>setTorch(x=>!x)} disabled={!permission?.granted} style={s.flex}/><Button title={manualOpen?'Close entry':'Enter manually'} variant="secondary" onPress={()=>setManualOpen(x=>!x)} style={s.flex}/></View>
    {manualOpen&&<View style={s.panel}><Text style={s.label}>Ticket link</Text><Input autoCapitalize="none" autoCorrect={false} value={manual} onChangeText={setManual} placeholder="Paste ticket URL"/><Button title={working?'Checking…':'Check ticket'} disabled={working||!manual.trim()} onPress={()=>handleScan(manual.trim(),'manual')}/></View>}
    {result&&<View accessibilityRole="alert" style={[s.result,{borderColor:resultColor}]}><Text style={[s.resultHeading,{color:resultColor}]}>{result.heading}</Text><Text style={s.resultDetail}>{result.detail}</Text></View>}
    <Text style={s.scanFoot}>{offlineStatus?.active?'Instant local verification · entries saved on this phone':'Live verification required'} · Check ID where required</Text>
   </>}
   <Footer/>
  </ScrollView>}
 </KeyboardAvoidingView>
 <Modal visible={feedbackOpen} animationType="none" statusBarTranslucent onRequestClose={dismissFeedback}>
  <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[s.feedback,{backgroundColor:!result?C.bg:result.kind==='approved'?'#20deb0':result.kind==='warning'?'#ffd17b':'#ef3856'}]}>
   {!result?<ActivityIndicator size="large" color={C.mint}/>:<Text style={[s.feedbackIcon,{color:result.kind==='rejected'?'#fff':'#062a23'}]}>{result.kind==='approved'?'✓':result.kind==='warning'?'!':'×'}</Text>}
   <Text style={[s.feedbackHeading,{color:!result||result.kind==='rejected'?'#fff':'#062a23'}]}>{result?.heading||'Checking ticket…'}</Text>
   <Text style={[s.feedbackDetail,{color:!result||result.kind==='rejected'?'#fff':'#062a23'}]}>{result?.detail||(offlineStatus?.active?'Saving and checking on this phone':'Waiting for live confirmation')}</Text>
   {result&&<Pressable accessibilityRole="button" onPress={dismissFeedback} style={s.feedbackNext}><Text style={s.feedbackNextText}>Scan next ticket</Text></Pressable>}
  </View>
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
 feedback:{flex:1,justifyContent:'center',alignItems:'center',padding:28,gap:22},feedbackIcon:{fontSize:110,fontWeight:'600',lineHeight:120},feedbackHeading:{fontSize:40,lineHeight:45,fontWeight:'800',textAlign:'center',letterSpacing:-1},feedbackDetail:{fontSize:18,lineHeight:26,fontWeight:'500',textAlign:'center'},feedbackNext:{minHeight:54,padding:17,borderRadius:14,backgroundColor:'#ffffffed',marginTop:16},feedbackNextText:{fontSize:16,fontWeight:'700',color:'#10231e'}
});

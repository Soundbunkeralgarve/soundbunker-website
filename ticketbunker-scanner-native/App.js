import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,KeyboardAvoidingView,Linking,Modal,Platform,Pressable,SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import {CameraView,useCameraPermissions} from 'expo-camera';
import * as Haptics from 'expo-haptics';
import {createScannerClient,scannerApi} from './lib/backend';
import {admissionResult,inviteToken,ticketUrl} from './lib/scanLogic';

const C={bg:'#130d1c',panel:'#241a31',panel2:'#30223d',edge:'#554365',text:'#f9f5ef',muted:'#c3b5cf',mint:'#33e4b2',amber:'#ffc971',red:'#ff8b9f'};
const Button=({title,onPress,variant='primary',disabled=false})=><Pressable disabled={disabled} onPress={onPress} style={[s.button,variant==='secondary'?s.secondary:null,disabled?s.disabled:null]} accessibilityRole="button"><Text style={[s.buttonText,variant==='secondary'?s.secondaryText:null]}>{title}</Text></Pressable>;
const Input=(props)=><TextInput placeholderTextColor="#9988ab" style={s.input} {...props}/>;

export default function App(){
 const [client,setClient]=useState(null);
 const [user,setUser]=useState(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [message,setMessage]=useState('');
 const [events,setEvents]=useState([]);
 const [selected,setSelected]=useState('');
 const [working,setWorking]=useState(false);
 const [result,setResult]=useState(null);
 const [feedbackOpen,setFeedbackOpen]=useState(false);
 const feedbackTimer=useRef(null);
 const [manual,setManual]=useState('');
 const [invite,setInvite]=useState('');
 const [torch,setTorch]=useState(false);
 const [foreground,setForeground]=useState(AppState.currentState==='active');
 const [permission,requestPermission]=useCameraPermissions();
 const [admissions,setAdmissions]=useState(0);
 const lock=useRef(false);
 const last=useRef({code:'',at:0});
 useEffect(()=>()=>clearTimeout(feedbackTimer.current),[]);
 const eventId=useRef('');
 eventId.current=selected;

 useEffect(()=>{
  let alive=true,authSub,appSub;
  (async()=>{
   try{
    const sb=await createScannerClient();
    if(!alive)return;
    setClient(sb);
    const listener=sb.auth.onAuthStateChange((_name,session)=>{if(alive)setUser(session?.user||null);});
    authSub=listener.data.subscription;
    const {data,error}=await sb.auth.getUser();
    if(!alive)return;
    if(error){setUser(null);}else setUser(data.user||null);
   }catch(e){if(alive)setMessage(e.message||'Unable to connect to ticket service.');}
   finally{if(alive)setLoading(false);}
  })();
  appSub=AppState.addEventListener('change',next=>setForeground(next==='active'));
  return()=>{alive=false;authSub?.unsubscribe();appSub?.remove();};
 },[]);

 useEffect(()=>{
  if(!client)return;
  if(foreground)client.auth.startAutoRefresh();
  else client.auth.stopAutoRefresh();
 },[client,foreground]);

 const refresh=useCallback(async(sb=client)=>{
  if(!sb)return;
  setWorking(true);
  try{
   const response=await scannerApi(sb,'/api/event-staff?mode=my');
   const next=Array.isArray(response.events)?response.events:[];
   setEvents(next);
   setSelected(old=>next.some(e=>e.id===old)?old:(next[0]?.id||''));
   setMessage(next.length?'Select your event and scan tickets.':'No event currently open for this account. Ask the organiser to invite you or check the event time.');
  }catch(e){setEvents([]);setSelected('');setMessage(e.message||'Unable to load assigned events.');}
  finally{setWorking(false);}
 },[client]);

 useEffect(()=>{if(client&&user?.email_confirmed_at)refresh(client);else{setEvents([]);setSelected('');}},[client,user?.id,user?.email_confirmed_at,refresh]);

 async function signIn(){
  if(!client||busy)return;
  if(!email.trim()||!password){setMessage('Enter your verified staff email and password.');return;}
  setBusy(true);setMessage('');
  try{
   const {data,error}=await client.auth.signInWithPassword({email:email.trim(),password});
   if(error)throw error;
   if(!data.user?.email_confirmed_at){await client.auth.signOut();throw Error('Verify your email before using the door scanner.');}
   setUser(data.user);setPassword('');
  }catch(e){setMessage(e.message||'Sign in failed.');}
  finally{setBusy(false);}
 }
 async function signOut(){
  if(!client)return;
  await client.auth.signOut();
  setUser(null);setEvents([]);setSelected('');setResult(null);setAdmissions(0);setPassword('');
 }
 async function acceptInvite(){
  const token=inviteToken(invite);
  if(!token){setMessage('Paste the full staff invitation URL from TicketBunker.');return;}
  setWorking(true);setMessage('');
  try{
   const response=await scannerApi(client,'/api/event-staff',{action:'accept',token});
   setInvite('');await refresh(client);setSelected(response.eventId||'');
   setMessage('Invitation accepted. Your event is ready when check-in opens.');
  }catch(e){setMessage(e.message||'Unable to accept the invitation.');}
  finally{setWorking(false);}
 }
 async function handleScan(raw,source='camera'){
  if(!eventId.current||!client)return;
  const now=Date.now();
  if(source==='camera'&&raw===last.current.code&&now-last.current.at<1800){last.current.at=now;return;}
  if(lock.current)return;
  lock.current=true;setWorking(true);setResult(null);setFeedbackOpen(true);clearTimeout(feedbackTimer.current);
  if(source==='camera')last.current={code:raw,at:now};
  try{
   const code=ticketUrl(raw);
   const response=await scannerApi(client,'/api/event-scan',{code,eventId:eventId.current});
   const next=admissionResult(response);setResult(next);
   if(next.kind==='approved')setAdmissions(n=>n+1);
   const tone=next.kind==='approved'?Haptics.NotificationFeedbackType.Success:next.kind==='warning'?Haptics.NotificationFeedbackType.Warning:Haptics.NotificationFeedbackType.Error;
   Haptics.notificationAsync(tone).catch(()=>{});
  }catch(e){
   setResult({kind:'rejected',heading:'NO ADMISSION',detail:e.message||'Could not verify ticket. Do not admit without confirmation.'});
   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(()=>{});
  }finally{
   setManual('');
   setWorking(false);
   setTimeout(()=>{lock.current=false;},700);
   feedbackTimer.current=setTimeout(()=>setFeedbackOpen(false),1800);
  }
 }
 const myEvent=events.find(e=>e.id===selected);
 const resultColor=result?.kind==='approved'?C.mint:result?.kind==='warning'?C.amber:C.red;
 return <SafeAreaView style={s.root}><StatusBar barStyle="light-content" backgroundColor={C.bg}/><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':undefined}>
  <View style={s.header}><View><Text style={s.brand}>TICKET<Text style={{color:C.mint}}>BUNKER</Text></Text><Text style={s.subbrand}>SCANNER · DOOR CREW</Text></View><View style={s.dot}/></View>
  {loading?<View style={s.center}><ActivityIndicator size="large" color={C.mint}/><Text style={s.muted}>Connecting securely…</Text></View>:
   !client?<View style={s.center}><Text style={s.headline}>Service unavailable</Text><Text style={s.muted}>{message}</Text><Button title="Retry connection" onPress={()=>{setLoading(true);createScannerClient().then(c=>{setClient(c);return c.auth.getUser().then(({data})=>setUser(data.user||null));}).catch(e=>setMessage(e.message)).finally(()=>setLoading(false));}}/></View>:
   !user?<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.container}>
    <Text style={s.kicker}>STAFF SIGN-IN</Text><Text style={s.headline}>Own the door.</Text><Text style={s.body}>Sign in using the exact verified email your organiser invited. Scanner access is limited to your assigned events.</Text>
    <Text style={s.label}>Email</Text><Input value={email} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" onChangeText={setEmail} placeholder="you@example.com"/>
    <Text style={s.label}>Password</Text><Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" placeholder="Your password"/>
    <Button title={busy?'Signing in…':'Sign in to scanner'} disabled={busy} onPress={signIn}/>
    <Button title="Account help / password reset ↗" variant="secondary" onPress={()=>Linking.openURL('https://theticketbunker.com/client')}/>
    {!!message&&<Text style={s.alert}>{message}</Text>}
    <Text style={s.foot}>Only verified, authorised staff can admit tickets. A live connection is required.</Text>
   </ScrollView>:
   !user.email_confirmed_at?<View style={s.center}><Text style={s.headline}>Verify your email</Text><Text style={s.body}>Verify your email before scanning tickets.</Text><Button title="Sign out" onPress={signOut}/></View>:
   <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.container}>
    <View style={s.line}><View style={s.flex}><Text style={s.kicker}>SIGNED IN</Text><Text style={s.email} numberOfLines={1}>{user.email}</Text></View><Pressable onPress={signOut} accessibilityRole="button"><Text style={s.link}>Sign out</Text></Pressable></View>
    <Text style={s.headline}>Door scanner.</Text>
    <Text style={s.body}>Authorised one-time admission. Every scan is checked live against TicketBunker.</Text>
    <View style={s.panel}><View style={s.line}><Text style={s.panelHeading}>ASSIGNED EVENT</Text><Pressable onPress={()=>refresh()} accessibilityRole="button" disabled={working}><Text style={s.link}>Refresh ↻</Text></Pressable></View>
     {events.length?events.map(e=><Pressable onPress={()=>{setSelected(e.id);setResult(null);setAdmissions(0);}} key={e.id} accessibilityRole="radio" accessibilityState={{checked:e.id===selected}} style={[s.event,e.id===selected?s.eventSelected:null]}><View style={s.radio}>{e.id===selected&&<View style={s.radioFill}/>}</View><View style={s.flex}><Text style={s.eventName}>{e.title}</Text><Text style={s.small}>{e.venue||'Event venue'}</Text></View></Pressable>):<Text style={s.small}>No active assigned events.</Text>}
    </View>
    <View style={s.panel}><Text style={s.panelHeading}>ACCEPT A DOOR CREW INVITE</Text><Text style={s.small}>First shift? Paste the private invite link sent by your organiser.</Text><Input autoCapitalize="none" value={invite} onChangeText={setInvite} placeholder="Paste invitation link"/><Button title={working?'Please wait…':'Accept invite'} variant="secondary" disabled={working||!invite.trim()} onPress={acceptInvite}/></View>
    {!!message&&<Text style={s.note}>{message}</Text>}
    {myEvent&&<>
     <View style={s.scanTop}><Text style={s.panelHeading}>SCAN TICKET · {myEvent.title}</Text><Text style={s.small}>Session approvals on this device: {admissions}</Text></View>
     {permission?.granted?<View style={s.cameraFrame}><CameraView style={s.camera} facing="back" enableTorch={torch} active={foreground} barcodeScannerSettings={{barcodeTypes:['qr']}} onBarcodeScanned={({data})=>handleScan(data)}/><View pointerEvents="none" style={s.scanOverlay}><Text style={s.scanHint}>ALIGN QR IN FRAME</Text></View></View>:
     <View style={s.cameraMissing}><Text style={s.body}>Camera access is required to scan tickets.</Text><Button title="Allow camera" onPress={requestPermission}/></View>}
     <Button title={torch?'Turn torch off':'Turn torch on'} variant="secondary" onPress={()=>setTorch(x=>!x)}/>
     {result&&<View accessibilityRole="alert" style={[s.result,{borderColor:resultColor}]}><Text style={[s.resultHeading,{color:resultColor}]}>{result.heading}</Text><Text style={s.resultDetail}>{result.detail}</Text><Text style={s.small}>Check photo ID or age restrictions if required.</Text></View>}
     <Text style={s.panelHeading}>MANUAL BACKUP</Text><Text style={s.small}>Paste the full TicketBunker ticket URL. The server still validates entry.</Text>
     <Input autoCapitalize="none" value={manual} onChangeText={setManual} placeholder="Ticket URL"/>
     <Button title={working?'Verifying…':'Verify ticket'} disabled={working||!manual.trim()} onPress={()=>handleScan(manual.trim(),'manual')}/>
     <Text style={s.foot}>Internet required. Do not admit a ticket if verification fails or the connection is lost. An old QR becomes invalid when a ticket is transferred or refunded.</Text>
    </>}
    <Text style={s.foot}>TicketBunker · Powered by SoundBunker Algarve · <Text style={s.link} onPress={()=>Linking.openURL('https://theticketbunker.com/terms#privacy')}>Privacy</Text></Text>
   </ScrollView>}
 </KeyboardAvoidingView>
 <Modal visible={feedbackOpen} animationType="none" statusBarTranslucent onRequestClose={()=>{if(result)setFeedbackOpen(false);}}>
  <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[s.feedback,{backgroundColor:!result?'#162239':result.kind==='approved'?'#19ef9b':result.kind==='warning'?'#ffd040':'#ef3054'}]}>
   {!result?<ActivityIndicator size="large" color="#fff"/>:<Text style={[s.feedbackIcon,{color:result.kind==='approved'?'#042b20':result.kind==='warning'?'#362400':'#fff'}]}>{result.kind==='approved'?'✓':result.kind==='warning'?'!':'✕'}</Text>}
   <Text style={[s.feedbackHeading,{color:!result||result.kind==='rejected'?'#fff':result.kind==='approved'?'#042b20':'#362400'}]}>{result?.heading||'CHECKING…'}</Text>
   <Text style={[s.feedbackDetail,{color:!result||result.kind==='rejected'?'#fff':result.kind==='approved'?'#042b20':'#362400'}]}>{result?.detail||'Wait for live ticket verification.'}</Text>
   {result&&<Pressable accessibilityRole="button" onPress={()=>setFeedbackOpen(false)} style={s.feedbackNext}><Text style={s.feedbackNextText}>Scan next ticket</Text></Pressable>}
  </View>
 </Modal></SafeAreaView>;
}
const s=StyleSheet.create({
 feedback:{flex:1,justifyContent:'center',alignItems:'center',padding:24,gap:20},
 feedbackIcon:{fontSize:110,fontWeight:'900',lineHeight:120},
 feedbackHeading:{fontSize:48,lineHeight:52,fontWeight:'900',textAlign:'center'},
 feedbackDetail:{fontSize:20,lineHeight:27,fontWeight:'700',textAlign:'center'},
 feedbackNext:{minHeight:52,padding:16,borderRadius:12,backgroundColor:'#ffffffdd',marginTop:10},
 feedbackNextText:{fontSize:18,fontWeight:'900',color:'#162239'},
 root:{flex:1,backgroundColor:C.bg},flex:{flex:1},center:{flex:1,justifyContent:'center',alignItems:'center',padding:24,gap:16},
 header:{backgroundColor:C.panel,paddingHorizontal:20,paddingVertical:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:C.edge},
 brand:{color:C.text,fontSize:24,fontWeight:'900',letterSpacing:-1},subbrand:{color:C.muted,fontSize:10,letterSpacing:3,marginTop:2,fontWeight:'700'},dot:{height:10,width:10,borderRadius:5,backgroundColor:C.mint},
 container:{padding:20,paddingBottom:55,gap:12},kicker:{color:C.mint,fontSize:11,letterSpacing:2.5,fontWeight:'900'},headline:{color:C.text,fontSize:36,fontWeight:'900',letterSpacing:-1.3,marginBottom:2},
 body:{color:C.muted,fontSize:15,lineHeight:22},small:{color:C.muted,fontSize:12,lineHeight:18},muted:{color:C.muted},email:{color:C.text,fontSize:14,fontWeight:'700'},link:{color:C.mint,fontWeight:'700',fontSize:13},
 label:{fontSize:12,color:C.text,fontWeight:'700',marginTop:10},input:{borderWidth:1,borderColor:C.edge,borderRadius:12,color:C.text,padding:15,fontSize:15,backgroundColor:C.panel2,minHeight:52},
 button:{backgroundColor:C.mint,paddingVertical:16,borderRadius:12,alignItems:'center',marginTop:4},buttonText:{fontWeight:'900',color:'#102019',fontSize:15},
 secondary:{backgroundColor:C.panel2,borderWidth:1,borderColor:C.edge},secondaryText:{color:C.text},disabled:{opacity:.5},
 alert:{backgroundColor:'#48232d',padding:13,borderRadius:8,color:C.red},note:{backgroundColor:C.panel,padding:12,borderRadius:8,color:C.muted},
 foot:{color:C.muted,fontSize:12,lineHeight:19,marginTop:12},line:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:16},
 panel:{backgroundColor:C.panel,borderWidth:1,borderColor:C.edge,borderRadius:16,padding:14,gap:12,marginTop:8},
 panelHeading:{fontWeight:'900',color:C.text,fontSize:12,letterSpacing:1.3},
 event:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:11,backgroundColor:C.panel2,borderWidth:1,borderColor:'transparent'},
 eventSelected:{borderColor:C.mint},radio:{width:20,height:20,borderWidth:2,borderColor:C.mint,borderRadius:10,alignItems:'center',justifyContent:'center'},radioFill:{height:10,width:10,borderRadius:5,backgroundColor:C.mint},
 eventName:{color:C.text,fontSize:14,fontWeight:'800'},scanTop:{marginTop:16,gap:6},cameraFrame:{overflow:'hidden',borderRadius:16,height:310,borderWidth:2,borderColor:C.mint,backgroundColor:'#060608'},
 camera:{width:'100%',height:'100%'},scanOverlay:{position:'absolute',bottom:0,left:0,right:0,padding:15,backgroundColor:'#120b18a8',alignItems:'center'},
 scanHint:{color:C.text,fontWeight:'900',letterSpacing:2,fontSize:11},cameraMissing:{padding:25,gap:12,backgroundColor:C.panel,borderRadius:12},
 result:{marginTop:12,borderRadius:16,borderWidth:2,padding:20,gap:12,backgroundColor:C.panel},resultHeading:{fontSize:25,fontWeight:'900'},resultDetail:{color:C.text,fontSize:16,fontWeight:'700'}
});
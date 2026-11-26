import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View, Text, ScrollView, Pressable, TextInput, StyleSheet, Switch, AppState, RefreshControl} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {s, C, F} from '../theme.js';
import {Button, Chip, StatusShade, BrandHeader} from '../components/ui.js';
import {locate, watchTransportLocation} from '../state.js';
import {openOut, openPage} from '../open.js';
import {SITE, siteUrl} from '../../lib/config.js';
import {contextForFix, initialTransportSelection, latestRequest, nearbyTransport, mappedDetails, mappedLinks, departureLabel, freshLiveTimes, shouldRefreshNearby, movedMetres} from '../../lib/getAround.js';
import {withDeadline} from '../../lib/request.js';
import {CITY_PAGES, cityBySlug, CITY_COORDS, MODES, LIVE, KEYED, keyedBoard, keyedCitiesLive, TFL_ATTRIBUTION, tflNearby, tflArrivals, tflStatus, tflJourney,
  taxiLinks, plannerLinks, transportLinks, tripLinks, minsText, distanceText} from '../../lib/site.js';

// Get around: live departures from where you're standing, line status, routes with
// step-free / fewer changes / air-con options, taxis and trip links. Same rules as the site:
// times only from the operator's live feed; cities without one get planners, not guesses.
const ICON = {metro: 'Ⓜ', rail: '🚆', bus: '🚌', tram: '🚊', boat: '⛴', taxi: '🚕', walk: '🚶', other: '•'};
const hhmm = v => (String(v || '').match(/T(\d\d:\d\d)/) || [])[1] || '';
const Line = ({l}) => <View style={[g.line, l.colour ? {backgroundColor: l.colour} : null]}>
  <Text style={[g.lineText, l.text ? {color: l.text} : null]}>{l.name || l.line}{l.ac ? ' ❄' : ''}</Text></View>;

export default function GetAroundScreen({route}) {
  const initialSelection=useRef(initialTransportSelection(route?.params?.slug));
  const [context, setContext] = useState(initialSelection.current.context);
  const slug = context.slug || '', here = context.fix?.point || null;
  const [where, setWhere] = useState('');
  const [radius, setRadius] = useState(2000), [mapped, setMapped] = useState(null), [localError, setLocalError] = useState(''), [localBusy, setLocalBusy] = useState(false), [localLimit, setLocalLimit] = useState(12);
  const [boardBusy, setBoardBusy] = useState(false);
  const [,tickFreshness]=useState(0);
  const now=Date.now();
  const boardGate = useRef(latestRequest()), liveGate = useRef(latestRequest()), gpsGate = useRef(latestRequest()), routeGate = useRef(latestRequest());
  const boardCurrent = useRef(() => false), arrivalVersions = useRef(new Map());
  const lastQuery=useRef(null),needsRefresh=useRef(false),stopWatch=useRef(null),contextRef=useRef(context),applyFixRef=useRef(null);
  contextRef.current=context;
  const [boardRevision,setBoardRevision]=useState(0);
  const [mode, setMode] = useState('all'), [opt, setOpt] = useState({stepFree: false, fewerChanges: false, airCon: false});
  const [stops, setStops] = useState([]), [arr, setArr] = useState({}), [open, setOpen] = useState(new Set());
  const [status, setStatus] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const [to, setTo] = useState(''), [routes, setRoutes] = useState(null), [routeBusy, setRouteBusy] = useState(false);
  const [keyedOn, setKeyedOn] = useState([]), [attr, setAttr] = useState('');
  useEffect(() => { let active=true; keyedCitiesLive({base: SITE}).then(list => { if(active)setKeyedOn(list); }); return () => {active=false;}; }, []);
  const city = cityBySlug(slug), name = city ? city[1].replace(/^the /, '') : 'your location';
  const areaName=context.near?'near '+name:name;
  const tfl = Boolean(LIVE[slug]), keyed = Boolean(KEYED[slug]) && keyedOn.includes(slug), live = tfl || keyed;
  const acKnown = tfl || (keyed && KEYED[slug].ac);
  const from = here || CITY_COORDS[slug];
  const openRef = useRef(open); openRef.current = open;
  const fromRef = useRef(from); fromRef.current = from;
  useEffect(() => {
    const gates=[boardGate.current,liveGate.current,gpsGate.current,routeGate.current];gates.forEach(gate=>gate.activate());
    return()=>gates.forEach(gate=>gate.dispose());
  }, []);

  const loadArrivals = useCallback(async (id, current=boardCurrent.current) => {
    if (!LIVE[slug]) return;
    const version=(arrivalVersions.current.get(id)||0)+1;arrivalVersions.current.set(id,version);
    const valid=()=>current()&&arrivalVersions.current.get(id)===version;
    try { const list = await withDeadline(()=>tflArrivals(id),15000); if(valid())setArr(a => ({...a, [id]: {list, at: Date.now()}})); }
    catch (e) { if(valid())setArr(a => ({...a, [id]: {list: [], error: e.message, at: Date.now()}})); }
  }, [slug]);
  const loadKeyed = useCallback(async (point, keepOpen, current=boardCurrent.current) => {
    const latest=liveGate.current.begin();
    const j = await withDeadline(()=>keyedBoard(slug, point, {base: SITE}),15000);
    if(!current()||!latest())return;
    const list = j.stops || [];
    setAttr(j.attribution || ''); setStops(list); setErr('');
    setArr(Object.fromEntries(list.map(x => [x.id, {list: x.departures || [], at: Date.parse(j.at) || Date.now()}])));
    if (!keepOpen) { const first = new Set(list.slice(0, 3).map(x => x.id)); const bus = list.find(x => x.mode === 'bus'); if (bus) first.add(bus.id); setOpen(first); }
    if (!list.length) setErr('No departures returned from stops near this position right now.');
  }, [slug]);
  const loadBoard = useCallback(async point => {
    const current=boardGate.current.begin();boardCurrent.current=current;liveGate.current.invalidate();arrivalVersions.current.clear();
    lastQuery.current={point:[...point],at:Date.now()};
    setErr('');setStops([]);setArr({});setOpen(new Set());setStatus(null);setAttr('');
    setMapped(null);setLocalError('');setLocalBusy(true);setLocalLimit(12);setBoardBusy(live);
    const local=nearbyTransport(point,{radius}).then(data=>{if(current())setMapped(data);})
      .catch(e=>{if(current())setLocalError(e.message);}).finally(()=>{if(current())setLocalBusy(false);});
    const board=(async()=>{
      if(!live)return;
      try{
        if(keyed)await loadKeyed(point,false,current);
        else{
          const list=await withDeadline(()=>tflNearby(point,{radius:650}),15000);if(!current())return;
          const first=new Set(list.slice(0,3).map(x=>x.id));const bus=list.find(x=>x.mode==='bus');if(bus)first.add(bus.id);
          setStops(list);setOpen(first);
          if(!list.length)setErr('No live-feed stops returned near this position. Mapped transport and searches are below.');
          await Promise.all([...first].map(id=>loadArrivals(id,current)));
          tflStatus().then(value=>{if(current())setStatus(value);}).catch(()=>{if(current())setStatus(null);});
        }
      }catch(e){if(current())setErr(e.message);}
      finally{if(current())setBoardBusy(false);}
    })();
    await Promise.all([local,board]);
  }, [slug, live, keyed, radius, loadArrivals, loadKeyed]);

  function chooseCity(next){
    stopWatch.current?.();stopWatch.current=null;
    gpsGate.current.invalidate();boardGate.current.invalidate();routeGate.current.invalidate();
    setBusy(false);setWhere('');setRoutes(null);setRouteBusy(false);setContext({slug:next,fix:null});setBoardRevision(value=>value+1);
  }
  function applyFix(fix,force=false){
    if(contextRef.current.fix&&fix.at<contextRef.current.fix.at)return;
    const next=contextForFix(fix),refresh=force||needsRefresh.current||next.slug!==contextRef.current.slug||shouldRefreshNearby(lastQuery.current,fix);
    gpsGate.current.invalidate();setBusy(false);setWhere('');setContext(next);
    if(refresh){needsRefresh.current=false;boardGate.current.invalidate();routeGate.current.invalidate();setRoutes(null);setRouteBusy(false);setBoardRevision(value=>value+1);}
  }
  applyFixRef.current=applyFix;
  async function findMe() {
    if(AppState.currentState!=='active')return;
    const current=gpsGate.current.begin();setBusy(true);setWhere('Finding your current position…');
    try {
      const fix=await locate({fresh:true,details:true});if(!current())return;
      applyFix(fix,true);
    } catch(e){if(current())setWhere(e.message+(here?' Showing your previous position.':' Showing central '+name+'.'));}
    finally{if(current())setBusy(false);}
  }
  useEffect(() => { if(initialSelection.current.autoLocate)findMe(); }, []);
  const previousRoute=useRef(route?.params?.slug);
  useEffect(() => {const next=route?.params?.slug;if(next!==previousRoute.current&&cityBySlug(next))chooseCity(next);previousRoute.current=next;}, [route?.params?.slug]);
  useEffect(() => {loadBoard(fromRef.current);}, [loadBoard, boardRevision]);
  useEffect(() => {
    if(!here)return;
    const stop=watchTransportLocation(fix=>applyFixRef.current(fix),error=>setWhere(error.message+' Showing your last position.'),()=>{needsRefresh.current=true;});
    stopWatch.current=stop;return()=>{stop();if(stopWatch.current===stop)stopWatch.current=null;};
  }, [Boolean(here)]);
  useEffect(()=>{
    const listener=AppState.addEventListener('change',state=>{
      if(state==='active'){tickFreshness(value=>value+1);needsRefresh.current=true;if(contextRef.current.fix)setWhere('Updating your current position…');else setBoardRevision(value=>value+1);return;}
      gpsGate.current.invalidate();boardGate.current.invalidate();routeGate.current.invalidate();setBusy(false);setRouteBusy(false);setBoardBusy(false);setLocalBusy(false);
      if(contextRef.current.fix)setWhere('Location paused while the app is inactive. Showing your last position.');
    });
    return()=>listener.remove();
  },[]);
  // Refresh connected departure feeds only while the app is in front. Map data keeps its own fetch time.
  useEffect(() => {
    const timer=setInterval(()=>{
      if(AppState.currentState!=='active')return;
      tickFreshness(value=>value+1);
      if(tfl)[...openRef.current].forEach(id=>loadArrivals(id));
      else if(keyed){const current=boardCurrent.current;loadKeyed(fromRef.current,true,current).catch(e=>{if(current())setErr('Live update unavailable: '+e.message);});}
    },30000);
    return()=>clearInterval(timer);
  }, [tfl,keyed,loadArrivals,loadKeyed]);

  async function plan(target = to.trim()) {
    if (!target) return;
    if (!tfl) { setRoutes({handoff: true}); return; }
    const current=routeGate.current.begin();setRouteBusy(true);
    try { const result=await withDeadline(()=>tflJourney(from.join(','),target,opt),15000);if(current())setRoutes(result); } catch(e){if(current())setRoutes({error:e.message});}
    finally{if(current())setRouteBusy(false);}
  }
  useEffect(() => { if (routes?.journeys && to.trim()) plan(); }, [opt.stepFree, opt.fewerChanges, opt.airCon]);

  let shown = stops.filter(x => mode === 'all' || (x.modes || [x.mode]).includes(mode));
  if (opt.airCon) shown = shown.filter(x => x.lines.some(l => l.ac) || (arr[x.id]?.list || []).some(d => d.ac));
  const fastest = routes?.journeys?.length ? Math.min(...routes.journeys.slice(0, 4).map(j => j.mins)) : 0;
  const hand = plannerLinks({slug, from, toName: to.trim()});
  const localPlaces=(mapped?.places || []).map(p=>({...p,distance:Math.round(movedMetres(from,[p.lat,p.lon]))})).filter(p=>p.distance<=radius&&(mode==='all'||p.mode===mode)).sort((a,b)=>a.distance-b.distance);
  const options=transportLinks({slug,name:city?name:'',country:city?.[2]||'',from,toName:to.trim()});
  const position=context.fix;
  const positionText=position?`Your position · ${position.accuracy==null?'accuracy not reported':`accuracy ±${Math.ceil(position.accuracy)} m${position.accuracy>200?' · approximate position':''}`} · updated ${new Date(position.at).toLocaleTimeString('en-GB')}`:`Central ${name} · use your location for nearby transport`;
  const hasLiveTimes=freshLiveTimes(arr,now);

  return <SafeAreaView edges={['top']} style={s.screen}>
    <ScrollView contentContainerStyle={{padding: 18, gap: 16, paddingBottom: 40}} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl tintColor={C.teal} refreshing={boardBusy || localBusy} onRefresh={() => loadBoard(from)}/>}>
      <BrandHeader/>
        <View style={{gap: 6}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <Text style={s.eyebrow}>Get around {areaName}</Text>{hasLiveTimes ? <Text style={g.live}>● LIVE TIMES</Text> : null}</View>
        <Text style={[s.h1, {fontSize: 44, lineHeight: 44, textTransform: 'uppercase'}]}>{`Get around\n${areaName}`}</Text>
        <Text style={s.muted}>{where || positionText}</Text>
      </View>
      <Button title={here ? 'Update my location' : 'Use my location'} icon="◎" busy={busy} onPress={findMe}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8}}>
        {CITY_PAGES.slice().sort((a, b) => (LIVE[b[0]] ? 1 : 0) - (LIVE[a[0]] ? 1 : 0)).map(c =>
          <Chip key={c[0]} label={(LIVE[c[0]] ? '● ' : '') + c[1].replace(/^the /, '')} active={c[0] === slug} onPress={() => chooseCity(c[0])}/>)}
      </ScrollView>

      {/* Big, clear transport choices: a grid of tiles with a large icon each. */}
      <View style={g.modeGrid}>
        {[...MODES,['taxi','Taxis']].map(([k, l]) => <Pressable key={k} accessibilityRole="button" accessibilityState={{selected: mode === k}} onPress={() => setMode(k)}
          style={({pressed}) => [g.modeTile, mode === k && g.modeOn, pressed && {opacity: 0.85}]}>
          <Text style={g.modeIcon}>{k === 'all' ? '✦' : ICON[k]}</Text>
          <Text style={[g.modeLabel, mode === k && {color: C.tealInk}]} numberOfLines={2}>{k === 'boat' ? 'Ferries & boats' : l}</Text>
        </Pressable>)}
      </View>
      {live ? <>
        <View style={g.card}>
          {[['stepFree', tfl ? '♿ Step-free routes' : '♿ Wheelchair accessible'], tfl && ['fewerChanges', '⇄ Fewer changes'], acKnown && ['airCon', '❄ Air-conditioned']].filter(Boolean).map(([k, l]) =>
            <View key={k} style={g.toggle}><Text style={s.body}>{l}</Text>
              <Switch value={opt[k]} onValueChange={v => setOpt(o => ({...o, [k]: v}))} trackColor={{true: C.teal, false: C.line}} thumbColor="#fff" accessibilityLabel={l}/></View>)}
        </View>

        <Text style={s.h2}>Departures near you</Text>
        {err ? <Text style={s.muted}>{err}</Text> : null}
        {!err && boardBusy && !stops.length ? <Text style={s.muted}>Finding stops near you…</Text> : null}
        {stops.length > 0 && !shown.length ? <Text style={s.muted}>Nothing of that kind within walking distance. Try Everything.</Text> : null}
        {shown.slice(0, 12).map(st => {
          const isOpen = open.has(st.id), a = arr[st.id];
          let list = (a?.list || []).filter(x => mode === 'all' || x.mode === mode);
          if (opt.airCon) list = list.filter(x => x.ac);
          if (opt.stepFree) list = list.filter(x => x.wheelchair !== false);
          return <View key={st.id} style={g.card}>
            <Pressable accessibilityRole="button" accessibilityState={{expanded: isOpen}} style={{flexDirection: 'row', gap: 12}}
              onPress={() => { const n = new Set(open); isOpen ? n.delete(st.id) : (n.add(st.id), loadArrivals(st.id)); setOpen(n); }}>
              <Text style={g.ic}>{ICON[st.mode]}</Text>
              <View style={{flex: 1, gap: 4}}>
                <Text style={s.h3}>{st.name.replace(/ (Underground|Rail) Station$/, '')}{st.indicator ? `  (${st.indicator})` : ''}</Text>
                <Text style={s.muted}>{distanceText(st.distance)} · {Math.max(1, Math.round(st.distance / 80))} min walk{st.towards ? ' · towards ' + st.towards : ''}</Text>
                <View style={g.lines}>{st.lines.slice(0, 8).map(l => <Line key={l.id} l={l}/>)}</View>
              </View>
            </Pressable>
            {isOpen ? <View style={{marginTop: 10}}>
              {!a ? <Text style={s.muted}>Loading live times…</Text> : a.error ? <Text style={s.muted}>{a.error}</Text>
                : !list.length ? <Text style={s.muted}>{a.list.length ? 'Nothing matching your choices in the next 30 minutes.' : 'No live times for this stop right now.'}</Text>
                : list.slice(0, 6).map((x, i) => <View key={i} style={g.dep}>
                  <Line l={x}/><View style={{flex: 1}}><Text style={[s.body, {fontFamily: F.medium}]} numberOfLines={1}>{x.towards || '—'}</Text>
                    {x.platform || x.wheelchair || x.live === false ? <Text style={s.muted} numberOfLines={1}>{[x.platform, x.wheelchair && '♿ accessible', x.live === false && 'timetable'].filter(Boolean).join(' · ')}</Text> : null}</View>
                  <Text style={g.min}>{minsText(x.mins)}</Text></View>)}
              {a && !a.error ? <Text style={[s.muted, {fontSize: 12, marginTop: 6}]}>{departureLabel(a.list)} · updated {new Date(a.at).toLocaleTimeString('en-GB')}{now-a.at>=90000?' · last received data':''}</Text> : null}
            </View> : null}
          </View>;
        })}
        {tfl && status ? <View style={g.card}><Text style={s.h3}>Line status</Text>
          {status.filter(l => !l.good).map(l => <View key={l.id} style={[g.dep, {alignItems: 'flex-start'}]}><Line l={l}/>
            <View style={{flex: 1}}><Text style={[s.body, {color: C.warn}]}>{l.status}</Text>{l.reason ? <Text style={s.muted}>{l.reason.replace(/^[^:]+:\s*/, '')}</Text> : null}</View></View>)}
          <Text style={[s.body, {color: C.teal}]}>{status.some(l => !l.good) ? 'Good service on all other lines.' : 'Good service on every line.'}</Text></View> : null}
      </> : <View style={g.card}>
        <Text style={s.h3}>Local transport information</Text>
        <Text style={s.muted}>No connected departure feed for this area. Mapped stops, local searches and operator timetables still work. Check current services with the provider.</Text>
        {plannerLinks({slug, from, toName: city?name:''}).map(l => <Button key={l.kind} title={l.name} kind="secondary" small onPress={() => openOut(l.url)}/>)}
      </View>}

      <View style={g.card}>
        <Text style={s.h2}>Nearby stops & transport</Text>
        <View style={{flexDirection:'row',gap:8}}>{[2000,5000].map(value=><Chip key={value} label={`Within ${value/1000} km`} active={radius===value} onPress={()=>setRadius(value)}/>)}</View>
        <Text style={s.muted}>Mapped places · straight-line distances, not walking routes. No departure times or vehicle availability are implied.</Text>
        {localBusy?<Text style={s.muted}>Finding mapped transport near this position…</Text>:localError?<Text style={s.muted}>{localError}</Text>:!localPlaces.length?<Text style={s.muted}>{mapped?.places.length?'No mapped places match this transport filter. Try Everything.':`No mapped places returned within ${radius/1000} km. Try 5 km or the searches below.`}</Text>:null}
        {localPlaces.slice(0,localLimit).map(place=><View key={place.id} style={g.journey}>
          <Text style={s.h3}>{ICON[place.mode]||'•'} {place.name}</Text>
          <Text style={s.muted}>{distanceText(place.distance)} · {place.mode==='boat'?'Ferry / boat terminal':place.mode==='taxi'?'Taxi rank':place.mode}</Text>
          {mappedDetails(place)?<Text style={s.muted}>{mappedDetails(place)}</Text>:null}
          <View style={{gap:8}}>{mappedLinks(place,from).map(link=><Button key={link.name} title={link.name} kind="secondary" small onPress={()=>openOut(link.url)}/>)}</View>
        </View>)}
        {localPlaces.length>localLimit?<Button title={`Show more (${localPlaces.length-localLimit} left)`} kind="secondary" onPress={()=>setLocalLimit(value=>value+12)}/>:null}
        {mapped?<Text style={[s.muted,{fontSize:12}]}>Map data © OpenStreetMap contributors (ODbL){mapped.at?` · fetched ${new Date(mapped.at).toLocaleTimeString('en-GB')}`:''}. Mapped information may be incomplete; confirm access, services and schedules with the operator.</Text>:null}
      </View>
      <View style={g.card}>
        <Text style={s.h3}>All transport options</Text>
        <Text style={s.muted}>Local searches and onward travel. Check routes, timetables, vehicle spaces, fares and availability with each provider.</Text>
        {options.map(link=><View key={link.kind} style={{gap:4}}><Button title={link.name} lines={2} kind="secondary" small onPress={()=>link.url.startsWith('/')?openPage(siteUrl(link.url)):openOut(link.url)}/><Text style={s.muted}>{link.note}</Text></View>)}
      </View>

      <View style={g.card}>
        <Text style={s.h3}>Plan a route</Text>
        <Text style={s.muted}>From {here ? 'your location' : 'central ' + name}</Text>
        <TextInput style={s.input} value={to} onChangeText={value=>{routeGate.current.invalidate();setTo(value);setRoutes(null);setRouteBusy(false);}} placeholder={live ? 'Venue, station or postcode' : 'Venue or address'} placeholderTextColor={C.muted}
          returnKeyType="search" onSubmitEditing={() => plan()} accessibilityLabel="Where to?"/>
        <Button title="Show routes" busy={routeBusy} onPress={() => plan()}/>
        {routes?.error ? <Text style={s.muted}>{routes.error}</Text> : null}
        {routes?.choices ? (routes.choices.to.length ? <View style={{gap: 8}}><Text style={s.muted}>Which one do you mean?</Text>
          {routes.choices.to.map(c => <Button key={c.value} title={c.name} kind="secondary" small onPress={() => { setTo(c.name); plan(c.value); }}/>)}</View>
          : <Text style={s.muted}>TfL could not find that place. Try a postcode or station name.</Text>) : null}
        {routes?.journeys && !routes.journeys.length ? <Text style={s.muted}>No routes match those options. Try turning one off.</Text> : null}
        {routes?.journeys?.slice(0, 4).map((j, i) => <View key={i} style={g.journey}>
          <Text style={s.h2}>{j.mins} min <Text style={s.muted}>{hhmm(j.depart)} → {hhmm(j.arrive)}</Text></Text>
          <Text style={[s.muted, {color: C.teal}]}>{[j.mins === fastest && 'Fastest', j.changes === 0 ? 'No changes' : `${j.changes} change${j.changes > 1 ? 's' : ''}`, j.allAc && '❄ Air-con', opt.stepFree && '♿ Step-free', Number.isInteger(j.fare) && `£${(j.fare / 100).toFixed(2)}`].filter(Boolean).join(' · ')}</Text>
          {j.legs.map((l, n) => <View key={n} style={g.leg}><Text style={g.legIc}>{ICON[l.mode] || '•'}</Text>
            {l.line && l.mode !== 'walk' ? <Line l={l}/> : null}
            <View style={{flex: 1}}><Text style={s.body}>{l.summary}</Text><Text style={s.muted}>{hhmm(l.depart)} · {l.mins} min{l.disrupted ? ' · ⚠ disruption on this line' : ''}</Text></View></View>)}
        </View>)}
        {routes && to.trim() ? <View style={{gap: 8}}><Text style={s.muted}>{'Open your route with a provider'}</Text>
          {hand.map(l => <Button key={l.kind} title={l.name} kind="secondary" small onPress={() => openOut(l.url)}/>)}</View> : null}
      </View>

      <View style={g.card}><Text style={s.h3}>Taxis & private hire</Text>
        {taxiLinks({from, toName: to.trim()}).map(l => <Button key={l.kind} title={l.name} icon="🚕" kind="secondary" small onPress={() => openOut(l.url)}/>)}
        <Text style={s.muted}>Uber opens with your pickup filled in; in Bolt, set the drop-off yourself.</Text></View>

      <View style={g.card}><Text style={s.h3}>Plan your onward trip</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
          {tripLinks({name:city?name:'', country: city?.[2]||''}).map(l => <Chip key={l.kind} label={l.label} onPress={() => openPage(SITE + l.href)}/>)}</View></View>

      <Text style={[s.muted, {fontSize: 12}]}>{tfl ? TFL_ATTRIBUTION + ' Times are TfL’s live predictions and can change.' : keyed ? attr + ' Times marked “timetable” are scheduled, not live.' : 'Live boards are added city by city as we connect each operator’s official feed.'}</Text>
    </ScrollView>
    <StatusShade/>
  </SafeAreaView>;
}
const g = StyleSheet.create({
  modeGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  modeTile: {flexBasis: '31%', flexGrow: 1, minHeight: 92, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10},
  modeOn: {backgroundColor: C.teal, borderColor: C.teal, shadowColor: C.teal, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: {width: 0, height: 6}, elevation: 6},
  modeIcon: {fontSize: 30, lineHeight: 36},
  modeLabel: {fontFamily: F.bold, fontSize: 14, color: C.text, textAlign: 'center'},
  card: {backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10},
  toggle: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  live: {color: C.teal, fontFamily: F.bold, fontSize: 12, letterSpacing: 1.4},
  ic: {width: 36, height: 36, borderRadius: 10, backgroundColor: C.cardHi, textAlign: 'center', lineHeight: 36, fontSize: 18, overflow: 'hidden', color: C.text},
  lines: {flexDirection: 'row', flexWrap: 'wrap', gap: 5},
  line: {backgroundColor: C.cardHi, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#ffffff22'},
  lineText: {color: C.text, fontFamily: F.bold, fontSize: 12},
  dep: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line},
  min: {color: C.teal, fontFamily: F.display, fontSize: 20},
  journey: {borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, gap: 8},
  leg: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  legIc: {width: 24, textAlign: 'center', fontSize: 15, color: C.text}
});

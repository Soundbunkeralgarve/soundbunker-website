import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View, Text, ScrollView, Pressable, TextInput, StyleSheet, Switch, AppState, RefreshControl} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {s, C, F} from '../theme.js';
import {Button, Chip, StatusShade} from '../components/ui.js';
import {locate} from '../state.js';
import {openOut, openPage} from '../open.js';
import {SITE} from '../../lib/config.js';
import {CITY_PAGES, cityBySlug, nearestCities, distanceKm, CITY_COORDS, MODES, LIVE, KEYED, keyedBoard, keyedCitiesLive, TFL_ATTRIBUTION, tflNearby, tflArrivals, tflStatus, tflJourney,
  taxiLinks, plannerLinks, tripLinks, minsText, distanceText} from '../../lib/site.js';

// Get around: live departures from where you're standing, line status, routes with
// step-free / fewer changes / air-con options, taxis and trip links. Same rules as the site:
// times only from the operator's live feed; cities without one get planners, not guesses.
const ICON = {metro: 'Ⓜ', rail: '🚆', bus: '🚌', tram: '🚊', boat: '⛴', walk: '🚶', other: '•'};
const hhmm = v => (String(v || '').match(/T(\d\d:\d\d)/) || [])[1] || '';
const Line = ({l}) => <View style={[g.line, l.colour ? {backgroundColor: l.colour} : null]}>
  <Text style={[g.lineText, l.text ? {color: l.text} : null]}>{l.name || l.line}{l.ac ? ' ❄' : ''}</Text></View>;

export default function GetAroundScreen({route}) {
  const [slug, setSlug] = useState(route?.params?.slug || 'london');
  const [here, setHere] = useState(null), [where, setWhere] = useState('');
  const [mode, setMode] = useState('all'), [opt, setOpt] = useState({stepFree: false, fewerChanges: false, airCon: false});
  const [stops, setStops] = useState([]), [arr, setArr] = useState({}), [open, setOpen] = useState(new Set());
  const [status, setStatus] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const [to, setTo] = useState(''), [routes, setRoutes] = useState(null), [routeBusy, setRouteBusy] = useState(false);
  const [keyedOn, setKeyedOn] = useState([]), [attr, setAttr] = useState('');
  useEffect(() => { keyedCitiesLive({base: SITE}).then(setKeyedOn); }, []);
  const city = cityBySlug(slug), name = city[1].replace(/^the /, ''), tfl = Boolean(LIVE[slug]), keyed = Boolean(KEYED[slug]) && keyedOn.includes(slug), live = tfl || keyed;
  const acKnown = tfl || (keyed && KEYED[slug].ac);
  const from = here || CITY_COORDS[slug];
  const openRef = useRef(open); openRef.current = open;
  const fromRef = useRef(from); fromRef.current = from;

  const loadArrivals = useCallback(async id => {
    if (!LIVE[slug]) return;
    try { const list = await tflArrivals(id); setArr(a => ({...a, [id]: {list, at: Date.now()}})); }
    catch (e) { setArr(a => ({...a, [id]: {list: [], error: e.message, at: Date.now()}})); }
  }, [slug]);
  const loadKeyed = useCallback(async (point, keepOpen) => {
    const j = await keyedBoard(slug, point, {base: SITE});
    const list = j.stops || [];
    setAttr(j.attribution || ''); setStops(list);
    setArr(Object.fromEntries(list.map(x => [x.id, {list: x.departures, at: Date.parse(j.at) || Date.now()}])));
    if (!keepOpen) { const first = new Set(list.slice(0, 3).map(x => x.id)); const bus = list.find(x => x.mode === 'bus'); if (bus) first.add(bus.id); setOpen(first); }
    if (!list.length) setErr('No departures from stops within walking distance right now.');
  }, [slug]);
  const loadBoard = useCallback(async point => {
    const isKeyed = Boolean(KEYED[slug]) && keyedOn.includes(slug);
    if (!LIVE[slug] && !isKeyed) return;
    setErr(''); setStops([]); setArr({});
    if (isKeyed) { try { await loadKeyed(point, false); } catch (e) { setErr(e.message); } return; }
    try {
      const list = await tflNearby(point, {radius: 650});
      const first = new Set(list.slice(0, 3).map(x => x.id)); const bus = list.find(x => x.mode === 'bus'); if (bus) first.add(bus.id);
      setStops(list); setOpen(first); await Promise.all([...first].map(loadArrivals));
    } catch (e) { setErr(e.message); }
    tflStatus().then(setStatus).catch(() => setStatus(null));
  }, [slug, loadArrivals, loadKeyed, keyedOn]);

  async function findMe() {
    setBusy(true);
    try {
      const p = await locate();
      const near = nearestCities(p, 1)[0];
      if (near && near.km < 40) { setHere(p); setWhere('Near you'); if (near.slug !== slug) setSlug(near.slug); else loadBoard(p); }
      else { setHere(null); setWhere(`You’re not near one of our cities, so this shows central ${name}.`); loadBoard(CITY_COORDS[slug]); }
    } catch (e) { setWhere(e.message); loadBoard(CITY_COORDS[slug]); }
    finally { setBusy(false); }
  }
  useEffect(() => { findMe(); }, []);
  useEffect(() => { if (route?.params?.slug && cityBySlug(route.params.slug)) setSlug(route.params.slug); }, [route?.params?.slug]);
  const firstRun = useRef(true);
  useEffect(() => { if (keyedOn.includes(slug)) loadBoard(here && distanceKm(here, CITY_COORDS[slug]) < 40 ? here : CITY_COORDS[slug]); }, [keyedOn]);
  useEffect(() => { if (firstRun.current) { firstRun.current = false; return; } if (here && distanceKm(here, CITY_COORDS[slug]) < 40) loadBoard(here); else loadBoard(CITY_COORDS[slug]); setRoutes(null); }, [slug]);
  // Refresh open boards every 30 seconds while the app is in front.
  useEffect(() => {
    const t = setInterval(() => { if (AppState.currentState !== 'active') return; if (LIVE[slug]) [...openRef.current].forEach(loadArrivals); else if (KEYED[slug] && keyedOn.includes(slug)) loadKeyed(fromRef.current, true).catch(() => {}); }, 30000);
    return () => clearInterval(t);
  }, [slug, loadArrivals, loadKeyed, keyedOn]);

  async function plan(target = to.trim()) {
    if (!target) return;
    if (!tfl) { setRoutes({handoff: true}); return; }
    setRouteBusy(true);
    try { setRoutes(await tflJourney(from.join(','), target, opt)); } catch (e) { setRoutes({error: e.message}); }
    finally { setRouteBusy(false); }
  }
  useEffect(() => { if (routes?.journeys && to.trim()) plan(); }, [opt.stepFree, opt.fewerChanges, opt.airCon]);

  let shown = stops.filter(x => mode === 'all' || x.modes.includes(mode));
  if (opt.airCon) shown = shown.filter(x => x.lines.some(l => l.ac) || (arr[x.id]?.list || []).some(d => d.ac));
  const fastest = routes?.journeys?.length ? Math.min(...routes.journeys.slice(0, 4).map(j => j.mins)) : 0;
  const hand = plannerLinks({slug, from: here, toName: to.trim()});

  return <SafeAreaView edges={['top']} style={s.screen}>
    <ScrollView contentContainerStyle={{padding: 18, gap: 16, paddingBottom: 40}} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl tintColor={C.teal} refreshing={false} onRefresh={() => loadBoard(from)}/>}>
      <View style={{gap: 6}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <Text style={s.eyebrow}>Get around {name}</Text>{live ? <Text style={g.live}>● LIVE</Text> : null}</View>
        <Text style={[s.h1, {fontSize: 38, lineHeight: 40, textTransform: 'uppercase'}]}>{live ? 'Live times.\nRight lines.' : `Get around ${name}`}</Text>
        <Text style={s.muted}>{where || (here ? 'Near you' : `Central ${name}`)}</Text>
      </View>
      <Button title={here ? 'Update my location' : 'Use my location'} icon="◎" busy={busy} onPress={findMe}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8}}>
        {CITY_PAGES.slice().sort((a, b) => (LIVE[b[0]] ? 1 : 0) - (LIVE[a[0]] ? 1 : 0)).map(c =>
          <Chip key={c[0]} label={(LIVE[c[0]] ? '● ' : '') + c[1].replace(/^the /, '')} active={c[0] === slug} onPress={() => setSlug(c[0])}/>)}
      </ScrollView>

      {live ? <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8}}>
          {MODES.map(([k, l]) => <Chip key={k} label={(k === 'all' ? '' : ICON[k] + ' ') + l} active={mode === k} onPress={() => setMode(k)}/>)}
        </ScrollView>
        <View style={g.card}>
          {[['stepFree', tfl ? '♿ Step-free routes' : '♿ Wheelchair accessible'], tfl && ['fewerChanges', '⇄ Fewer changes'], acKnown && ['airCon', '❄ Air-conditioned']].filter(Boolean).map(([k, l]) =>
            <View key={k} style={g.toggle}><Text style={s.body}>{l}</Text>
              <Switch value={opt[k]} onValueChange={v => setOpt(o => ({...o, [k]: v}))} trackColor={{true: C.teal, false: C.line}} thumbColor="#fff" accessibilityLabel={l}/></View>)}
        </View>

        <Text style={s.h2}>Departures near you</Text>
        {err ? <Text style={s.muted}>{err}</Text> : null}
        {!err && !stops.length ? <Text style={s.muted}>Finding stops near you…</Text> : null}
        {stops.length && !shown.length ? <Text style={s.muted}>Nothing of that kind within walking distance. Try Everything.</Text> : null}
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
              {a && !a.error ? <Text style={[s.muted, {fontSize: 12, marginTop: 6}]}>Live · updated {new Date(a.at).toLocaleTimeString('en-GB')}</Text> : null}
            </View> : null}
          </View>;
        })}
        {tfl && status ? <View style={g.card}><Text style={s.h3}>Line status</Text>
          {status.filter(l => !l.good).map(l => <View key={l.id} style={[g.dep, {alignItems: 'flex-start'}]}><Line l={l}/>
            <View style={{flex: 1}}><Text style={[s.body, {color: C.warn}]}>{l.status}</Text>{l.reason ? <Text style={s.muted}>{l.reason.replace(/^[^:]+:\s*/, '')}</Text> : null}</View></View>)}
          <Text style={[s.body, {color: C.teal}]}>{status.some(l => !l.good) ? 'Good service on all other lines.' : 'Good service on every line.'}</Text></View> : null}
      </> : <View style={g.card}>
        <Text style={s.h3}>Live departure boards for {name} are on the way.</Text>
        <Text style={s.muted}>We only show times straight from the operator. Until {name}’s feed is connected, these have live times from where you are:</Text>
        {plannerLinks({slug, from: here, toName: name}).map(l => <Button key={l.kind} title={l.name} kind="secondary" small onPress={() => openOut(l.url)}/>)}
      </View>}

      <View style={g.card}>
        <Text style={s.h3}>Plan a route</Text>
        <Text style={s.muted}>From {here ? 'your location' : 'central ' + name}</Text>
        <TextInput style={s.input} value={to} onChangeText={setTo} placeholder={live ? 'Venue, station or postcode' : 'Venue or address'} placeholderTextColor={C.muted}
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
        {routes && to.trim() ? <View style={{gap: 8}}><Text style={s.muted}>{live ? 'Also open in' : 'Open your route with live times in'}</Text>
          {hand.map(l => <Button key={l.kind} title={l.name} kind="secondary" small onPress={() => openOut(l.url)}/>)}</View> : null}
      </View>

      <View style={g.card}><Text style={s.h3}>Taxis</Text>
        {taxiLinks({from: here, toName: to.trim()}).map(l => <Button key={l.kind} title={l.name} icon="🚕" kind="secondary" small onPress={() => openOut(l.url)}/>)}
        <Text style={s.muted}>Uber opens with your pickup filled in; in Bolt, set the drop-off yourself.</Text></View>

      <View style={g.card}><Text style={s.h3}>Getting to {name}</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
          {tripLinks({name, country: city[2]}).map(l => <Chip key={l.kind} label={l.label} onPress={() => openPage(SITE + l.href)}/>)}</View></View>

      <Text style={[s.muted, {fontSize: 12}]}>{tfl ? TFL_ATTRIBUTION + ' Times are TfL’s live predictions and can change.' : keyed ? attr + ' Times marked “timetable” are scheduled, not live.' : 'Live boards are added city by city as we connect each operator’s official feed.'}</Text>
    </ScrollView>
    <StatusShade/>
  </SafeAreaView>;
}
const g = StyleSheet.create({
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

import React, {useState} from 'react';
import {View, Text, StyleSheet, useWindowDimensions} from 'react-native';
import {s, C, WIDE} from '../theme.js';
import {Button} from './ui.js';
import {directionLinks, travelEstimates, estimateText} from '../../lib/site.js';
import {locate} from '../state.js';
import {openOut} from '../open.js';

const ICON = {walk: '🚶', transit: '🚇', taxi: '🚕', citymapper: '🗺', tube: 'Ⓣ'};
// Walk / transit / Uber / Citymapper / Tube map, with rough times worked out on the phone.
export default function GetThere({place}) {
  const links = directionLinks(place), wide = useWindowDimensions().width >= WIDE;
  const [eta, setEta] = useState(''), [busy, setBusy] = useState(false);
  const hasPoint = Number.isFinite(place.lat) && Number.isFinite(place.lng);
  async function howFar() {
    setBusy(true);
    try { setEta(estimateText(travelEstimates(await locate(), [place.lat, place.lng]))); }
    catch (e) { setEta(e.message); }
    finally { setBusy(false); }
  }
  if (!links.length) return <Text style={s.muted}>Directions appear once the venue is confirmed.</Text>;
  return <View style={{gap: 10}}>
    {hasPoint ? <View style={g.eta}>
      <Button title={eta ? 'Update time from here' : 'How far is it from here?'} kind="secondary" small busy={busy} onPress={howFar}/>
      {eta ? <Text style={[s.body, {color: C.teal}]} accessibilityLiveRegion="polite">{eta}</Text> : null}
      <Text style={s.muted}>Rough times. Your map app gives exact ones.</Text>
    </View> : null}
    <View style={g.grid}>
      {links.map(l => <Button key={l.kind} title={l.name} icon={ICON[l.kind]} kind="secondary" onPress={() => openOut(l.url)} style={{flexGrow: 1, flexBasis: wide ? '45%' : '100%'}}/>)}
    </View>
  </View>;
}
const g = StyleSheet.create({
  eta: {gap: 8, backgroundColor: C.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.line},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10}
});

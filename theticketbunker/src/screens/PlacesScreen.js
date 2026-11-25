import React, {useMemo, useState} from 'react';
import {View, Text, TextInput, SectionList, Pressable, StyleSheet, Alert, useWindowDimensions} from 'react-native';
import {WebView} from 'react-native-webview';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, F, s, WIDE} from '../theme.js';
import {StatusShade, Button, Chip, BrandHeader} from '../components/ui.js';
import {citiesByCountry, cityRow} from '../../lib/listings.js';
import {CITY_COORDS, nearestCities, cityBySlug, placeText} from '../../lib/site.js';
import {cityMapHtml} from '../../lib/mapHtml.js';
import {locate} from '../state.js';

const ALL = citiesByCountry().map(g => ({...g, cities: g.cities.map(c => ({...c, at: CITY_COORDS[c.slug]}))}));
const MAP_HTML = cityMapHtml(ALL.flatMap(g => g.cities));

// Pick a country. Pick a city. Or let the phone find the closest ones.
export default function PlacesScreen({navigation}) {
  const insets = useSafeAreaInsets(), {width} = useWindowDimensions(), wide = width >= WIDE;
  const [q, setQ] = useState(''), [map, setMap] = useState(false), [near, setNear] = useState(null), [busy, setBusy] = useState(false);
  const open = slug => navigation.navigate('City', cityRow(cityBySlug(slug)));
  const sections = useMemo(() => {
    const want = placeText(q);
    return ALL.map(g => ({title: g.title, data: g.cities.filter(c => !want || placeText(c.name).includes(want) || placeText(g.title).includes(want))}))
      .filter(g => g.data.length);
  }, [q]);
  async function findNear() {
    setBusy(true);
    try { setNear(nearestCities(await locate(), 3).map(n => ({...n, name: cityBySlug(n.slug)[1]}))); }
    catch (e) { Alert.alert('Near me', e.message); }
    finally { setBusy(false); }
  }
  const header = <View style={{gap: 12, paddingBottom: 8}}>
    <BrandHeader/>
        <Text style={[s.h1, {textTransform: 'uppercase'}]}>Places</Text>
    <Text style={s.muted}>153 cities, islands and regions across the UK, Ireland and Europe.</Text>
    <View style={[{gap: 10}, wide && {flexDirection: 'row'}]}>
      <Button title="Near me" icon="◎" onPress={findNear} busy={busy} style={wide && {flex: 1}}/>
      <Button title={map ? 'Show the list' : 'Show the map'} icon={map ? '☰' : '🗺'} kind="ghost" onPress={() => setMap(!map)} style={wide && {flex: 1}}/>
    </View>
    {near ? <View style={p.near}>
      <Text style={s.eyebrow}>Closest to you</Text>
      {near.map(n => <Button key={n.slug} kind="secondary" title={`${n.name} · ${n.km < 10 ? n.km.toFixed(1) : Math.round(n.km)} km`} onPress={() => open(n.slug)}/>)}
    </View> : null}
    {!map ? <TextInput style={s.input} placeholder="Search places" placeholderTextColor={C.muted} value={q} onChangeText={setQ} autoCorrect={false} accessibilityLabel="Search places"/> : null}
  </View>;
  if (map) return <View style={[s.screen, {paddingTop: insets.top + 8}]}>
    <View style={s.pad}>{header}</View>
    <WebView style={{flex: 1, backgroundColor: C.bg}} originWhitelist={['*']} source={{html: MAP_HTML, baseUrl: 'https://theticketbunker.com/'}}
      onMessage={e => open(e.nativeEvent.data)} setSupportMultipleWindows={false}/>
  </View>;
  return <View style={s.screen}><SectionList style={s.screen} sections={sections} keyExtractor={c => c.slug} stickySectionHeadersEnabled={false}
    contentContainerStyle={{paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 40}} ListHeaderComponent={header} keyboardShouldPersistTaps="handled"
    renderSectionHeader={({section}) => <Text style={[s.eyebrow, {marginTop: 22, marginBottom: 8}]}>{section.title}</Text>}
    renderItem={({item}) => <Pressable accessibilityRole="button" onPress={() => open(item.slug)} style={({pressed}) => [p.row, pressed && {backgroundColor: C.cardHi}]}>
      <Text style={p.name}>{item.name}</Text><Text style={p.go}>→</Text>
    </Pressable>}/><StatusShade/></View>;
}
const p = StyleSheet.create({
  near: {gap: 8, backgroundColor: C.card, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: C.line},
  row: {minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, backgroundColor: C.card, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: C.line},
  name: {fontFamily: F.bold, color: C.text, fontSize: 18},
  go: {color: C.teal, fontSize: 22, fontFamily: F.bold}
});

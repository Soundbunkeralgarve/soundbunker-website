import React, {useMemo, useRef, useState} from 'react';
import {View, Text, TextInput, ScrollView, FlatList, Modal, Pressable, StyleSheet, Alert, Keyboard, useWindowDimensions} from 'react-native';
import {WebView} from 'react-native-webview';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, F, s, WIDE} from '../theme.js';
import {StatusShade, Button, BrandHeader} from '../components/ui.js';
import {citiesByCountry, countryName, cityRow} from '../../lib/listings.js';
import {nearestCities, cityBySlug} from '../../lib/site.js';
import {countryPlaces, matchingPlaces, submittedPlace, mapDestination} from '../../lib/places.js';
import {cityMapHtml} from '../../lib/mapHtml.js';
import {locate} from '../state.js';

const COUNTRIES = citiesByCountry().sort((a, b) => a.title.localeCompare(b.title));

export default function PlacesScreen({navigation}) {
  const insets = useSafeAreaInsets(), {width} = useWindowDimensions(), wide = width >= WIDE;
  const [country, setCountry] = useState(''), [q, setQ] = useState(''), [selected, setSelected] = useState(null);
  const [point, setPoint] = useState(null), [nearby, setNearby] = useState(false), [showCountries, setShowCountries] = useState(false);
  const [busy, setBusy] = useState(false), [mapError, setMapError] = useState(false);
  const interaction = useRef(0);
  const choices = useMemo(() => selected ? [] : matchingPlaces(q, country), [q, country, selected]);
  const pins = useMemo(() => countryPlaces(country), [country]);
  const mapHtml = useMemo(() => cityMapHtml(pins, point, 11, {selectedSlug: selected?.slug, location: nearby ? point : null}), [pins, point, selected, nearby]);
  const showMap = Boolean(country || selected);

  function chooseCountry(code) {
    interaction.current++;
    setCountry(code); setQ(''); setSelected(null); setPoint(null); setNearby(false); setMapError(false); setShowCountries(false);
    Keyboard.dismiss();
  }
  function choose(city, at = city.at, isNear = false) {
    interaction.current++;
    setCountry(city.country); setQ(city.name.replace(/^the /, '')); setSelected(city); setPoint(at); setNearby(isNear); setMapError(false);
    Keyboard.dismiss();
  }
  function changeQuery(value) {
    interaction.current++;
    setQ(value); setSelected(null); setPoint(null); setNearby(false);
  }
  function search() {
    const match = submittedPlace(q, country);
    if (match) choose(match);
    else Keyboard.dismiss();
  }
  async function findNear() {
    const request = ++interaction.current;
    setBusy(true);
    try {
      const at = await locate({fresh: true}), [best] = nearestCities(at, 1);
      if (request === interaction.current && best) choose({...cityRow(cityBySlug(best.slug)), at}, at, true);
    } catch (error) {
      if (request === interaction.current) Alert.alert('Near me', error.message);
    } finally { setBusy(false); }
  }
  function mapChoice(event) {
    const city = mapDestination(event.nativeEvent.data, country);
    if (city) choose(city);
  }

  return <View style={s.screen}><ScrollView style={s.screen} keyboardShouldPersistTaps="handled"
    contentContainerStyle={{paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 40}}>
    <BrandHeader/>
    <Text style={[s.h1, {textTransform: 'uppercase'}]}>Find your place.</Text>
    <Text style={[s.muted, {marginTop: 10, marginBottom: 24}]}>Choose a country, search a city or region, then see what’s on.</Text>
    <View style={p.panel}>
      <Text style={p.label}>Country</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Country: ${country ? countryName(country) : 'Choose a country'}`}
        accessibilityState={{expanded: showCountries}} onPress={() => {interaction.current++; setShowCountries(true);}}
        style={({pressed}) => [s.input, p.select, pressed && {borderColor: C.teal}]}>
        <Text style={p.selectText}>{country ? countryName(country) : 'Choose a country'}</Text><Text style={p.arrow}>⌄</Text>
      </Pressable>
      <Text style={[p.label, {marginTop: 18}]}>City or region</Text>
      <TextInput style={s.input} placeholder="Search a city, island or region" placeholderTextColor={C.muted} value={q} onChangeText={changeQuery}
        returnKeyType="search" onSubmitEditing={search} autoCorrect={false} accessibilityLabel="Search a city, island or region"/>
      {choices.length ? <View style={p.results}>{choices.map(city => <Pressable key={city.slug} accessibilityRole="button"
        accessibilityLabel={`${city.name}, ${countryName(city.country)}`} onPress={() => choose(city)}
        style={({pressed}) => [p.result, pressed && {backgroundColor: C.cardHi}]}>
        <View style={{flex: 1}}><Text style={p.name}>{city.name.replace(/^the /, '')}</Text><Text style={s.muted}>{countryName(city.country)}</Text></View><Text style={p.arrow}>→</Text>
      </Pressable>)}</View> : q.trim() && !selected ? <Text accessibilityLiveRegion="polite" style={[s.muted, {marginTop: 12}]}>No matching destination{country ? ` in ${countryName(country)}` : ''}. Try another city or region.</Text> : null}
      <View style={[p.actions, wide && {flexDirection: 'row'}]}>
        <Button title="Search" onPress={search} disabled={!q.trim()} style={wide && {flex: 1}}/>
        <Button title="Near me" icon="◎" onPress={findNear} busy={busy} kind="ghost" style={wide && {flex: 1}}/>
      </View>
    </View>
    {showMap ? <View style={p.mapPanel}>
      <Text accessibilityLiveRegion="polite" style={[s.eyebrow, {padding: 16}]}>{nearby ? 'Your area' : selected ? selected.name.replace(/^the /, '') : countryName(country)}</Text>
      {mapError ? <Text style={[s.muted, {padding: 20}]}>The map couldn’t load. You can still search and choose a destination above.</Text> : <WebView
        style={{height: wide ? 420 : 300, backgroundColor: C.bg}} originWhitelist={['*']} source={{html: mapHtml, baseUrl: 'https://theticketbunker.com/'}}
        onMessage={mapChoice} onError={() => setMapError(true)} onHttpError={() => setMapError(true)} nestedScrollEnabled setSupportMultipleWindows={false}
        accessibilityLabel={nearby ? 'Map centred on your area' : selected ? `Map centred on ${selected.name}` : `Destinations in ${countryName(country)}`}/>}
    </View> : <Text style={[s.muted, {marginTop: 20}]}>Choose a country to explore the map, or use Near me.</Text>}
    {selected ? <View style={p.selection}>
      <Text style={s.h3}>{nearby ? 'Your area' : selected.name.replace(/^the /, '')}</Text>
      <Text style={s.muted}>{nearby ? `Closest destination: ${selected.name.replace(/^the /, '')}` : countryName(selected.country)}</Text>
      <Button title={nearby ? 'See what’s on nearby' : 'See what’s on'} onPress={() => navigation.navigate('City', selected)} style={{marginTop: 14}}/>
    </View> : null}
  </ScrollView><StatusShade/>
    <Modal visible={showCountries} transparent animationType="slide" onRequestClose={() => setShowCountries(false)}>
      <View style={[p.modalBackdrop, {paddingTop: insets.top + 24, paddingBottom: insets.bottom + 18}]}>
        <View style={p.countrySheet} accessibilityViewIsModal>
          <View style={p.sheetHeader}><Text style={s.h2}>Choose a country</Text><Button title="Close" small kind="ghost" onPress={() => setShowCountries(false)}/></View>
          <FlatList data={COUNTRIES} keyExtractor={item => item.country} keyboardShouldPersistTaps="handled"
            renderItem={({item}) => <Pressable accessibilityRole="button" accessibilityState={{selected: country === item.country}}
              onPress={() => chooseCountry(item.country)} style={({pressed}) => [p.countryRow, (pressed || country === item.country) && {backgroundColor: C.cardHi}]}>
              <Text style={[p.name, {flex: 1}]}>{item.title}</Text><Text style={p.arrow}>{country === item.country ? '✓' : '→'}</Text>
            </Pressable>}/>
        </View>
      </View>
    </Modal>
  </View>;
}

const p = StyleSheet.create({
  panel: {backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 18},
  label: {fontFamily: F.bold, color: C.text, fontSize: 15, marginBottom: 8},
  select: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: C.bg},
  selectText: {fontFamily: F.medium, color: C.text, fontSize: 17, flex: 1},
  arrow: {fontFamily: F.bold, color: C.teal, fontSize: 22},
  actions: {gap: 12, marginTop: 18},
  results: {marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden'},
  result: {minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line},
  name: {fontFamily: F.bold, color: C.text, fontSize: 17},
  mapPanel: {marginTop: 20, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.line, backgroundColor: C.card},
  selection: {marginTop: 16, padding: 18, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.teal, gap: 6},
  modalBackdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: '#000b', paddingHorizontal: 18},
  countrySheet: {height: '85%', width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: C.card, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.line},
  sheetHeader: {padding: 18, gap: 16},
  countryRow: {minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line}
});

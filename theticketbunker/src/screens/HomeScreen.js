import React, {useEffect, useState} from 'react';
import {ScrollView, View, Text, TextInput, ImageBackground, StyleSheet, useWindowDimensions, Alert} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, F, s, WIDE} from '../theme.js';
import {Button, Chip, StatusShade, BrandHeader} from '../components/ui.js';
import EventCard from '../components/EventCard.js';
import {CATEGORY_KEYS, WHEN_OPTIONS, search, mixTypes, cityRow} from '../../lib/listings.js';
import {discoveryCategories, nearestCities, cityBySlug} from '../../lib/site.js';
import {locate} from '../state.js';

const POPULAR = ['london', 'manchester', 'glasgow', 'dublin', 'algarve', 'lisbon', 'barcelona', 'ibiza', 'paris', 'amsterdam', 'berlin', 'bristol'];

export default function HomeScreen({navigation}) {
  const insets = useSafeAreaInsets(), {width, height} = useWindowDimensions(), wide = width >= WIDE, short = height < 760;
  const [place, setPlace] = useState(''), [when, setWhen] = useState('any'), [category, setCategory] = useState('');
  const [soon, setSoon] = useState(null), [count, setCount] = useState(0), [finding, setFinding] = useState(false);

  useEffect(() => {
    search({}).then(r => { setSoon(mixTypes(r.items).slice(0, wide ? 12 : 8)); setCount(r.total); }).catch(() => setSoon([]));
  }, [wide]);

  const go = () => navigation.navigate('Results', {city: place.trim(), when, category});
  async function nearMe() {
    setFinding(true);
    try { const [best] = nearestCities(await locate(), 1); navigation.navigate('City', cityRow(cityBySlug(best.slug))); }
    catch (e) { Alert.alert('Near me', e.message); }
    finally { setFinding(false); }
  }

  return <View style={s.screen}><ScrollView style={s.screen} contentContainerStyle={{paddingBottom: 40}} keyboardShouldPersistTaps="handled">
    <ImageBackground source={require('../../assets/club.jpg')} style={[h.hero, {paddingTop: insets.top + (short ? 12 : 28)}]} imageStyle={{opacity: 0.45}}>
      <View style={[h.heroInner, wide && {maxWidth: 760}]}>
        <BrandHeader/>
        <Text style={s.eyebrow}>{count ? count.toLocaleString('en-GB') + ' events on sale' : 'Tickets on sale now'} · Algarve to Berlin</Text>
        <Text style={[s.h1, h.title, wide && !short && {fontSize: 72, lineHeight: 72}]}>Book it.{'\n'}<Text style={{color: C.teal}}>Head out.</Text></Text>
        <Text style={h.tagline}>Your night out, sorted.</Text>
        <TextInput style={[s.input, {marginTop: 18}]} placeholder="Where? Town, city or region" placeholderTextColor={C.muted} value={place} onChangeText={setPlace}
          returnKeyType="search" onSubmitEditing={go} autoCorrect={false} accessibilityLabel="Where"/>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={h.chips}>
          {WHEN_OPTIONS.map(([k, label]) => <Chip key={k} label={label} active={when === k} onPress={() => setWhen(k)}/>)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={h.chips}>
          <Chip label="Everything" active={!category} onPress={() => setCategory('')}/>
          {CATEGORY_KEYS.map(k => <Chip key={k} label={discoveryCategories[k]} active={category === k} onPress={() => setCategory(k)}/>)}
        </ScrollView>
        <View style={[h.actions, wide && {flexDirection: 'row'}]}>
          <Button title="Find events" icon="⌕" onPress={go} style={wide && {flex: 1}}/>
          <Button title="Near me" icon="◎" kind="ghost" onPress={nearMe} busy={finding} style={wide && {flex: 1}}/>
        </View>
      </View>
    </ImageBackground>

    <View style={[s.pad, h.section]}>
      <Text style={s.eyebrow}>Browse by type</Text>
      <View style={h.grid}>
        {CATEGORY_KEYS.map(k => <Button key={k} kind="secondary" title={discoveryCategories[k]} onPress={() => navigation.navigate('Results', {category: k})}
          lines={2} style={[h.tile, {width: wide ? '23.5%' : '48%'}]}/>)}
      </View>
    </View>

    <View style={[s.pad, h.section]}>
      <Text style={s.eyebrow}>Popular places</Text>
      <View style={h.wrap}>
        {POPULAR.map(slug => cityBySlug(slug)).filter(Boolean).map(row => <Chip key={row[0]} label={row[1]} onPress={() => navigation.navigate('City', cityRow(row))}/>)}
        <Chip label="All 153 places →" onPress={() => navigation.navigate('Tabs', {screen: 'Places'})}/>
      </View>
    </View>

    <View style={[s.pad, h.section]}>
      <Text style={s.eyebrow}>Coming up</Text>
      <Text style={[s.h2, {marginBottom: 12}]}>On soon. Mixed picks.</Text>
      {soon === null ? <Text style={s.muted}>Loading what’s on…</Text> : soon.length === 0 ? <Text style={s.muted}>Could not load listings. Check your connection.</Text> :
        <View style={[h.list, wide && h.listWide]}>
          {soon.map(item => <View key={item.key} style={wide ? {width: '49%'} : null}><EventCard item={item} onPress={() => navigation.navigate('Event', {item})}/></View>)}
        </View>}
      <Button title="See everything on" kind="ghost" onPress={() => navigation.navigate('Results', {})} style={{marginTop: 14}}/>
    </View>
  </ScrollView><StatusShade/></View>;
}
const h = StyleSheet.create({
  hero: {backgroundColor: C.bg, paddingHorizontal: 18, paddingBottom: 26},
  heroInner: {width: '100%', alignSelf: 'center'},
  title: {marginTop: 10, textTransform: 'uppercase'},
  tagline: {fontFamily: F.medium, color: C.text, fontSize: 22, marginTop: 6},
  chips: {gap: 8, paddingTop: 12},
  actions: {gap: 10, marginTop: 16},
  section: {marginTop: 28, gap: 10},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between'},
  tile: {minHeight: 72},
  wrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  list: {gap: 12},
  listWide: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12}
});

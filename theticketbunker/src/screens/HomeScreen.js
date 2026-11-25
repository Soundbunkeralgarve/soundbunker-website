import React, {useEffect, useRef, useState} from 'react';
import {ScrollView, View, Text, TextInput, ImageBackground, StyleSheet, useWindowDimensions, Alert, Pressable, ActivityIndicator} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, F, s, WIDE} from '../theme.js';
import {Button, Chip, StatusShade, BrandHeader} from '../components/ui.js';
import EventCard from '../components/EventCard.js';
import {CATEGORY_KEYS, WHEN_OPTIONS, search, mixTypes, cityRow} from '../../lib/listings.js';
import {discoveryCategories, nearestCities, cityBySlug} from '../../lib/site.js';
import {locate} from '../state.js';

const POPULAR = ['london', 'manchester', 'glasgow', 'dublin', 'algarve', 'lisbon', 'barcelona', 'ibiza', 'paris', 'amsterdam', 'berlin', 'bristol'];

export default function HomeScreen({navigation}) {
  const insets = useSafeAreaInsets(), {width} = useWindowDimensions(), wide = width >= WIDE;
  const [place, setPlace] = useState(''), [when, setWhen] = useState('any'), [category, setCategory] = useState('');
  const [soon, setSoon] = useState(null), [count, setCount] = useState(0), [finding, setFinding] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false), [featuredAt, setFeaturedAt] = useState(0);
  const featuredRail = useRef(null), cardWidth = Math.min(width - 54, 380), cardStep = cardWidth + 14;
  const featured = soon?.slice(0, 5) || [];

  useEffect(() => {
    let active = true;
    search({}).then(r => { if (active) {setSoon(mixTypes(r.items).slice(0, wide ? 12 : 8)); setCount(r.total);} }).catch(() => active && setSoon([]));
    return () => {active = false;};
  }, [wide]);
  useEffect(() => {setFeaturedAt(0); featuredRail.current?.scrollTo({x: 0, animated: false});}, [cardWidth]);

  const go = () => navigation.navigate('Results', {city: place.trim(), when, category});
  async function nearMe() {
    setFinding(true);
    try { const [best] = nearestCities(await locate(), 1); navigation.navigate('City', cityRow(cityBySlug(best.slug))); }
    catch (e) { Alert.alert('Near me', e.message); }
    finally { setFinding(false); }
  }

  return <View style={s.screen}><ScrollView style={s.screen} contentContainerStyle={{paddingBottom: 40}} keyboardShouldPersistTaps="handled">
    <ImageBackground source={require('../../assets/club.jpg')} style={[h.hero, {paddingTop: insets.top + 16}]} imageStyle={{opacity: 0.12}}>
      <View style={[h.heroInner, wide && {maxWidth: 1140}]}>
        <View style={h.brandRow}><BrandHeader style={h.brand}/><Text style={h.coverage}>UK & Europe</Text></View>
        <View style={h.liveRow}><View style={h.liveDot}/><Text style={h.liveText}>{count ? count.toLocaleString('en-GB') + ' events on sale' : 'Tickets on sale now'}</Text></View>
        <Text style={[s.h1, h.title, {fontSize: Math.min(86, Math.max(60, width * 0.18)), lineHeight: Math.min(82, Math.max(58, width * 0.174))}]}>Book it.{'\n'}<Text style={{color: C.teal}}>Head out.</Text></Text>
        <View style={h.titleRule}/>
        <Text style={h.tagline}>Lock in your next great memory.</Text>
      </View>
    </ImageBackground>

    {soon === null || featured.length > 0 ? <View style={h.featureSection}>
      <View style={h.featureHeading}><Text style={[s.eyebrow, {color: C.pink}]}>Hot right now</Text>{featured.length > 0 ? <Text style={h.featureCount}>{featuredAt + 1} / {featured.length}</Text> : null}</View>
      {soon === null ? <View style={[h.loadingTicket, {width: cardWidth}]}><ActivityIndicator color={C.teal}/><Text style={s.muted}>Loading tickets…</Text></View> : <>
        <ScrollView ref={featuredRail} horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={cardStep} snapToAlignment="start"
          contentContainerStyle={h.featureRail} accessibilityLabel="Featured tickets. Swipe to browse."
          onMomentumScrollEnd={event => setFeaturedAt(Math.max(0, Math.min(featured.length - 1, Math.round(event.nativeEvent.contentOffset.x / cardStep))))}>
          {featured.map(item => <View key={item.key} style={{width: cardWidth}}><EventCard featured item={item} onPress={() => navigation.navigate('Event', {item})}/></View>)}
        </ScrollView>
        <View style={h.featurePagination} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{featured.map((item, n) => <View key={item.key} style={[h.pageDot, n === featuredAt && h.pageDotActive]}/>)}</View>
      </>}
    </View> : null}

    <View style={[s.pad, h.searchSection]}>
      <View style={h.searchPanel}>
        <Text style={h.searchTitle}>Find your next plan.</Text>
        <Text style={h.inputLabel}>Where are you heading?</Text>
        <TextInput style={s.input} placeholder="Town, city or region" placeholderTextColor={C.muted} value={place} onChangeText={setPlace}
          returnKeyType="search" onSubmitEditing={go} autoCorrect={false} accessibilityLabel="Where"/>
        <Pressable accessibilityRole="button" accessibilityLabel="Dates and categories" accessibilityState={{expanded: filtersOpen}} onPress={() => setFiltersOpen(open => !open)} style={h.filterToggle}>
          <View style={h.filterSummary}><Text style={h.filterLabel}>Date & type</Text><Text style={s.muted}>{WHEN_OPTIONS.find(([k]) => k === when)?.[1] || 'Any date'} · {category ? discoveryCategories[category] : 'Everything'}</Text></View><Text style={h.filterAction}>{filtersOpen ? 'Done' : 'Edit'}</Text>
        </Pressable>
        {filtersOpen ? <View style={h.filters}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={h.chips}>
            {WHEN_OPTIONS.map(([k, label]) => <Chip key={k} label={label} active={when === k} onPress={() => setWhen(k)}/>)}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={h.chips}>
            <Chip label="Everything" active={!category} onPress={() => setCategory('')}/>
            {CATEGORY_KEYS.map(k => <Chip key={k} label={discoveryCategories[k]} active={category === k} onPress={() => setCategory(k)}/>)}
          </ScrollView>
        </View> : null}
        <View style={h.actions}>
          <Button title="Near me" kind="secondary" onPress={nearMe} busy={finding} style={{flex: 1, paddingHorizontal: 10}}/>
          <Button title="Find tickets" onPress={go} style={{flex: 1.25, paddingHorizontal: 10}}/>
        </View>
      </View>
    </View>

    <View style={[s.pad, h.section]}>
      <Text style={s.eyebrow}>Find your thing</Text>
      <Text style={s.h2}>Pick your next plan.</Text>
      <View style={h.grid}>
        {CATEGORY_KEYS.map(k => <Button key={k} kind="secondary" title={discoveryCategories[k]} onPress={() => navigation.navigate('Results', {category: k})}
          lines={2} style={[h.tile, {width: wide ? '23.5%' : '48%'}]}/>)}
      </View>
    </View>

    <View style={[s.pad, h.section]}>
      <Text style={s.eyebrow}>Explore UK & Europe</Text>
      <Text style={s.h2}>Find your city.</Text>
      <View style={h.wrap}>
        {POPULAR.map(slug => cityBySlug(slug)).filter(Boolean).map(row => <Chip key={row[0]} label={row[1]} onPress={() => navigation.navigate('City', cityRow(row))}/>)}
        <Chip label="All 153 places" onPress={() => navigation.navigate('Tabs', {screen: 'Places'})}/>
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
  hero: {backgroundColor: C.bg, paddingHorizontal: 20, paddingBottom: 24},
  heroInner: {width: '100%', alignSelf: 'center'},
  brandRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 26},
  brand: {width: 202, height: 34, marginBottom: 0},
  coverage: {fontFamily: F.medium, fontSize: 12, color: C.muted, flexShrink: 1, textAlign: 'right'},
  liveRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12},
  liveDot: {width: 6, height: 6, borderRadius: 3, backgroundColor: C.teal},
  liveText: {fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: '#d6dbe1'},
  title: {textTransform: 'uppercase', letterSpacing: -0.5},
  titleRule: {width: 76, height: 3, borderRadius: 2, backgroundColor: C.teal, marginTop: 16, marginBottom: 14},
  tagline: {fontFamily: F.medium, color: C.text, fontSize: 17, lineHeight: 24},
  featureSection: {paddingTop: 6, paddingBottom: 4},
  featureHeading: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 14},
  featureCount: {fontFamily: F.medium, fontSize: 13, color: C.muted},
  featureRail: {paddingHorizontal: 20, paddingBottom: 12, gap: 14},
  featurePagination: {flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 8},
  pageDot: {height: 4, width: 6, borderRadius: 2, backgroundColor: '#3c3c48'},
  pageDotActive: {width: 22, backgroundColor: C.teal},
  loadingTicket: {minHeight: 260, marginLeft: 20, borderRadius: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', gap: 14},
  searchSection: {marginTop: 22},
  searchPanel: {padding: 18, borderRadius: 22, backgroundColor: C.card, borderWidth: 1, borderColor: '#343441', gap: 10},
  searchTitle: {fontFamily: F.display, color: C.text, fontSize: 30, lineHeight: 32, marginBottom: 6, textTransform: 'uppercase'},
  inputLabel: {fontFamily: F.semibold, color: '#d6dbe1', fontSize: 14, lineHeight: 20},
  filterToggle: {minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10},
  filterSummary: {flex: 1, gap: 2},
  filterLabel: {fontFamily: F.semibold, color: C.text, fontSize: 14, lineHeight: 20},
  filterAction: {fontFamily: F.bold, fontSize: 14, color: C.teal},
  filters: {gap: 10, paddingBottom: 8},
  chips: {gap: 8},
  actions: {flexDirection: 'row', gap: 10, marginTop: 4},
  section: {marginTop: 34, gap: 10},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between'},
  tile: {minHeight: 70, borderRadius: 16, paddingHorizontal: 12},
  wrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  list: {gap: 12},
  listWide: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12}
});

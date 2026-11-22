import React, {useEffect, useState} from 'react';
import {View, Text, ScrollView, StyleSheet} from 'react-native';
import {s} from '../theme.js';
import {Chip, Loading, Empty, Button} from '../components/ui.js';
import SplitList from '../components/SplitList.js';
import {CATEGORY_KEYS, WHEN_OPTIONS, search} from '../../lib/listings.js';
import {discoveryCategories} from '../../lib/site.js';

// Event lists by place, date and type. Also the body of every city page.
export function useSearch(params) {
  const [state, set] = useState({loading: true, items: [], error: ''});
  const key = JSON.stringify(params);
  useEffect(() => {
    let live = true; set(v => ({...v, loading: true, error: ''}));
    search(params).then(r => live && set({loading: false, items: r.items, error: ''}))
      .catch(e => live && set({loading: false, items: [], error: e.message}));
    return () => { live = false; };
  }, [key]);
  return state;
}
export function Filters({when, setWhen, category, setCategory}) {
  return <View style={{gap: 8, marginBottom: 6}}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={f.row}>
      {WHEN_OPTIONS.map(([k, label]) => <Chip key={k} label={label} active={when === k} onPress={() => setWhen(k)}/>)}
    </ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={f.row}>
      <Chip label="Everything" active={!category} onPress={() => setCategory('')}/>
      {CATEGORY_KEYS.map(k => <Chip key={k} label={discoveryCategories[k]} active={category === k} onPress={() => setCategory(k)}/>)}
    </ScrollView>
  </View>;
}
export default function ResultsScreen({route, navigation}) {
  const p = route.params || {};
  const [when, setWhen] = useState(p.when || 'any'), [category, setCategory] = useState(p.category || '');
  const result = useSearch({city: p.city || '', category, when});
  useEffect(() => { navigation.setOptions({title: p.city || (category ? discoveryCategories[category] : 'Everything on')}); }, [p.city, category]);
  const header = <View>
    <Text style={[s.h2, {marginBottom: 4}]}>{[category ? discoveryCategories[category] : 'Everything on', p.city && 'in ' + p.city].filter(Boolean).join(' ')}</Text>
    <Text style={[s.muted, {marginBottom: 12}]}>{result.loading ? 'Searching…' : `${result.items.length} found · soonest first`}</Text>
    <Filters {...{when, setWhen, category, setCategory}}/>
  </View>;
  if (result.error) return <View style={s.screen}><Empty title="Could not load events" text={result.error}/></View>;
  if (result.loading) return <View style={s.screen}>{header && <View style={{padding: 16}}>{header}</View>}<Loading label="Finding events…"/></View>;
  return <View style={s.screen}><SplitList items={result.items} header={header} navigation={navigation}/></View>;
}
const f = StyleSheet.create({row: {gap: 8}});

import React, {useEffect, useState} from 'react';
import {View, Text} from 'react-native';
import {s} from '../theme.js';
import {Loading, Empty} from '../components/ui.js';
import SplitList from '../components/SplitList.js';
import {useSearch, Filters} from './ResultsScreen.js';
import {countryName} from '../../lib/listings.js';

// One of the site's 153 city pages: that place preset, with what is on there.
export default function CityScreen({route, navigation}) {
  const city = route.params;
  const [when, setWhen] = useState('any'), [category, setCategory] = useState('');
  const result = useSearch({city: city.query, country: city.country, category, when});
  useEffect(() => { navigation.setOptions({title: city.name}); }, [city.slug]);
  const header = <View>
    <Text style={s.eyebrow}>{countryName(city.country)}</Text>
    <Text style={[s.h1, {fontSize: 38, lineHeight: 40, textTransform: 'uppercase', marginTop: 4}]}>What’s on in {city.name}</Text>
    <Text style={[s.muted, {marginVertical: 10}]}>{city.pitch.charAt(0).toUpperCase() + city.pitch.slice(1)}.</Text>
    <Filters {...{when, setWhen, category, setCategory}}/>
    {!result.loading ? <Text style={[s.muted, {marginBottom: 4}]}>{result.items.length} found · soonest first</Text> : null}
  </View>;
  if (result.error) return <View style={s.screen}><Empty title="Could not load events" text={result.error}/></View>;
  if (result.loading) return <View style={s.screen}><View style={{padding: 16}}>{header}</View><Loading label={`Finding events in ${city.name}…`}/></View>;
  return <View style={s.screen}><SplitList items={result.items} header={header} navigation={navigation}
    empty={<Empty title={`Nothing listed in ${city.name} for that choice`} text="Try Any date or Everything. Tours and days out are added as partners approve us."/>}/></View>;
}

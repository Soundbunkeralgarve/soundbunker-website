import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, FlatList, RefreshControl, useWindowDimensions, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, s, WIDE} from '../theme.js';
import {Button, Chip, Empty, Loading, StatusShade} from '../components/ui.js';
import EventRow from '../components/EventRow.js';
import EventDashboard from '../components/EventDashboard.js';
import AccountBanner from '../components/AccountBanner.js';
import {useOrganiser} from '../state.js';
import {groupEvents} from '../../lib/organiser.js';

const TABS = [['live', 'Live'], ['drafts', 'Drafts'], ['past', 'Past']];
export default function EventsScreen({navigation}) {
  const org = useOrganiser(), insets = useSafeAreaInsets(), {width} = useWindowDimensions(), wide = width >= WIDE;
  const groups = useMemo(() => groupEvents(org.events), [org.events]);
  const [tab, setTab] = useState(null), [picked, setPicked] = useState(null), [refreshing, setRefreshing] = useState(false);
  const current = tab || (groups.live.length ? 'live' : groups.drafts.length ? 'drafts' : 'live');
  const items = groups[current];
  useEffect(() => { if (wide && items.length && !items.some(e => e.id === picked)) setPicked(items[0].id); }, [wide, items]);
  if (!org.loaded) return <View style={[s.screen, {paddingTop: insets.top}]}><Loading label="Loading your events…"/></View>;
  if (!org.organiser) return <View style={[s.screen, {paddingTop: insets.top}]}><AccountBanner/></View>;
  const header = <View style={{gap: 12, marginBottom: 6}}>
    <Text style={s.eyebrow}>{org.organiser.display_name}</Text>
    <Text style={[s.h1, {textTransform: 'uppercase'}]}>My events</Text>
    <AccountBanner compact/>
    <Button title="Create an event" icon="+" onPress={() => navigation.navigate('EventForm', {})}/>
    <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap'}}>
      {TABS.map(([k, label]) => <Chip key={k} label={`${label} · ${groups[k].length}`} active={current === k} onPress={() => setTab(k)}/>)}
    </View>
    {org.error ? <Text style={[s.body, {color: C.bad}]}>{org.error}</Text> : null}
  </View>;
  const list = <FlatList data={items} keyExtractor={e => e.id} ListHeaderComponent={header}
    contentContainerStyle={{paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 40, gap: 12}}
    refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.teal} onRefresh={async () => { setRefreshing(true); await org.reload(); setRefreshing(false); }}/>}
    ListEmptyComponent={<Empty title={current === 'live' ? 'No live events yet' : current === 'drafts' ? 'No drafts' : 'No past events'} text="Create an event to get started. It stays private until you publish it."/>}
    renderItem={({item}) => <EventRow event={item} selected={wide && picked === item.id} onPress={() => wide ? setPicked(item.id) : navigation.navigate('Event', {id: item.id})}/>}/>;
  return <View style={s.screen}>
    {wide ? <View style={l.row}><View style={l.left}>{list}</View><View style={[l.right, {paddingTop: insets.top}]}>
      {picked && org.event(picked) ? <EventDashboard key={picked} id={picked} navigation={navigation}/> : <Empty title="Choose an event" text="Its sales, door and guest list appear here."/>}
    </View></View> : list}
    <StatusShade/>
  </View>;
}
const l = StyleSheet.create({row: {flex: 1, flexDirection: 'row'}, left: {flex: 0.44, borderRightWidth: 1, borderRightColor: C.line}, right: {flex: 0.56}});

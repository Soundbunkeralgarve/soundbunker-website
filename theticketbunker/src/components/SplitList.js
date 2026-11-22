import React, {useEffect, useState} from 'react';
import {View, FlatList, useWindowDimensions, StyleSheet} from 'react-native';
import {C, WIDE} from '../theme.js';
import EventCard from './EventCard.js';
import EventDetail from './EventDetail.js';
import {Empty} from './ui.js';

// Phones: a list that opens each event. iPad/tablets: the list on the left, the chosen
// event on the right.
export default function SplitList({items, header, navigation, empty}) {
  const {width} = useWindowDimensions(), wide = width >= WIDE;
  const [picked, setPicked] = useState(null);
  useEffect(() => { if (wide && items.length && !items.some(i => i.key === picked?.key)) setPicked(items[0]); }, [wide, items]);
  const list = <FlatList data={items} keyExtractor={i => i.key} ListHeaderComponent={header} ListEmptyComponent={empty || <Empty title="Nothing found" text="Try another date or type, or a nearby town."/>}
    contentContainerStyle={{padding: 16, gap: 12, paddingBottom: 40}} initialNumToRender={12} windowSize={9}
    renderItem={({item}) => <EventCard item={item} selected={wide && picked?.key === item.key} onPress={() => wide ? setPicked(item) : navigation.navigate('Event', {item})}/>}/>;
  if (!wide) return list;
  return <View style={l.row}>
    <View style={l.left}>{list}</View>
    <View style={l.right}>{picked ? <EventDetail key={picked.key} item={picked} compact onOpenTrip={() => navigation.navigate('Tabs', {screen: 'Trip'})}/> : null}</View>
  </View>;
}
const l = StyleSheet.create({
  row: {flex: 1, flexDirection: 'row', backgroundColor: C.bg},
  left: {flex: 0.46, borderRightWidth: 1, borderRightColor: C.line},
  right: {flex: 0.54}
});

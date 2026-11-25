import React from 'react';
import {Pressable, Text, View, StyleSheet} from 'react-native';
import {Image} from 'expo-image';
import {C, F, s} from '../theme.js';
import {whenText, priceText, sellerText, placeLine} from '../../lib/format.js';
import {discoveryCategories} from '../../lib/site.js';

export default function EventCard({item, onPress, selected}) {
  const price = priceText(item);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${whenText(item)}, ${placeLine(item)}`} onPress={onPress}
    style={({pressed}) => [e.card, selected && e.selected, pressed && {opacity: 0.85}]}>
    {item.image ? <Image source={item.image} style={e.img} contentFit="cover" transition={150}/> : <View style={[e.img, e.noImg]}><Text style={e.noImgText}>TB</Text></View>}
    <View style={e.body}>
      <Text style={e.when} numberOfLines={1}>{whenText(item)}</Text>
      <Text style={e.title} numberOfLines={2}>{item.title}</Text>
      <Text style={s.muted} numberOfLines={1}>{placeLine(item) || discoveryCategories[item.category]}</Text>
      <View style={e.row}>
        {price ? <Text style={e.price}>{price}</Text> : null}
        <Text style={[e.seller, !item.external && {color: C.teal}]} numberOfLines={1}>{sellerText(item)}</Text>
      </View>
    </View>
  </Pressable>;
}
const e = StyleSheet.create({
  card: {flexDirection: 'row', backgroundColor: C.card, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.line, minHeight: 124},
  selected: {borderColor: C.teal, borderWidth: 2},
  img: {width: 112, backgroundColor: C.cardHi},
  noImg: {alignItems: 'center', justifyContent: 'center'},
  noImgText: {fontFamily: F.display, color: C.teal, fontSize: 30},
  body: {flex: 1, padding: 14, gap: 3},
  when: {fontFamily: F.bold, color: C.teal, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.4},
  title: {fontFamily: F.heading, color: C.text, fontSize: 26, lineHeight: 27},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap'},
  price: {fontFamily: F.bold, color: C.text, fontSize: 14},
  seller: {fontFamily: F.body, color: C.muted, fontSize: 13, flexShrink: 1}
});

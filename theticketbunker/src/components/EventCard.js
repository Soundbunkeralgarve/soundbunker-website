import React from 'react';
import {Pressable, Text, View, StyleSheet} from 'react-native';
import {Image} from 'expo-image';
import {C, F, s} from '../theme.js';
import {whenText, priceText, sellerText, placeLine} from '../../lib/format.js';
import {discoveryCategories} from '../../lib/site.js';

export default function EventCard({item, onPress, selected, featured = false}) {
  const price = priceText(item), category = discoveryCategories[item.category] || 'Event';
  const artwork = item.image
    ? <Image source={item.image} style={featured ? e.featureImage : e.img} contentFit="cover" transition={150}/>
    : <View style={[featured ? e.featureImage : e.img, e.noImg]}><Text style={e.noImgText}>TB</Text></View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${whenText(item)}, ${placeLine(item)}, ${sellerText(item)}`} onPress={onPress}
    style={({pressed}) => [e.card, featured && e.featured, selected && e.selected, pressed && {opacity: 0.85}]}>
    {featured ? <View style={e.featureArt}>{artwork}<View style={e.categoryBadge}><Text style={e.categoryText}>{category}</Text></View></View> : artwork}
    <View style={[e.body, featured && e.featureBody]}>
      <Text style={e.when} numberOfLines={1}>{whenText(item)}</Text>
      <Text style={[e.title, featured && e.featureTitle]} numberOfLines={2}>{item.title}</Text>
      <Text style={s.muted} numberOfLines={1}>{placeLine(item) || category}</Text>
      {!featured ? <View style={e.row}>
        {price ? <Text style={e.price}>{price}</Text> : null}
        <Text style={[e.seller, !item.external && {color: C.teal}]} numberOfLines={1}>{sellerText(item)}</Text>
      </View> : null}
    </View>
    {featured ? <View style={e.stub}>
      <View style={e.stubNotchLeft}/><View style={e.stubNotchRight}/>
      <View style={e.stubInfo}>{price ? <Text style={e.featurePrice}>{price}</Text> : null}<Text style={e.featureSeller} numberOfLines={2}>{sellerText(item)}</Text></View>
      <View style={e.ticketButton}><Text style={e.ticketButtonText}>Tickets</Text></View>
    </View> : null}
  </Pressable>;
}
const e = StyleSheet.create({
  card: {flexDirection: 'row', backgroundColor: C.card, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.line, minHeight: 138},
  selected: {borderColor: C.teal, borderWidth: 2},
  img: {width: 112, backgroundColor: C.cardHi},
  noImg: {alignItems: 'center', justifyContent: 'center'},
  noImgText: {fontFamily: F.display, color: C.teal, fontSize: 42},
  body: {flex: 1, padding: 14, gap: 5},
  when: {fontFamily: F.bold, color: C.teal, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.4},
  title: {fontFamily: F.heading, color: C.text, fontSize: 26, lineHeight: 27},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap'},
  price: {fontFamily: F.bold, color: C.text, fontSize: 14},
  seller: {fontFamily: F.body, color: C.muted, fontSize: 13, flexShrink: 1},
  featured: {flexDirection: 'column', borderRadius: 22, borderColor: '#343441', shadowColor: '#000', shadowOffset: {width: 0, height: 12}, shadowOpacity: 0.24, shadowRadius: 18, elevation: 4},
  featureArt: {position: 'relative', overflow: 'hidden', backgroundColor: C.cardHi},
  featureImage: {width: '100%', aspectRatio: 1.45, backgroundColor: C.cardHi},
  categoryBadge: {position: 'absolute', left: 14, top: 14, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#07070bd9'},
  categoryText: {fontFamily: F.bold, fontSize: 12, lineHeight: 16, color: C.teal, textTransform: 'uppercase', letterSpacing: 0.6},
  featureBody: {flex: 0, padding: 16, gap: 7, minHeight: 126},
  featureTitle: {fontFamily: F.display, fontSize: 30, lineHeight: 31, textTransform: 'uppercase', minHeight: 62},
  stub: {position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingTop: 14, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: '#454553', backgroundColor: '#0c0c13'},
  stubInfo: {flex: 1, gap: 3},
  featurePrice: {fontFamily: F.display, color: C.text, fontSize: 25, lineHeight: 27},
  featureSeller: {fontFamily: F.body, color: C.muted, fontSize: 12, lineHeight: 17},
  stubNotchLeft: {position: 'absolute', width: 18, height: 18, borderRadius: 9, top: -9, left: -10, backgroundColor: C.bg},
  stubNotchRight: {position: 'absolute', width: 18, height: 18, borderRadius: 9, top: -9, right: -10, backgroundColor: C.bg},
  ticketButton: {minHeight: 44, borderRadius: 999, paddingHorizontal: 18, justifyContent: 'center', backgroundColor: C.teal},
  ticketButtonText: {fontFamily: F.bold, fontSize: 14, color: C.tealInk}
});

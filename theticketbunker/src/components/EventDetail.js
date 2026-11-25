import React from 'react';
import {ScrollView, View, Text, StyleSheet, Share, Alert} from 'react-native';
import {Image} from 'expo-image';
import {C, F, s} from '../theme.js';
import {Button} from './ui.js';
import {whenText, priceText, sellerText} from '../../lib/format.js';
import {discoveryCategories} from '../../lib/site.js';
import {ticketLink} from '../../lib/planner.js';
import {earlyAccessUntil} from '../../lib/vip.js';
import {useTrip} from '../state.js';
import {openPage} from '../open.js';
import GetThere from './GetThere.js';

export default function EventDetail({item, onOpenTrip, compact}) {
  const trip = useTrip(), saved = trip.has(item.key || item.id || item.url);
  const price = priceText(item), vipUntil = earlyAccessUntil(item);
  const tickets = () => { openPage(ticketLink(item, 'app-event')); if (!saved) trip.save(item); };
  const share = () => Share.share({message: `${item.title} · ${whenText(item)}\n${ticketLink(item, 'app-share')}`}).catch(() => {});
  return <ScrollView style={s.screen} contentContainerStyle={{paddingBottom: 48}}>
    {item.image ? <Image source={item.image} style={[d.img, compact && {height: 220}]} contentFit="cover" transition={150}/> : null}
    <View style={[s.pad, {gap: 8, paddingTop: 18}]}>
      <Text style={s.eyebrow}>{discoveryCategories[item.category] || 'Event'}</Text>
      <Text style={s.h2}>{item.title}</Text>
      <Text style={d.when}>{whenText(item, 'long')}</Text>
      {item.venue ? <Text style={s.h3}>{item.venue}</Text> : null}
      <Text style={s.muted}>{item.address || item.city}</Text>
      <View style={d.box}>
        {price ? <Text style={d.price}>{price}</Text> : null}
        <Text style={[s.body, !item.external && {color: C.teal}]}>{sellerText(item)}</Text>
        {item.external ? <Text style={s.muted}>{item.seller} sells, delivers and supports this ticket. Prices on their site are final.</Text>
          : <Text style={s.muted}>Pay securely with TicketBunker. Your tickets appear in My tickets.</Text>}
      </View>
      {vipUntil ? <Text style={[s.body, {color: '#d9b35b'}]}>VIP early access until {whenText({startsAt: vipUntil, timezone: item.timezone}, 'long')}. TicketBunker VIP members can book now; everyone else from then.</Text> : null}
      {item.soldOut ? <Button title="Sold out" disabled/> : <Button title={item.external ? `Get tickets on ${item.seller}` : 'Get tickets'} onPress={tickets}/>}
      <Button title={saved ? 'In My trip ✓' : 'Add to My trip'} kind={saved ? 'secondary' : 'ghost'}
        onPress={() => { if (saved) { onOpenTrip?.(); } else { trip.save(item); Alert.alert('Saved to My trip', 'Plan getting there, a bed and food for this night in My trip.'); } }}/>
      <Text style={[s.eyebrow, {marginTop: 22}]}>Get to the venue</Text>
      <GetThere place={item}/>
      <Button title="Share" kind="secondary" small onPress={share} style={{marginTop: 20}}/>
    </View>
  </ScrollView>;
}
const d = StyleSheet.create({
  img: {width: '100%', height: 280, backgroundColor: C.card},
  when: {fontFamily: F.bold, color: C.teal, fontSize: 17},
  box: {backgroundColor: C.card, borderRadius: 18, padding: 16, gap: 4, marginVertical: 10, borderWidth: 1, borderColor: C.line},
  price: {fontFamily: F.display, color: C.text, fontSize: 26}
});

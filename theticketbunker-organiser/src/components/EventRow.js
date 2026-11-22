import React from 'react';
import {Pressable, View, Text, StyleSheet} from 'react-native';
import {Image} from 'expo-image';
import {C, F, s} from '../theme.js';
import {statusLabel, whenText} from '../../lib/organiser.js';

export default function EventRow({event, onPress, selected}) {
  const live = event.status === 'published';
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed}) => [r.row, selected && r.on, pressed && {opacity: 0.85}]}>
    {event.image_url ? <Image source={event.image_url} style={r.img} contentFit="cover"/> : <View style={[r.img, r.noImg]}><Text style={r.tb}>TB</Text></View>}
    <View style={{flex: 1, gap: 3}}>
      <Text style={[r.status, !live && {color: C.warn}, event.status === 'cancelled' && {color: C.bad}]}>{statusLabel(event).toUpperCase()}</Text>
      <Text style={s.h3} numberOfLines={2}>{event.title}</Text>
      <Text style={s.muted} numberOfLines={1}>{[whenText(event.starts_at, event.venue_timezone), event.venue].filter(Boolean).join(' · ')}</Text>
    </View>
    <Text style={r.go}>›</Text>
  </Pressable>;
}
const r = StyleSheet.create({
  row: {flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: C.card, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: C.line, minHeight: 104},
  on: {borderColor: C.teal, borderWidth: 2},
  img: {width: 72, height: 80, borderRadius: 12, backgroundColor: C.cardHi},
  noImg: {alignItems: 'center', justifyContent: 'center'},
  tb: {fontFamily: F.display, color: C.teal, fontSize: 24},
  status: {fontFamily: F.bold, color: C.teal, fontSize: 12, letterSpacing: 1},
  go: {color: C.teal, fontSize: 30, fontFamily: F.bold, paddingHorizontal: 4}
});

import React from 'react';
import {ScrollView, View, Text, StyleSheet, Pressable, useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, F, s, WIDE} from '../theme.js';
import {StatusShade, Button, Empty} from '../components/ui.js';
import GetThere from '../components/GetThere.js';
import {useTrip} from '../state.js';
import {plannerSteps} from '../../lib/planner.js';
import {whenText} from '../../lib/format.js';
import {openPage} from '../open.js';

// My trip: each saved night as a short checklist — tickets, getting there, a bed, food, extras.
export default function TripScreen({navigation}) {
  const insets = useSafeAreaInsets(), {width} = useWindowDimensions(), wide = width >= WIDE;
  const {trip, mark, remove} = useTrip();
  return <View style={s.screen}><ScrollView style={s.screen} contentContainerStyle={{paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 40, gap: 16}}>
    <Text style={[s.h1, {textTransform: 'uppercase'}]}>My trip</Text>
    <Text style={s.muted}>Make a night of it. Each step books on the partner’s own site; we keep the plan on this phone.</Text>
    {!trip.length ? <Empty title="No nights planned yet" text="Tap Add to My trip on any event to plan getting there, a bed and food."
      action={<Button title="Find something on" onPress={() => navigation.navigate('Discover')}/>}/> :
      <View style={[{gap: 16}, wide && {flexDirection: 'row', flexWrap: 'wrap'}]}>
        {trip.map(n => <Night key={n.id} night={n} wide={wide} mark={mark} remove={remove} navigation={navigation}/>)}
      </View>}
  </ScrollView><StatusShade/></View>;
}
function Night({night, wide, mark, remove, navigation}) {
  const steps = plannerSteps(night);
  return <View style={[t.night, wide && {width: '48.8%'}]}>
    <Pressable onPress={() => navigation.navigate('Event', {item: {...night, key: night.id}})} accessibilityRole="button">
      <Text style={t.when}>{[whenText(night), night.venue, night.city].filter(Boolean).join(' · ')}</Text>
      <Text style={s.h3}>{night.title}</Text>
    </Pressable>
    {steps.map((step, i) => {
      const done = Boolean(night.done?.[step.kind]), live = step.links.length > 0;
      return <View key={step.kind} style={[t.step, done && {borderColor: C.teal}]}>
        <View style={t.stepHead}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{checked: done}} accessibilityLabel={`${step.label} done`} onPress={() => mark(night.id, step.kind, !done)}
            style={[t.num, done && {backgroundColor: C.teal}]} hitSlop={10}>
            <Text style={[t.numText, done && {color: C.tealInk}]}>{done ? '✓' : i + 1}</Text>
          </Pressable>
          <View style={{flex: 1}}>
            <Text style={t.label}>{step.label}</Text>
            <Text style={s.muted}>{live ? step.blurb : 'Coming soon'}</Text>
          </View>
        </View>
        {step.kind === 'route' ? <GetThere place={night}/> :
          live ? <View style={{gap: 8}}>{step.links.map(l => <Button key={l.name} small kind={step.kind === 'tickets' ? 'primary' : 'secondary'} title={l.name}
            onPress={() => { openPage(l.url); if (step.kind !== 'tickets') mark(night.id, step.kind, true); }}/>)}</View> : null}
      </View>;
    })}
    <Button title="Remove this night" kind="ghost" small onPress={() => remove(night.id)}/>
  </View>;
}
const t = StyleSheet.create({
  night: {backgroundColor: C.card, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: C.line},
  when: {fontFamily: F.bold, color: C.teal, fontSize: 13, textTransform: 'uppercase', marginBottom: 4},
  step: {gap: 10, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 12, backgroundColor: C.bg},
  stepHead: {flexDirection: 'row', alignItems: 'center', gap: 12},
  num: {width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: C.teal, alignItems: 'center', justifyContent: 'center'},
  numText: {fontFamily: F.bold, color: C.teal, fontSize: 17},
  label: {fontFamily: F.bold, color: C.text, fontSize: 17}
});

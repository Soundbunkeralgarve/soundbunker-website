import React, {useEffect, useState} from 'react';
import {ScrollView, View, Text, Pressable, KeyboardAvoidingView, Platform, StyleSheet} from 'react-native';
import {C, F, s} from '../theme.js';
import {Button} from '../components/ui.js';
import Field from '../components/Field.js';
import {useOrganiser, call} from '../state.js';
import {pricedTicketRows, money} from '../../lib/organiser.js';

const blank = name => ({name, price: '', capacity: '100'});
// Step 2: ticket types. Only rows with a price are saved, as on the web portal.
export default function TiersScreen({route, navigation}) {
  const org = useOrganiser(), event = org.event(route.params.id), saved = event?.tiers || [];
  const [rows, setRows] = useState(saved.length ? [blank('')] : [blank('General Admission'), blank('VIP')]);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  useEffect(() => { navigation.setOptions({title: 'Ticket types'}); }, []);
  if (!event) return null;
  const symbol = event.currency === 'gbp' ? '£' : '€';
  const edit = (i, k) => v => setRows(r => r.map((row, j) => j === i ? {...row, [k]: v} : row));
  async function save() {
    setBusy(true); setMsg('');
    try {
      const tiers = pricedTicketRows(rows);
      await call('organiser', {action: 'tiers', eventId: event.id, tiers});
      await org.reload();
      navigation.replace('Event', {id: event.id});
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 18, gap: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center'}}>
      <Text style={s.eyebrow}>Step 2 of 3 · Tickets</Text>
      <Text style={s.h2}>{event.title}</Text>
      {saved.length ? <View style={t.box}>
        <Text style={s.h3}>Saved ticket types</Text>
        {saved.map(x => <Text key={x.id || x.name} style={s.body}>{x.name} · {money(x.price_cents, event.currency)} · {Number(x.quantity_total)} tickets</Text>)}
        <Button title="Next: review & publish" small onPress={() => navigation.replace('Event', {id: event.id})}/>
      </View> : null}
      <Text style={s.muted}>Enter the full buyer price including applicable VAT / IVA. Leave the price blank to skip a row. Up to 2,000 tickets self-service; buyers pay no booking fee.</Text>
      {rows.map((row, i) => <View key={i} style={t.row}>
        <Field label="Ticket name" value={row.name} onChangeText={edit(i, 'name')} maxLength={100} placeholder="e.g. Early bird"/>
        <View style={{flexDirection: 'row', gap: 10}}>
          <Field label={`Price ${symbol}`} value={row.price} onChangeText={edit(i, 'price')} keyboardType="decimal-pad" placeholder="0.00" style={{flex: 1}}/>
          <Field label="Quantity" value={row.capacity} onChangeText={edit(i, 'capacity')} keyboardType="number-pad" style={{flex: 1}}/>
        </View>
        {rows.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${row.name || 'ticket type'}`} onPress={() => setRows(r => r.filter((_, j) => j !== i))} hitSlop={10}>
          <Text style={t.remove}>Remove</Text></Pressable> : null}
      </View>)}
      <Button title="+ Add ticket type" kind="ghost" small disabled={rows.length >= 10} onPress={() => setRows(r => [...r, blank('')])}/>
      {msg ? <Text style={[s.body, {color: C.bad}]}>{msg}</Text> : null}
      <Button title="Save ticket types" busy={busy} onPress={save}/>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const t = StyleSheet.create({
  box: {gap: 8, backgroundColor: C.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.teal},
  row: {gap: 10, backgroundColor: C.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.line},
  remove: {fontFamily: F.bold, color: C.bad, fontSize: 15}
});

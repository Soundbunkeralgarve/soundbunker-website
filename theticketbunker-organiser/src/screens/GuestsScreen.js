import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, View, Text, Alert, StyleSheet} from 'react-native';
import {C, F, s} from '../theme.js';
import {Button, Chip, Loading} from '../components/ui.js';
import Field from '../components/Field.js';
import {useOrganiser, call} from '../state.js';
import {guestRoster, isVipAllocation} from '../../lib/organiser.js';

// Guest list: give an artist a number of free passes on a ticket type; they name their guests.
export default function GuestsScreen({route, navigation}) {
  const org = useOrganiser(), id = route.params.id, event = org.event(id);
  const [roster, setRoster] = useState(null), [tiers, setTiers] = useState([]), [form, setForm] = useState({name: '', email: '', tierId: '', quota: '5'});
  const [busy, setBusy] = useState(''), [msg, setMsg] = useState(''), [vip, setVip] = useState({tierId: '', quota: '10'});
  const load = useCallback(async () => {
    try {
      const [g, c] = await Promise.all([call('event-guest-list?eventId=' + encodeURIComponent(id)), call('event-capacity?eventId=' + encodeURIComponent(id))]);
      setRoster(guestRoster(g)); setTiers(c.tiers || []); setForm(f => ({...f, tierId: f.tierId || c.tiers?.[0]?.id || ''})); setVip(v => ({...v, tierId: v.tierId || c.tiers?.[0]?.id || ''}));
    } catch (e) { setMsg(e.message); setRoster([]); }
  }, [id]);
  useEffect(() => { navigation.setOptions({title: 'Guest list'}); load(); }, [load]);
  const act = async (key, body, done) => {
    setBusy(key); setMsg('');
    try { const r = await call('event-guest-list', {eventId: id, ...body}); await load(); setMsg(r.emailSent === false ? 'Saved. The email could not be sent; use Retry email.' : done); }
    catch (e) { setMsg(e.message); } finally { setBusy(''); }
  };
  if (!event) return null;
  return <ScrollView style={s.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 18, gap: 14, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center'}}>
    <Text style={s.eyebrow}>{event.title}</Text>
    <Text style={s.body}>Give a DJ, band or artist free passes. They get an email to name their guests; each guest gets a real ticket.</Text>
    <Field label="DJ / band name" value={form.name} onChangeText={v => setForm(f => ({...f, name: v}))} maxLength={100}/>
    <Field label="Artist email" value={form.email} onChangeText={v => setForm(f => ({...f, email: v}))} autoCapitalize="none" keyboardType="email-address"/>
    <Text style={[s.body, {fontSize: 15, color: C.muted}]}>Ticket type</Text>
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{tiers.map(t => <Chip key={t.id} label={t.name} active={form.tierId === t.id} onPress={() => setForm(f => ({...f, tierId: t.id}))}/>)}</View>
    <Field label="Free passes" value={form.quota} onChangeText={v => setForm(f => ({...f, quota: v}))} keyboardType="number-pad"/>
    <Button title="Allocate & email invitation" busy={busy === 'create'} disabled={form.name.trim().length < 2 || !form.email.includes('@') || !form.tierId}
      onPress={() => act('create', {action: 'create', name: form.name.trim(), email: form.email.trim(), tierId: form.tierId, quota: form.quota}, 'Allocation saved and invitation emailed.').then(() => setForm(f => ({...f, name: '', email: ''})))}/>
    <View style={g.vip}>
      <Text style={g.badge}>VIP</Text>
      <Text style={s.h3}>TicketBunker VIP guestlist</Text>
      <Text style={s.muted}>Give TicketBunker VIP members free guestlist places. Each member claims one pass and gets a normal ticket that shows VIP at the door.</Text>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{tiers.map(t => <Chip key={t.id} label={t.name} active={vip.tierId === t.id} onPress={() => setVip(v => ({...v, tierId: t.id}))}/>)}</View>
      <Field label="VIP spots" value={vip.quota} onChangeText={q => setVip(v => ({...v, quota: q}))} keyboardType="number-pad"/>
      <Button title="Add VIP spots" kind="secondary" busy={busy === 'vip'} disabled={!vip.tierId || !(Number(vip.quota) >= 1)}
        onPress={() => act('vip', {action: 'vipSpots', tierId: vip.tierId, quota: Number(vip.quota)}, 'VIP guestlist spots added. VIP members can claim them in the TicketBunker app or on theticketbunker.com/vip.')}/>
    </View>
    <Text style={s.muted}>Allocated places are reserved from that ticket type’s capacity. Revoking releases unused places; issued tickets stay valid.</Text>
    {msg ? <Text style={[s.body, {color: C.teal}]}>{msg}</Text> : null}
    {!roster ? <Loading/> : roster.length === 0 ? <Text style={s.muted}>No allocations yet.</Text> : roster.map(a => <View key={a.id} style={g.card}>
      <Text style={s.h3}>{isVipAllocation(a) ? 'TicketBunker VIP guestlist' : a.artist_name}</Text>
 <Text style={s.muted}>{isVipAllocation(a) ? 'VIP members' : a.artist_email} · {a.sb_event_tiers?.name} · {a.used} / {a.quota} issued{a.revoked_at ? ' · Revoked' : ''}</Text>
      {a.guests.map(x => <Text key={x.id} style={s.body}>{x.guest_name} · {x.email_sent_at ? 'email sent' : 'email pending'}</Text>)}
      {!a.revoked_at ? <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
        {!a.invitation_sent_at && !isVipAllocation(a) ? <Button small kind="secondary" title="Retry invitation" busy={busy === 'inv' + a.id} onPress={() => act('inv' + a.id, {action: 'invite', allocationId: a.id}, 'Invitation sent.')}/> : null}
        {a.guests.filter(x => !x.email_sent_at).map(x => <Button key={x.id} small kind="secondary" title={`Retry ${x.guest_name}`} onPress={() => act('r' + x.id, {action: 'retry', allocationId: a.id, entryId: x.id}, 'Email sent.')}/>)}
        <Button small kind="ghost" title="Revoke access" onPress={() => Alert.alert('Revoke artist access?', 'Unused places are released. Issued tickets stay valid.', [{text: 'Cancel', style: 'cancel'},
          {text: 'Revoke', style: 'destructive', onPress: () => act('rev' + a.id, {action: 'revoke', allocationId: a.id}, 'Access revoked.')}])}/>
      </View> : null}
    </View>)}
  </ScrollView>;
}
const g = StyleSheet.create({
  vip: {gap: 10, backgroundColor: C.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.gold},
  badge: {alignSelf: 'flex-start', fontFamily: F.bold, color: C.goldInk, backgroundColor: C.gold, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 6, fontSize: 14, letterSpacing: 1.2, overflow: 'hidden'},
  card: {gap: 8, backgroundColor: C.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.line}});

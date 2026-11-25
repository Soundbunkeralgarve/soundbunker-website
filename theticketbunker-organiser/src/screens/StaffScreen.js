import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, View, Text, Alert, StyleSheet} from 'react-native';
import {C, s} from '../theme.js';
import {Button, Loading} from '../components/ui.js';
import Field from '../components/Field.js';
import {useOrganiser, call} from '../state.js';
import {activeStaff} from '../../lib/organiser.js';
import {openPage} from '../open.js';

// Door staff for one live event: invite by email; they scan with TicketBunker Scanner.
export default function StaffScreen({route, navigation}) {
  const org = useOrganiser(), event = org.event(route.params.id);
  const [data, setData] = useState(null), [email, setEmail] = useState(''), [busy, setBusy] = useState(''), [msg, setMsg] = useState('');
  const load = useCallback(async () => { try { setData(activeStaff(await call('event-staff?eventId=' + encodeURIComponent(route.params.id)))); } catch (e) { setMsg(e.message); setData({staff: [], invites: []}); } }, [route.params.id]);
  useEffect(() => { navigation.setOptions({title: 'Door staff'}); load(); }, [load]);
  async function invite() {
    setBusy('invite'); setMsg('');
    try {
      const r = await call('event-staff', {action: 'invite', eventId: event.id, email: email.trim()});
      setEmail(''); setMsg(r.emailSent ? 'Scanner invitation emailed.' : 'Invitation created, but the email could not be sent.');
      if (!r.emailSent && r.invitationUrl) Alert.alert('Share the invitation', r.invitationUrl, [{text: 'Open', onPress: () => openPage(r.invitationUrl)}, {text: 'OK'}]);
      await load();
    } catch (e) { setMsg(e.message); } finally { setBusy(''); }
  }
  function revoke(body, label) {
    Alert.alert('Revoke access?', label, [{text: 'Cancel', style: 'cancel'}, {text: 'Revoke', style: 'destructive', onPress: async () => {
      try { await call('event-staff', {eventId: event.id, ...body}); await load(); } catch (e) { setMsg(e.message); }
    }}]);
  }
  if (!event) return null;
  return <ScrollView style={s.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 18, gap: 14, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center'}}>
    <Text style={s.eyebrow}>{event.title}</Text>
    <Text style={s.body}>Invite the people scanning tickets at the door. They sign in to TicketBunker Scanner and can only scan this event.</Text>
    <Field label="Door staff email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@example.com"/>
    <Button title="Send scanner invitation" busy={busy === 'invite'} disabled={!email.includes('@')} onPress={invite}/>
    {msg ? <Text style={[s.body, {color: C.teal}]}>{msg}</Text> : null}
    {!data ? <Loading/> : <>
      <Text style={[s.eyebrow, {marginTop: 10}]}>Active crew</Text>
      {data.staff.length ? data.staff.map(x => <View key={x.user_id} style={st.row}>
        <Text style={[s.body, {flex: 1}]}>{x.email || x.user_id}</Text>
        <Button title="Revoke" kind="ghost" small onPress={() => revoke({action: 'revokeStaff', userId: x.user_id}, x.email || 'this person')}/>
      </View>) : <Text style={s.muted}>Nobody yet.</Text>}
      <Text style={[s.eyebrow, {marginTop: 10}]}>Pending invitations</Text>
      {data.invites.length ? data.invites.map(x => <View key={x.id} style={st.row}>
        <Text style={[s.body, {flex: 1}]}>{x.invited_email}</Text>
        <Button title="Revoke" kind="ghost" small onPress={() => revoke({action: 'revokeInvite', inviteId: x.id}, x.invited_email)}/>
      </View>) : <Text style={s.muted}>None pending.</Text>}
    </>}
  </ScrollView>;
}
const st = StyleSheet.create({row: {flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: C.line}});

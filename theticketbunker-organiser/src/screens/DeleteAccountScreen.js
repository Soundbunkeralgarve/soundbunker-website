import React, {useEffect, useState} from 'react';
import {ScrollView, View, Text, TextInput, Alert, StyleSheet} from 'react-native';
import {C, s} from '../theme.js';
import {Button} from '../components/ui.js';
import {useOrganiser, auth} from '../state.js';
import {requestAccountDeletion, DELETION_TERMS, DELETION_DAYS} from '../../lib/accountDeletion.js';

// Delete my account: explains what happens, confirms twice, then opens the deletion case.
export default function DeleteAccountScreen({navigation}) {
  const me = useOrganiser();
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(null), [msg, setMsg] = useState('');
  useEffect(() => { navigation.setOptions({title: 'Delete my account'}); }, []);
  async function send() {
    setBusy(true); setMsg('');
    try {
      const {data} = await auth.auth.getSession();
      if (!data.session) throw Error('Your sign-in has expired. Please sign in again.');
      setDone(await requestAccountDeletion(data.session.access_token, me.email, 'TB Organiser', reason));
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  const confirm = () => Alert.alert('Delete your TicketBunker account?', `This deletes the account for ${me.email} on the website and in every TicketBunker app. It cannot be undone.`,
    [{text: 'Keep my account', style: 'cancel'}, {text: 'Delete account', style: 'destructive', onPress: send}]);
  if (done) return <ScrollView style={s.screen} contentContainerStyle={st.wrap}>
    <Text style={s.h2}>Request received</Text>
    <Text style={s.body}>{done.reference ? `Reference ${done.reference}. ` : ''}We’ll delete your account within {DELETION_DAYS} days and email {me.email} when it’s done. Reply to that email if you change your mind before then.</Text>
    <Button title="Sign out now" onPress={() => me.signOut()}/>
  </ScrollView>;
  return <ScrollView style={s.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={st.wrap}>
    <Text style={s.h2}>Delete my account</Text>
    <Text style={s.body}>Signed in as {me.email}. This is the same account you use on theticketbunker.com and in every TicketBunker app.</Text>
    <View style={st.box}>{DELETION_TERMS.map(t => <Text key={t} style={s.body}>• {t}</Text>)}</View>
    <Text style={s.muted}>Deletion is completed within {DELETION_DAYS} days. You’ll get a confirmation email.</Text>
    <Text style={[s.body, {fontSize: 15, color: C.muted}]}>Anything we should know? (optional)</Text>
    <TextInput style={[s.input, {minHeight: 96, paddingTop: 14, textAlignVertical: 'top', fontSize: 16}]} multiline maxLength={1000} value={reason} onChangeText={setReason}
      placeholder="e.g. cancel my upcoming tickets too" placeholderTextColor={C.muted} accessibilityLabel="Anything we should know"/>
    {msg ? <Text style={[s.body, {color: C.bad}]}>{msg}</Text> : null}
    <Button title="Delete my account" busy={busy} onPress={confirm} style={{backgroundColor: C.bad}}/>
    <Button title="Keep my account" kind="ghost" small onPress={() => navigation.goBack()}/>
  </ScrollView>;
}
const st = StyleSheet.create({
  wrap: {padding: 18, gap: 14, paddingBottom: 48, maxWidth: 620, width: '100%', alignSelf: 'center'},
  box: {gap: 8, backgroundColor: C.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.line}
});

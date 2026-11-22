import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, View, Text, TextInput, StyleSheet, RefreshControl} from 'react-native';
import {C, F, s} from '../theme.js';
import {Button, Loading} from '../components/ui.js';
import {useAuth} from '../state.js';
import {vipStatus, vipInterest, claimSpot, memberLine} from '../../lib/vip.js';
import {whenText} from '../../lib/format.js';

// TicketBunker VIP: your membership, the perks, and VIP guestlist spots to claim.
export default function VipScreen({navigation}) {
  const auth = useAuth();
  const [v, setV] = useState(null), [msg, setMsg] = useState(''), [busy, setBusy] = useState(''), [ask, setAsk] = useState(null), [name, setName] = useState('');
  const load = useCallback(async () => {
    try { setV(await vipStatus(await auth.token())); setMsg(''); } catch (e) { setMsg(e.message); setV(x => x || {}); }
  }, [auth]);
  useEffect(() => { navigation.setOptions({title: 'TicketBunker VIP'}); load(); }, [load]);
  async function interest() {
    setBusy('interest');
    try { setV(await vipInterest(await auth.token())); } catch (e) { setMsg(e.message); } finally { setBusy(''); }
  }
  async function claim(allocationId, retry) {
    setBusy(allocationId); setMsg('');
    try {
      const r = await claimSpot(await auth.token(), allocationId, retry || {});
      setV(x => ({...x, guestlist: r.guestlist})); setAsk(null); setName('');
      setMsg(`You’re on the guestlist. ${r.emailSent ? 'Your pass is in your email and' : 'Your pass is'} in My tickets.`);
    } catch (e) {
      if (e.needName) setAsk({allocationId, requestId: e.requestId}); else setMsg(e.message);
    } finally { setBusy(''); }
  }
  if (!v) return <View style={s.screen}><Loading label="Loading VIP…"/></View>;
  return <ScrollView style={s.screen} contentContainerStyle={{padding: 18, gap: 14, paddingBottom: 48, maxWidth: 620, width: '100%', alignSelf: 'center'}}
    refreshControl={<RefreshControl refreshing={false} tintColor={C.teal} onRefresh={load}/>}>
    <View style={st.hero}>
      <Text style={st.badge}>VIP</Text>
      <Text style={s.h2}>{v.member ? 'You’re VIP.' : 'TicketBunker VIP'}</Text>
      <Text style={s.body}>{v.member ? memberLine(v) : v.salesOpen ? 'VIP membership can’t be bought in this app. Already a member? Your perks appear here when you sign in with the same account.' : v.interested ? 'You’re on the list. We’ll email you the moment VIP opens.' : 'VIP opens soon. Be first in.'}</Text>
      {!v.member && !v.salesOpen && !v.interested ? <Button title="Tell me when it opens" busy={busy === 'interest'} onPress={interest}/> : null}
    </View>
    {(v.perks || []).length ? <View style={st.box}>
      <Text style={s.eyebrow}>What VIP gets you</Text>
      {v.perks.map(p => <Text key={p} style={s.body}>✓ {p}</Text>)}
    </View> : null}
    {msg ? <Text style={[s.body, {color: /could not|unavailable|error|only|first/i.test(msg) ? C.bad : C.teal}]}>{msg}</Text> : null}
    {v.member ? <>
      <Text style={[s.eyebrow, {marginTop: 8}]}>Your guestlist spots</Text>
      {(v.guestlist || []).length === 0 ? <Text style={s.muted}>No VIP guestlist spots right now. New ones appear here as organisers add them.</Text> :
        v.guestlist.map(g => <View key={g.allocationId} style={st.box}>
          <Text style={s.h3}>{g.event.title}</Text>
          <Text style={s.muted}>{[whenText({startsAt: g.event.startsAt, timezone: g.event.timezone}), g.event.venue, g.event.city].filter(Boolean).join(' · ')}</Text>
          {g.claimed ? <Text style={[s.body, {color: C.teal}]}>✓ On the list · your pass is in My tickets</Text>
            : g.spotsLeft > 0 ? <>
              {ask?.allocationId === g.allocationId ? <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Your name for the door list" placeholderTextColor={C.muted} autoFocus accessibilityLabel="Your name for the door list"/> : null}
              <Button title={ask?.allocationId === g.allocationId ? 'Claim with this name' : `Claim my spot · ${g.spotsLeft} left`} busy={busy === g.allocationId}
                disabled={ask?.allocationId === g.allocationId && name.trim().length < 2}
                onPress={() => claim(g.allocationId, ask?.allocationId === g.allocationId ? {requestId: ask.requestId, name: name.trim()} : undefined)}/>
            </> : <Text style={s.muted}>All spots taken</Text>}
        </View>)}
    </> : null}
  </ScrollView>;
}
const st = StyleSheet.create({
  hero: {gap: 10, backgroundColor: C.card, borderRadius: 20, padding: 18, borderWidth: 2, borderColor: '#d9b35b'},
  badge: {alignSelf: 'flex-start', fontFamily: F.display, color: '#1a1406', backgroundColor: '#d9b35b', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, fontSize: 16, letterSpacing: 2, overflow: 'hidden'},
  box: {gap: 8, backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.line}
});

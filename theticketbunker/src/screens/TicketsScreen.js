import React, {useCallback, useEffect, useState} from 'react';
import {View, Text, TextInput, FlatList, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, RefreshControl, useWindowDimensions} from 'react-native';
import {Image} from 'expo-image';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, F, s, WIDE} from '../theme.js';
import {Button, Loading, Empty, StatusShade} from '../components/ui.js';
import {useAuth} from '../state.js';
import {myTickets, sortTickets, ticketStatus, ticketRef} from '../../lib/tickets.js';
import {vipStatus} from '../../lib/vip.js';
import {whenText} from '../../lib/format.js';
import {openPage} from '../open.js';
import {SITE} from '../../lib/config.js';

export default function TicketsScreen({navigation}) {
  const auth = useAuth();
  if (auth.session === undefined) return <View style={s.screen}><Loading label="Restoring your sign-in…"/></View>;
  return auth.session ? <TicketList navigation={navigation}/> : <SignIn/>;
}

function SignIn() {
  const auth = useAuth(), insets = useSafeAreaInsets(), {width} = useWindowDimensions();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  async function submit() {
    if (!email.trim() || !password) { setMsg('Enter your email and password.'); return; }
    setBusy(true); setMsg('');
    try { await auth.signIn(email, password); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={{paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 40, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center'}} keyboardShouldPersistTaps="handled">
      <Text style={[s.h1, {textTransform: 'uppercase'}]}>My tickets</Text>
      <Text style={s.body}>Sign in with the email you booked with. Your TicketBunker tickets, QR codes and wallet passes are all here.</Text>
      <TextInput style={s.input} placeholder="Email" placeholderTextColor={C.muted} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email"
        keyboardType="email-address" textContentType="username" accessibilityLabel="Email"/>
      <TextInput style={s.input} placeholder="Password" placeholderTextColor={C.muted} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password"
        textContentType="password" onSubmitEditing={submit} returnKeyType="go" accessibilityLabel="Password"/>
      {msg ? <Text style={[s.body, {color: C.bad}]} accessibilityLiveRegion="assertive">{msg}</Text> : null}
      <Button title="Sign in" onPress={submit} busy={busy}/>
      <Button title="Forgot password?" kind="ghost" small onPress={() => openPage(SITE + '/login?role=buyer')}/>
      <Text style={s.muted}>Bought tickets but never set a password? Use Forgot password with your booking email. Partner tickets (Skiddle and others) are in that seller’s own app or email.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function TicketList({navigation}) {
  const auth = useAuth(), insets = useSafeAreaInsets(), {width} = useWindowDimensions(), wide = width >= WIDE;
  const [tickets, setTickets] = useState(null), [error, setError] = useState(''), [refreshing, setRefreshing] = useState(false), [vip, setVip] = useState(false);
  const load = useCallback(async () => {
    setError('');
    vipStatus(await auth.token().catch(() => '')).then(v => setVip(v.member === true)).catch(() => {});
    try {
      let list;
      try { list = await myTickets(await auth.token()); }
      catch (e) { if (e.status !== 401) throw e; list = await myTickets(await auth.renew()); }
      setTickets(sortTickets(list));
    } catch (e) { setError(e.message); setTickets(t => t || []); }
  }, [auth]);
  useEffect(() => { load(); }, [load]);
  const header = <View style={{gap: 8, marginBottom: 8}}>
    <Text style={[s.h1, {textTransform: 'uppercase'}]}>My tickets</Text>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
      {vip ? <Text style={k.vip}>VIP</Text> : null}
      <Text style={s.muted}>Signed in as {auth.email}</Text>
    </View>
    <Button title={vip ? 'VIP · your perks & guestlist' : 'TicketBunker VIP'} kind="secondary" small onPress={() => navigation.navigate('Vip')}/>
    {error ? <Text style={[s.body, {color: C.bad}]}>{error}</Text> : null}
  </View>;
  if (tickets === null) return <View style={[s.screen, {paddingTop: insets.top}]}><Loading label="Loading your tickets…"/></View>;
  return <View style={s.screen}><FlatList style={s.screen} data={tickets} keyExtractor={t => t.id} key={wide ? 'w' : 'n'} numColumns={wide ? 2 : 1} columnWrapperStyle={wide ? {gap: 12} : undefined}
    contentContainerStyle={{paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 40, gap: 12}}
    refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.teal} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}/>}
    ListHeaderComponent={header}
    ListEmptyComponent={<Empty title="No tickets yet." text="Tickets bought with your verified email will appear here." action={<Button title="Explore events" onPress={() => navigation.navigate('Discover')}/>}/>}
    ListFooterComponent={<Button title="Sign out" kind="ghost" small onPress={() => auth.signOut()} style={{marginTop: 20}}/>}
    renderItem={({item: t}) => <Pressable accessibilityRole="button" style={({pressed}) => [k.card, wide && {flex: 1}, pressed && {opacity: 0.85}]}
      onPress={() => ticketRef(t.url) ? navigation.navigate('Ticket', {ticket: t}) : openPage(t.url)}>
      {t.poster ? <Image source={t.poster} style={k.poster} contentFit="cover"/> : <View style={[k.poster, k.noPoster]}><Text style={k.tb}>TB</Text></View>}
      <View style={{flex: 1, gap: 3}}>
        <Text style={[k.tag, t.used && {color: C.muted}]}>{ticketStatus(t)}</Text>
        <Text style={s.h3} numberOfLines={2}>{t.title}</Text>
        <Text style={s.muted}>{whenText({startsAt: t.startsAt, timezone: t.timezone})}</Text>
        <Text style={s.muted} numberOfLines={1}>{t.venue}</Text>
        <Text style={s.body} numberOfLines={1}>{[t.ticketName, t.holderName].filter(Boolean).join(' · ')}</Text>
        <Text style={k.open}>Show ticket →</Text>
      </View>
    </Pressable>}/><StatusShade/></View>;
}
const k = StyleSheet.create({
  card: {flexDirection: 'row', gap: 14, backgroundColor: C.card, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: C.line},
  poster: {width: 96, height: 128, borderRadius: 12, backgroundColor: C.cardHi},
  noPoster: {alignItems: 'center', justifyContent: 'center'},
  tb: {fontFamily: F.display, color: C.teal, fontSize: 30},
  tag: {fontFamily: F.bold, color: C.teal, fontSize: 12, letterSpacing: 1},
  open: {fontFamily: F.bold, color: C.teal, fontSize: 15, marginTop: 6},
  vip: {fontFamily: F.display, color: '#1a1406', backgroundColor: '#d9b35b', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 6, fontSize: 13, letterSpacing: 2, overflow: 'hidden'}
});

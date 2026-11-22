import React, {useEffect, useMemo, useState} from 'react';
import {ScrollView, View, Text, StyleSheet, Platform, Alert} from 'react-native';
import {Image} from 'expo-image';
import {C, F, s} from '../theme.js';
import {Button, Loading, Empty} from '../components/ui.js';
import GetThere from '../components/GetThere.js';
import {ticketRef, ticketDetail, admissionUrl, walletUrl, googleWalletLink} from '../../lib/tickets.js';
import {qrRuns} from '../../lib/qr.js';
import {openOut, openPage} from '../open.js';
import {SITE} from '../../lib/config.js';

// The admission pass: the same QR the ticket web page shows, plus Apple / Google Wallet.
export default function TicketScreen({route}) {
  const listed = route.params.ticket, ref = useMemo(() => ticketRef(listed.url), [listed.url]);
  const [t, setT] = useState(null), [error, setError] = useState(''), [walletBusy, setWalletBusy] = useState(false);
  useEffect(() => { ticketDetail(ref).then(setT).catch(e => setError(e.message)); }, [ref]);
  if (error) return <View style={s.screen}><Empty title="Ticket unavailable" text={error} action={<Button title="Open on theticketbunker.com" kind="ghost" onPress={() => openPage(listed.url)}/>}/></View>;
  if (!t) return <View style={s.screen}><Loading label="Loading your ticket…"/></View>;
  const date = (() => { try { return new Intl.DateTimeFormat('en-GB', {dateStyle: 'full', timeStyle: 'short', timeZone: t.timezone || 'Europe/Lisbon'}).format(new Date(t.date)); } catch { return ''; } })();
  async function google() {
    setWalletBusy(true);
    try { openOut(await googleWalletLink(ref)); } catch (e) { Alert.alert('Google Wallet', e.message); } finally { setWalletBusy(false); }
  }
  return <ScrollView style={s.screen} contentContainerStyle={{padding: 18, gap: 14, paddingBottom: 48, width: '100%', maxWidth: 620, alignSelf: 'center'}}>
    <View style={q.pass}>
      {t.poster && /^https:\/\//.test(t.poster) ? <Image source={t.poster} style={q.poster} contentFit="cover"/> : null}
      <View style={{padding: 18, gap: 6}}>
        <Text style={s.eyebrow}>{t.used ? 'ALREADY CHECKED IN' : t.test ? 'PRIVATE TEST TICKET' : (t.tier || 'GENERAL ADMISSION')}</Text>
        <Text style={s.h2}>{t.title}</Text>
        <Text style={[s.body, {color: C.teal}]}>{date}</Text>
        <Text style={s.muted}>Venue local time · {t.venue}</Text>
        <View style={q.facts}>
          <Fact label="Ticket holder" value={t.holderName || 'Ticket holder'}/>
          <Fact label="Admission" value={t.admissionNumber ? String(t.admissionNumber).padStart(2, '0') : '—'}/>
        </View>
        {t.used ? <Text style={[s.body, {color: C.warn, marginTop: 8}]}>This ticket has already been used for admission.</Text> : <QR text={admissionUrl(ref)}/>}
        <Text style={[s.muted, {textAlign: 'center'}]}>Ticket reference · {ref.id}</Text>
        {t.test ? <Text style={[s.muted, {color: C.warn}]}>PRIVATE WALLET & SCANNER TEST · Not valid for admission to a public event.</Text> : null}
      </View>
    </View>
    {!t.used && t.wallet?.apple && Platform.OS === 'ios' ? <Button title="Add to Apple Wallet" onPress={() => openOut(walletUrl(ref, 'apple'))}/> : null}
    {!t.used && t.wallet?.google && Platform.OS === 'android' ? <Button title="Add to Google Wallet" onPress={google} busy={walletBusy}/> : null}
    <Text style={s.muted}>Turn your brightness up at the door, or add the ticket to your wallet so it opens without signal.</Text>
    <Text style={[s.eyebrow, {marginTop: 10}]}>Get to the venue</Text>
    <GetThere place={{venue: t.venue, address: t.venueCity || '', city: t.venueCity || ''}}/>
    {t.slug ? <Button title="Event details" kind="secondary" small onPress={() => openPage(SITE + '/event/' + encodeURIComponent(t.slug))}/> : null}
  </ScrollView>;
}
const Fact = ({label, value}) => <View style={{flex: 1}}><Text style={s.muted}>{label}</Text><Text style={s.h3}>{value}</Text></View>;
function QR({text}) {
  const {size, rows} = useMemo(() => qrRuns(text), [text]);
  const cell = Math.floor(232 / size), edge = cell * (size + 8);
  return <View accessibilityRole="image" accessibilityLabel="Ticket QR code for the door" style={[q.qr, {width: edge, height: edge, padding: cell * 4}]}>
    {rows.map((runs, r) => <View key={r} style={{height: cell}}>{runs.map(([x, w]) => <View key={x} style={{position: 'absolute', left: x * cell, width: w * cell, height: cell, backgroundColor: '#000'}}/>)}</View>)}
  </View>;
}
const q = StyleSheet.create({
  pass: {backgroundColor: C.card, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: C.line},
  poster: {width: '100%', height: 180},
  facts: {flexDirection: 'row', gap: 12, marginTop: 10},
  qr: {backgroundColor: '#fff', alignSelf: 'center', marginVertical: 14, borderRadius: 12}
});

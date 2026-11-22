import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, View, Text, StyleSheet, Share, Alert, RefreshControl, Linking} from 'react-native';
import {Image} from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import {C, F, s} from '../theme.js';
import {Button} from './ui.js';
import {useOrganiser, call} from '../state.js';
import {statusLabel, whenText, reportStats, publishState, isLive, money, publicUrl} from '../../lib/organiser.js';
import {openPage} from '../open.js';
import {SITE} from '../../lib/config.js';

// Door staff scan with the separate TicketBunker Scanner app.
async function openScanner() {
  if (await Linking.canOpenURL('ticketbunkerscanner://').catch(() => false)) return Linking.openURL('ticketbunkerscanner://');
  Alert.alert('TicketBunker Scanner', 'Install TicketBunker Scanner from the App Store or Google Play, then sign in with this account or a door-staff invite.');
}

// One event at a glance: live numbers, sharing, the door, guests, and — for drafts — what
// is left before it can be published.
export default function EventDashboard({id, navigation}) {
  const org = useOrganiser(), event = org.event(id);
  const [report, setReport] = useState(null), [reportError, setReportError] = useState(''), [busy, setBusy] = useState(''), [refreshing, setRefreshing] = useState(false);
  const loadReport = useCallback(async () => {
    if (event?.status !== 'published' && event?.status !== 'cancelled') return;
    try { setReport((await call('event-organiser-report?eventId=' + encodeURIComponent(id))).report); setReportError(''); }
    catch (e) { setReportError(e.message); }
  }, [id, event?.status]);
  useEffect(() => { loadReport(); }, [loadReport]);
  if (!event) return null;
  const draft = event.status === 'draft', live = isLive(event), url = publicUrl(event);
  const state = draft ? publishState(event, org.organiser, org.connect) : null;

  async function pay() {
    setBusy('pay');
    try {
      const r = await call('organiser-listing', {eventId: event.id, plan: state.plan});
      if (r.waived || r.bundle) { Alert.alert('Listing fee', r.message || 'Done.'); await org.reload(); return; }
      if (new URL(r.url).origin !== 'https://checkout.stripe.com') throw Error('Invalid payment link');
      await openPage(r.url); await org.reload();
    } catch (e) { Alert.alert('Listing fee', e.message); } finally { setBusy(''); }
  }
  async function publish() {
    setBusy('publish');
    try { const r = await call('organiser', {action: 'publish', eventId: event.id}); await org.reload(); Alert.alert('Published', r.message || 'Your event is live.'); }
    catch (e) { Alert.alert('Could not publish', e.message); } finally { setBusy(''); }
  }
  return <ScrollView style={s.screen} contentContainerStyle={{paddingBottom: 48}}
    refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.teal} onRefresh={async () => { setRefreshing(true); await Promise.all([org.reload(), loadReport()]); setRefreshing(false); }}/>}>
    {event.image_url ? <Image source={event.image_url} style={d.img} contentFit="cover"/> : null}
    <View style={{padding: 18, gap: 10}}>
      <Text style={[s.eyebrow, !draft && event.status !== 'cancelled' ? null : {color: C.warn}]}>{statusLabel(event)}</Text>
      <Text style={s.h2}>{event.title}</Text>
      <Text style={[s.body, {color: C.teal}]}>{whenText(event.starts_at, event.venue_timezone)}</Text>
      <Text style={s.muted}>{[event.venue, event.venue_city].filter(Boolean).join(' · ')}</Text>

      {report ? <View style={d.stats}>{reportStats(report).map(([k, v]) => <View key={k} style={d.stat}><Text style={d.statLabel}>{k.toUpperCase()}</Text><Text style={d.statValue}>{v}</Text></View>)}</View>
        : reportError ? <Text style={[s.muted, {color: C.bad}]}>{reportError}</Text> : null}
      {report?.attendancePending ? <Text style={s.muted}>Awaiting offline scanner sync. Final attendance updates once the door phones and hubs finish syncing.</Text> : null}

      {(event.tiers || []).length ? <View style={d.box}>
        <Text style={s.eyebrow}>Ticket types</Text>
        {event.tiers.map(t => <Text key={t.id || t.name} style={s.body}>{t.name} · {money(t.price_cents, event.currency)} · {Number(t.quantity_total)} tickets</Text>)}
      </View> : null}

      {draft ? <View style={d.box}>
        <Text style={s.eyebrow}>Before you publish</Text>
        <Text style={s.body}>{state.blocker || (state.paid ? 'Listing fee paid. Ready to publish.' : state.waived ? 'Listing fee waived. Ready to publish.' : 'Ready to publish.')}</Text>
        {state.capacity ? <Text style={s.muted}>{state.capacity} tickets · {state.planLabel} band · listing fee {state.waived ? 'waived' : money(state.amountCents, state.currency)}</Text> : null}
        <Button title="Ticket types" kind="secondary" small onPress={() => navigation.navigate('Tiers', {id})}/>
        <Button title="Edit details & poster" kind="secondary" small onPress={() => navigation.navigate('EventForm', {id})}/>
        {state.needsPayment ? <Button title={state.prepaid ? `Use 1 prepaid bundle event (${state.prepaid.event_count - state.prepaid.events_used} left)` : `Pay ${money(state.amountCents, state.currency)} listing fee`}
          kind="secondary" disabled={!state.canPay} busy={busy === 'pay'} onPress={pay}/> : null}
        <Button title="Publish event" disabled={!state.canPublish} busy={busy === 'publish'} onPress={publish}/>
      </View> : null}

      {event.status === 'published' && url ? <>
        <Button title="Share event link" icon="↗" onPress={() => Share.share({message: `${event.title} · tickets: ${url}`, url}).catch(() => {})}/>
        <View style={{flexDirection: 'row', gap: 10}}>
          <Button title="Copy link" kind="secondary" small style={{flex: 1}} onPress={async () => { await Clipboard.setStringAsync(url); Alert.alert('Copied', url); }}/>
          <Button title="View page" kind="secondary" small style={{flex: 1}} onPress={() => openPage(url)}/>
        </View>
      </> : null}
      {live ? <>
        <Text style={[s.eyebrow, {marginTop: 12}]}>Door & guests</Text>
        <Button title="Door staff" kind="secondary" onPress={() => navigation.navigate('Staff', {id})}/>
        <Button title="Guest list" kind="secondary" onPress={() => navigation.navigate('Guests', {id})}/>
        <Button title="Open the door scanner app" kind="ghost" small onPress={openScanner}/>
      </> : null}
      {!draft ? <Button title="Postpone, cancel or refunds (website)" kind="ghost" small onPress={() => openPage(SITE + '/organiser')} style={{marginTop: 12}}/> : null}
    </View>
  </ScrollView>;
}
const d = StyleSheet.create({
  img: {width: '100%', height: 220, backgroundColor: C.card},
  stats: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6},
  stat: {flexGrow: 1, flexBasis: '45%', backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.line, gap: 4},
  statLabel: {fontFamily: F.bold, color: C.muted, fontSize: 11, letterSpacing: 1},
  statValue: {fontFamily: F.display, color: C.text, fontSize: 24},
  box: {gap: 10, backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.line, marginTop: 6}
});

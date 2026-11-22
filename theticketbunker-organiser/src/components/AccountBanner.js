import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {C, s} from '../theme.js';
import {Button} from './ui.js';
import {useOrganiser} from '../state.js';
import {openPage} from '../open.js';
import {SITE} from '../../lib/config.js';

// Registration, branding, billing and Stripe verification stay on the website, where
// Stripe's own onboarding runs. The app says what is missing and opens the right page.
export default function AccountBanner({compact}) {
  const org = useOrganiser();
  // A failed load is not the same as having no profile: say what went wrong and offer a retry.
  if (!org.organiser && org.error) return <View style={[b.box, {margin: 18, borderColor: C.bad}]}>
    <Text style={s.h2}>Couldn’t load your events</Text>
    <Text style={s.body}>{org.error}</Text>
    <Button title="Try again" onPress={org.reload}/>
    <Button title="Sign out" kind="ghost" small onPress={org.signOut}/>
  </View>;
  if (!org.organiser) return <View style={[b.box, {margin: 18}]}>
    <Text style={s.h2}>Finish setting up</Text>
    <Text style={s.body}>{org.email} is signed in, but has no organiser profile yet. Create it on theticketbunker.com (name, country, logo and payouts), then come back.</Text>
    <Button title="Set up on theticketbunker.com" onPress={() => openPage(SITE + '/organiser')}/>
    <Button title="I’ve done it · refresh" kind="secondary" small onPress={org.reload}/>
    <Button title="Sign out" kind="ghost" small onPress={org.signOut}/>
  </View>;
  if (org.connect?.ticketSalesEnabled) return null;
  const text = org.connect?.ready ? (org.connect.billingReviewComplete ? 'Ticket payments are waiting for platform activation. You can prepare drafts meanwhile.' : 'Add your billing details to finish account validation.') : 'Finish Stripe verification to sell tickets. Drafts can be prepared now.';
  return <View style={b.box}>
    <Text style={[s.body, {color: C.warn}]}>{text}</Text>
    {org.connect?.error ? <Text style={s.muted}>{org.connect.error}</Text> : null}
    <Button title="Finish on theticketbunker.com" kind="secondary" small onPress={() => openPage(SITE + '/organiser')}/>
  </View>;
}
const b = StyleSheet.create({box: {gap: 10, backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.warn}});

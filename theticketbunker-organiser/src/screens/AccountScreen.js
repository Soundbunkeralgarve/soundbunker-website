import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Image} from 'expo-image';
import {C, s} from '../theme.js';
import {Button, StatusShade} from '../components/ui.js';
import AccountBanner from '../components/AccountBanner.js';
import Brand from '../components/Brand.js';
import {useOrganiser} from '../state.js';
import {openPage} from '../open.js';
import {SITE} from '../../lib/config.js';

// Account-level settings that need Stripe or document uploads stay on the website.
export default function AccountScreen({navigation}) {
  const org = useOrganiser(), insets = useSafeAreaInsets(), p = org.organiser;
  return <View style={s.screen}><ScrollView contentContainerStyle={{paddingTop: insets.top + 8, padding: 18, gap: 14, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center'}}>
    <Brand compact/>
    <Text style={[s.h1, {textTransform: 'uppercase'}]}>Account</Text>
    {p?.logo_url ? <Image source={p.logo_url} style={{width: 140, height: 70}} contentFit="contain"/> : null}
    <Text style={s.h3}>{p?.display_name || 'No organiser profile yet'}</Text>
    <Text style={s.muted}>{org.email}</Text>
    {org.connect?.ticketSalesEnabled ? <Text style={[s.body, {color: C.teal}]}>✓ Ready to sell tickets</Text> : <AccountBanner compact/>}
    <Text style={[s.eyebrow, {marginTop: 10}]}>On theticketbunker.com</Text>
    {[['Payouts & post-show reports', '/organiser'], ['Branding & logo', '/organiser'], ['Billing details', '/organiser'], ['Pricing & event bundles', '/pricing'], ['Help & support', '/support']]
      .map(([label, path]) => <Button key={label} title={label} kind="secondary" small onPress={() => openPage(SITE + path)}/>)}
    <Button title="Sign out" kind="ghost" onPress={org.signOut} style={{marginTop: 20}}/>
    <Button title="Delete my account" kind="secondary" small onPress={() => navigation.navigate('DeleteAccount')}/>
  </ScrollView><StatusShade/></View>;
}

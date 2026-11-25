import React, {useState} from 'react';
import {Text, KeyboardAvoidingView, ScrollView, Platform, ImageBackground, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, s} from '../theme.js';
import {Button} from '../components/ui.js';
import Brand from '../components/Brand.js';
import Field from '../components/Field.js';
import {useOrganiser} from '../state.js';
import {openPage} from '../open.js';
import {SITE} from '../../lib/config.js';

export default function SignInScreen() {
  const org = useOrganiser(), insets = useSafeAreaInsets();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  async function submit() {
    if (!email.trim() || !password) { setMsg('Enter your email and password.'); return; }
    setBusy(true); setMsg('');
    try { await org.signIn(email, password); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom: 40}}>
      <ImageBackground source={require('../../assets/hero-live.jpg')} imageStyle={{opacity: 0.5}} style={{paddingTop: insets.top + 36, paddingHorizontal: 18, paddingBottom: 34, backgroundColor: C.bg, overflow: 'hidden'}}>
        <View pointerEvents="none" style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, opacity: 0.5}}/>
        <View style={{maxWidth: 560, width: '100%', alignSelf: 'center'}}>
          <Brand/>
          <Text style={[s.eyebrow, {marginTop: 22}]}>Organiser</Text>
          <Text style={[s.h1, {textTransform: 'uppercase', marginTop: 8}]}>Your events.{'\n'}<Text style={{color: C.teal}}>On the move.</Text></Text>
          <Text style={[s.body, {marginTop: 8}]}>Create events, publish, watch sales and run the door from your phone.</Text>
        </View>
      </ImageBackground>
      <View style={{padding: 18, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center'}}>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" placeholder="you@example.com"/>
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} returnKeyType="go" placeholder="Password"/>
        {msg ? <Text style={[s.body, {color: C.bad}]} accessibilityLiveRegion="assertive">{msg}</Text> : null}
        <Button title="Sign in" onPress={submit} busy={busy}/>
        <Button title="Forgot password?" kind="ghost" small onPress={() => openPage(SITE + '/login?role=organiser')}/>
        <Text style={s.muted}>New to TicketBunker? Create your free organiser account on theticketbunker.com, then sign in here.</Text>
        <Button title="Create organiser account" kind="secondary" small onPress={() => openPage(SITE + '/organiser')}/>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

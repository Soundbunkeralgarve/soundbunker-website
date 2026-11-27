import React, {useEffect, useState} from 'react';
import {ScrollView, View, Text, Platform, KeyboardAvoidingView, Pressable, Alert, StyleSheet} from 'react-native';
import {Image} from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import DateTimePicker, {DateTimePickerAndroid} from '@react-native-community/datetimepicker';
import {C, F, s} from '../theme.js';
import {Button, Chip} from '../components/ui.js';
import Field from '../components/Field.js';
import {useOrganiser, call} from '../state.js';
import {KINDS, eventInput, venueStamp, venueDate, eventTimeZone} from '../../lib/organiser.js';

const MAX_POSTER = 2000000;
// A new date field opens on the same weekday next week at 20:00; the end defaults to five hours later.
const suggested = zone => venueDate(venueStamp(Date.now() + 7 * 864e5, zone).slice(0, 10) + 'T20:00', zone);
const nice = (st, zone) => { const d = venueDate(st, zone); return d ? d.toLocaleString('en-GB', {timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : 'Choose…'; };

// Step 1 of creating an event (or editing a draft): details and poster. The draft stays
// private until it is published.
export default function EventFormScreen({route, navigation}) {
  const org = useOrganiser(), editing = route.params?.id ? org.event(route.params.id) : null;
  const zone = eventTimeZone(editing, org.organiser);
  const [form, setForm] = useState(() => editing ? {title: editing.title, kind: editing.event_kind || 'club', venue: editing.venue || '', venueCity: editing.venue_city || '',
    headlineArtist: editing.headline_artist || '', startsAt: venueStamp(editing.starts_at, zone), endsAt: venueStamp(editing.ends_at, zone), vipEarlyAccessUntil: venueStamp(editing.vip_presale_until, zone), description: editing.description || ''}
    : {title: '', kind: 'club', venue: '', venueCity: '', headlineArtist: '', startsAt: '', endsAt: '', vipEarlyAccessUntil: '', description: ''});
  const [poster, setPoster] = useState(null), [posterBusy, setPosterBusy] = useState(''), [picker, setPicker] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState({});
  useEffect(() => { navigation.setOptions({title: editing ? 'Edit event' : 'New event'}); }, []);
  const set = k => v => setForm(f => ({...f, [k]: v}));

  async function choosePoster(camera) {
    if (posterBusy || busy) return;
    setPosterBusy(camera ? 'camera' : 'photos');
    setError(e => ({...e, poster: ''}));
    try {
      const ask = camera ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
      if (!(await ask()).granted) { Alert.alert('Poster', 'Allow access in Settings to choose a poster.'); return; }
      const pick = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({mediaTypes: ['images'], quality: 1});
      if (pick.canceled) return;
      const uri = pick.assets?.[0]?.uri;
      if (!uri) throw Error('No photo was returned. Choose another image.');
      // Posters are resized on the phone so they fit the site's 2 MB upload limit.
      let out = await ImageManipulator.manipulateAsync(uri, [{resize: {width: 1600}}], {compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true});
      if (!out.base64) throw Error('The photo could not be prepared. Try another image.');
      if (out.base64.length * 0.75 > MAX_POSTER) out = await ImageManipulator.manipulateAsync(out.uri, [{resize: {width: 1200}}], {compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true});
      if (!out.base64 || out.base64.length * 0.75 > MAX_POSTER) throw Error('This image is still too large. Choose a smaller photo.');
      setPoster({uri: out.uri, dataUrl: 'data:image/jpeg;base64,' + out.base64});
    } catch (e) { setError(prev => ({...prev, poster: e.message || 'The photo could not be prepared. Try another image.'})); }
    finally { setPosterBusy(''); }
  }
  function pickDate(which, value) {
    setPicker(Platform.OS === 'ios' ? picker : '');
    if (!value) return;
    const stamp = venueStamp(value, zone);
    setForm(f => ({...f, [which]: stamp, ...(which === 'startsAt' && (!f.endsAt || venueDate(f.endsAt, zone) <= value) ? {endsAt: venueStamp(new Date(value.getTime() + 5 * 3600000), zone)} : {})}));
  }
  async function save() {
    setBusy(true); setError({});
    try {
      const data = eventInput(form, editing?.id || '', zone);
      if (!editing && !poster) throw Object.assign(Error('Add a poster for the event page and tickets.'), {field: 'poster'});
      const r = await call('organiser', data);
      const id = r.event?.id || editing?.id;
      if (!id) throw Error('The service did not confirm the save. Check My events before retrying.');
      if (poster) {
        try { await call('event-media', {eventId: id, kind: 'poster', dataUrl: poster.dataUrl}); }
        catch (e) { await org.reload(); throw Error('Your draft is saved, but its poster could not upload: ' + e.message + ' Try Edit details to add it again.'); }
      }
      await org.reload();
      navigation.replace(editing ? 'Event' : 'Tiers', {id, fresh: !editing});
    } catch (e) { setError({[e.field || 'form']: e.message}); }
    finally { setBusy(false); }
  }
  const dateRow = (which, label) => <View style={{gap: 6, flex: 1}}>
    <Text style={[s.body, {fontSize: 15, color: C.muted}]}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => {
      if (picker === which) { setPicker(''); return; }
      const start = venueDate(form.startsAt, zone);
      if (!form[which]) pickDate(which, which === 'endsAt' && start ? new Date(start.getTime() + 5 * 3600000)
        : which === 'vipEarlyAccessUntil' && start ? new Date(Math.max(Date.now() + 3600000, start.getTime() - 48 * 3600000)) : suggested(zone));
      setPicker(which);
    }} style={[s.input, {justifyContent: 'center'}, error[which] && {borderColor: C.bad}]}>
      <Text style={[s.body, !form[which] && {color: C.muted}]}>{nice(form[which], zone)}</Text>
    </Pressable>
    {picker === which ? <DateTimePicker value={venueDate(form[which], zone) || suggested(zone)} mode={Platform.OS === 'ios' ? 'datetime' : 'date'} timeZoneName={zone}
      display={Platform.OS === 'ios' ? 'inline' : 'default'} themeVariant="dark" accentColor={C.teal} minimumDate={new Date()}
      onChange={(e, v) => { if (Platform.OS === 'android' && v && e.type === 'set') { const base = v; setPicker(''); DateTimePickerAndroidTime(base, zone, t => pickDate(which, t)); } else if (Platform.OS === 'ios') pickDate(which, v); else setPicker(''); }}/> : null}
    {error[which] ? <Text style={[s.muted, {color: C.bad}]}>{error[which]}</Text> : null}
  </View>;
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 18, gap: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center'}}>
      <Text style={s.eyebrow}>Step 1 of 3 · Details</Text>
      <Field label="Event name" value={form.title} onChangeText={set('title')} maxLength={160} placeholder="What’s the event called?" error={error.title}/>
      <View style={{gap: 6}}>
        <Text style={[s.body, {fontSize: 15, color: C.muted}]}>Category</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{KINDS.map(([k, label]) => <Chip key={k} label={label} active={form.kind === k} onPress={() => set('kind')(k)}/>)}</View>
      </View>
      <Field label="Venue" value={form.venue} onChangeText={set('venue')} maxLength={180} placeholder="Venue name and address" error={error.venue}/>
      <Field label="Town / city" value={form.venueCity} onChangeText={set('venueCity')} maxLength={120} placeholder="e.g. Loulé"/>
      <Field label="Headline act (optional)" value={form.headlineArtist} onChangeText={set('headlineArtist')} maxLength={120} placeholder="Artist / DJ / comedian"/>
      <View style={{gap: 16}}>{dateRow('startsAt', 'Starts · venue local time')}{dateRow('endsAt', 'Ends · venue local time')}</View>
      <View style={st.vip}>
        {dateRow('vipEarlyAccessUntil', 'VIP early access until (optional)')}
        <Text style={s.muted}>Before this time only TicketBunker VIP members can book. Leave empty for everyone at once.</Text>
        {form.vipEarlyAccessUntil ? <Button title="No VIP early access" kind="ghost" small onPress={() => { setPicker(''); set('vipEarlyAccessUntil')(''); }}/> : null}
      </View>
      <Field label="Full event information" value={form.description} onChangeText={set('description')} multiline maxLength={4000} error={error.description}
        hint={`${form.description.length} / 4,000 · line-up, door times, last entry, age limits, accessibility, travel and refunds.`}
        placeholder="Tell fans what to expect."/>
      <View style={st.poster}>
        <Text style={s.h3}>Poster / artwork</Text>
        <Text style={s.muted}>Shown on the event page and every ticket. Resized on your phone to fit the 2 MB limit.</Text>
        {poster ? <Image source={poster.uri} style={st.preview} contentFit="cover"/> : editing?.image_url ? <Image source={editing.image_url} style={st.preview} contentFit="cover"/> : null}
        <View style={{flexDirection: 'row', gap: 10}}>
          <Button title="Choose photo" kind="secondary" small style={{flex: 1}} disabled={busy || Boolean(posterBusy)} busy={posterBusy === 'photos'} onPress={() => choosePoster(false)}/>
          <Button title="Take photo" kind="secondary" small style={{flex: 1}} disabled={busy || Boolean(posterBusy)} busy={posterBusy === 'camera'} onPress={() => choosePoster(true)}/>
        </View>
        {error.poster ? <Text style={[s.muted, {color: C.bad}]}>{error.poster}</Text> : null}
      </View>
      {error.form ? <Text style={[s.body, {color: C.bad}]}>{error.form}</Text> : null}
      <Button title={editing ? 'Save changes' : 'Save draft · next: tickets'} busy={busy} disabled={Boolean(posterBusy)} onPress={save}/>
      <Text style={s.muted}>Your organiser logo is added automatically. The event stays private until you publish it.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}
// Android shows date and time as two dialogs.
function DateTimePickerAndroidTime(day, zone, done) {
  DateTimePickerAndroid.open({value: day, timeZoneName: zone, mode: 'time', is24Hour: true,
    onChange: (e, t) => { if (e.type === 'set' && t) { const chosen = venueDate(venueStamp(day, zone).slice(0, 10) + 'T' + venueStamp(t, zone).slice(11), zone); if (chosen) done(chosen); } }});
}
const st = StyleSheet.create({
  vip: {gap: 10, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.gold},
  poster: {gap: 10, backgroundColor: C.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.line},
  preview: {width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: C.cardHi}
});

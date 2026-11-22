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
import {KINDS, eventInput, localStamp, stampDate} from '../../lib/organiser.js';

const MAX_POSTER = 2000000;
const toStamp = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? localStamp(d) : ''; };
// A new date field opens on the same weekday next week at 20:00; the end defaults to five hours later.
const suggested = () => { const d = new Date(Date.now() + 7 * 864e5); d.setHours(20, 0, 0, 0); return d; };
const nice = st => { const d = stampDate(st); return d ? d.toLocaleString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : 'Choose…'; };

// Step 1 of creating an event (or editing a draft): details and poster. The draft stays
// private until it is published.
export default function EventFormScreen({route, navigation}) {
  const org = useOrganiser(), editing = route.params?.id ? org.event(route.params.id) : null;
  const [form, setForm] = useState(() => editing ? {title: editing.title, kind: editing.event_kind || 'club', venue: editing.venue || '', venueCity: editing.venue_city || '',
    headlineArtist: editing.headline_artist || '', startsAt: toStamp(editing.starts_at), endsAt: toStamp(editing.ends_at), vipEarlyAccessUntil: toStamp(editing.vip_presale_until), description: editing.description || ''}
    : {title: '', kind: 'club', venue: '', venueCity: '', headlineArtist: '', startsAt: '', endsAt: '', vipEarlyAccessUntil: '', description: ''});
  const [poster, setPoster] = useState(null), [picker, setPicker] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState({});
  useEffect(() => { navigation.setOptions({title: editing ? 'Edit event' : 'New event'}); }, []);
  const set = k => v => setForm(f => ({...f, [k]: v}));

  async function choosePoster(camera) {
    const ask = camera ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    if (!(await ask()).granted) { Alert.alert('Poster', 'Allow access in Settings to choose a poster.'); return; }
    const pick = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({mediaTypes: ['images'], quality: 1});
    if (pick.canceled) return;
    // Posters are resized on the phone so they always fit the site's 2 MB upload limit.
    let out = await ImageManipulator.manipulateAsync(pick.assets[0].uri, [{resize: {width: 1600}}], {compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true});
    if (out.base64.length * 0.75 > MAX_POSTER) out = await ImageManipulator.manipulateAsync(out.uri, [{resize: {width: 1200}}], {compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true});
    setPoster({uri: out.uri, dataUrl: 'data:image/jpeg;base64,' + out.base64});
  }
  function pickDate(which, value) {
    setPicker(Platform.OS === 'ios' ? picker : '');
    if (!value) return;
    const stamp = localStamp(value);
    setForm(f => ({...f, [which]: stamp, ...(which === 'startsAt' && (!f.endsAt || stampDate(f.endsAt) <= value) ? {endsAt: localStamp(new Date(value.getTime() + 5 * 3600000))} : {})}));
  }
  async function save() {
    setBusy(true); setError({});
    try {
      const data = eventInput(form, editing?.id || '');
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
      const start = stampDate(form.startsAt);
      if (!form[which]) pickDate(which, which === 'endsAt' && start ? new Date(start.getTime() + 5 * 3600000)
        : which === 'vipEarlyAccessUntil' && start ? new Date(Math.max(Date.now() + 3600000, start.getTime() - 48 * 3600000)) : suggested());
      setPicker(which);
    }} style={[s.input, {justifyContent: 'center'}, error[which] && {borderColor: C.bad}]}>
      <Text style={[s.body, !form[which] && {color: C.muted}]}>{nice(form[which])}</Text>
    </Pressable>
    {picker === which ? <DateTimePicker value={stampDate(form[which]) || suggested()} mode={Platform.OS === 'ios' ? 'datetime' : 'date'}
      display={Platform.OS === 'ios' ? 'inline' : 'default'} themeVariant="dark" accentColor={C.teal} minimumDate={new Date()}
      onChange={(e, v) => { if (Platform.OS === 'android' && v && e.type === 'set') { const base = v; setPicker(''); DateTimePickerAndroidTime(base, t => pickDate(which, t)); } else if (Platform.OS === 'ios') pickDate(which, v); else setPicker(''); }}/> : null}
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
          <Button title="Choose photo" kind="secondary" small style={{flex: 1}} onPress={() => choosePoster(false)}/>
          <Button title="Take photo" kind="secondary" small style={{flex: 1}} onPress={() => choosePoster(true)}/>
        </View>
        {error.poster ? <Text style={[s.muted, {color: C.bad}]}>{error.poster}</Text> : null}
      </View>
      {error.form ? <Text style={[s.body, {color: C.bad}]}>{error.form}</Text> : null}
      <Button title={editing ? 'Save changes' : 'Save draft · next: tickets'} busy={busy} onPress={save}/>
      <Text style={s.muted}>Your organiser logo is added automatically. The event stays private until you publish it.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}
// Android shows date and time as two dialogs.
function DateTimePickerAndroidTime(day, done) {
  DateTimePickerAndroid.open({value: day, mode: 'time', is24Hour: true, onChange: (e, t) => { if (e.type === 'set' && t) { const d = new Date(day); d.setHours(t.getHours(), t.getMinutes(), 0, 0); done(d); } }});
}
const st = StyleSheet.create({
  vip: {gap: 10, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#d9b35b'},
  poster: {gap: 10, backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.line},
  preview: {width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: C.cardHi}
});

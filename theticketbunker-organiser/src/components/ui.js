import React from 'react';
import {Pressable, Text, View, ActivityIndicator, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, F, s} from '../theme.js';

// Big, easy-to-tap buttons: at least 56pt tall, full width unless told otherwise.
export function Button({title, onPress, kind = 'primary', icon, disabled, busy, small, style, accessibilityLabel, lines = 1}) {
  const primary = kind === 'primary', ghost = kind === 'ghost';
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || title} disabled={disabled || busy} onPress={onPress}
    style={({pressed}) => [b.base, small && b.small, primary ? b.primary : ghost ? b.ghost : b.secondary, (disabled || busy) && {opacity: 0.5}, pressed && {opacity: 0.8, transform: [{scale: 0.99}]}, style]}>
    {busy ? <ActivityIndicator color={primary ? C.tealInk : C.teal}/> : <>
      {icon ? <Text style={[b.icon, {color: primary ? C.tealInk : C.teal}]}>{icon}</Text> : null}
      <Text style={[b.text, small && {fontSize: 15}, lines > 1 && {textAlign: 'center', flexShrink: 1}, {color: primary ? C.tealInk : C.text}]} numberOfLines={lines}>{title}</Text>
    </>}
  </Pressable>;
}
export function Chip({label, active, onPress}) {
  return <Pressable accessibilityRole="button" accessibilityState={{selected: !!active}} onPress={onPress}
    style={({pressed}) => [b.chip, active && b.chipOn, pressed && {opacity: 0.8}]}>
    <Text style={[b.chipText, active && {color: C.tealInk}]}>{label}</Text>
  </Pressable>;
}
// Keeps scrolled content from running under the clock and notch on tab screens.
export function StatusShade() {
  const {top} = useSafeAreaInsets();
  return <View pointerEvents="none" style={{position: 'absolute', top: 0, left: 0, right: 0, height: top, backgroundColor: C.bg, opacity: 0.94}}/>;
}
export const Loading = ({label = 'Loading…'}) => <View style={b.center}><ActivityIndicator color={C.teal} size="large"/><Text style={[s.muted, {marginTop: 12}]}>{label}</Text></View>;
export function Empty({title, text, action}) {
  return <View style={[b.center, {paddingVertical: 40}]}>
    <Text style={[s.h3, {textAlign: 'center'}]}>{title}</Text>
    {text ? <Text style={[s.muted, {textAlign: 'center', marginTop: 8, maxWidth: 420}]}>{text}</Text> : null}
    {action ? <View style={{marginTop: 18, alignSelf: 'stretch'}}>{action}</View> : null}
  </View>;
}
const b = StyleSheet.create({
  base: {minHeight: 58, borderRadius: 999, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10},
  small: {minHeight: 48, borderRadius: 999, paddingHorizontal: 16},
  primary: {backgroundColor: C.teal},
  secondary: {backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line},
  ghost: {backgroundColor: 'transparent', borderWidth: 1, borderColor: C.teal},
  text: {fontFamily: F.bold, fontSize: 17, flexShrink: 1},
  icon: {fontSize: 20},
  chip: {minHeight: 48, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, justifyContent: 'center'},
  chipOn: {backgroundColor: C.teal, borderColor: C.teal},
  chipText: {fontFamily: F.bold, color: C.text, fontSize: 15},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}
});

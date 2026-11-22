import React from 'react';
import {View, Text, TextInput} from 'react-native';
import {C, s} from '../theme.js';

export default function Field({label, hint, error, multiline, style, ...props}) {
  return <View style={[{gap: 6}, style]}>
    <Text style={[s.body, {fontSize: 15, color: C.muted}]}>{label}</Text>
    <TextInput placeholderTextColor={C.muted} multiline={multiline} accessibilityLabel={label}
      style={[s.input, multiline && {minHeight: 160, paddingTop: 14, textAlignVertical: 'top', fontSize: 16}, error && {borderColor: C.bad}]} {...props}/>
    {error ? <Text style={[s.muted, {color: C.bad}]}>{error}</Text> : hint ? <Text style={s.muted}>{hint}</Text> : null}
  </View>;
}

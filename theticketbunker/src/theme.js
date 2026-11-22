import {StyleSheet} from 'react-native';
// theticketbunker.com brand: dark background, teal accents, bold display headlines.
export const C = {bg: '#080e12', card: '#111a1f', cardHi: '#17242a', line: '#22323a', text: '#f3f7f5', muted: '#9fb0aa', teal: '#00E0A6', tealInk: '#04281d', warn: '#ffcf5c', bad: '#ff6b7a'};
export const F = {display: 'BricolageGrotesque_800ExtraBold', bold: 'BricolageGrotesque_700Bold', body: 'BricolageGrotesque_400Regular', medium: 'BricolageGrotesque_600SemiBold'};
export const WIDE = 768; // iPad and big tablets get the two-column layouts
export const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: C.bg},
  pad: {paddingHorizontal: 18},
  h1: {fontFamily: F.display, color: C.text, fontSize: 44, lineHeight: 46, letterSpacing: -1},
  h2: {fontFamily: F.display, color: C.text, fontSize: 28, lineHeight: 32, letterSpacing: -0.5},
  h3: {fontFamily: F.bold, color: C.text, fontSize: 19, lineHeight: 24},
  body: {fontFamily: F.body, color: C.text, fontSize: 16, lineHeight: 22},
  muted: {fontFamily: F.body, color: C.muted, fontSize: 14, lineHeight: 20},
  eyebrow: {fontFamily: F.bold, color: C.teal, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase'},
  input: {minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, color: C.text, paddingHorizontal: 16, fontSize: 18, fontFamily: F.medium}
});

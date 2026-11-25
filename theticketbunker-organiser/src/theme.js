import {StyleSheet} from 'react-native';
// Shared with the public website: Barlow Condensed headings, DM Sans text, teal controls.
export const C = {bg: '#07070b', card: '#101018', cardHi: '#171722', line: '#24242f', text: '#f4f6f8', muted: '#a7adb6', teal: '#00e0a6', tealInk: '#04140d', pink: '#ff4f9a', warn: '#ffcf5c', bad: '#ff6b7a', gold: '#d9b35b', goldInk: '#1a1406'};
export const F = {display: 'BarlowCondensed_900Black', heading: 'BarlowCondensed_700Bold', body: 'DMSans_400Regular', medium: 'DMSans_500Medium', semibold: 'DMSans_600SemiBold', bold: 'DMSans_700Bold'};
export const WIDE = 768; // iPad and big tablets get the two-column layouts
export const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: C.bg},
  pad: {paddingHorizontal: 18},
  h1: {fontFamily: F.display, color: C.text, fontSize: 52, lineHeight: 54, letterSpacing: -0.3},
  h2: {fontFamily: F.display, color: C.text, fontSize: 34, lineHeight: 37, letterSpacing: -0.2},
  h3: {fontFamily: F.heading, color: C.text, fontSize: 26, lineHeight: 29},
  body: {fontFamily: F.body, color: C.text, fontSize: 16, lineHeight: 24},
  muted: {fontFamily: F.body, color: C.muted, fontSize: 14, lineHeight: 21},
  eyebrow: {fontFamily: F.bold, color: C.teal, fontSize: 14, letterSpacing: 1.2, textTransform: 'uppercase'},
  input: {minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, color: C.text, paddingHorizontal: 16, fontSize: 18, fontFamily: F.medium}
});

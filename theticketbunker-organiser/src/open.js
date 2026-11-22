import {Linking, Alert} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {C} from './theme.js';

// Partner and checkout pages open in an in-app browser so people come straight back.
export async function openPage(url) {
  try { await WebBrowser.openBrowserAsync(url, {toolbarColor: C.bg, controlsColor: C.teal, presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET}); }
  catch { openOut(url); }
}
// Map, ride and transit apps (and Wallet) open in their own app where installed.
export async function openOut(url) {
  try { await Linking.openURL(url); } catch { Alert.alert('Could not open that link', url); }
}

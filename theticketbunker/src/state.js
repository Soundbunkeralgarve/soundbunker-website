import React, {createContext, useContext, useEffect, useMemo, useState, useCallback} from 'react';
import {AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {createClient, processLock} from '@supabase/supabase-js';
import {PUBLIC_CONFIG} from '../lib/publicConfig.js';
import {secureSessionStorage} from '../lib/secureStorage.js';
import {fetchWithDeadline, withDeadline} from '../lib/request.js';
import {saveNight, removeNight, markStep, tidyTrip} from '../lib/planner.js';
import {deviceLocation,watchForegroundLocation} from '../lib/getAround.js';

// ---- My trip: saved on this phone only, like the site keeps it in the browser.
const TRIP_KEY = 'tb-my-trip';
const TripContext = createContext(null);
export function TripProvider({children}) {
  const [trip, setTrip] = useState([]);
  useEffect(() => { AsyncStorage.getItem(TRIP_KEY).then(v => { try { setTrip(tidyTrip(JSON.parse(v || '[]'))); } catch { setTrip([]); } }).catch(() => {}); }, []);
  const update = useCallback(fn => setTrip(list => { const next = fn(list); AsyncStorage.setItem(TRIP_KEY, JSON.stringify(next)).catch(() => {}); return next; }), []);
  const value = useMemo(() => ({
    trip,
    has: id => trip.some(n => n.id === id),
    save: item => update(list => saveNight(list, item)),
    remove: id => update(list => removeNight(list, id)),
    mark: (id, kind, done) => update(list => markStep(list, id, kind, done))
  }), [trip, update]);
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}
export const useTrip = () => useContext(TripContext);

// ---- Account: the same TicketBunker sign-in as the website. The session lives in the
// iOS Keychain / Android Keystore; the site's API checks the token on every request.
export const auth = createClient(PUBLIC_CONFIG.url, PUBLIC_CONFIG.key, {
  global: {fetch: (url, options) => fetchWithDeadline(url, options, 15000)},
  auth: {storage: secureSessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, lock: processLock, lockAcquireTimeout: 10000}
});
AppState.addEventListener('change', state => state === 'active' ? auth.auth.startAutoRefresh() : auth.auth.stopAutoRefresh());

const AuthContext = createContext(null);
export function AuthProvider({children}) {
  const [session, setSession] = useState(undefined); // undefined = still restoring
  useEffect(() => {
    withDeadline(() => auth.auth.getSession(), 4500).then(({data}) => setSession(data.session || null)).catch(() => setSession(null));
    const {data} = auth.auth.onAuthStateChange((_event, next) => setSession(next || null));
    return () => data.subscription.unsubscribe();
  }, []);
  const value = useMemo(() => ({
    session, email: session?.user?.email || '',
    async signIn(email, password) {
      const {data, error} = await withDeadline(() => auth.auth.signInWithPassword({email: email.trim(), password}), 20000);
      if (error) throw Error(error.message === 'Invalid login credentials' ? 'That email and password do not match.' : error.message);
      if (!data.user?.email_confirmed_at) { await auth.auth.signOut(); throw Error('Confirm your email address using the email we sent before signing in.'); }
      // The session must be saved in the Keychain/Keystore, or the ticket list would bounce back here.
      try { await secureSessionStorage.getItem('probe'); }
      catch { await auth.auth.signOut().catch(() => {}); throw Error('This phone could not store your sign-in securely. Restart the app and try again.'); }
      return data.session;
    },
    signOut: () => auth.auth.signOut(),
    async token() {
      const {data, error} = await withDeadline(() => auth.auth.getSession(), 10000);
      if (error || !data.session) throw Error('Your session expired. Please sign in again.');
      return data.session.access_token;
    },
    // After the site rejects a token (401): renew once; if that fails, sign out so the app
    // shows the sign-in screen instead of an error.
    async renew() {
      const {data, error} = await withDeadline(() => auth.auth.refreshSession(), 15000).catch(err => ({error: err}));
      if (error || !data?.session) { await auth.auth.signOut().catch(() => {}); throw Error('Your sign-in has expired. Please sign in again.'); }
      return data.session.access_token;
    }
  }), [session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

// Foreground location only. Get Around sends the requested position to nearby and
// transport providers; coordinates are not stored in the phone's saved trip history.
export const locate = options => deviceLocation(Location, options);
export const watchTransportLocation = (onFix,onError,onResume) => watchForegroundLocation(Location,AppState,onFix,onError,onResume);

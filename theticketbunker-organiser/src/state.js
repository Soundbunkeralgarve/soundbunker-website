import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {AppState} from 'react-native';
import {createClient, processLock} from '@supabase/supabase-js';
import {PUBLIC_CONFIG} from '../lib/publicConfig.js';
import {secureSessionStorage} from '../lib/secureStorage.js';
import {fetchWithDeadline, withDeadline} from '../lib/request.js';
import {organiserApi} from '../lib/organiser.js';

// The same TicketBunker sign-in as theticketbunker.com/organiser. The session lives in the
// iOS Keychain / Android Keystore; the site's API checks the token on every request.
export const auth = createClient(PUBLIC_CONFIG.url, PUBLIC_CONFIG.key, {
  global: {fetch: (url, options) => fetchWithDeadline(url, options, 15000)},
  auth: {storage: secureSessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, lock: processLock, lockAcquireTimeout: 10000}
});
AppState.addEventListener('change', state => state === 'active' ? auth.auth.startAutoRefresh() : auth.auth.stopAutoRefresh());

async function token() {
  const {data, error} = await withDeadline(() => auth.auth.getSession(), 10000);
  if (error || !data.session) throw Error('Your session expired. Please sign in again.');
  return data.session.access_token;
}
// One call: path plus optional POST body, signed with the current session. If the site
// rejects the sign-in (401), renew it once and retry; if that fails, sign out so the app
// asks for the password again instead of showing an empty account.
export async function call(path, body) {
  try { return await organiserApi(await token())(path, body); }
  catch (e) {
    if (e.status !== 401) throw e;
    const {data, error} = await withDeadline(() => auth.auth.refreshSession(), 15000).catch(err => ({error: err}));
    if (error || !data?.session) { await auth.auth.signOut().catch(() => {}); throw Error('Your sign-in has expired. Please sign in again.'); }
    return organiserApi(data.session.access_token)(path, body);
  }
}

const Ctx = createContext(null);
export function OrganiserProvider({children}) {
  const [session, setSession] = useState(undefined);
  const [data, setData] = useState({organiser: null, events: [], connect: null, loaded: false, error: ''});
  useEffect(() => {
    withDeadline(() => auth.auth.getSession(), 4500).then(({data}) => setSession(data.session || null)).catch(() => setSession(null));
    const {data: sub} = auth.auth.onAuthStateChange((_e, next) => setSession(next || null));
    return () => sub.subscription.unsubscribe();
  }, []);
  const reload = useCallback(async () => {
    try {
      const [main, connect] = await Promise.all([call('organiser'), call('organiser-connect').catch(() => null)]);
      setData({organiser: main.organiser || null, events: main.events || [], connect, loaded: true, error: ''});
      return main;
    } catch (e) { setData(d => ({...d, loaded: true, error: e.message})); }
  }, []);
  useEffect(() => { if (session) reload(); else setData({organiser: null, events: [], connect: null, loaded: false, error: ''}); }, [session?.user?.id]);
  const value = useMemo(() => ({
    session, email: session?.user?.email || '', ...data, reload,
    event: id => data.events.find(e => e.id === id),
    async signIn(email, password) {
      const {data: d, error} = await withDeadline(() => auth.auth.signInWithPassword({email: email.trim(), password}), 20000);
      if (error) throw Error(error.message === 'Invalid login credentials' ? 'That email and password do not match.' : error.message);
      if (!d.user?.email_confirmed_at) { await auth.auth.signOut(); throw Error('Confirm your email address using the email we sent before signing in.'); }
      // The session must be saved in the Keychain/Keystore, or the next screen would bounce back here.
      try { await secureSessionStorage.getItem('probe'); }
      catch { await auth.auth.signOut().catch(() => {}); throw Error('This phone could not store your sign-in securely. Restart the app and try again.'); }
    },
    signOut: () => auth.auth.signOut()
  }), [session, data, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useOrganiser = () => useContext(Ctx);

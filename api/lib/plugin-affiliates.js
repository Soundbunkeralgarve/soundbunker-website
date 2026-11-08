import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { sendTransactionalEmail } from './notify.js';

const base = () => (process.env.SITE_URL || 'https://www.soundbunker.pt').replace(/\/$/, '');
const studio = () => process.env.PLUGIN_AFFILIATE_NOTIFICATION_EMAIL || 'steve@soundbunker.pt';
export const GIVEAWAY_CODE = 'SBPRODUCER';

const referralCode = /^[a-f0-9]{24}$/;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const payment = /^pi_[a-zA-Z0-9_]+$/;

export const affiliateJoinUrl = () => `${base()}/client?next=%2Fclient%23plugin-affiliates#plugin-affiliates`;

async function checked(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function producerEligible(db, email) {
  if (!email) return false;
  return Boolean(await checked(db.from('plugin_code_redemptions').select('licence_id')
    .eq('code', GIVEAWAY_CODE).eq('email', email.trim().toLowerCase()).maybeSingle()));
}

export async function affiliateStatus(db, userId, verifiedEmail) {
  const affiliate = await checked(db.from('plugin_affiliates').select('code,email,notified_at').eq('user_id', userId).maybeSingle());
  const eligible = await producerEligible(db, affiliate?.email || verifiedEmail);
  if (!affiliate) return { joined: false, eligible };
  const summary = await checked(db.rpc('sb_plugin_affiliate_summary', { p_affiliate: userId }));
  return {
    joined: true, eligible, ...(eligible ? { link: `${base()}/plugins.html?ref=${affiliate.code}` } : {}),
    joinNoticePending: eligible && !affiliate.notified_at, ...summary
  };
}

export async function joinAffiliate(db, user, profile, send = sendTransactionalEmail) {
  const fullName = String(profile?.full_name || user.user_metadata?.full_name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  if (!user.email_confirmed_at || !user.email || !fullName) return { error: 'Use a SoundBunker account with a full name and confirmed email to join.' };
  if (!await producerEligible(db, user.email)) return { error: 'Redeem your producer invitation with this account email before joining.' };
  await checked(db.from('plugin_affiliates').upsert({
    user_id: user.id, code: randomBytes(12).toString('hex'), full_name: fullName, email: user.email.toLowerCase()
  }, { onConflict: 'user_id', ignoreDuplicates: true }));
  const affiliate = await checked(db.from('plugin_affiliates').select('full_name,email,notified_at').eq('user_id', user.id).single());
  if (!affiliate.notified_at) {
    await send({ to: studio(), key: `plugin-affiliate-joined-${user.id}`, subject: 'New SoundBunker plug-in affiliate',
      text: `${affiliate.full_name} joined the plug-in affiliate programme.\n\nEmail: ${affiliate.email}\n\nManage affiliates: ${base()}/plugin-admin.html#affiliate-payouts` });
    await checked(db.from('plugin_affiliates').update({ notified_at: new Date().toISOString() }).eq('user_id', user.id));
  }
  return affiliateStatus(db, user.id);
}

function payoutBankKey() {
  const key = Buffer.from(process.env.PLUGIN_AFFILIATE_PAYOUT_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('Affiliate payout encryption is not configured');
  return key;
}

function validIban(iban) {
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  let remainder = 0;
  for (const character of iban.slice(4) + iban.slice(0, 4)) {
    const value = character.charCodeAt(0);
    remainder = value >= 65 ? (remainder * 100 + value - 55) % 97 : (remainder * 10 + value - 48) % 97;
  }
  return remainder === 1;
}

function encryptBank(id, details) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', payoutBankKey(), nonce);
  cipher.setAAD(Buffer.from(id));
  const data = Buffer.concat([cipher.update(JSON.stringify(details)), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), data]).toString('base64');
}

export async function payoutBankDetails(db, id) {
  if (!uuid.test(id || '')) return null;
  const payout = await checked(db.from('plugin_affiliate_payouts').select('bank_ciphertext').eq('id', id)
    .is('paid_at', null).is('cancelled_at', null).maybeSingle());
  if (!payout?.bank_ciphertext) return null;
  const data = Buffer.from(payout.bank_ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', payoutBankKey(), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'));
}

export async function requestAffiliatePayout(db, userId, { holder, iban, retry }, send = sendTransactionalEmail) {
  let id;
  if (retry) {
    const status = await affiliateStatus(db, userId);
    id = status.open_request;
  } else {
    holder = String(holder || '').trim();
    iban = String(iban || '').replace(/\s/g, '').toUpperCase();
    if (holder.length < 2 || holder.length > 150 || /[\p{Cc}]/u.test(holder) || !validIban(iban)) {
      return { error: 'Enter the account holder name and a valid IBAN.' };
    }
    const payoutId = randomUUID();
    id = await checked(db.rpc('sb_plugin_affiliate_request', {
      p_affiliate: userId, p_payout: payoutId, p_bank: encryptBank(payoutId, { holder, iban })
    }));
  }
  if (!id) return { error: 'There is no commission available to request.' };
  const [payout, affiliate] = await Promise.all([
    checked(db.from('plugin_affiliate_payouts').select('notified_at').eq('id', id).single()),
    checked(db.from('plugin_affiliates').select('full_name,email').eq('user_id', userId).single())
  ]);
  if (!payout.notified_at) {
    await send({ to: studio(), key: `plugin-affiliate-payout-${id}`, subject: 'SoundBunker affiliate payout requested',
      text: `${affiliate.full_name} has requested an affiliate payout.\n\nEmail: ${affiliate.email}\n\nReview the current balance: ${base()}/plugin-admin.html#affiliate-payouts` });
    await checked(db.from('plugin_affiliate_payouts').update({ notified_at: new Date().toISOString() }).eq('id', id));
  }
  return affiliateStatus(db, userId);
}

export async function affiliateAdmin(db) {
  const [affiliates, payouts] = await Promise.all([
    checked(db.from('plugin_affiliates').select('full_name,email,created_at').order('created_at', { ascending: false }).limit(100)),
    checked(db.from('plugin_affiliate_payouts').select('id,requested_at,paid_at,paid_cents,plugin_affiliates(full_name,email),plugin_affiliate_sales(commission_cents,reversed_at)')
      .is('paid_at', null).is('cancelled_at', null).order('requested_at').limit(100))
  ]);
  return { affiliates, payouts: payouts.map(({ plugin_affiliates: member, plugin_affiliate_sales: sales, ...payout }) => ({
    ...payout, ...member, cents: sales.filter((sale) => !sale.reversed_at).reduce((sum, sale) => sum + sale.commission_cents, 0)
  })) };
}

export async function markAffiliatePaid(db, id, cents) {
  if (!uuid.test(id) || !Number.isSafeInteger(cents) || cents <= 0) return { error: 'Invalid payout.' };
  const paid = await checked(db.rpc('sb_plugin_affiliate_paid', { p_payout: id, p_expected_cents: cents }));
  return paid ? { ok: true } : { error: 'This payout changed. Refresh the list and review the amount.' };
}

export async function attachAffiliateReferral(form, db, code, buyer) {
  if (!referralCode.test(code || '')) return;
  const affiliate = await checked(db.from('plugin_affiliates').select('user_id,email').eq('code', code).maybeSingle());
  if (!affiliate || affiliate.user_id === buyer || !await producerEligible(db, affiliate.email)) return;
  form.set('metadata[plugin_affiliate]', affiliate.user_id);
  form.set('payment_intent_data[metadata][plugin_affiliate]', affiliate.user_id);
  form.set('payment_intent_data[metadata][purchase_type]', 'plugin_licence');
}

export async function recordAffiliateSale(checkout, licence, db) {
  const id = checkout.metadata?.plugin_affiliate;
  const intent = licence.stripe_payment_intent;
  if (!uuid.test(id || '') || checkout.livemode !== true || checkout.payment_status !== 'paid' ||
      checkout.currency !== 'eur' || !(checkout.amount_total > 0) || !payment.test(intent || '')) return;
  const affiliate = await checked(db.from('plugin_affiliates').select('email').eq('user_id', id).maybeSingle());
  if (!await producerEligible(db, affiliate?.email)) return;
  await checked(db.rpc('sb_plugin_affiliate_record', {
    p_payment: intent, p_session: checkout.id, p_affiliate: id, p_email: licence.email, p_buyer: licence.user_id
  }));
}

export async function reverseAffiliateSale(db, stripe, intent, metadata) {
  if (!payment.test(intent || '') || (metadata?.purchase_type && metadata.purchase_type !== 'plugin_licence')) return;
  const match = await checked(db.from('plugin_affiliate_sales').select('affiliate_id').eq('payment_intent', intent).maybeSingle());
  const id = match?.affiliate_id || metadata?.plugin_affiliate ||
    (!metadata?.purchase_type ? (await stripe(`/payment_intents/${intent}`)).metadata?.plugin_affiliate : null);
  if (uuid.test(id || '')) await checked(db.rpc('sb_plugin_affiliate_reverse', { p_payment: intent, p_affiliate: id }));
}

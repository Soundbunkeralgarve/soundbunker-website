import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.LICENCE_PRIVATE_KEY_B64 = Buffer.from(pem).toString('base64');
const { pluginRequest, fulfilPluginCheckout, revokeForPayment, createCheckout, claimFree, listProducts, licenceForSession } = await import('../api/lib/plugin-licences.js');
const { verifyToken } = await import('../api/lib/licence-token.js');
const publicPem = crypto.createPublicKey(pem).export({ type: 'spki', format: 'pem' });

const m = (n) => crypto.createHash('sha256').update(`machine-${n}`).digest('hex');

async function database({ asShipped = false } = {}) {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(await readFile(new URL('../SUPABASE_PLUGIN_LICENCES.sql', import.meta.url), 'utf8'));
  if (!asShipped) await db.exec("update plugin_products set price_cents = 4900, active = true where id = 'fallout';");
  return db;
}

// Just enough of supabase-js for lib/plugin-licences.js: rpc() runs the real SQL functions, from() simple queries.
function client(db) {
  const run = async (sql, params) => (await db.query(sql, params)).rows;
  return {
    async rpc(name, args) {
      const keys = Object.keys(args);
      try {
        const rows = await run(`select ${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => args[k]));
        return { data: rows[0].r, error: null };
      } catch (error) { return { data: null, error }; }
    },
    from(table) {
      const where = [], params = [];
      let op = 'select', values = null, single = false, maybe = false;
      const q = {
        select() { return q; },
        order() { return q; },
        eq(c, v) { params.push(v); where.push(`${c} = $${params.length}`); return q; },
        in(c, v) { params.push(v); where.push(`${c} = any($${params.length})`); return q; },
        is(c) { where.push(`${c} is null`); return q; },
        insert(row) { op = 'insert'; values = row; return q; },
        update(row) { op = 'update'; values = row; return q; },
        single() { single = true; return q; },
        maybeSingle() { maybe = true; return q; },
        then(resolve, reject) {
          (async () => {
            let sql;
            if (op === 'insert') {
              const cols = Object.keys(values);
              sql = `insert into ${table} (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning *`;
              params.splice(0, params.length, ...cols.map((c) => values[c]));
            } else if (op === 'update') {
              const cols = Object.keys(values), offset = params.length;
              sql = `update ${table} set ${cols.map((c, i) => `${c} = $${offset + i + 1}`).join(',')}${where.length ? ` where ${where.join(' and ')}` : ''} returning *`;
              params.push(...cols.map((c) => values[c]));
            } else sql = `select * from ${table}${where.length ? ` where ${where.join(' and ')}` : ''}`;
            try {
              const rows = await run(sql, params);
              if (single && rows.length !== 1) return { data: null, error: new Error('not single') };
              return { data: single || maybe ? rows[0] ?? null : rows, error: null };
            } catch (error) { return { data: null, error }; }
          })().then(resolve, reject);
        }
      };
      return q;
    }
  };
}

const ask = (sb, body) => pluginRequest({ machineName: 'Studio Mac', os: 'macOS 27', version: '1.0.0', ...body }, sb);

test('plug-in activation: seats, products, refresh, deactivate, revoke', async () => {
  const db = await database();
  const sb = client(db);
  try {
    await db.exec(`insert into plugin_licences (licence_key, product_id, includes, seats, email) values
      ('SB-AAAAA-BBBBB-CCCCC-DDDDD', 'fallout', array['fallout'], 2, 'buyer@example.com'),
      ('SB-EEEEE-FFFFF-GGGGG-HHHHH', 'complete', array['armoury','nuclear','napalm','shrapnel','fallout','sentinel','recon'], 2, 'pro@example.com')`);

    const first = await ask(sb, { action: 'activate', product: 'fallout', machine: m(1), key: ' sb-aaaaa-bbbbb-ccccc-ddddd ' });
    assert.equal(first.ok, true);
    const claims = verifyToken(first.token, publicPem);
    assert.equal(claims.typ, 'licence'); assert.equal(claims.pid, 'fallout'); assert.equal(claims.mid, m(1));
    assert.equal(claims.em, 'bu***@example.com'); assert.equal(claims.lic, 'SB-AAAAA-*****-*****-DDDDD');
    assert.equal(claims.chk - claims.iat, 30 * 86400);

    assert.equal((await ask(sb, { action: 'activate', product: 'fallout', machine: m(1), key: 'SB-AAAAA-BBBBB-CCCCC-DDDDD' })).ok, true, 'same computer again: no new seat');
    assert.equal((await ask(sb, { action: 'activate', product: 'fallout', machine: m(2), key: 'SB-AAAAA-BBBBB-CCCCC-DDDDD' })).ok, true);
    const third = await ask(sb, { action: 'activate', product: 'fallout', machine: m(3), key: 'SB-AAAAA-BBBBB-CCCCC-DDDDD' });
    assert.equal(third.error, 'no_seats'); assert.match(third.message, /2 computers/);
    assert.equal((await ask(sb, { action: 'activate', product: 'nuclear', machine: m(1), key: 'SB-AAAAA-BBBBB-CCCCC-DDDDD' })).error, 'wrong_product');
    assert.equal((await ask(sb, { action: 'activate', product: 'fallout', machine: m(1), key: 'SB-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ' })).error, 'invalid_key');
    assert.equal((await ask(sb, { action: 'activate', product: 'fallout', machine: 'not-a-machine', key: 'SB-AAAAA-BBBBB-CCCCC-DDDDD' })).error, 'bad_request');

    // A bundle: every plug-in on one computer uses one seat.
    for (const product of ['armoury', 'nuclear', 'fallout', 'recon'])
      assert.equal((await ask(sb, { action: 'activate', product, machine: m(7), key: 'SB-EEEEE-FFFFF-GGGGG-HHHHH' })).ok, true, product);
    assert.equal((await ask(sb, { action: 'activate', product: 'sentinel', machine: m(8), key: 'SB-EEEEE-FFFFF-GGGGG-HHHHH' })).ok, true);
    assert.equal((await ask(sb, { action: 'activate', product: 'napalm', machine: m(9), key: 'SB-EEEEE-FFFFF-GGGGG-HHHHH' })).error, 'no_seats');

    const refreshed = await ask(sb, { action: 'refresh', product: 'fallout', machine: m(1), token: first.token });
    assert.equal(refreshed.ok, true);
    assert.equal((await ask(sb, { action: 'refresh', product: 'fallout', machine: m(2), token: first.token })).error, 'invalid_token', 'token from another computer');
    const forged = first.token.replace(/^[^.]+/, Buffer.from(JSON.stringify({ ...claims, pid: 'complete' })).toString('base64url'));
    assert.equal((await ask(sb, { action: 'refresh', product: 'complete', machine: m(1), token: forged })).error, 'invalid_token', 'edited token');

    assert.equal((await ask(sb, { action: 'deactivate', product: 'fallout', machine: m(1), token: refreshed.token })).ok, true);
    assert.equal((await ask(sb, { action: 'refresh', product: 'fallout', machine: m(1), token: refreshed.token })).error, 'not_found', 'deactivated computer');
    assert.equal((await ask(sb, { action: 'activate', product: 'fallout', machine: m(3), key: 'SB-AAAAA-BBBBB-CCCCC-DDDDD' })).ok, true, 'freed seat is reusable');

    await db.exec("update plugin_licences set status = 'refunded' where licence_key = 'SB-AAAAA-BBBBB-CCCCC-DDDDD'");
    const m3 = await ask(sb, { action: 'activate', product: 'fallout', machine: m(3), key: 'SB-AAAAA-BBBBB-CCCCC-DDDDD' });
    assert.equal(m3.error, 'revoked');
  } finally { await db.close(); }
});

test('trials: 14 days, restored on reinstall, never twice', async () => {
  const db = await database();
  const sb = client(db);
  try {
    const t = await ask(sb, { action: 'trial', product: 'sentinel', machine: m(1) });
    const claims = verifyToken(t.token, publicPem);
    assert.equal(claims.typ, 'trial');
    assert.ok(Math.abs(claims.exp - (Date.now() / 1000 + 14 * 86400)) < 60);
    const again = verifyToken((await ask(sb, { action: 'trial', product: 'sentinel', machine: m(1) })).token, publicPem);
    assert.equal(again.exp, claims.exp, 'reinstall gets the same end date');
    assert.equal((await ask(sb, { action: 'trial', product: 'nothing', machine: m(1) })).error, 'wrong_product');
    await db.exec("update plugin_trials set started_at = now() - interval '15 days'");
    assert.equal((await ask(sb, { action: 'trial', product: 'sentinel', machine: m(1) })).error, 'trial_used');
    assert.equal((await ask(sb, { action: 'refresh', product: 'sentinel', machine: m(1), token: t.token })).error, 'invalid_token', 'trials are not refreshed');
  } finally { await db.close(); }
});

test('checkout, fulfilment, e-mail and refunds', async () => {
  const db = await database();
  const sb = client(db);
  try {
    await db.exec("update plugin_products set active = false where id = 'napalm'");
    assert.match((await createCheckout({ productId: 'napalm' }, sb, async () => assert.fail('no Stripe call'))).error, /not on sale/);
    await db.exec("update plugin_products set active = true where id = 'napalm'");
    let form;
    const made = await createCheckout({ productId: 'fallout', email: 'buyer@example.com' }, sb, async (path, f) => { form = f; return { url: 'https://checkout.stripe.com/x' }; });
    assert.equal(made.url, 'https://checkout.stripe.com/x');
    assert.equal(form.get('line_items[0][price_data][unit_amount]'), '4900');
    assert.equal(form.get('metadata[purchase_type]'), 'plugin_licence');
    assert.equal(form.get('payment_intent_data[metadata][plugin_product]'), 'fallout');

    const sent = [];
    const opts = { send: async (mail) => { sent.push(mail); }, invoice: async () => ({ queued: true }) };
    const checkout = { id: 'cs_live_123', livemode: true, payment_status: 'paid', currency: 'eur', amount_subtotal: 4900, amount_total: 3900,
      payment_intent: 'pi_123', customer_details: { email: 'buyer@example.com' }, metadata: { purchase_type: 'plugin_licence', plugin_product: 'fallout' } };
    const done = await fulfilPluginCheckout(checkout, sb, opts);
    assert.equal(done.status, 'fulfilled');
    assert.deepEqual(done.invoice, { queued: true });
    const again = await fulfilPluginCheckout(checkout, sb, opts);
    assert.equal(again.licence, done.licence, 'webhook retry: same licence');
    const rows = (await db.query('select * from plugin_licences')).rows;
    assert.equal(rows.length, 1);
    assert.match(rows[0].licence_key, /^SB(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
    assert.equal(rows[0].amount_cents, 3900);
    const customer = sent.filter((x) => x.to === 'buyer@example.com');
    assert.equal(customer.length, 2);
    assert.equal(customer[0].key, customer[1].key, 'retries reuse the e-mail idempotency key');
    assert.ok(customer[0].text.includes(rows[0].licence_key));
    assert.match(customer[0].text, /2 computers/);

    await assert.rejects(fulfilPluginCheckout({ ...checkout, id: 'cs_live_999', amount_subtotal: 100 }, sb, opts), /does not match/);
    const test = await fulfilPluginCheckout({ ...checkout, id: 'cs_test_1', livemode: false, payment_intent: 'pi_test' }, sb,
      { ...opts, invoice: async () => assert.fail('no invoice for test payments') });
    assert.equal(test.invoice.skipped, true);

    assert.deepEqual(await revokeForPayment('pi_123', 'refund', sb), { revoked: 1 });
    assert.equal((await db.query("select status from plugin_licences where stripe_payment_intent = 'pi_123'")).rows[0].status, 'refunded');
    assert.deepEqual(await revokeForPayment('pi_other', 'refund', sb), { revoked: 0 });
  } finally { await db.close(); }
});

test('browsers cannot read or call the licence tables', async () => {
  const db = await database();
  try {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role};`);
      await assert.rejects(db.query('select * from plugin_licences'), /permission denied/);
      await assert.rejects(db.query('select * from plugin_activations'), /permission denied/);
      await assert.rejects(db.query(`select sb_plugin_trial('fallout', '${m(1)}')`), /permission denied/);
      await assert.rejects(db.query('select * from plugin_codes'), /permission denied/);
      await assert.rejects(db.query(`select sb_plugin_redeem_code('SBPRODUCER', 'a@example.com', 'x')`), /permission denied/);
      await db.exec('reset role;');
    }
  } finally { await db.close(); }
});

test('prices: Armoury free; plug-ins EUR 25; any 3 EUR 45; everything EUR 59', async () => {
  const db = await database({ asShipped: true });
  try {
    const products = Object.fromEntries((await listProducts(client(db))).map((p) => [p.id, p]));
    assert.equal(products.armoury.free, true); assert.equal(products.armoury.for_sale, true);
    for (const id of ['nuclear', 'napalm', 'shrapnel', 'fallout', 'sentinel']) {
      assert.equal(products[id].price_cents, 2500, id);
      assert.equal(products[id].for_sale, true, id);
    }
    // RECON is listed as coming soon: not on sale and in neither bundle.
    assert.equal(products.recon.for_sale, false);
    assert.equal(products.pack3.price_cents, 4500); assert.equal(products.pack3.pick, 3);
    assert.deepEqual(products.pack3.includes, ['nuclear', 'napalm', 'shrapnel', 'fallout', 'sentinel']);
    assert.equal(products.complete.price_cents, 5900);
    assert.ok(!products.complete.includes.includes('recon'));
    assert.equal(products.complete.includes.length, 6);
  } finally { await db.close(); }
});

test('free Armoury: e-mailed key, one licence per address, bundles offered in the e-mail', async () => {
  const db = await database({ asShipped: true });
  const sb = client(db);
  try {
    const sent = [];
    const opts = { send: async (mail) => { sent.push(mail); } };
    assert.match((await claimFree({ productId: 'armoury', email: 'nope' }, sb, opts)).error, /valid e-mail/);
    assert.match((await claimFree({ productId: 'fallout', email: 'a@example.com' }, sb, opts)).error, /not free/);
    assert.deepEqual(await claimFree({ productId: 'armoury', email: ' Fan@Example.com ' }, sb, opts), { ok: true });
    assert.deepEqual(await claimFree({ productId: 'armoury', email: 'fan@example.com' }, sb, opts), { ok: true });
    const rows = (await db.query("select * from plugin_licences")).rows;
    assert.equal(rows.length, 1, 'claiming again re-sends the same key');
    assert.equal(rows[0].source, 'free'); assert.equal(rows[0].email, 'fan@example.com');
    assert.equal(sent.length, 2);
    assert.match(sent[0].subject, /free SB ARMOURY/);
    assert.ok(sent[0].text.includes(rows[0].licence_key));
    assert.match(sent[0].text, /is €25\.00, or any 3 for €45\.00 \(instead of €75\.00\), or all 5 for €59\.00 \(instead of €125\.00\)/);
    assert.match(sent[0].text, /plugins\.html#go-further/);
    const key = rows[0].licence_key;
    assert.equal((await ask(sb, { action: 'activate', product: 'armoury', machine: m(1), key })).ok, true, 'free key activates the Armoury');
    assert.equal((await ask(sb, { action: 'activate', product: 'fallout', machine: m(1), key })).error, 'wrong_product');
  } finally { await db.close(); }
});

test('every paid order includes the free Armoury; the 3-Pack unlocks the chosen three', async () => {
  const db = await database({ asShipped: true });
  const sb = client(db);
  try {
    let form;
    const stripe = async (path, f) => { form = f; return { url: 'https://checkout.stripe.com/x' }; };
    await createCheckout({ productId: 'nuclear', email: 'fan@example.com' }, sb, stripe);
    assert.equal(form.get('line_items[0][price_data][unit_amount]'), '2500');
    assert.equal(form.get('metadata[free_product]'), 'armoury', 'single plug-in: Armoury added free');
    assert.match(form.get('custom_text[submit][message]'), /^SB ARMOURY included free\./);
    assert.equal(form.get('line_items[0][price_data][product]'), 'sb_plugin_nuclear');
    await createCheckout({ productId: 'complete' }, sb, stripe);
    assert.equal(form.get('line_items[0][price_data][unit_amount]'), '5900');
    assert.equal(form.get('metadata[free_product]'), '', 'Complete already contains the Armoury');

    assert.match((await createCheckout({ productId: 'pack3', choice: ['nuclear', 'napalm'] }, sb, stripe)).error, /Choose 3/);
    assert.match((await createCheckout({ productId: 'pack3', choice: ['nuclear', 'nuclear', 'napalm'] }, sb, stripe)).error, /Choose 3/);
    assert.match((await createCheckout({ productId: 'pack3', choice: ['nuclear', 'napalm', 'armoury'] }, sb, stripe)).error, /Choose 3/);
    await createCheckout({ productId: 'pack3', choice: ['nuclear', 'napalm', 'fallout'] }, sb, stripe);
    assert.equal(form.get('line_items[0][price_data][unit_amount]'), '4500');
    assert.equal(form.get('metadata[choice]'), 'nuclear,napalm,fallout');
    assert.equal(form.get('metadata[free_product]'), 'armoury');
    assert.match(form.get('custom_text[submit][message]'), /^Your plug-ins: SB NUCLEAR, SB NAPALM, SB FALLOUT\. SB ARMOURY included free\./);

    const sent = [];
    const opts = { send: async (mail) => { sent.push(mail); }, invoice: async () => ({ queued: true }) };
    const checkout = { id: 'cs_live_pack', livemode: true, payment_status: 'paid', currency: 'eur', amount_subtotal: 4500, amount_total: 4500,
      payment_intent: 'pi_pack', customer_details: { email: 'fan@example.com' },
      metadata: { purchase_type: 'plugin_licence', plugin_product: 'pack3', choice: 'nuclear,napalm,fallout', free_product: 'armoury' } };
    await fulfilPluginCheckout(checkout, sb, opts);
    const rows = (await db.query('select product_id, source, includes from plugin_licences order by product_id')).rows;
    assert.deepEqual(rows.map((r) => `${r.product_id}:${r.source}:${r.includes.join('+')}`), ['armoury:free:armoury', 'pack3:stripe:nuclear+napalm+fallout']);
    const key = (await db.query("select licence_key from plugin_licences where product_id = 'pack3'")).rows[0].licence_key;
    assert.equal((await ask(sb, { action: 'activate', product: 'napalm', machine: m(1), key })).ok, true, 'a chosen plug-in activates');
    assert.equal((await ask(sb, { action: 'activate', product: 'sentinel', machine: m(1), key })).error, 'wrong_product', 'an unchosen one does not');
    const freeMail = sent.find((x) => /free SB ARMOURY/.test(x.subject));
    assert.ok(freeMail && !/Want more/.test(freeMail.text), 'no sales pitch right after buying');
    assert.ok(sent.some((x) => /SB 3-PACK licence key/.test(x.subject) && /unlocks SB NUCLEAR, SB NAPALM, SB FALLOUT/.test(x.text)));
    await assert.rejects(fulfilPluginCheckout({ ...checkout, id: 'cs_live_x', metadata: { ...checkout.metadata, choice: 'nuclear,sentinel' } }, sb, opts), /choice is invalid/);
    await assert.rejects(fulfilPluginCheckout({ ...checkout, id: 'cs_live_y', amount_subtotal: 2500 }, sb, opts), /does not match/);
  } finally { await db.close(); }
});

// A Stripe account with promotion codes, enough for the producer code sync.
function fakeStripe() {
  const s = { products: {}, promos: [], coupons: [], sessions: [], prices: [], lineItems: {}, retrieved: {} };
  s.call = async (path, form) => {
    if (path.startsWith('/prices?')) {
      const keys = new URLSearchParams(path.split('?')[1]).getAll('lookup_keys[]');
      return { data: s.prices.filter((p) => keys.includes(p.lookup_key)) };
    }
    if (path === '/prices') {
      const p = { id: `price_${s.prices.length + 1}`, product: form.get('product'), unit_amount: Number(form.get('unit_amount')), lookup_key: form.get('lookup_key') };
      s.prices.push(p);
      return p;
    }
    if (path.endsWith('/line_items?limit=20')) return { data: s.lineItems[path.split('/')[3]] || [] };
    if (path.startsWith('/checkout/sessions/')) return s.retrieved[path.split('/')[3]] || assert.fail('unknown session');
    if (path.startsWith('/products')) { const id = path.split('/')[2] || form.get('id'); s.products[id] = form; return { id }; }
    if (path === '/coupons') {
      const c = { id: `co_${s.coupons.length + 1}`, percent: form.get('percent_off'), product: form.get('applies_to[products][0]') };
      s.coupons.push(c);
      return c;
    }
    if (path === '/promotion_codes') {
      const p = { id: `promo_${s.promos.length + 1}`, code: form.get('code'), coupon: form.get('coupon'), max: form.get('max_redemptions'),
        active: true, metadata: { plugin_code: form.get('metadata[plugin_code]') } };
      s.promos.push(p);
      return p;
    }
    if (path.startsWith('/promotion_codes?')) {
      const q = new URLSearchParams(path.split('?')[1]);
      return { data: s.promos.filter((p) => p.active && p.code === q.get('code')) };
    }
    if (path.startsWith('/promotion_codes/')) {
      const p = s.promos.find((x) => x.id === path.split('/')[2]);
      if (form) p.active = form.get('active') !== 'false';
      return p;
    }
    if (path === '/checkout/sessions') { s.sessions.push(form); return { url: 'https://checkout.stripe.com/s' }; }
    throw new Error(`unexpected Stripe call ${path}`);
  };
  return s;
}

test('producer codes: Stripe promotion codes limited to the code\'s product, counted once per address, switched off when used up', async () => {
  const db = await database({ asShipped: true });
  const sb = client(db);
  try {
    await db.exec(`insert into plugin_codes (code, product_id, max_uses) values ('SBPRODUCER', 'complete', 2);
      insert into plugin_codes (code, product_id, active) values ('OLDCODE', 'complete', false);
      insert into plugin_codes (code, product_id, expires_at) values ('LASTYEAR', 'complete', now() - interval '1 day');`);
    const noStripe = async () => assert.fail('no Stripe call');
    assert.match((await createCheckout({ code: 'WRONG' }, sb, noStripe)).error, /not valid/);
    assert.match((await createCheckout({ code: 'OLDCODE' }, sb, noStripe)).error, /not valid/);
    assert.match((await createCheckout({ code: 'LASTYEAR' }, sb, noStripe)).error, /expired/);

    // Any checkout for the product makes sure its usable codes exist in Stripe, once, and only for that product.
    const stripe = fakeStripe();
    await createCheckout({ productId: 'complete' }, sb, stripe.call);
    await createCheckout({ productId: 'complete' }, sb, stripe.call);
    await createCheckout({ productId: 'nuclear' }, sb, stripe.call);
    assert.deepEqual(stripe.promos.map((p) => `${p.code}:${p.max}:${p.metadata.plugin_code}`), ['SBPRODUCER:2:SBPRODUCER']);
    assert.deepEqual(stripe.coupons.map((c) => `${c.percent}:${c.product}`), ['100:sb_plugin_complete'], 'never discounts merch or other products');
    assert.equal(stripe.sessions[0].get('allow_promotion_codes'), 'true', 'buyers type codes in the checkout');
    assert.equal(stripe.sessions[0].get('line_items[0][price_data][product]'), 'sb_plugin_complete');

    // A producer link opens the checkout for the code's product with the code applied.
    await createCheckout({ productId: 'nuclear', code: ' sbproducer ' }, sb, stripe.call);
    const form = stripe.sessions.at(-1);
    assert.equal(form.get('metadata[plugin_product]'), 'complete', 'the code decides the product');
    assert.equal(form.get('discounts[0][promotion_code]'), 'promo_1');
    assert.equal(form.get('allow_promotion_codes'), null, 'Stripe refuses discounts together with promotion codes');

    const sent = [];
    const opts = { send: async (mail) => { sent.push(mail); }, invoice: async () => assert.fail('no invoice for a €0 order'), stripeCall: stripe.call };
    const order = (id, email) => ({ id, livemode: true, payment_status: 'no_payment_required', currency: 'eur', amount_subtotal: 5900,
      amount_total: 0, payment_intent: null, customer_details: { email }, discounts: [{ coupon: 'co_1', promotion_code: 'promo_1' }],
      metadata: { purchase_type: 'plugin_licence', plugin_product: 'complete' } });
    const done = await fulfilPluginCheckout(order('cs_live_p1', 'beat@maker.com'), sb, opts);
    assert.equal(done.invoice.skipped, true);
    await fulfilPluginCheckout(order('cs_live_p1', 'beat@maker.com'), sb, opts);   // webhook retry
    let rows = (await db.query('select * from plugin_licences')).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, 'code'); assert.equal(rows[0].product_id, 'complete'); assert.equal(rows[0].note, 'Code SBPRODUCER');
    assert.equal((await db.query("select uses from plugin_codes where code = 'SBPRODUCER'")).rows[0].uses, 1);
    const toProducer = sent.filter((x) => x.to === 'beat@maker.com');
    assert.match(toProducer[0].subject, /free SB COMPLETE/);
    assert.match(toProducer[0].text, /with our compliments/);
    assert.match(toProducer[0].text, /Everything at once \(one installer for all 6\):\n   \[SB COMPLETE for macOS\]\(https:\/\/www\.soundbunker\.pt\/download\/complete\/mac\)/);
    assert.match(toProducer[0].text, /SB NUCLEAR:  \[macOS\]\(https:\/\/www\.soundbunker\.pt\/download\/nuclear\/mac\)/);
    assert.doesNotMatch(toProducer[0].text, /github/i);
    assert.match(toProducer[0].text, /Or one by one:\n\nSB ARMOURY/);
    assert.equal(new Set(sent.filter((x) => /Producer code used · SBPRODUCER/.test(x.subject)).map((x) => x.key)).size, 1, 'retries reuse the e-mail key');

    const key = rows[0].licence_key;
    for (const product of ['nuclear', 'sentinel', 'armoury'])
      assert.equal((await ask(sb, { action: 'activate', product, machine: m(1), key })).ok, true, product);

    await fulfilPluginCheckout(order('cs_live_p2', 'second@maker.com'), sb, opts);
    assert.equal((await db.query("select uses from plugin_codes where code = 'SBPRODUCER'")).rows[0].uses, 2);
    assert.match((await createCheckout({ code: 'SBPRODUCER' }, sb, noStripe)).error, /maximum/);
    await createCheckout({ productId: 'complete' }, sb, stripe.call);
    assert.equal(stripe.promos[0].active, false, 'a used-up code is switched off in Stripe');
    await assert.rejects(fulfilPluginCheckout({ ...order('cs_live_p3', 'x@maker.com'), discounts: [] }, sb, opts),
      /Not a paid/, 'a €0 order without a producer code is refused');
  } finally { await db.close(); }
});

test('free SB ARMOURY: a €0 Stripe checkout offering SB COMPLETE and every plug-in, all on one key', async () => {
  const db = await database({ asShipped: true });
  const sb = client(db);
  try {
    const stripe = fakeStripe();
    assert.ok((await createCheckout({ productId: 'armoury' }, sb, stripe.call)).url);
    const named = stripe.products.sb_plugin_complete;
    assert.match(named.get('name'), /^★ BEST OFFER · SB COMPLETE: all 6 plug-ins, save €66\.00$/);
    assert.match(named.get('images[0]'), /assets\/plugins\/complete\.jpg$/);
    const form = stripe.sessions[0];
    assert.equal(form.get('line_items[0][price_data][unit_amount]'), '0');
    assert.equal(form.get('line_items[0][price_data][product]'), 'sb_plugin_armoury');
    assert.equal(form.get('allow_promotion_codes'), 'true', 'discount codes can be typed in the checkout');
    const offered = [...form.keys()].filter((k) => /^optional_items\[\d+\]\[price\]$/.test(k)).map((k) => stripe.prices.find((p) => p.id === form.get(k)).product);
    assert.equal(offered[0], 'sb_plugin_complete', 'the full collection is offered first');
    assert.equal(form.get('optional_items[0][adjustable_quantity][maximum]'), '1');
    assert.ok(offered.includes('sb_plugin_nuclear') && !offered.includes('sb_plugin_pack3') && !offered.includes('sb_plugin_armoury'));
    assert.match(form.get('custom_text[submit][message]'), /SB ARMOURY is free\. Add SB COMPLETE above: all \d plug-ins for €59\.00 instead of €\d+\.00, you save/);
    await createCheckout({ productId: 'armoury' }, sb, stripe.call);
    assert.equal(stripe.prices.length, offered.length, 'prices are made once and reused');

    const sent = [];
    const opts = { send: async (mail) => { sent.push(mail); }, invoice: async (c, p) => ({ queued: p.name }), stripeCall: stripe.call };
    const meta = { purchase_type: 'plugin_licence', plugin_product: 'armoury', free_checkout: '1' };
    const item = (id, cents) => ({ price: { product: `sb_plugin_${id}`, unit_amount: cents } });

    // Nothing added: the free licence, and the thank-you page finds it.
    const free = { id: 'cs_live_f1', livemode: true, status: 'complete', payment_status: 'no_payment_required', currency: 'eur', amount_subtotal: 0, amount_total: 0,
      customer_details: { email: 'Free@Maker.com' }, metadata: meta };
    stripe.lineItems.cs_live_f1 = [item('armoury', 0)];
    stripe.retrieved.cs_live_f1 = free;
    assert.equal((await fulfilPluginCheckout(free, sb, opts)).free, true);
    assert.equal((await licenceForSession('cs_live_f1', sb, stripe.call)).product, 'SB ARMOURY');
    assert.match(sent.find((m) => m.to === 'free@maker.com').subject, /Your free SB ARMOURY licence key/);

    // Two plug-ins added: one key for SB ARMOURY + both, invoiced as such.
    const two = { id: 'cs_live_f2', livemode: true, payment_status: 'paid', currency: 'eur', amount_subtotal: 5000, amount_total: 5000,
      customer_details: { email: 'two@maker.com' }, metadata: meta };
    stripe.lineItems.cs_live_f2 = [item('armoury', 0), item('nuclear', 2500), item('napalm', 2500)];
    const done = await fulfilPluginCheckout(two, sb, opts);
    assert.equal(done.invoice.queued, 'SB ARMOURY + SB NUCLEAR + SB NAPALM');
    const l = await licenceForSession('cs_live_f2', sb, stripe.call);
    assert.equal(l.product, 'SB ARMOURY + SB NUCLEAR + SB NAPALM');
    assert.deepEqual(l.plugins.map((p) => p.id).sort(), ['armoury', 'napalm', 'nuclear']);
    assert.equal(l.install_all, null);
    assert.equal(sent.filter((m) => m.to === 'two@maker.com').length, 1, 'one e-mail, one key');

    // SB COMPLETE added: an SB COMPLETE licence.
    const all = { ...two, id: 'cs_live_f3', amount_subtotal: 5900, amount_total: 5900, customer_details: { email: 'all@maker.com' } };
    stripe.lineItems.cs_live_f3 = [item('armoury', 0), item('complete', 5900)];
    await fulfilPluginCheckout(all, sb, opts);
    assert.equal((await licenceForSession('cs_live_f3', sb, stripe.call)).product, 'SB COMPLETE');

    // A producer code on the added SB COMPLETE: free, counted, no invoice.
    await db.exec(`insert into plugin_codes (code, product_id, max_uses) values ('FREEPROD', 'complete', 5)`);
    const coded = { ...all, id: 'cs_live_f5', payment_status: 'no_payment_required', amount_total: 0, customer_details: { email: 'prod@maker.com' },
      discounts: [{ promotion_code: { id: 'promo_x', metadata: { plugin_code: 'FREEPROD' } } }] };
    stripe.lineItems.cs_live_f5 = [item('armoury', 0), item('complete', 5900)];
    assert.equal((await fulfilPluginCheckout(coded, sb, opts)).invoice.skipped, true);
    assert.equal((await db.query(`select uses from plugin_codes where code = 'FREEPROD'`)).rows[0].uses, 1);
    assert.equal((await licenceForSession('cs_live_f5', sb, stripe.call)).product, 'SB COMPLETE');
    stripe.lineItems.cs_live_f6 = stripe.lineItems.cs_live_f5;
    await assert.rejects(fulfilPluginCheckout({ ...coded, id: 'cs_live_f6', discounts: [] }, sb, opts), /Not a paid/, 'added plug-ins are only free with a producer code');

    // Two SB COMPLETEs: one key on twice the computers.
    stripe.lineItems.cs_live_f7 = [item('armoury', 0), { ...item('complete', 5900), quantity: 2 }];
    await fulfilPluginCheckout({ ...all, id: 'cs_live_f7', amount_subtotal: 11800, amount_total: 11800, customer_details: { email: 'twice@maker.com' } }, sb, opts);
    assert.equal((await licenceForSession('cs_live_f7', sb, stripe.call)).seats, 4);

    stripe.lineItems.cs_live_f4 = [item('armoury', 0), item('complete', 5900)];
    await assert.rejects(fulfilPluginCheckout({ ...all, id: 'cs_live_f4', amount_subtotal: 100 }, sb, opts), /does not match/);
  } finally { await db.close(); }
});

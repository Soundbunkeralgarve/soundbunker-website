import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.LICENCE_PRIVATE_KEY_B64 = Buffer.from(pem).toString('base64');
const { pluginRequest, fulfilPluginCheckout, revokeForPayment, createCheckout } = await import('../api/lib/plugin-licences.js');
const { verifyToken } = await import('../api/lib/licence-token.js');
const publicPem = crypto.createPublicKey(pem).export({ type: 'spki', format: 'pem' });

const m = (n) => crypto.createHash('sha256').update(`machine-${n}`).digest('hex');

async function database() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(await readFile(new URL('../SUPABASE_PLUGIN_LICENCES.sql', import.meta.url), 'utf8'));
  await db.exec("update plugin_products set price_cents = 4900, active = true where id in ('fallout', 'complete');");
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
    assert.match((await createCheckout({ productId: 'nuclear' }, sb, async () => assert.fail('no Stripe call'))).error, /not on sale/);
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
      await db.exec('reset role;');
    }
  } finally { await db.close(); }
});

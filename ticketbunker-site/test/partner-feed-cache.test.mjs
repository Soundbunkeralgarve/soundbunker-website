import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('failed refreshes never renew expired Viator prices while other provider fallback survives', () => {
  // A separate process gives the real handler an isolated module cache, clock and
  // fixture-only environment without accessing the developer's provider credentials.
  const script = `
    import assert from 'node:assert/strict';
    for (const processingFailure of [false, true]) {
    const {default: handler} = await import(${JSON.stringify(new URL('../api/partner-feed.js', import.meta.url).href)} + '?failure=' + processingFailure);
    let now = Date.parse('2026-11-21T12:00:00Z'), failing = false, requests = 0;
    Date.now = () => now;
    console.log = () => {};
    console.error = () => {if (processingFailure) throw Error('fixture processing failure');};
    globalThis.fetch = async (url) => {
      requests++;
      if (failing) return {ok: false, status: 503};
      if (url.includes('skiddlecdn')) return {ok: true, text: async () =>
        '<event id="1" link="https://www.skiddle.com/e/1/?sktag=XXX"><name>Fixture gig</name><date>2026-11-28</date><eventcode>LIVE</eventcode><cancelled>0</cancelled><venue><name>Fixture venue</name><town>London</town></venue><ticket id="1"><faceValue>15</faceValue><status statuscode="1">on sale</status></ticket></event>'};
      if (url.includes('productdata.awin')) return {ok: true, arrayBuffer: async () => Buffer.from(
        'merchant_id,product_name,aw_deep_link,aw_product_id,search_price\\n1936,Fixture show,https://www.awin1.com/cread.php?awinmid=1936,2,25\\n')};
      const products = [{productCode: '3P1', title: 'Fixture boat trip',
        productUrl: 'https://www.viator.com/tours/London/Fixture/3P1?pid=P00333211',
        pricing: {summary: {fromPrice: 20}, currency: 'EUR'}}];
      return {ok: true, json: async () => ({products: url.endsWith('/search/freetext') ? {results: []} : products})};
    };
    const read = async () => {
      let body;
      const res = {setHeader() {}, status(code) {assert.equal(code, 200); return this;}, json(value) {body = value;}};
      await handler({method: 'GET', query: {}}, res);
      return body.events;
    };
    const initial = await read();
    assert.deepEqual(new Set(initial.map(i => i.id)), new Set(['skiddle:1', 'viator:3P1', 'awin:1936:2']));
    const initialRequests = requests;
    failing = true;
    now += 29 * 60 * 1000;
    assert.deepEqual(await read(), initial, 'unexpired search results remain usable');
    assert.equal(requests, initialRequests, 'the unexpired cache does not refresh');
    for (const minutes of [2, 6]) {
      now += minutes * 60 * 1000;
      const staleFallback = await read();
      assert.ok(!staleFallback.some(i => i.provider === 'viator'), 'failed refresh must not renew old Viator prices');
      assert.deepEqual(new Set(staleFallback.map(i => i.id)), new Set(processingFailure ? ['skiddle:1', 'awin:1936:2'] : ['skiddle:1']), 'existing non-Viator fallback behavior is preserved');
    }
    failing = false;
    now += 6 * 60 * 1000;
    assert.ok((await read()).some(i => i.id === 'viator:3P1'), 'Viator returns after a successful refresh');
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', timeout: 10000,
    env: {VIATOR_API_KEY: 'fixture-token', SKIDDLE_AFFILIATE_ID: '1', AWIN_FEED_URLS: 'https://productdata.awin.com/fixture'}
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

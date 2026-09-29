import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sendStudioEmail, sendTransactionalEmail } from '../api/lib/notify.js';

test('both notification senders include the exact PNG inline and retain plain text', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.NOTIFICATION_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'test-key';
  process.env.NOTIFICATION_FROM_EMAIL = 'studio@example.com';
  const requests = [];
  globalThis.fetch = async (_, options) => { requests.push(options); return { ok:true }; };
  try {
    const text = 'Hello <script>alert(1)</script>\nManage: https://www.soundbunker.pt/client';
    await sendStudioEmail('client@example.com', 'Update', text);
    await sendTransactionalEmail({ to:'client@example.com', subject:'Confirmation', text, key:'test-stable-key' });
    for (const request of requests) {
      const payload = JSON.parse(request.body);
      assert.equal(payload.text, text);
      assert.ok(payload.html.includes('&lt;script&gt;'));
      assert.ok(!payload.html.includes('<script>'));
      assert.ok(payload.html.includes('href="https://www.soundbunker.pt/client"'));
      assert.ok(payload.html.includes('cid:soundbunker-email-footer'));
      assert.equal(payload.attachments.length, 1);
      assert.equal(payload.attachments[0].content_id, 'soundbunker-email-footer');
      assert.deepEqual(Buffer.from(payload.attachments[0].content, 'base64'), readFileSync(new URL('../assets/soundbunker-email-footer.png', import.meta.url)));
    }
    assert.equal(requests[1].headers['Idempotency-Key'], 'test-stable-key');
  } finally {
    globalThis.fetch = originalFetch;
    if(originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
    if(originalFrom === undefined) delete process.env.NOTIFICATION_FROM_EMAIL; else process.env.NOTIFICATION_FROM_EMAIL = originalFrom;
  }
});

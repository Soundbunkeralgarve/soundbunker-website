import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.dataset = {}; this.hidden = false; this.disabled = false; this.textContent = ''; this.classList = { toggle() {} }; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this[key] = value; }
  removeAttribute(key) { delete this[key]; }
  addEventListener() {}
  querySelectorAll(selector) { return this.children.filter(child => selector === 'button' && child.tagName === 'button'); }
}

async function portal(search = '') {
  const elements = new Map(); const events = []; const redirects = [];
  const document = {
    hidden: false, addEventListener() {},
    dispatchEvent(event) { events.push(event); },
    querySelector(selector) { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); },
    createElement(tag) { return new Element(tag); }
  };
  const location = { search, origin: 'https://www.soundbunker.pt', assign(url) { redirects.push(url); } };
  const context = vm.createContext({ document, location, URL, URLSearchParams, Intl,
    console, clearInterval() {}, clearTimeout() {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    setTimeout() { throw new Error('Unexpected timer'); }, setInterval() { throw new Error('Unexpected timer'); }
  });
  vm.runInContext(await readFile(new URL('../client.js', import.meta.url), 'utf8'), context);
  return { context, elements, events, redirects, element: selector => document.querySelector(selector) };
}
const due = { balanceCents: 15000, canDownload: false, bookings: [{ id: 'booking-dave', serviceName: 'Recording', balanceCents: 15000, canPay: true }] };

test('a checkout return remains locked until the server confirms payment', async () => {
  const ui = await portal('?delivery_payment=processing');
  ui.context.renderDeliveryAccess(due);
  assert.equal(ui.element('#deliveryPayment').hidden, false);
  assert.match(ui.element('#deliveryPaymentSummary').textContent, /€150\.00/);
  assert.match(ui.element('#deliveryPaymentStatus').textContent, /waiting for payment confirmation/);
  assert.equal(ui.element('#deliveryPaymentActions').children[0].dataset.payBooking, 'booking-dave');
  assert.equal(ui.events.at(-1).detail.canDownload, false);
  // A contradictory response cannot unlock unpaid files.
  ui.context.renderDeliveryAccess({ ...due, canDownload: true });
  assert.equal(ui.events.at(-1).detail.canDownload, false);
  ui.context.renderDeliveryAccess({ balanceCents: 0, canDownload: true, bookings: [] });
  assert.match(ui.element('#deliveryPaymentSummary').textContent, /Payment confirmed/);
  assert.equal(ui.events.at(-1).detail.canDownload, true);
});

test('clients can still upload while shared music links are removed', async () => {
  const ui = await portal();
  ui.context.renderProfile({ full_name: 'David Lewis', email: 'dave@example.test', role: 'client',
    dropbox_folder_path: '/Clients/David', dropbox_music_path: '/Clients/David/My Music',
    dropbox_photos_path: '/Clients/David/My Photos', dropbox_music_url: '', dropbox_shared_url: '' });
  assert.equal(ui.element('#musicUpload').disabled, false);
  assert.equal(ui.element('#sessionUpload').disabled, false);
  assert.equal(ui.element('#musicFolderLink').href, undefined);
});

test('pending invoices and balances requiring review cannot open checkout', async () => {
  const ui = await portal();
  ui.context.renderDeliveryAccess({ ...due, bookings: [{ ...due.bookings[0], canPay: false }] });
  assert.equal(ui.element('#deliveryPaymentActions').children[0].disabled, true);
  ui.context.renderDeliveryAccess({ balanceCents: 0, canDownload: false, requiresReview: true, bookings: [], message: 'Please contact the studio.' });
  assert.match(ui.element('#deliveryPaymentSummary').textContent, /contact the studio/);
  assert.equal(ui.element('#deliveryPaymentActions').children[0].href, 'mailto:bookings@soundbunker.pt');
});

test('payment buttons reject an unexpected redirect destination', async () => {
  const ui = await portal();
  ui.context.renderDeliveryAccess(due);
  ui.context.result = { url: 'https://example.test/phishing' };
  vm.runInContext('portalApi = async () => result', ui.context);
  await ui.context.payDeliveryBalance('booking-dave');
  assert.equal(ui.redirects.length, 0);
  assert.match(ui.element('#deliveryPaymentStatus').textContent, /could not be opened/);
  ui.context.result = { url: 'https://checkout.stripe.com/c/pay/valid' };
  await ui.context.payDeliveryBalance('booking-dave');
  assert.deepEqual(ui.redirects, ['https://checkout.stripe.com/c/pay/valid']);
});

test('project cards never expose the stored delivery URL', async () => {
  const ui = await portal();
  ui.context.response = { ok: true, json: async () => ({ access: due, projects: [{ title: 'Another Love', delivery_url: 'https://dropbox.com/private-original' }] }) };
  vm.runInContext('fetch = async () => response', ui.context);
  await ui.context.loadProjects({ access_token: 'test' });
  const button = ui.element('#projectList').children[0];
  assert.equal(button.tagName, 'button');
  assert.equal(button.href, undefined);
  assert.match(ui.element('#projectSummary').textContent, /unlock/);
});

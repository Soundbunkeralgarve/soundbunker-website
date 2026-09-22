import { json, parseJson, safeText, validEmail } from './lib/http.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return json(response, { error: 'Method not allowed' }, 405);
  try {
    const input = await parseJson(request);
    if (input.website) return json(response, { ok: true }); // Invisible spam trap.
    const email = safeText(input.email, 200).trim().toLowerCase();
    if (input.consent !== true || !validEmail(email)) return json(response, { error: 'Enter an email and agree to promotional emails.' }, 400);
    if (!process.env.RESEND_API_KEY) return json(response, { error: 'The mailing list is being set up. Try again later.' }, 503);
    const name = safeText(input.name, 100).trim();
    const result = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email, ...(name ? { first_name: name } : {}), unsubscribed: false })
    });
    // Never PATCH an existing contact: this could silently re-subscribe someone
    // who already used Resend's unsubscribe link.
    if (result.status === 409) return json(response, { ok: true, existing: true });
    if (!result.ok) throw new Error(`Resend contacts rejected request (${result.status})`);
    return json(response, { ok: true });
  } catch (error) {
    console.error('Newsletter signup failed', error);
    return json(response, { error: 'Could not add you right now. Please try again later.' }, 503);
  }
}

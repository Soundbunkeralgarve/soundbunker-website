import { syncSoundBunkerMarketing } from './lib/soundbunker-promo-list.js';
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
    const result=await syncSoundBunkerMarketing({
      apiKey:process.env.RESEND_API_KEY,email,firstName:name,consent:true
    });
    if(!result.synced)return json(response,{ok:false,error:result.reason},409);
    return json(response,{ok:true,existing:result.existing===true});
  } catch (error) {
    console.error('Newsletter signup failed', error);
    return json(response, { error: 'Could not add you right now. Please try again later.' }, 503);
  }
}

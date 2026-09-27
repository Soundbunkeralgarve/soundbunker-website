import { requireAdmin } from './lib/supabase-auth.js';
import { prizeVoucherPdf } from './lib/prize-pdf.js';
import { json } from './lib/http.js';

const uuid = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

export default async function handler(request, response) {
  if (request.method !== 'GET') return json(response, { error: 'Method not allowed' }, 405);
  const ctx = await requireAdmin(request);
  if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
  const id = new URL(request.url, 'https://soundbunker.pt').searchParams.get('id');
  if (!uuid.test(id || '')) return json(response, { error: 'Choose a prize voucher' }, 400);
  const result = await ctx.admin.from('prize_codes').select('id,code,service_id').eq('id', id).maybeSingle();
  if (result.error || !result.data) return json(response, { error: 'Prize voucher not found' }, 404);
  try {
    const pdf = await prizeVoucherPdf(result.data);
    response.setHeader('content-type', 'application/pdf');
    response.setHeader('content-disposition', `attachment; filename="SoundBunker-${result.data.code}.pdf"`);
    response.setHeader('cache-control', 'private, no-store');
    response.statusCode = 200;
    return response.end(pdf);
  } catch (error) {
    console.error('Prize voucher PDF failed', error);
    return json(response, { error: 'Could not prepare this voucher PDF' }, 500);
  }
}

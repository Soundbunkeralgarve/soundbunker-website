import { json, parseJson } from './lib/http.js';
import { requireAdmin } from './lib/supabase-auth.js';
import { pf, countries, publicVariant, httpsURL, quoteOrder, checkoutOrder, shopDB, hasAccess, stripeRequest, fulfillShopCheckout } from './lib/printful-shop.js';

export const config = { maxDuration: 60 };
export default async function handler(req,res) {
  const url = new URL(req.url,'https://shop.local');
  const action = url.searchParams.get('action') || 'products';
  try {
    if (req.method === 'GET' && action === 'products') {
      const offset = Math.max(0,Math.min(10000,Number(url.searchParams.get('offset')) || 0));
      const products = await pf(`/store/products?limit=24&offset=${Math.floor(offset)}`);
      return json(res,{ products: products.filter(p => !p.is_ignored && p.synced > 0).map(p => ({ id:p.id,name:p.name,image:httpsURL(p.thumbnail_url) })), next: products.length === 24 ? offset+24 : null, countries: countries() });
    }
    if (req.method === 'GET' && action === 'product') {
      const id = url.searchParams.get('id'); if (!/^\d+$/.test(id || '')) return json(res,{error:'Invalid product'},400);
      const p = await pf(`/store/products/${id}`);
      return json(res,{ id:p.sync_product.id,name:p.sync_product.name,image:httpsURL(p.sync_product.thumbnail_url), variants: p.sync_product.is_ignored ? [] : p.sync_variants.map(publicVariant).filter(Boolean) });
    }
    if (req.method === 'POST' && action === 'quote') {
      const input = await parseJson(req);
      const row = await quoteOrder(input);
      return json(res,{ id:row.id,token:row.access_token,items:row.items,subtotal:row.subtotal_cents,shipping:row.shipping_cents,total:row.total_cents,delivery:row.shipping_label });
    }
    if (req.method === 'POST' && ['checkout','status'].includes(action)) {
      const input = await parseJson(req);
      if (!/^[a-f0-9-]{36}$/.test(input.id || '')) return json(res,{error:'Order not found'},404);
      const db = shopDB();
      const {data:row,error} = await db.from('shop_orders').select('*').eq('id',input.id).single();
      if (error || !row || !hasAccess(row,input.token)) return json(res,{error:'Order not found'},404);
      if (action === 'checkout') return json(res,{url:await checkoutOrder(row,db)});
      let status = row.last_error && !row.printful_order_id ? 'needs_attention' : row.status, shipments = [], payment = 'pending';
      if (row.stripe_session_id) {
        const checkout = await stripeRequest(`/checkout/sessions/${encodeURIComponent(row.stripe_session_id)}`);
        payment = checkout.payment_status;
        if (payment === 'paid' && status === 'awaiting_payment') status = checkout.livemode ? 'paid_pending' : 'test_paid';
      }
      if (row.printful_order_id) {
        const order = await pf(`/orders/${row.printful_order_id}`);
        status = order.status;
        shipments = (order.shipments || []).map(s => ({ carrier:s.carrier,tracking_number:s.tracking_number,tracking_url:httpsURL(s.tracking_url) }));
      }
      return json(res,{ id:row.id,status,payment,items:row.items,total:row.total_cents,shipments });
    }
    if (req.method === 'GET' && action === 'admin-list') {
      const ctx = await requireAdmin(req); if (ctx.error) return json(res,{error:ctx.error},ctx.status);
      const result = await ctx.admin.from('shop_orders').select('id,created_at,status,total_cents,printful_order_id,last_error,stripe_session_id,customer_email_sent,studio_email_sent').not('stripe_session_id','is',null).order('created_at',{ascending:false}).limit(100);
      if (result.error) throw new Error('Cannot load shop orders');
      return json(res,{orders:result.data});
    }
    if (req.method === 'POST' && action === 'retry') {
      const ctx = await requireAdmin(req); if (ctx.error) return json(res,{error:ctx.error},ctx.status);
      const input = await parseJson(req);
      const {data:row,error} = await ctx.admin.from('shop_orders').select('*').eq('id',input.id).single();
      if (error || !row?.stripe_session_id) return json(res,{error:'Paid order not found'},404);
      const checkout = await stripeRequest(`/checkout/sessions/${encodeURIComponent(row.stripe_session_id)}`);
      await fulfillShopCheckout(checkout,ctx.admin);
      return json(res,{ok:true});
    }
    return json(res,{error:'Method or action not allowed'},405);
  } catch (error) {
    // Detailed provider responses may contain customer data. Never return them publicly.
    console.error('Shop request failed', action, error.message);
    return json(res,{error: action === 'quote' && /^(Please |An item |Delivery is |This basket)/.test(error.message) ? error.message : 'The shop could not complete this request. Please try again or contact bookings@soundbunker.pt.'},503);
  }
}

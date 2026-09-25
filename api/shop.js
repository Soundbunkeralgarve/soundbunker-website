import { visibleProduct, couplesComboIds } from './lib/shop-collections.js';
import { json, parseJson } from './lib/http.js';
import { requireAdmin } from './lib/supabase-auth.js';
import { pf, countries, shippingDestinations, shopProduct, storefrontProduct, shirtPairs, hiddenProductIds, httpsURL, quoteOrder, checkoutOrder, shopDB, hasAccess, stripeRequest, fulfillShopCheckout } from './lib/printful-shop.js';

export const config = { maxDuration: 60 };
// Six varied, pre-approved products on the first screen. Full browsing is opt-in.
const initialProductIds = [475033196,475185407,475184250,475185759,413283381,413293723];
const initialAdultProductIds = [475234129,475188366,475188276];
async function initialProducts(ids) {
  const hydrated = [];
  for (let i = 0; i < ids.length; i += 2) {
    hydrated.push(...await Promise.all(ids.slice(i,i+2).map(shopProduct)));
  }
  return hydrated.filter(p=>p.variants.length).map(({variants,...p})=>p);
}
export default async function handler(req,res) {
  const url = new URL(req.url,'https://shop.local');
  const action = url.searchParams.get('action') || 'products';
  try {
    if (req.method === 'GET' && action === 'destinations') {
      return json(res,{destinations:await shippingDestinations()});
    }
    if (req.method === 'GET' && action === 'featured') {
      const products=await initialProducts(initialProductIds);
      res.setHeader('Cache-Control','public, max-age=60, s-maxage=60');
      return json(res,{products,next:null});
    }
    if (req.method === 'GET' && action === 'products') {
      if (url.searchParams.get('offset') === 'initial') {
        const adult = req.headers['x-sb-adult-confirmed'] === 'true';
        res.setHeader('Cache-Control','private, no-store');
        return json(res,{products:await initialProducts(adult ? [...initialProductIds,...initialAdultProductIds] : initialProductIds),next:0,countries:countries()});
      }
      const offset = Math.max(0,Math.min(10000,Number(url.searchParams.get('offset')) || 0));
      const products = await pf(`/store/products?limit=24&offset=${Math.floor(offset)}`);
      const adult = req.headers['x-sb-adult-confirmed'] === 'true';
      const selected = products.filter(p => visibleProduct(p.id, adult, p.name) && !couplesComboIds.includes(Number(p.id)) && !p.is_ignored && p.synced > 0 && !hiddenProductIds.has(Number(p.id)));
      const displayOrder=shirtPairs.flat();
      selected.sort((a,b)=>{const rank=id=>{const i=displayOrder.indexOf(Number(id));return i<0?displayOrder.length:i;};return rank(a.id)-rank(b.id);});
      const hydrated = [];
      // Bound concurrency so a large collection does not flood the provider.
      for (let i = 0; i < selected.length; i += 2) {
        hydrated.push(...await Promise.all(selected.slice(i,i+2).map(p => shopProduct(p.id))));
      }
      res.setHeader('Cache-Control','private, no-store');
      res.statusCode = 200;
      res.setHeader('Content-Type','application/json; charset=utf-8');
      return res.end(JSON.stringify({ products: hydrated.filter(p => p.variants.length).map(({variants,...p}) => p), next: products.length === 24 ? offset+24 : null, countries: countries() }));
    }
    if (req.method === 'GET' && action === 'product') {
      const id = url.searchParams.get('id'); if (!/^\d+$/.test(id || '')) return json(res,{error:'Invalid product'},400);
      const adult = req.headers['x-sb-adult-confirmed']==='true';
      if (!adult && !visibleProduct(id)) return json(res,{error:'Confirm you are 18 or over to view this collection.'},403);
      res.setHeader('Cache-Control','private, no-store');
      const product = await storefrontProduct(id);
      if (!visibleProduct(product.id,adult,product.name)) return json(res,{error:'Product is not published.'},404);
      return json(res,product);
    }
    if (req.method === 'POST' && action === 'quote') {
      const input = await parseJson(req);
      input.adult_confirmed = req.headers['x-sb-adult-confirmed'] === 'true';
      const row = await quoteOrder(input);
      return json(res,{ id:row.id,token:row.access_token,items:row.items,subtotal:row.subtotal_cents,discount:row.items.reduce((sum,i)=>sum+((i.list_price??i.price)-i.price)*i.quantity,0),shipping:row.shipping_cents,total:row.total_cents,delivery:row.shipping_label });
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
    const quoteErrors={delivery:'Delivery rates are temporarily unavailable. Please try again shortly.',estimate:'We could not confirm production costs for this item. Please contact bookings@soundbunker.pt.',variant:'We could not check this item with Printful. Please try again shortly.',save_quote:'We could not save your delivery quote. Please contact bookings@soundbunker.pt.'};
    return json(res,{error: action === 'quote' && /^(Please |An item |Delivery is |This basket)/.test(error.message) ? error.message : action==='quote' && quoteErrors[error.shopStage] ? quoteErrors[error.shopStage] : 'The shop could not complete this request. Please try again or contact bookings@soundbunker.pt.',...(action==='quote'&&error.priceReview?{price_review:error.priceReview}:{}),...(action==='quote'&&error.shopStage?{code:error.shopStage,...(Number.isInteger(error.status)?{provider_status:error.status}:{})}: {})},503);
  }
}

// Retail prices in cents, including VAT. Never trust browser or supplier retail prices.
export const retailPrices = Object.freeze({ tshirts: 4500, hoodies: 7500, hats: 3500, polos: 5000 });
export function productCategory(name = '') {
  if (/\bpolo\b/i.test(name)) return 'polos';
  if (/\bhood(?:ie|y|ies)\b/i.test(name)) return 'hoodies';
  if (/\b(?:hat|cap|beanie|snapback)\b/i.test(name)) return 'hats';
  if (/\b(?:t[\s-]?shirts?|tees?)\b/i.test(name)) return 'tshirts';
  return 'accessories';
}
export function retailPrice(name, fallback) {
  if (/\bshotta bag\b/i.test(name)) return 4000;
  return retailPrices[productCategory(name)] ?? fallback;
}
function setting(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error('Shop margin settings need attention');
  return value;
}
// Contribution estimate, not accounting profit. Pass supplier costs after
// eligible VAT recovery. Rates remain configurable for the merchant tax/fee setup.
export function marginCheck(subtotal, shipping, supplierTotal) {
  const vat = setting('SHOP_MARGIN_VAT_RATE', 0.23, 0, 1);
  const feeRate = setting('SHOP_MARGIN_PAYMENT_RATE', 0.035, 0, 1);
  const feeFixed = setting('SHOP_MARGIN_PAYMENT_FIXED_CENTS', 30, 0, 10000);
  const minimum = 0.15; // Owner-approved minimum contribution margin, including discounted orders.
  const revenue = Math.floor((subtotal + shipping) / (1 + vat));
  const fees = Math.ceil((subtotal + shipping) * feeRate + feeFixed);
  const contribution = revenue - supplierTotal - fees;
  return { allowed: contribution >= Math.ceil(revenue * minimum), contribution, revenue, fees, minimum };
}

export function productLabel(name = '') {
  const base = name.split(' / ')[0].trim();
  const design = base.match(/^Unisex Organic Cotton Creator 2\.0 T-Shirt (.+)$/i);
  const slogans = {EXCELLENCE:'Excellence',DRUNK:'Drunk','LAST TAKE':'Last Take',MUM:'My Mum Loves My Music',GOD:'Rap God',DJ:'I’m Not a DJ',AUTOTUNE:'Autotune',BANGERS:'I Only Make Bangers','WARM UP':'Warm Up',TALENT:'Talent'};
  if (design) return `${slogans[design[1].toUpperCase()] || design[1]} T-Shirt`;
  if (/^SoundBunker /i.test(base)) {
    if (productCategory(base)==='tshirts') return 'SoundBunker T-Shirt';
    if (productCategory(base)==='hoodies') return /zip/i.test(base)?'SoundBunker Zip Hoodie':'SoundBunker Hoodie';
    if (/bucket hat/i.test(base)) return 'SoundBunker Bucket Hat';
    if (/trucker/i.test(base)) return 'SoundBunker Trucker Cap';
    if (/polo/i.test(base)) return 'SoundBunker Polo';
    if (/water bottle/i.test(base)) return 'SoundBunker Water Bottle';
  }
  return base;
}

// Apply an owner-created shop code. Keep catalogue prices for later validation.
export function applyShopDiscount(items, offer) {
  if (!offer) return;
  const amount = Number(offer.amount);
  if (!['fixed','percent'].includes(offer.kind) || !Number.isFinite(amount) || amount <= 0 || (offer.kind === 'percent' && amount > 100)) throw new Error('Please check your discount code.');
  const subtotal = items.reduce((n,i)=>n+i.price*i.quantity,0);
  const requested = offer.kind === 'percent' ? Math.round(subtotal*amount/100) : Math.round(amount*100);
  const discount = Math.min(requested, subtotal-items.reduce((n,i)=>n+i.quantity,0));
  let applied = 0;
  for (const item of items) {
    item.list_price = item.price;
    const unitOff = Math.min(item.price-1, Math.floor(discount*item.price/subtotal));
    item.price -= unitOff;
    applied += unitOff*item.quantity;
    item.discount_code = offer.code;
  }
  for (const item of items) {
    const extra = Math.min(item.price-1, Math.floor((discount-applied)/item.quantity));
    item.price -= extra; applied += extra*item.quantity;
  }
}
export async function loadShopDiscount(db, value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!code) return null;
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new Error('Please enter a valid discount code.');
  const {data:offer,error}=await db.from('discount_codes').select('*').eq('code',code).maybeSingle();
  if (error || !offer || !offer.active || offer.service_id !== 'shop' || offer.client_user_id || offer.max_uses || (offer.expires_at && (!Number.isFinite(Date.parse(offer.expires_at)) || Date.parse(offer.expires_at)<=Date.now()))) throw new Error('Please check your discount code; it is unavailable for the shop or has expired.');
  return offer;
}

export function minimumShopPrice(shipping, supplierTotal) {
 let low=0,high=10000000;
 while(low<high){const mid=Math.floor((low+high)/2);if(marginCheck(mid,shipping,supplierTotal).allowed)high=mid;else low=mid+1;}
 return low;
}

// Owner confirms eligible Printful invoice VAT is reclaimed. Subtract only the
// explicit VAT field; never infer VAT from a gross price or deduct other taxes.
// Set SHOP_RECOVER_PRINTFUL_VAT=false if the accounting treatment changes.
export function supplierCost(total, vat = 0) {
  if (![total, vat].every(n => Number.isSafeInteger(n) && n >= 0) || vat > total) throw new Error('Invalid supplier VAT');
  return total - (process.env.SHOP_RECOVER_PRINTFUL_VAT === 'false' ? 0 : vat);
}
// Delivery includes sales VAT and its variable payment fee, rounded up to 50c.
// Fixed payment fees remain in the basket margin calculation.
export function deliveryRetailPrice(netShipping) {
  const vat = setting('SHOP_MARGIN_VAT_RATE', 0.23, 0, 1);
  const fee = setting('SHOP_MARGIN_PAYMENT_RATE', 0.035, 0, 1);
  const divisor = 1 - fee * (1 + vat);
  if (!Number.isSafeInteger(netShipping) || netShipping < 0 || divisor <= 0) throw new Error('Invalid delivery pricing');
  return Math.ceil(netShipping * (1 + vat) / divisor / 50) * 50;
}

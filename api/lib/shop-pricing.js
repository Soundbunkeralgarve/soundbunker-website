// Retail prices in cents, including VAT. Never trust browser or supplier retail prices.
export const retailPrices = Object.freeze({ tshirts: 5000, hoodies: 8000, hats: 4000 });
export function productCategory(name = '') {
  if (/\bpolo\b/i.test(name)) return 'polos';
  if (/\bhood(?:ie|y|ies)\b/i.test(name)) return 'hoodies';
  if (/\b(?:hat|cap|beanie|snapback)\b/i.test(name)) return 'hats';
  if (/\b(?:t[\s-]?shirts?|tees?)\b/i.test(name)) return 'tshirts';
  return 'accessories';
}
export function retailPrice(name, fallback) {
  return retailPrices[productCategory(name)] ?? fallback;
}
function setting(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error('Shop margin settings need attention');
  return value;
}
// Conservative contribution estimate, not accounting profit. Supplier VAT is not
// assumed recoverable. Rates are configurable to match the merchant's tax/fee setup.
export function marginCheck(subtotal, shipping, supplierTotal) {
  const vat = setting('SHOP_MARGIN_VAT_RATE', 0.23, 0, 1);
  const feeRate = setting('SHOP_MARGIN_PAYMENT_RATE', 0.035, 0, 1);
  const feeFixed = setting('SHOP_MARGIN_PAYMENT_FIXED_CENTS', 30, 0, 10000);
  const minimum = setting('SHOP_MIN_MARGIN', 0.25, 0, 0.9);
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

// Codes are enabled by the shop owner; none are invented or enabled by default.
// SHOP_DISCOUNT_CODES example: {"EXAMPLE":{"percent_off":10}}
export function applyShopDiscount(items, value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!code) return;
  if (!/^[A-Z0-9_-]{1,40}$/.test(code)) throw new Error('Please enter a valid discount code.');
  let codes;
  try { codes = JSON.parse(process.env.SHOP_DISCOUNT_CODES || '{}'); }
  catch { throw new Error('Please try your discount code again later.'); }
  const offer = Object.hasOwn(codes, code) ? codes[code] : null;
  const percent = offer?.percent_off;
  if (!offer || offer.active === false || typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0 || percent >= 100 || (offer.expires_at && (!Number.isFinite(Date.parse(offer.expires_at)) || Date.parse(offer.expires_at) <= Date.now()))) throw new Error('Please check your discount code; it is invalid or expired.');
  for (const item of items) {
    item.list_price = item.price;
    item.price = Math.max(1, Math.round(item.price * (1 - percent / 100)));
    item.discount_code = code;
  }
}

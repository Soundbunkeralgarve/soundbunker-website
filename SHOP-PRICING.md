# Shop retail pricing

T-shirts: €60. Hoodies: €80. Hats/caps: €40. Polos: €55. Shotta Bags: €50. All sizes use the same VAT-inclusive customer price. Other accessories retain their existing EUR retail prices. Rules live in `api/lib/shop-pricing.js`; both the catalogue and server quote use them. Printful retail prices no longer control these categories and Shotta Bags.

Shipping is the exact EUR STANDARD rate (or cheapest available rate) returned by Printful for the basket and destination. There is no shipping multiplier. The final total is displayed before Stripe payment. Stripe product prices are marked inclusive; this does not enable Stripe Tax or replace tax reporting.

## Margin protection

Before a quote can be saved, Printful's order estimate supplies its complete cost including printing, shipping, supplier taxes and extras. A basket must retain at least 25% of estimated net revenue after that cost and an assumed payment fee. The defaults reserve 23% VAT from customer gross receipts and 3.5% + €0.30 payment fees. Supplier VAT is conservatively treated as a cost rather than assumed recoverable. These are planning allowances, not a guarantee of accounting profit or a destination-specific tax calculation. Overheads, refunds and currency adjustments are not included.

Vercel environment overrides, if required for the actual tax and payment setup:
- `SHOP_MARGIN_VAT_RATE` (default `0.23`)
- `SHOP_MARGIN_PAYMENT_RATE` (default `0.035`)
- `SHOP_MARGIN_PAYMENT_FIXED_CENTS` (default `30`)
- `SHOP_MIN_MARGIN` (default `0.25`)

A failing basket is blocked before payment with a price-review message. Customer prices are never automatically raised. Mixed baskets also check each product line separately using its own supplier estimate less base shipping, so a profitable item cannot subsidise an expensive product. Actual product/size/destination estimates should be reviewed when adding products or changing costs.

## Catalogue

All Printful product pages load automatically. A full wrapping product grid with sidebar categories (including Polo Shirts), black/white filters and design search, visible VAT wording, and current synced variant previews support the new 20-shirt collection. Matching generated model photos are primary covers. Clicking a tile or its image reveals the synced Printful product mockup and loads size options. Gallery controls can switch back to the model photo. Products without a matching generated model image use the exact Printful preview. Covers are only enabled while their source image still matches the synced artwork.

## Verification

`npm test` covers fixed pricing, malformed input, margin rejection, stale quotes, payment validation and fulfillment retries. `npm run check` checks script syntax. A paid production order is not necessary to test price and shipping quotation; never use live payment merely for automated tests.

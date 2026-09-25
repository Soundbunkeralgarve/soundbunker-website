# Crude City domain launch

Crude City is a separate, age-gated public storefront served by the existing SoundBunker Vercel deployment. This shares the approved Printful catalogue, Stripe account, Supabase shop orders and fulfilment webhook without copying secrets or duplicating orders. The browser basket uses `cc-shop-basket`; the studio shop uses `sb-shop-basket`.

## Before switching on live checkout

1. Purchase `crude-city.com`. Add `crude-city.com` and `www.crude-city.com` to the **same Vercel project** that serves soundbunker.pt. Apply exactly the DNS targets shown by Vercel and verify both certificates. Redirect `www` to the apex domain in Vercel.
2. Set production environment variable `CRUDE_CITY_SITE_URL=https://crude-city.com` in Vercel and redeploy the tested build. Without this value, Crude City checkout deliberately refuses payment so customers cannot be redirected to an unconnected domain.
3. Keep the existing `SITE_URL` set to the SoundBunker URL. Do not create a second Printful order webhook or second Stripe payment webhook; the existing webhook fulfils both shops, with brand chosen from the saved order item collections.
4. Confirm that the current Printful store includes all approved Crude City products and variants. The safe allowlist is in `api/lib/shop-collections.js`. New approved `Unisex classic tee` design names are explicitly allowlisted; unrecognised products stay unpublished.
5. Open the domain in a private browser session. Confirm the age notice appears before product images or names are requested. Choose both black and white variants, gallery, combo shirt sizes, sharing, delivery country and optional discount.
6. Run a Stripe **test-mode** order through quote, checkout and private order page. Test-mode payments must not create Printful production orders. Then use a deliberate live order for your own address to verify payment → webhook → Printful → tracking email. Check delivery and margin review before a real promotion.
7. Verify `soundbunker.pt/shop.html` contains no adult product cards and keeps the existing studio collections, photos and basket. Test direct API product and mixed basket restrictions.

## Routes

- `crude-city.com/` and `/shop.html`: `crude-city.html`
- `crude-city.com/order`: `crude-order.html` (capability-token private URL; do not index)
- `crude-city.com/robots.txt` and `/sitemap.xml`: dedicated Crude City files.
- SoundBunker existing routes and its shop remain unchanged.
- `crude-city.html` on a preview deployment allows visual checks before attaching the custom domain, but payment stays locked until `CRUDE_CITY_SITE_URL` is configured.

## Technical details

The storefront sends `x-sb-shop-brand: crude-city`. The API also recognises the Crude City domain and enforces catalogue separation. The age confirmation is required on every new browser visit, not stored as a persistent age-verification credential. This is a self-declared access notice, not proof of identity or legal age verification.

The commerce database schema does not need a new brand column: quote rows store each item's existing `collection`. Checkout and notification links are chosen from those saved collections; one mixed-brand order is rejected at quote time. Existing SoundBunker order receipts continue to link to the studio shop.

Contact and merchant identity remain SoundBunker Algarve. Review the published terms and privacy information for the new brand before launch. Shipping availability depends on the destination and garment, and is checked by Printful per quote.

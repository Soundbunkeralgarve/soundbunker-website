# Collection maintenance

Assign each synced Printful product ID in `api/lib/shop-collections.js`. New unassigned products are withheld from the shop, preventing accidental public exposure of adult designs. Standard, Slogans, Rave, Kids and Christmas are public. Crude City requires explicit age confirmation on every new page visit and is excluded from the default feed and homepage.

Prices including VAT: adult tees €45, hoodies €75, sweatshirts €60; kids tees €30, hoodies €50, sweatshirts €40. Existing hats/polos/bags retain their prices. Checkout independently recalculates all prices and retains the 15% contribution safeguard. Kids production costs still need live basket verification for all sizes/destinations; these are retail settings, not a guarantee of contribution.

Campaign images in `api/lib/shop-artwork.js` are tied to exact supplier preview URLs; if artwork changes in Printful, the lifestyle image is dropped until rechecked. Product options retain exact supplier previews. Do not substitute a T-shirt lifestyle photo for a sweatshirt or hoodie.

Small public-page adverts are in `merch-promos.js` and never include Crude City. Homepage uses a six-product featured API feed.

The Horny Bitch / Horny Bastard designs are sold only as a €90 two-shirt combo. Their individual cards are omitted; checkout verifies equal quantities of the two actual Printful products. Each shirt has a separate size choice.

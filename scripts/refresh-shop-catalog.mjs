// Refresh the public browsing snapshot. Variant selection and checkout always
// recheck Printful live; no credentials or customer data belong in this file.
import { writeFile } from 'node:fs/promises';
import { collectionProducts, visibleProduct } from '../api/lib/shop-collections.js';
import { browseCatalog } from '../api/lib/shop-catalog.js';
const origin = process.env.SHOP_CATALOG_ORIGIN || 'https://www.soundbunker.pt';
const products = new Map();
let offset = 0;
for (let page = 0; page < 30; page++) {
  const response = await fetch(`${origin}/api/shop?action=products&offset=${offset}`, { signal: AbortSignal.timeout(65000) });
  if (!response.ok) throw new Error(`Catalogue refresh failed: ${response.status}`);
  const data = await response.json();
  for (const product of data.products) if (visibleProduct(product.id)) products.set(product.id, product);
  if (data.next === null) break;
  if (data.next === offset || page === 29) throw new Error('Catalogue pagination did not finish');
  offset = data.next;
}
const expected = Object.values(collectionProducts).flat().filter(id => visibleProduct(id));
const missing = expected.filter(id => !products.has(id));
if (missing.length) throw new Error(`Expected products missing; review before replacing the catalogue: ${missing.join(', ')}`);
const rows = browseCatalog([...products.values()]);
await writeFile(new URL('../assets/shop/catalog.json', import.meta.url), JSON.stringify({updated_at:new Date().toISOString(),products:rows}));
console.log(`Saved ${rows.length} public products. Live selection and checkout remain authoritative.`);

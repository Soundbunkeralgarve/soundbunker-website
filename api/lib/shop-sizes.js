// Gildan's UK age conversion for 5000B, 18000B and 18500B.
// Source: Gildan 2024 Size Conversion to UK TO Fit + EU Standard sizes,
// June 2024. Ages are guidance; retain the supplier size and variant ID.
// https://iconsports.co.uk/static/version1761270768/frontend/child-theme/theme-1/en_GB/SizeGuides/Gildan%20size%20guide.pdf
const ages = Object.freeze({XS:'4–5',S:'5–6',M:'7–8',L:'9–11',XL:'12–14'});
export function kidsAge(name, size) {
  if (!/^Youth (?:classic tee|heavy blend hoodie|crewneck sweatshirt)\b/i.test(name || '')) return null;
  return ages[String(size || '').trim().toUpperCase()] || null;
}
export function shopSizeLabel(name, size) {
  const age = kidsAge(name, size);
  return age ? `${age} years (${size})` : size;
}

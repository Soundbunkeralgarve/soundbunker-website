// Display helpers. Times are always shown in the venue's own timezone.
export function whenText(item, style = 'short') {
  if (!item?.startsAt) return 'Any day · book your date';
  const opts = style === 'long'
    ? {weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'}
    : {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'};
  try { return new Intl.DateTimeFormat('en-GB', {...opts, timeZone: item.timezone || undefined}).format(new Date(item.startsAt)); }
  catch { return new Date(item.startsAt).toUTCString(); }
}
export function priceText(item) {
  if (!Number.isInteger(item?.priceCents) || !item.currency) return '';
  if (item.priceCents === 0) return 'Free';
  try { return 'From ' + new Intl.NumberFormat('en-GB', {style: 'currency', currency: item.currency.toUpperCase()}).format(item.priceCents / 100); }
  catch { return ''; }
}
// Every partner listing names who sells it and that their fees may apply;
// TicketBunker's own events never add a booking fee.
export function sellerText(item) {
  return item?.external ? `Sold by ${item.seller} · fees may apply` : 'TicketBunker · no booking fee';
}
export const placeLine = item => [item?.venue, item?.city].filter(Boolean).join(' · ');

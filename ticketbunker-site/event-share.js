import {escapeHtml as esc, date} from './shared.js';
import {activityContext} from './activity-search.js';
const SITE = 'https://theticketbunker.com';
export function eventLink(e) {
  if (e.preview) return SITE + '/event-preview?slug=' + encodeURIComponent(e.slug);
  const id = e.listingId || (e.key?.startsWith('feed:') ? e.key.slice(5) : '');
  if (id) {const context=activityContext(e.activityContext);return SITE + '/listing/' + encodeURIComponent(id)+(context?'?'+new URLSearchParams(context):'');}
  const slug = e.slug || e.raw?.slug;
  if (slug) return SITE + '/event/' + encodeURIComponent(slug);
  if (!e.external && /^\/event\/[^/?#]+$/.test(e.url || '')) return SITE + e.url;
  // Older approved directory entries share their actual supplier page.
  try { const u = new URL(e.url); if (u.protocol === 'https:') return u.href; } catch {}
  return SITE + '/';
}
export function promoCaption(e) {
  const start = e.starts_at || e.startsAt;
  return [e.preview ? 'DEMO ONLY — NOT A REAL EVENT' : '', e.title,
    start ? date(start, e.venue_timezone || e.timezone) : 'Choose your date on the booking page',
    [e.venue, e.venue_city || e.city].filter(Boolean).join(', '),
    e.headline_artist ? 'Featuring ' + e.headline_artist : '',
    (e.preview ? 'View the test event page: ' : 'Event details & tickets: ') + eventLink(e),
    e.external ? `Tickets via ${e.seller || 'the named provider'}. Their fees and terms apply.` : 'No added TicketBunker booking fees.'
  ].filter(Boolean).join('\n');
}
export function sharePanel(e) {
  const url = eventLink(e), caption = promoCaption(e);
  return `<section class="social-share" aria-label="Share this event"><h3>Share this event</h3><p>Get your friends together. Share the public event page.</p><div class="social-buttons"><button type="button" data-share-native>Share…</button><button type="button" data-copy-link>Copy event link</button><a target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${encodeURIComponent(caption)}">WhatsApp</a><a target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">Facebook</a></div><details><summary>Instagram Stories &amp; social posts</summary><p>Create a Story image, save it and add it in Instagram or Facebook. Paste the event URL into a Link sticker. Apps available in your phone’s share menu depend on your device.</p><button type="button" data-create-story>Create Story image</button><div class="story-result" data-story-result hidden><img data-story-preview alt="Preview of your event Story image" width="180" height="320"><div class="social-buttons"><button type="button" data-save-story>Save Story image</button><button type="button" data-share-story hidden>Share image…</button></div><p>Then add a Link sticker using the event link below.</p></div><label>Ready-to-use caption<textarea rows="7" readonly data-promo-caption>${esc(caption)}</textarea></label><button type="button" data-copy-caption>Copy caption</button></details><label>Public event link<input readonly value="${esc(url)}" data-event-link></label><p role="status" aria-live="polite" data-share-status></p></section>`;
}
function wrapText(ctx, text, width, maxLines) {
  const words = String(text || '').split(/\s+/), lines = []; let line = '';
  for (const word of words) {
    if (ctx.measureText(line + ' ' + word).width > width && line) { lines.push(line); line = word; }
    else line = line ? line + ' ' + word : word;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, '') + '…'; }
  return lines;
}
function posterImage(src) {
  return new Promise(resolve => {
    if (!src || !/^https?:\/\//.test(src) && !src.startsWith('/')) return resolve(null);
    const img = new Image(), timer = setTimeout(() => resolve(null), 6500);
    img.crossOrigin = 'anonymous';
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}
export async function storyImage(e) {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Image creation is unavailable.');
  ctx.fillStyle = '#080c0b'; ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = '#00edb2'; ctx.fillRect(0, 0, 1080, 20);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 48px Arial'; ctx.fillText('THE TICKETBUNKER', 72, 125);
  const img = await posterImage(e.image_url || e.image);
  if (img) {
    const scale = Math.min(936 / img.width, 800 / img.height), w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (1080 - w) / 2, 205 + (800 - h) / 2, w, h);
  } else {
    ctx.fillStyle = '#102d25'; ctx.fillRect(72, 205, 936, 800);
    ctx.fillStyle = '#00edb2'; ctx.font = 'bold 108px Arial';
    ['GET YOUR', 'FRIENDS', 'TOGETHER.'].forEach((line, i) => ctx.fillText(line, 110, 480 + i * 140));
  }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 68px Arial';
  wrapText(ctx, e.title, 936, 3).forEach((line, i) => ctx.fillText(line, 72, 1120 + i * 82));
  const start = e.starts_at || e.startsAt;
  ctx.font = '36px Arial'; ctx.fillStyle = '#c3d9d1';
  const detail = [start ? date(start, e.venue_timezone || e.timezone) : 'Choose your date', [e.venue, e.venue_city || e.city].filter(Boolean).join(', ')].join(' · ');
  wrapText(ctx, detail, 936, 3).forEach((line, i) => ctx.fillText(line, 72, 1410 + i * 50));
  ctx.fillStyle = '#00edb2'; ctx.font = 'bold 42px Arial'; ctx.fillText('FIND YOUR NEXT GREAT NIGHT.', 72, 1670);
  ctx.fillStyle = '#fff'; ctx.font = '36px Arial'; ctx.fillText('theticketbunker.com', 72, 1735);
  ctx.font = '28px Arial'; ctx.fillStyle = '#c3d9d1';
  wrapText(ctx, e.external ? `Tickets via ${e.seller || 'the named provider'} · fees & terms apply` : 'No added TicketBunker booking fees', 936, 2).forEach((line, i) => ctx.fillText(line, 72, 1810 + i * 35));
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Could not create the image.')), 'image/png'));
}
export function wireShare(root, e) {
  const status = root.querySelector('[data-share-status]');
  let file, objectUrl;
  async function copy(text, input, message) {
    try { await navigator.clipboard.writeText(text); status.textContent = message; }
    catch { input.focus(); input.select(); status.textContent = 'Text selected. Use your device’s Copy option.'; }
  }
  root.querySelector('[data-copy-link]').onclick = () => copy(eventLink(e), root.querySelector('[data-event-link]'), 'Event link copied.');
  root.querySelector('[data-copy-caption]').onclick = () => copy(promoCaption(e), root.querySelector('[data-promo-caption]'), 'Caption copied. Paste it into your social post.');
  root.querySelector('[data-share-native]').onclick = async () => {
    try { if (navigator.share) await navigator.share({title: e.title, text: e.title, url: eventLink(e)}); else await copy(eventLink(e), root.querySelector('[data-event-link]'), 'Event link copied.'); }
    catch (err) { if (err.name !== 'AbortError') status.textContent = 'Sharing was unavailable. Use Copy event link instead.'; }
  };
  root.querySelector('[data-create-story]').onclick = async event => {
    const button = event.currentTarget; button.disabled = true; status.textContent = 'Preparing your Story image…';
    try {
      const blob = await storyImage(e);
      file = new File([blob], 'ticketbunker-event-story.png', {type: 'image/png'});
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      root.querySelector('[data-story-preview]').src = objectUrl;
      root.querySelector('[data-story-result]').hidden = false;
      root.querySelector('[data-share-story]').hidden = !(navigator.share && navigator.canShare?.({files: [file]}));
      status.textContent = 'Story image ready. Save or share it, then add the event link in your Story.';
    } catch { status.textContent = 'Image creation was unavailable. You can still copy the event link and caption.'; }
    finally { button.disabled = false; }
  };
  root.querySelector('[data-save-story]').onclick = () => {
    if (!objectUrl) return;
    const a = document.createElement('a'); a.href = objectUrl; a.download = 'ticketbunker-event-story.png'; a.click();
    status.textContent = 'Image download started. On mobile, use Save Image if prompted.';
  };
  root.querySelector('[data-share-story]').onclick = async () => {
    try { await navigator.share({files: [file]}); }
    catch (err) { if (err.name !== 'AbortError') status.textContent = 'Use Save Story image, then upload it in your social app.'; }
  };
  return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
}
export function openShare(e) {
  document.getElementById('event-social-tools')?.close();
  const dialog = document.createElement('dialog'); dialog.id = 'event-social-tools'; dialog.setAttribute('aria-label', 'Share ' + e.title);
  dialog.innerHTML = `<form method="dialog"><button type="submit" aria-label="Close sharing">Close</button></form>${sharePanel(e)}`;
  document.body.append(dialog); const dispose = wireShare(dialog, e);
  dialog.addEventListener('close', () => { dispose(); dialog.remove(); }, {once: true});
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  dialog.showModal();
}

// Branded, multi-page PDF city guide (A4). Pure JS: vendored jsPDF, the brand fonts
// (Barlow Condensed + DM Sans, SIL OFL) and a JPEG cover photo read from disk.
import {jsPDF} from '../vendor/jspdf.mjs';

const C = {dark: '#07070b', ink: '#16161d', grey: '#5d5d69', soft: '#f3f4f7', line: '#dcdee5', teal: '#00e0a6', tealInk: '#007a5c', pink: '#ff4f9a', white: '#ffffff'};
const W = 210, H = 297, M = 16, CW = W - M * 2;
const SITE = 'https://theticketbunker.com';

// Width and height of a baseline/progressive JPEG, from its SOF marker.
export function jpegSize(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return {height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8]};
    i += 2 + len;
  }
  return null;
}

const b64 = buf => Buffer.from(buf).toString('base64');
const clean = v => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
const httpsUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };

/**
 * @param {object} g  guide: {slug,name,country,countryName,base,rich,tips,offers,providers,photo,fonts,logo,edition}
 * @returns {ArrayBuffer}
 */
export function buildGuidePdf(g) {
  const doc = new jsPDF({unit: 'mm', format: 'a4', compress: true});
  for (const [file, family, style] of [['BarlowCondensed-ExtraBold.ttf', 'Barlow', 'bold'], ['BarlowCondensed-SemiBold.ttf', 'Barlow', 'normal'], ['DMSans-Regular.ttf', 'DMSans', 'normal'], ['DMSans-Bold.ttf', 'DMSans', 'bold']]) {
    doc.addFileToVFS(file, b64(g.fonts[file]));
    doc.addFont(file, family, style);
  }
  const city = g.name, r = g.rich || {}, tips = g.tips || {};
  doc.setProperties({title: `${city} city guide | TicketBunker`, subject: `TicketBunker city guide to ${city}: areas, hotspots, food, nightlife and travel tips`, author: 'The TicketBunker', creator: 'theticketbunker.com', keywords: `${city}, city guide, travel, nightlife, food`});
  const opacity = a => doc.setGState(new doc.GState({opacity: a}));
  const font = (family, style, size, color) => { doc.setFont(family, style); doc.setFontSize(size); doc.setTextColor(color); };
  const lh = size => size * 0.3528 * 1.38; // line height in mm for a pt size
  const lines = (text, width) => doc.splitTextToSize(clean(text), width);
  const pageUrl = `${SITE}/guides/${g.slug}`;
  let y = 0, page = 1;

  const photo = g.photo?.jpeg ? {data: new Uint8Array(g.photo.jpeg), size: jpegSize(g.photo.jpeg)} : null;
  // Draw the photo to cover a box, cropped, optionally anchored vertically (0 top … 1 bottom).
  const coverImage = (x, top, w, h, anchor = 0.5) => {
    if (!photo?.size) {
      // No licensed photo for this place: a branded graphic instead of a stand-in image.
      doc.saveGraphicsState(); doc.rect(x, top, w, h, null); doc.clip(); doc.discardPath();
      doc.setFillColor('#0d1f1a'); doc.rect(x, top, w, h, 'F');
      for (let i = 0; i < 9; i++) { opacity(0.08 + i * 0.012); doc.setFillColor(i % 2 ? C.pink : C.teal); doc.triangle(x + w * 0.15 + i * 22, top, x + w * 0.15 + i * 22 + 60, top, x + w * 0.15 + i * 22 - 40, top + h, 'F'); }
      opacity(0.07); font('Barlow', 'bold', h * 2.2, C.white); doc.text(String(g.name).slice(0, 1).toUpperCase(), x + w - 10, top + h * 0.86, {align: 'right'});
      opacity(1); doc.restoreGraphicsState(); return;
    }
    const ratio = photo.size.width / photo.size.height;
    let iw = w, ih = w / ratio;
    if (ih < h) { ih = h; iw = h * ratio; }
    doc.saveGraphicsState();
    doc.rect(x, top, w, h, null); doc.clip(); doc.discardPath();
    doc.addImage(photo.data, 'JPEG', x - (iw - w) / 2, top - (ih - h) * anchor, iw, ih, 'cover', 'MEDIUM');
    doc.restoreGraphicsState();
  };
  const logo = (x, top, w) => { if (g.logo) doc.addImage(new Uint8Array(g.logo), 'PNG', x, top, w, w * 88 / 900, 'logo', 'FAST'); };

  // ---------- Cover ----------
  doc.setFillColor(C.dark); doc.rect(0, 0, W, H, 'F');
  coverImage(0, 0, W, 205, 0.45);
  // Smooth fade into the dark base: stacked translucent bands that each run to the photo's foot.
  for (let i = 0; i < 60; i++) { opacity(0.055); doc.setFillColor(C.dark); doc.rect(0, 108 + i * 1.62, W, 206 - (108 + i * 1.62), 'F'); }
  opacity(0.55); doc.setFillColor(C.dark); doc.rect(0, 0, W, 26, 'F'); opacity(1);
  logo(M, 10, 62);
  font('Barlow', 'bold', 9, C.white); doc.text('CITY GUIDE  ·  ' + clean(g.edition || ''), W - M, 14.6, {align: 'right'});
  doc.setFillColor(C.teal); doc.rect(M, 186, 14, 1.6, 'F');
  font('Barlow', 'bold', 13, C.teal); doc.text('YOUR TICKETBUNKER CITY GUIDE', M + 18, 188.1);
  let size = 92; font('Barlow', 'bold', size, C.white);
  const title = city.toUpperCase();
  while (doc.getTextWidth(title) > CW && size > 40) { size -= 2; doc.setFontSize(size); }
  doc.text(title, M - 1, 192 + size * 0.3528 * 0.78);
  y = 192 + size * 0.3528 * 0.78 + 9;
  font('Barlow', 'normal', 16, C.pink); doc.text(clean(g.countryName).toUpperCase(), M, y); y += 8;
  font('DMSans', 'normal', 11.5, '#d9dbe3');
  for (const l of lines(r.intro || g.base?.history || '', CW - 30)) { doc.text(l, M, y); y += lh(11.5); }
  y = Math.max(y + 6, 262);
  const chips = ['Areas', 'Hotspots', 'Food & drink', 'After dark', 'Travel tips', 'Dining deals'];
  let cx = M; font('DMSans', 'bold', 8.5, C.white);
  for (const chip of chips) { const w = doc.getTextWidth(chip) + 8; if (cx + w > W - M) break; doc.setDrawColor('#3b3d48'); doc.setLineWidth(0.3); doc.roundedRect(cx, y - 4.6, w, 7, 3.5, 3.5, 'S'); doc.text(chip, cx + 4, y); cx += w + 3; }
  font('DMSans', 'normal', 7.5, '#9a9caa');
  if (g.photo?.credit) doc.textWithLink('Cover photo: ' + clean(g.photo.credit) + ' / Unsplash', M, H - 10, {url: httpsUrl(g.photo.url) || 'https://unsplash.com/'});
  doc.textWithLink(pageUrl.replace('https://', ''), W - M, H - 10, {url: pageUrl, align: 'right'});

  // ---------- Inner page furniture ----------
  const newPage = () => {
    doc.addPage(); page++;
    doc.setFillColor(C.white); doc.rect(0, 0, W, H, 'F');
    doc.setFillColor(C.dark); doc.rect(0, 0, W, 15, 'F');
    doc.setFillColor(C.teal); doc.rect(0, 15, W, 0.9, 'F');
    logo(M, 5.2, 40);
    font('Barlow', 'normal', 10, '#c9cbd6'); doc.text(city.toUpperCase() + ' CITY GUIDE', W - M, 9.6, {align: 'right'});
    font('DMSans', 'normal', 7.5, C.grey);
    doc.text('TicketBunker · ' + pageUrl.replace('https://', ''), M, H - 8);
    doc.link(M, H - 11, 90, 5, {url: pageUrl});
    doc.text(String(page), W - M, H - 8, {align: 'right'});
    y = 27;
  };
  const need = h => { if (y + h > H - 18) newPage(); };
  let sectionNo = 0;
  // Keep each heading with at least `follow` mm of the content that comes after it.
  const section = (kicker, heading, follow = 30) => {
    need(32 + follow); sectionNo++;
    font('Barlow', 'bold', 11, C.pink); doc.text(String(sectionNo).padStart(2, '0') + '  ·  ' + kicker.toUpperCase(), M, y);
    y += 10.5; font('Barlow', 'bold', 26, C.ink); doc.text(heading.toUpperCase(), M - 0.4, y);
    y += 3; doc.setFillColor(C.teal); doc.rect(M, y, 18, 1.2, 'F'); y += 8;
  };
  const para = (text, size = 10, color = C.ink, width = CW, x = M) => {
    font('DMSans', 'normal', size, color);
    for (const l of lines(text, width)) { need(lh(size)); doc.text(l, x, y); y += lh(size); }
  };

  // ---------- At a glance + areas ----------
  newPage();
  section('At a glance', `Welcome to ${city}`);
  const facts = [['Money', tips.currency], ['Language', tips.language], ['Emergency', tips.emergency], ['Plugs', tips.plugs], ['Best time', r.when], ['Tipping', tips.tipping]].filter(([, v]) => clean(v));
  const colW = (CW - 6) / 2;
  if (r.intro) { para(r.intro, 11.5, C.ink); y += 3; }
  // Quick facts box, two columns.
  const factRows = facts.map(([k, v]) => { font('DMSans', 'normal', 8.6, '#e8e9ef'); return [k, lines(v, colW - 10)]; });
  const half = Math.ceil(factRows.length / 2), colHeight = rows => rows.reduce((s, [, ls]) => s + 4.6 + ls.length * lh(8.6) + 3, 0);
  const boxH = Math.max(colHeight(factRows.slice(0, half)), colHeight(factRows.slice(half))) + 12;
  need(boxH);
  doc.setFillColor(C.dark); doc.roundedRect(M, y, CW, boxH, 4, 4, 'F');
  font('Barlow', 'bold', 12, C.teal); doc.text('QUICK FACTS', M + 6, y + 8);
  [factRows.slice(0, half), factRows.slice(half)].forEach((rows, ci) => {
    let fy = y + 15; const fx = M + 6 + ci * (colW + 6);
    for (const [k, ls] of rows) {
      font('DMSans', 'bold', 7.4, C.pink); doc.text(k.toUpperCase(), fx, fy); fy += 4.2;
      font('DMSans', 'normal', 8.6, '#e8e9ef'); for (const l of ls) { doc.text(l, fx, fy); fy += lh(8.6); }
      fy += 3;
    }
  });
  y += boxH + 10;

  const cards = (items, accent) => {
    const w = (CW - 6) / 2;
    for (let i = 0; i < items.length; i += 2) {
      const pair = items.slice(i, i + 2).map(([name, text]) => { font('DMSans', 'normal', 9.2, C.grey); return [clean(name), lines(text, w - 12)]; });
      const h = Math.max(...pair.map(([, ls]) => ls.length)) * lh(9.2) + 19;
      need(h + 5);
      pair.forEach(([name, ls], j) => {
        const x = M + j * (w + 6);
        doc.setFillColor(C.soft); doc.roundedRect(x, y, w, h, 3, 3, 'F');
        doc.setFillColor(accent); doc.rect(x, y + 5, 1.4, 8, 'F');
        font('Barlow', 'bold', 14.5, C.ink); doc.text(name.toUpperCase(), x + 6, y + 11, {maxWidth: w - 10});
        font('DMSans', 'normal', 9.2, C.grey); let ty = y + 17.5; for (const l of ls) { doc.text(l, x + 6, ty); ty += lh(9.2); }
      });
      y += h + 5;
    }
    y += 4;
  };
  const numbered = (items, accent) => {
    items.forEach(([name, text], i) => {
      font('DMSans', 'normal', 9.6, C.grey); const ls = lines(text, CW - 16);
      need(8 + ls.length * lh(9.6) + 4);
      doc.setFillColor(accent); doc.circle(M + 4, y - 1.4, 4, 'F');
      font('Barlow', 'bold', 11, accent === C.teal ? C.dark : C.white); doc.text(String(i + 1), M + 4, y + 0.6, {align: 'center'});
      font('Barlow', 'bold', 14, C.ink); doc.text(clean(name).toUpperCase(), M + 12, y + 0.4);
      y += 5.6; font('DMSans', 'normal', 9.6, C.grey); for (const l of ls) { doc.text(l, M + 12, y); y += lh(9.6); }
      y += 4;
    });
    y += 2;
  };

  if (r.areas?.length) { section('Neighbourhoods', 'Main areas to know'); cards(r.areas, C.teal); }

  // ---------- Hotspots ----------
  if (r.sights?.length) {
    need(120);
    section('Hotspots', 'See & do');
    need(58); coverImage(M, y - 2, CW, 50, 0.7); y += 56;
    numbered(r.sights, C.teal);
  }
  if (r.eat?.length || g.base?.food) {
    section('Food & drink', 'Eat like a local');
    if (g.base?.food) { para(g.base.food, 10, C.ink); y += 4; }
    numbered(r.eat || [], C.pink);
  }
  if (r.night?.length || g.base?.nightlife) {
    section('Nightlife', 'After dark');
    if (g.base?.nightlife) { para(g.base.nightlife, 10, C.ink); y += 4; }
    cards(r.night || [], C.pink);
  }
  if (g.base?.shopping || g.base?.history) {
    need(40);
    const w = (CW - 6) / 2, blocks = [['A little history', g.base.history], ['Shopping', g.base.shopping]].filter(([, t]) => clean(t));
    const pair = blocks.map(([k, t]) => { font('DMSans', 'normal', 9.2, C.grey); return [k, lines(t, w - 12)]; });
    const h = Math.max(...pair.map(([, ls]) => ls.length)) * lh(9.2) + 19;
    need(h + 6);
    pair.forEach(([k, ls], j) => {
      const x = M + j * (w + 6);
      doc.setDrawColor(C.line); doc.setLineWidth(0.4); doc.roundedRect(x, y, w, h, 3, 3, 'S');
      font('Barlow', 'bold', 14.5, C.ink); doc.text(k.toUpperCase(), x + 6, y + 11);
      font('DMSans', 'normal', 9.2, C.grey); let ty = y + 17.5; for (const l of ls) { doc.text(l, x + 6, ty); ty += lh(9.2); }
    });
    y += h + 10;
  }

  // ---------- Travel tips ----------
  const travel = [['Getting there', r.arrive], ['Getting around', r.around], ['Passes & tickets', r.pass], ['Paying', tips.cards], ['Staying safe', tips.safety], ['Local tip', r.tip]].filter(([, v]) => clean(v));
  if (travel.length) {
    section('Practical', 'Travel tips');
    for (const [k, v] of travel) {
      font('DMSans', 'normal', 9.6, C.ink); const ls = lines(v, CW - 46);
      const h = Math.max(1, ls.length) * lh(9.6) + 5;
      need(h + 1);
      font('Barlow', 'bold', 12, k === 'Local tip' ? C.pink : C.tealInk); doc.text(k.toUpperCase(), M, y);
      font('DMSans', 'normal', 9.6, C.ink); let ty = y; for (const l of ls) { doc.text(l, M + 46, ty); ty += lh(9.6); }
      y += h; doc.setDrawColor(C.line); doc.setLineWidth(0.25); doc.line(M, y - 3.2, W - M, y - 3.2); y += 1;
    }
    y += 6;
  }

  // ---------- Dining coupon panel ----------
  const offers = (g.offers || []).filter(o => httpsUrl(o.url)).slice(0, 3);
  section('Dining deals', `Dining deals for ${city}`, 70);
  const coupon = (top, h, render) => {
    doc.setFillColor('#fff4f9'); doc.roundedRect(M, top, CW, h, 4, 4, 'F');
    doc.setFillColor(C.dark); doc.roundedRect(M, top, 34, h, 4, 4, 'F'); doc.rect(M + 30, top, 4, h, 'F');
    doc.setDrawColor(C.pink); doc.setLineWidth(0.6); doc.setLineDashPattern([1.6, 1.4], 0); doc.roundedRect(M + 37, top + 1.8, CW - 38.8, h - 3.6, 2.5, 2.5, 'S'); doc.line(M + 34, top + 4, M + 34, top + h - 4); doc.setLineDashPattern([], 0);
    doc.setFillColor(C.white); doc.circle(M + 34, top, 3.2, 'F'); doc.circle(M + 34, top + h, 3.2, 'F');
    font('Barlow', 'bold', 22, C.teal); doc.text('EAT', M + 17, top + h / 2 - 1, {align: 'center'});
    font('Barlow', 'normal', 9, C.white); doc.text('DEALS', M + 17, top + h / 2 + 5, {align: 'center'});
    render(M + 42, top + 10, CW - 50);
  };
  if (offers.length) {
    for (const o of offers) {
      font('DMSans', 'normal', 8.6, C.grey);
      const dl = lines(o.description || '', CW - 50).slice(0, 3), tl = lines(o.terms || 'See the provider’s terms before booking.', CW - 50).slice(0, 4);
      const h = 30 + (o.code ? 11 : 0) + (dl.length + tl.length) * lh(8.6);
      need(h + 6);
      coupon(y, h, (x, ty, w) => {
        font('DMSans', 'bold', 7.6, C.pink); doc.text(o.code ? 'VOUCHER CODE' : 'PARTNER OFFER', x, ty);
        font('Barlow', 'bold', 15, C.ink); doc.text(lines(o.title, w)[0], x, ty + 6.5);
        ty += 11.5; font('DMSans', 'normal', 8.6, C.grey); for (const l of dl) { doc.text(l, x, ty); ty += lh(8.6); }
        if (o.code) { doc.setFillColor(C.dark); doc.roundedRect(x, ty, Math.min(w, doc.getTextWidth(o.code) * 1.7 + 20), 8.5, 2, 2, 'F'); font('Barlow', 'bold', 13, C.teal); doc.text(clean(o.code), x + 4, ty + 6.2); ty += 11.5; }
        font('DMSans', 'normal', 8.6, C.grey); for (const l of tl) { doc.text(l, x, ty); ty += lh(8.6); }
        font('DMSans', 'bold', 8.6, C.tealInk); doc.textWithLink(`${clean(o.advertiser || 'Partner')}${o.ends ? ' · ends ' + clean(o.ends) : ''} · open offer ›`, x, ty + 1.5, {url: httpsUrl(o.url)});
      });
      y += h + 6;
    }
  } else {
    const links = [[`TicketBunker food & drink deals`, `${SITE}/deals?` + new URLSearchParams({country: g.country, kind: 'food'})], ...(g.providers || []).filter(p => !/(^|\.)google\./.test(new URL(p.url).hostname)).map(p => [p.name, p.url]), [`Restaurants near you on Google Maps`, 'https://www.google.com/maps/search/?' + new URLSearchParams({api: '1', query: 'restaurants ' + city})]].filter(([, u]) => httpsUrl(u)).slice(0, 4);
    font('DMSans', 'normal', 9.2, C.grey);
    const body = lines(`There’s no exclusive TicketBunker food coupon for ${city} yet, and we never print codes that aren’t confirmed. Check these for live restaurant offers, set menus and early-bird tables before you book:`, CW - 50);
    const h = 24 + body.length * lh(9.2) + links.length * 7;
    need(h + 6);
    coupon(y, h, (x, ty, w) => {
      font('DMSans', 'bold', 7.6, C.pink); doc.text('LIVE OFFERS, CHECKED WHEN YOU BOOK', x, ty);
      font('Barlow', 'bold', 15, C.ink); doc.text(`Eat well in ${city} for less`.toUpperCase(), x, ty + 6.5);
      ty += 12; font('DMSans', 'normal', 9.2, C.grey); for (const l of body) { doc.text(l, x, ty); ty += lh(9.2); }
      ty += 2.5;
      for (const [label, url] of links) { font('DMSans', 'bold', 9.2, C.tealInk); doc.textWithLink('›  ' + clean(label), x, ty, {url: httpsUrl(url)}); ty += 7; }
    });
    y += h + 6;
  }
  font('DMSans', 'normal', 7.8, C.grey);
  for (const l of lines('Offers are run by the named restaurant or provider, vary by date, time and menu, and may end without notice. Redeem and book directly with them under their terms.', CW)) { need(4); doc.text(l, M, y); y += lh(7.8); }
  y += 8;

  // ---------- Plan with TicketBunker ----------
  need(52);
  doc.setFillColor(C.dark); doc.roundedRect(M, y, CW, 44, 4, 4, 'F');
  font('Barlow', 'bold', 20, C.white); doc.text(`PLAN YOUR ${city.toUpperCase()} TRIP`, M + 7, y + 11);
  font('DMSans', 'normal', 9, '#c9cbd6'); doc.text('Tickets with no TicketBunker booking fee, plus hotels, travel and nights out.', M + 7, y + 17.5);
  const q = '?' + new URLSearchParams({city, country: g.country});
  const plan = [['Events & activities', `${SITE}/${g.slug}`], ['Hotels', `${SITE}/hotels${q}`], ['Trains & coaches', `${SITE}/travel${q}`], ['Car hire', `${SITE}/car-hire${q}`], ['VIP transfers', `${SITE}/vip-transfers${q}`], ['Stag & hen', `${SITE}/stag-hen-weekends${q}`]];
  plan.forEach(([label, url], i) => {
    const bw = (CW - 14 - 10) / 3, bx = M + 7 + (i % 3) * (bw + 5), by = y + 22 + Math.floor(i / 3) * 10;
    doc.setFillColor(i === 0 ? C.teal : '#1d1f29'); doc.roundedRect(bx, by, bw, 7.5, 2, 2, 'F');
    font('DMSans', 'bold', 8.6, i === 0 ? C.dark : C.white); doc.text(label, bx + bw / 2, by + 5, {align: 'center'});
    doc.link(bx, by, bw, 7.5, {url});
  });
  y += 52;

  // ---------- Sources ----------
  const sources = [...(r.sources || []), ...(g.base?.sources || [])].filter((s, i, all) => httpsUrl(s.url) && all.findIndex(o => o.url === s.url) === i);
  section('Sources', 'Official information', 40);
  para(`Researched from official tourism, transport and venue sources; checked ${clean(r.checked || g.base?.checked)}. Opening times, prices and timetables change, so confirm with the venue or operator before you travel.`, 9, C.grey);
  y += 3;
  for (const s of sources) {
    font('DMSans', 'normal', 8.6, C.tealInk);
    const ls = lines(s.title, CW - 6); need(ls.length * lh(8.6) + 4.5);
    ls.forEach((l, i) => { doc.textWithLink((i ? '   ' : '•  ') + l, M, y, {url: httpsUrl(s.url)}); y += lh(8.6); });
    font('DMSans', 'normal', 7.2, C.grey); doc.text(lines(s.url, CW - 6)[0], M + 4.4, y - 0.6); y += 4;
  }
  y += 4;
  para('This guide is independent of the organisations and businesses named in it. Inclusion is not an endorsement or a paid placement. © The TicketBunker · SoundBunker Algarve.', 7.8, C.grey);
  return doc.output('arraybuffer');
}

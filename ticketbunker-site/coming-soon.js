// Pre-launch notice: public pages are covered by "We're not open yet". The word "open"
// is the owner's hidden way in; clicking it remembers this device and shows the site.
// Pages people need for real tickets or running events are never covered.
const KEY = 'tb-preview-open';
// What's coming, one at a time, each with its own photo behind the notice.
const KINDS = [['Gigs', '/assets/hero/live.jpg'], ['Raves & club nights', '/assets/hero/club.jpg'], ['Festivals', '/assets/hero/festival.jpg'],
  ['Theatre & shows', '/assets/samples/theatre-gold.jpg'], ['Comedy', '/assets/samples/comedy-spot.jpg'], ['Boat trips', '/assets/hero/boat.jpg'],
  ['Family days out', '/assets/hero/family.jpg'], ['City breaks', '/assets/hero/travel.jpg']];
const EXEMPT = /^\/(my-tickets|account|checkout|checkout-complete|event-ticket|event-preview|partner-preview|organiser|control-room|event-scanner|scanner|support|guest-list|door-paid|ticket-preview|ticket-email-preview)(\.html)?(\/|$)/;

export function needsNotice(path, stored) {
  return stored !== '1' && !EXEMPT.test(path);
}

function remembered() { try { return localStorage.getItem(KEY); } catch { return null; } }

if (typeof document !== 'undefined' && needsNotice(location.pathname, remembered())) {
  const style = document.createElement('style');
  style.textContent = `
.tb-soon{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;background:#07070b;color:#fff;font-family:'DM Sans',Arial,sans-serif;text-align:center;overflow:auto}
.tb-soon::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 20% 15%,#00e0a633,transparent 45%),radial-gradient(circle at 85% 85%,#ff4f9a2e,transparent 45%);pointer-events:none}
.tb-soon-box{position:relative;max-width:640px}
.tb-soon img{width:220px;height:auto;margin:0 auto 34px;display:block}
.tb-soon h1{font:900 clamp(2.8rem,9vw,5.6rem)/.95 'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;margin:0 0 18px;letter-spacing:-.01em}
.tb-soon h1 em,.tb-soon h1 span{font-family:'Barlow Condensed',Arial,sans-serif!important;font-weight:900!important;font-style:normal!important;text-transform:uppercase!important;letter-spacing:inherit;color:inherit}
.tb-soon h1 em{color:#00e0a6}
.tb-soon h1 span{cursor:text}
.tb-soon p{font-size:1.1rem;line-height:1.6;color:#c9cfd6;margin:0 auto 26px;max-width:46ch}
.tb-soon a{display:inline-flex;min-height:48px;align-items:center;padding:12px 22px;border-radius:999px;background:#00e0a6;color:#04140d;font-weight:800;text-decoration:none}
.tb-soon a:hover{background:#ff4f9a;color:#20030f}
.tb-soon small{display:block;margin-top:26px;color:#7d8590;font-size:.85rem}
.tb-soon .tb-soon-what{font-size:1.2rem;color:#fff;margin-bottom:12px}.tb-soon .tb-soon-what b{color:#00e0a6}
.tb-soon .tb-soon-partners{font:800 .85rem/1.4 'Barlow Condensed',Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#ff4f9a;margin-bottom:10px}
.tb-soon-count{display:inline-flex;flex-direction:column;align-items:center;gap:4px;margin:0 0 26px;padding:16px 26px;border:1px solid #2a2a38;border-radius:18px;background:#12121b}
.tb-soon-count[hidden]{display:none}
.tb-soon-count b{font:900 clamp(2.6rem,8vw,4rem)/1 'Barlow Condensed',Arial,sans-serif;color:#00e0a6;font-variant-numeric:tabular-nums}
.tb-soon-count span{font-size:.95rem;color:#c9cfd6}
.tb-soon-count i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff4f9a;margin-right:6px;animation:tbSoonPulse 1.6s infinite}
@keyframes tbSoonPulse{50%{opacity:.25}}
@media(prefers-reduced-motion:reduce){.tb-soon-count i{animation:none}}
html.tb-soon-on,html.tb-soon-on body{overflow:hidden!important}
.tb-soon-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.tb-soon-bg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.08);transition:opacity 1.2s ease,transform 6s ease}
.tb-soon-bg img.on{opacity:.32;transform:scale(1)}
.tb-soon-bg::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,#07070bcc,#07070bf2 70%)}
.tb-soon .tb-soon-kind{display:block;height:1.1em;overflow:hidden;margin:0 auto 22px;max-width:none;font:900 clamp(1.8rem,6vw,3rem)/1.1 'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;color:#ff4f9a}
.tb-soon-kind b{display:block;font:inherit;animation:tbSoonIn .6s ease both}
@keyframes tbSoonIn{from{opacity:0;transform:translateY(60%)}to{opacity:1;transform:none}}
.tb-soon-perks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 26px;text-align:left}
.tb-soon-perks li{list-style:none;padding:14px;border:1px solid #2a2a38;border-radius:14px;background:#12121bcc;opacity:0;animation:tbSoonUp .6s ease forwards;transition:border-color .4s,box-shadow .4s}
.tb-soon-perks li:nth-child(2){animation-delay:.15s}.tb-soon-perks li:nth-child(3){animation-delay:.3s}.tb-soon-perks li:nth-child(4){animation-delay:.45s}
.tb-soon-perks li.lit{border-color:#00e0a6;box-shadow:0 0 0 1px #00e0a6,0 10px 30px #00e0a633}
.tb-soon-perks b{display:block;font:800 1.05rem/1.1 'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;color:#fff;margin:6px 0 4px}
.tb-soon-perks span{font-size:.8rem;line-height:1.4;color:#aeb4bf}
.tb-soon-perks em{font-style:normal;font-size:1.3rem}
@keyframes tbSoonUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.tb-soon-box{max-width:820px}
@media(max-width:700px){.tb-soon-perks{grid-template-columns:1fr 1fr}.tb-soon{place-items:start center}}
@media(prefers-reduced-motion:reduce){.tb-soon-bg img,.tb-soon-kind b,.tb-soon-perks li{transition:none;animation:none;opacity:1;transform:none}.tb-soon-bg img{opacity:0}.tb-soon-bg img.on{opacity:.32}}`;
  const box = document.createElement('div');
  box.className = 'tb-soon';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'tb-soon-h');
  box.innerHTML = `<div class="tb-soon-bg" aria-hidden="true">${KINDS.map(([, img], i) => `<img src="${img}" alt=""${i ? ' loading="lazy"' : ''}>`).join('')}</div><div class="tb-soon-box"><img src="/brand-compact.png" alt="The TicketBunker" width="220">
<h1 id="tb-soon-h">We’re not <span data-soon-enter>open</span> yet.<br><em>Coming soon.</em></h1>
<p class="tb-soon-kind" aria-hidden="true"><b data-soon-kind>Gigs</b></p>
<p class="tb-soon-what"><b>TicketBunker premium event tickets</b>, sold by us with no booking fees, <b>plus the best deals we can find</b> on hotels, flights, trains and tours through our partnerships with some of the biggest names in travel and tickets.</p><p class="tb-soon-partners">Viator · GetYourGuide · Aviasales · Skiddle · Entradas.com</p>
<div class="tb-soon-count" data-soon-count hidden aria-live="polite"><b>0</b><span><i></i>events, tours &amp; days out lined up, live now</span></div>
<ul class="tb-soon-perks" aria-label="What you get when we open"><li><em>🎟️</em><b>No booking fees</b><span>Our events cost the ticket price, nothing added.</span></li><li><em>📱</em><b>Wallet tickets</b><span>Apple &amp; Google Wallet, ready at the door.</span></li><li><em>⭐</em><b>VIP perks</b><span>Early access, faster entry and guestlist spots.</span></li><li><em>✈️</em><b>The whole trip</b><span>Hotels, flights, trains and food in one place.</span></li></ul>
<p>Across the UK and Europe. We’re putting the finishing touches to it now.</p>
<a href="/organiser">Hosting an event? Organiser portal →</a>
<small>Already have tickets? <a href="/my-tickets" style="all:unset;cursor:pointer;text-decoration:underline">My tickets</a></small></div>`;
  const show = () => { document.documentElement.classList.add('tb-soon-on'); document.head.append(style); document.body.append(box); };
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show, {once: true});
  // Rotate ticket types (with their photo) and light up one benefit at a time.
  const pics = [...box.querySelectorAll('.tb-soon-bg img')], perks = [...box.querySelectorAll('.tb-soon-perks li')];
  let kind = box.querySelector('[data-soon-kind]');
  let at = 0; pics[0].classList.add('on');
  const timer = setInterval(() => {
    if (!box.isConnected) return clearInterval(timer);
    pics[at].classList.remove('on'); at = (at + 1) % KINDS.length; pics[at].classList.add('on');
    // A fresh element restarts the slide-in animation.
    const next = kind.cloneNode(); next.textContent = KINDS[at][0]; kind.replaceWith(next); kind = next;
    perks.forEach((li, i) => li.classList.toggle('lit', i === at % perks.length));
  }, 2400);
  // Live count from the partner feed: a city that matches nothing returns only the total.
  fetch('/api/partner-feed?city=prelaunch-count', {signal: AbortSignal.timeout(15000)}).then(r => r.ok ? r.json() : null).then(j => {
    const total = Number(j?.total);
    if (!(total > 0)) return;
    const wrap = box.querySelector('[data-soon-count]'), num = wrap.querySelector('b');
    wrap.hidden = false;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { num.textContent = total.toLocaleString('en-GB'); return; }
    const t0 = performance.now(), step = t => { const k = Math.min(1, (t - t0) / 1400), e = 1 - Math.pow(1 - k, 3);
      num.textContent = Math.round(total * e).toLocaleString('en-GB'); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }).catch(() => {});
  box.querySelector('[data-soon-enter]').addEventListener('click', () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* still let them in for this visit */ }
    box.remove(); style.remove(); document.documentElement.classList.remove('tb-soon-on');
  });
}

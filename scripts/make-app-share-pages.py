# Builds the four TicketBunker app share pages and their 1200x630 link-preview cards.
#   python3 -I scripts/make-app-share-pages.py
# Writes ticketbunker-site/{app,organiser-app,scanner-app,check-in-hub}.html and
# ticketbunker-site/assets/og/app-*.jpg. Needs Google Chrome (headless) for the cards.
# Store links: set "ios"/"android"/"mac" to None while that store has not published the app,
# so a page never links to a store page that 404s. Re-run after changing them.
import html, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'ticketbunker-site')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
BASE = 'https://theticketbunker.com'
V = '20261126-apps'

APPS = [
  dict(slug='app', key='ticketbunker', name='TicketBunker', accent='#00e0a6', rgb='0,224,166', ink='#04140d',
       icon='icon-ticketbunker.png', shots=['fan-01.jpg', 'fan-02.jpg', 'fan-04.jpg'],
       eyebrow='The TicketBunker app', h1='Tickets in', h2='your pocket.',
       title='TicketBunker app: tickets, nights out and getting there',
       description='Find gigs, club nights, comedy and festivals near you, keep your tickets and door QR codes in one place, plan the night and get to the venue. Free for iPhone, iPad and Android.',
       card='Gigs, club nights, comedy and festivals across the UK and Europe. Free app.',
       platforms='iPhone · iPad · Android',
       ios='https://apps.apple.com/gb/app/id6837950372', android=None, mac=None,
       features=[('Find something on', 'Search any town or tap Near me. Tonight, this weekend or the next 7 days, across 153 cities.'),
                 ('No booking fee on our events', 'TicketBunker events never add a booking fee. Partner sellers are always named, with their fees shown.'),
                 ('Get around', 'Walk, bus, train or a ride to the venue, with live London times and step-free routes.'),
                 ('Your tickets, ready at the door', 'Door QR codes in the app and in Apple Wallet. VIP members see their perks too.')]),
  dict(slug='organiser-app', key='organisers', name='TicketBunker For Organisers', accent='#ff4f9a', rgb='255,79,154', ink='#2a0716',
       icon='icon-organisers.png', shots=['org-01.jpg', 'org-02.jpg', 'org-04.jpg'],
       eyebrow='TicketBunker For Organisers', h1='Run your events', h2='from your phone.',
       title='TicketBunker For Organisers: create, sell and run your events',
       description='The free organiser app for TicketBunker. Create events, add ticket types and VIP early access, publish, then watch live sales, invite door staff and manage guest lists. No booking fee for your buyers.',
       card='Create events, sell tickets with no booking fee and run the door. Free app.',
       platforms='iPhone · iPad · Android',
       ios='https://apps.apple.com/gb/app/id6837950804', android='https://play.google.com/store/apps/details?id=pt.soundbunker.theticketbunker.organiser', mac=None,
       features=[('Create and publish', 'Details, times in venue local time, a poster from your camera roll and your own ticket prices.'),
                 ('VIP early access', 'Let TicketBunker VIP members book first, then open sales to everyone.'),
                 ('Live numbers', 'Paid tickets, revenue, door check-ins, guest passes and door sales as they happen.'),
                 ('Door staff and guest lists', 'Invite door staff to the Scanner app and give artists free passes in a tap.')]),
  dict(slug='scanner-app', key='scanner', name='TicketBunker Scanner', accent='#ffcd4d', rgb='255,205,77', ink='#2a1f00',
       icon='icon-scanner.png', shots=['scanner-04.jpg', 'scanner-01.jpg', 'scanner-02.jpg'],
       eyebrow='TicketBunker Scanner', h1='Your door.', h2='Sorted.',
       title='TicketBunker Scanner: the free door app for your event',
       description='The free door app for TicketBunker events. Scan ticket QR codes in a second, see VIP entry straight away, stop double entries, take pay-at-door sales and keep a live door count.',
       card='Scan tickets in a second, spot VIPs and keep a live door count. Free app.',
       platforms='iPhone · iPad · Android',
       ios=None, android='https://play.google.com/store/apps/details?id=pt.soundbunker.ticketbunkerscanner', mac=None,
       features=[('Scan in a second', 'Point the camera at any ticket QR code. A full-screen result tells staff what to do.'),
                 ('VIP at the door', 'TicketBunker VIP members show VIP · ENTRY APPROVED, so they get the right welcome.'),
                 ('No double entries', 'Used tickets are flagged instantly, on every phone at the event.'),
                 ('Pay at door and door count', 'Sell admission by card or cash, and keep a live total of who is in.')]),
  dict(slug='check-in-hub', key='hub', name='TicketBunker Check-in Hub', accent='#ff8a2b', rgb='255,138,43', ink='#2a1200',
       icon='icon-hub.png', shots=['hub-screen.jpg'],
       eyebrow='TicketBunker Check-in Hub', h1='Every door.', h2='No signal needed.',
       title='TicketBunker Check-in Hub: keep checking in when the internet drops',
       description='The TicketBunker Check-in Hub for Mac and Windows. Download your event before you travel, pair your door scanners over local Wi-Fi and keep checking guests in even when the venue internet goes down.',
       card='Download your event, pair your scanners on local Wi-Fi and keep the queue moving.',
       platforms='Mac · Windows coming soon',
       ios=None, android=None, mac='/organiser#page-hub',
       features=[('Download first', 'Save your tickets on a laptop while you still have internet.'),
                 ('One local Wi-Fi', 'The hub and every paired scanner talk over the venue Wi-Fi, with or without internet.'),
                 ('Every door, one count', 'Scanners at every entrance share one list, so a ticket only gets in once.'),
                 ('Upload when you reconnect', 'Saved check-ins upload automatically once the hub is back online.')]),
]

E = html.escape
APPLE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.5 2.1-3.7 2.2-3.8-1.2-1.7-3-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.2zM13.9 5.1c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z"/></svg>'
PLAY = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#00e0a6" d="M3 2l11 10L3 22z"/><path fill="#ff4f9a" d="M3 2l14.5 8.3L14 12z"/><path fill="#ffcd4d" d="M3 22l14.5-8.3L14 12z"/><path fill="#ff8a2b" d="M17.5 10.3L21 12l-3.5 1.7L14 12z"/></svg>'
LAPTOP = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 5h16v10H4zM2 17h20l-1.5 2h-17z"/></svg>'


def store_buttons(a):
    out = []
    out.append(f'<a class="store" href="{E(a["ios"])}" rel="noopener">{APPLE}<span><small>Download on the</small>App Store</span></a>' if a['ios']
               else ('' if a['key'] == 'hub' else f'<span class="store soon">{APPLE}<span><small>Coming soon to the</small>App Store</span></span>'))
    out.append(f'<a class="store" href="{E(a["android"])}" rel="noopener">{PLAY}<span><small>Get it on</small>Google Play</span></a>' if a['android']
               else ('' if a['key'] == 'hub' else f'<span class="store soon">{PLAY}<span><small>Coming soon to</small>Google Play</span></span>'))
    if a['key'] == 'hub':
        out.append(f'<a class="store" href="{E(a["mac"])}">{LAPTOP}<span><small>Download for</small>Mac</span></a>')
        out.append(f'<span class="store soon">{LAPTOP}<span><small>Coming soon for</small>Windows</span></span>')
    return ''.join(out)


def page(a):
    url = f'{BASE}/{a["slug"]}'
    og = f'{BASE}/assets/og/app-{a["key"]}.jpg?v={V}'
    others = ''.join(f'<a class="other" href="/{b["slug"]}" style="--c:{b["accent"]}"><img src="/assets/apps/{b["icon"]}" alt="" width="44" height="44"><span>{E(b["name"])}</span></a>'
                     for b in APPS if b is not a)
    shots = ''.join(f'<img class="shot{" wide" if a["key"] == "hub" else ""}" src="/assets/apps/{s}" alt="{E(a["name"])} screen" loading="lazy">' for s in a['shots'])
    feats = ''.join(f'<li><b>{E(t)}</b><span>{E(d)}</span></li>' for t, d in a['features'])
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(a["title"])}</title><meta name="description" content="{E(a["description"])}"><link rel="canonical" href="{url}">
<meta name="theme-color" content="#07070b"><link rel="icon" href="/assets/apps/{a["icon"]}"><link rel="apple-touch-icon" href="/assets/apps/{a["icon"]}">
<meta property="og:type" content="website"><meta property="og:site_name" content="The TicketBunker"><meta property="og:locale" content="en_GB">
<meta property="og:title" content="{E(a["name"])}: {E(a["h1"])} {E(a["h2"])}"><meta property="og:description" content="{E(a["description"])}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{og}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="{E(a["name"])}: {E(a["card"])}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{E(a["name"])}: {E(a["h1"])} {E(a["h2"])}"><meta name="twitter:description" content="{E(a["description"])}"><meta name="twitter:image" content="{og}">
{f'<meta name="apple-itunes-app" content="app-id={a["ios"].rsplit("id", 1)[1]}">' if a["ios"] else ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=DM+Sans:wght@400;500;700&display=swap">
<link rel="stylesheet" href="/app-pages.css?v={V}"></head>
<body style="--c:{a["accent"]};--c-rgb:{a["rgb"]};--ink:{a["ink"]}"><header class="bar"><a href="/" aria-label="The TicketBunker homepage"><img src="/brand-compact.png" alt="The TicketBunker" width="180"></a><a class="bar-link" href="/">Find events ↗</a></header>
<main><section class="hero"><div class="copy"><p class="eyebrow"><img src="/assets/apps/{a["icon"]}" alt="" width="64" height="64">{E(a["eyebrow"])}</p>
<h1>{E(a["h1"])}<span>{E(a["h2"])}</span></h1><p class="lead">{E(a["description"])}</p>
<div class="stores">{store_buttons(a)}</div><p class="platforms">{E(a["platforms"])} · Free</p></div>
<div class="shots{" hub" if a["key"] == "hub" else ""}">{shots}</div></section>
<section class="features"><ul>{feats}</ul></section>
<section class="family"><h2>The TicketBunker apps</h2><div class="others">{others}</div></section></main>
<footer class="foot"><a href="/">theticketbunker.com</a> · <a href="/terms#app-privacy">Privacy</a> · <a href="/support">Support</a></footer></body></html>
'''


def card(a):
    hub = a['key'] == 'hub'
    shots = (f'<div class="laptop"><img src="{SITE}/assets/apps/{a["shots"][0]}"></div>' if hub else
             ''.join(f'<img class="ph p{i}" src="{SITE}/assets/apps/{s}">' for i, s in enumerate(a['shots'])))
    return f'''<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@800;900&family=DM+Sans:wght@500;700&display=swap" rel="stylesheet">
<style>html,body{{margin:0;width:1200px;height:630px;overflow:hidden;background:#07070b;font-family:'DM Sans',sans-serif}}
.bg{{position:absolute;inset:0;background:radial-gradient(ellipse 700px 520px at 82% 60%,rgba({a["rgb"]},.30),transparent 70%),radial-gradient(ellipse 520px 300px at 0% 0%,rgba({a["rgb"]},.12),transparent 70%),linear-gradient(160deg,#0f0f17,#07070b 60%)}}
.copy{{position:absolute;left:64px;top:58px;width:560px;z-index:3}}
.eb{{display:flex;align-items:center;gap:18px;color:#fff;font-weight:700;font-size:26px}}.eb img{{width:84px;height:84px;border-radius:20px;box-shadow:0 10px 30px rgba({a["rgb"]},.35),0 0 0 1px #ffffff22}}
.eb small{{display:block;color:{a["accent"]};font-size:15px;letter-spacing:.22em;text-transform:uppercase;margin-bottom:4px}}
h1{{margin:36px 0 0;font:900 {92 if max(len(a['h1']),len(a['h2']))<=13 else 76}px/.9 'Barlow Condensed',sans-serif;text-transform:uppercase;color:#f5f7f6;letter-spacing:.005em}}h1 span{{display:block;color:{a["accent"]}}}
p{{margin:26px 0 0;color:#c9cdd5;font-size:25px;line-height:1.3;max-width:520px}}
.pl{{position:absolute;left:64px;bottom:44px;display:flex;gap:10px}}.pl span{{border:1px solid #ffffff2e;border-radius:999px;padding:9px 16px;color:#fff;font-weight:700;font-size:17px;background:#ffffff0d}}
.ph{{position:absolute;width:248px;border-radius:30px;box-shadow:0 0 0 5px #1c1c26,0 0 0 6px #33333f,0 30px 60px rgba(0,0,0,.6)}}
.p0{{left:690px;top:120px;transform:rotate(-8deg)}}.p1{{left:850px;top:64px;z-index:2;width:268px}}.p2{{left:1010px;top:128px;transform:rotate(8deg)}}
.laptop{{position:absolute;left:660px;top:150px;width:500px;border-radius:16px 16px 0 0;overflow:hidden;border:10px solid #1c1c26;border-bottom:0;box-shadow:0 30px 70px rgba(0,0,0,.6),0 0 90px rgba({a["rgb"]},.25)}}.laptop img{{display:block;width:100%}}
.base{{position:absolute;left:630px;top:{150+322}px;width:560px;height:16px;border-radius:0 0 14px 14px;background:#2a2a36}}
</style><div class="bg"></div>{shots}{'<div class="base"></div>' if hub else ''}
<div class="copy"><div class="eb"><img src="{SITE}/assets/apps/{a["icon"]}"><span><small>The TicketBunker</small>{E(a["name"])}</span></div>
<h1>{E(a["h1"])}<span>{E(a["h2"])}</span></h1><p>{E(a["card"])}</p></div>
<div class="pl">{''.join(f'<span>{E(x.strip())}</span>' for x in a["platforms"].split('·'))}</div>'''


os.makedirs(os.path.join(SITE, 'assets', 'og'), exist_ok=True)
import tempfile; tmp = tempfile.mkdtemp(prefix='tb-app-cards-'); os.makedirs(tmp, exist_ok=True)
for a in APPS:
    open(os.path.join(SITE, a['slug'] + '.html'), 'w').write(page(a))
    hp = os.path.join(tmp, a['key'] + '.html'); open(hp, 'w').write(card(a))
    png = os.path.join(tmp, a['key'] + '.png')
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=1',
                    '--window-size=1200,630', '--virtual-time-budget=8000', f'--screenshot={png}', 'file://' + hp], capture_output=True, timeout=120)
    subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '86', png, '--out', os.path.join(SITE, 'assets', 'og', f'app-{a["key"]}.jpg')], capture_output=True)
    print(a['slug'], 'ok')

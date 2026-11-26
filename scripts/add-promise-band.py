# One-off: add the "Why book with TicketBunker" band and page photos to the public pages.
# Usage: python3 scripts/add-promise-band.py scripts/promise-band.html <page> ...  (run from ticketbunker-site)
# Safe to rerun: pages that already have the band are skipped.
import re,sys
band=open(sys.argv[1]).read()
CSS='<link rel="stylesheet" href="/promise.css?v=20261126">'
def photo(src,alt=''):return f'<img class="tbp-photo" src="{src}" alt="{alt}" width="1600" height="1000" fetchpriority="high">'
def banner(src,text):return f'<div class="tbp-banner"><img src="{src}" alt="" width="1600" height="1000" fetchpriority="high"><p>{text}</p></div>'
GUIDES=['hotels','travel','car-hire','restaurants','vip-transfers','plan-your-trip']
def edit(name,h):
    if 'class="tbp"' in h or 'class="tbp ' in h:return None
    h=h.replace('</head>',CSS+'</head>',1)
    if name=='index':
        h,n=re.subn(r'<section class="trust-strip" id="fan-benefits".*?</section>',band.replace('<section class="tbp"','<section class="tbp" id="fan-benefits"'),h,count=1,flags=re.S);assert n==1
        return h
    if name in GUIDES:
        h,n=re.subn(r'<section class="guide-hero" style="--guide-image:url\(\'[^\']+\'\)">',f'<section class="guide-hero tbp-guide" style="--guide-image:url(\'/assets/pages/{name}.webp\')">',h,count=1);assert n==1,name
    hero={'about':'/assets/crowd.jpg','contact':'/assets/pages/contact.webp','refund-policy':'/assets/pages/refund-policy.webp'}
    if name in hero:
        h,n=re.subn(r'<section class="about-hero"><div class="wrap">',f'<section class="about-hero tbp-photo-hero">{photo(hero[name])}<div class="wrap">',h,count=1);assert n==1,name
    if name=='city-guides':
        h,n=re.subn(r'<section class="cg-hero">',f'<section class="cg-hero tbp-photo-hero">{photo("/assets/groups/lisbon.webp")}',h,count=1);assert n==1
    if name=='advertise':
        h,n=re.subn(r'<section class="vip-hero"><div class="vip-wrap">','<section class="vip-hero"><img class="vip-hero-img" src="/assets/club.jpg" alt="" width="1600" height="1067" fetchpriority="high"><div class="vip-wrap">',h,count=1);assert n==1
    banners={'pricing':('/assets/hero-live-v2.webp','One price. <em>No commission.</em>'),'support':('/assets/pages/support.webp','Here when <em>you need us.</em>'),'terms':('/assets/pages/terms.webp','Straight answers. <em>Fair terms.</em>')}
    if name in banners:
        h,n=re.subn(r'(<main[^>]*>)',lambda m:m.group(1)+banner(*banners[name]),h,count=1);assert n==1
    if name!='terms':h=h.replace('</main>','</main>'+band,1)
    return h
for name in sys.argv[2:]:
    p=name+'.html';h=open(p).read();out=edit(name,h)
    if out is None:print('skip',name);continue
    open(p,'w').write(out);print('done',name)

import { writeFileSync } from "node:fs";

const pages = {
  "recording.html":"recording",
  "production.html":"production",
  "mixing-mastering.html":"mixing",
  "voiceover.html":"voiceover",
  "photography.html":"photography",
  "experiences-parties.html":"parties"
};

const seo = {
  recording: ["Recording Studio in Loulé | Sessions with Engineer", "Book a recording studio session with an experienced engineer in Loulé, Algarve. Vocals and instruments, with mixing and mastering included. From €250.", "Recording with an engineer", "Record vocals and instruments in Loulé with an experienced engineer. Mixing and mastering are included in the booked session."],
  production: ["Music Production in the Algarve | SoundBunker", "Create an original song at SoundBunker Algarve. Two focused production and vocal sessions in Loulé, followed by a professional mix and master.", "Music production in the Algarve", "Create an original song across two focused sessions, then finish it with a professional mix and master."],
  mixing: ["Online Mixing & Mastering | SoundBunker Algarve", "Professional online mixing and mastering from SoundBunker Algarve. See clear prices, book online and upload your stems securely for a release-ready finish.", "Online mixing and mastering", "Choose your mixing or mastering service, book online and upload your stems securely."],
  voiceover: ["Remote Voiceover Studio in Portugal | SoundBunker", "Broadcast-quality remote voiceover sessions from our treated studio in Loulé, Portugal. Live direction via SessionLink Pro, Neumann U87 and experienced engineering.", "Remote voiceover sessions", "Record broadcast-quality voiceover in Loulé with live direction available from anywhere."],
  photography: ["Photography Studio in Loulé, Algarve | SoundBunker", "Book a professional studio photoshoot in central Loulé. Artist portraits, family photography and business branding with edited digital images.", "Photography studio in Loulé", "Book artist, family or business photography with professionally edited digital images."],
  parties: ["Pop Star Experiences & Birthday Parties | Loulé", "Celebrate at SoundBunker Algarve with a Pop Star recording experience, birthday party, hen or stag session. Studio music and professional photography in Loulé.", "Studio parties and experiences", "Celebrate with recording, photography and creative activities at SoundBunker Algarve."]
};

const template = (file, key) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#100d14">
  <meta name="description" content="${seo[key][1]}">
  <title>${seo[key][0]}</title>
  <link rel="canonical" href="https://www.soundbunker.pt/${file}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="SoundBunker Algarve">
  <meta property="og:title" content="${seo[key][0]}">
  <meta property="og:description" content="${seo[key][1]}">
  <meta property="og:url" content="https://www.soundbunker.pt/${file}">
  <meta property="og:image" content="https://www.soundbunker.pt/hero-studio.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
  <link rel="stylesheet" href="detail-styles.css">
  <link rel="stylesheet" href="v5-styles.css">
  <script src="service-page.js" defer></script>
  <script src="script.js" defer></script>
</head>
<body data-service-page="${key}">
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header" id="top">
    <a class="brand" href="index.html" aria-label="SoundBunker Algarve home"><img src="soundbunker-logo.png" alt="SoundBunker Algarve"></a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu"><span></span><span></span></button>
    <nav id="site-nav" class="site-nav" aria-label="Main navigation">
      <a href="index.html#studio" data-i18n="nav.studio">Studio</a>
      <a href="index.html#services" data-i18n="nav.services">Services</a>
      <a href="experiences-parties.html" data-i18n="nav.experiences">Experiences</a>
      <a href="hub-academy.html" data-i18n="nav.education">Hub Academy</a>
      <a href="index.html#hub" data-i18n="nav.partnership">The Hub</a>
      <a href="index.html#contact" data-i18n="nav.contact">Contact</a>
    </nav>
    <div class="header-actions"><div class="language-switcher" role="group" aria-label="Language"><button class="lang active" type="button" data-lang="en" aria-pressed="true">EN</button><button class="lang" type="button" data-lang="pt" aria-pressed="false">PT</button><button class="lang" type="button" data-lang="fr" aria-pressed="false">FR</button></div><a class="button button-small" href="#book" data-i18n="common.book">Book now</a></div>
  </header>
  <main id="main">
    <section class="detail-hero" id="detail-hero"><div class="detail-hero-content wrap"><h1>${seo[key][2]}</h1><p class="detail-hero-copy">${seo[key][3]}</p></div></section>
    <div id="detail-content"><section class="section wrap detail-lead"><h2>${seo[key][2]} at SoundBunker Algarve</h2><p>${seo[key][3]}</p></section></div>
    <section class="booking section" id="book">
      <div class="wrap detail-book-intro"><p class="eyebrow" data-i18n="booking.eyebrow">Online booking</p><h2 data-i18n="booking.title">Book your studio time.</h2><p data-i18n="booking.copy">Choose your session, select an available date and secure it with your VAT-inclusive deposit.</p></div>
      <div class="wrap booking-grid"><div class="booking-copy"><ul><li data-i18n="booking.rule1">Weekdays: 10:00, 13:00 or 16:00</li><li data-i18n="booking.rule2">Saturday: 16:00, two hours only</li><li data-i18n="booking.rule3">Sunday: 10:00, two or four hours</li><li data-i18n="booking.rule4">Free move with more than 24 hours' notice</li></ul><p class="policy" data-i18n="booking.policy">The deposit is non-refundable for cancellation or changes within 24 hours.</p><p>For parties, podcasts, voiceover, photography, mixing or a bespoke song, email <a href="mailto:bookings@soundbunker.pt">bookings@soundbunker.pt</a> for a tailored booking.</p></div>
        <form class="booking-form" id="booking-form" novalidate>
          <div class="field full-field"><label for="service" data-i18n="form.service">Session</label><select id="service" name="service" required></select></div>
          <div class="field"><label for="date" data-i18n="form.date">Date</label><input id="date" name="date" type="date" required></div>
          <div class="field"><label for="time" data-i18n="form.time">Start time</label><select id="time" name="time" required><option value="" data-i18n="form.chooseDate">Choose a date first</option></select></div>
          <div class="field"><label for="name" data-i18n="form.name">Full name</label><input id="name" name="name" autocomplete="name" required></div>
          <div class="field"><label for="email" data-i18n="form.email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="phone" data-i18n="form.phone">Phone</label><input id="phone" name="phone" type="tel" autocomplete="tel" required></div>
          <div class="field"><label for="taxId" data-i18n="form.nif">NIF / tax number</label><input id="taxId" name="taxId"></div>
          <div class="field full-field"><label for="notes" data-i18n="form.notes">Session notes</label><textarea id="notes" name="notes" rows="3"></textarea></div>
          <label class="check full-field"><input type="checkbox" name="terms" required><span><span data-i18n="form.terms">I accept the booking and cancellation terms.</span> <a href="terms.html" target="_blank">Terms</a></span></label>
          <div class="booking-total full-field"><div><span data-i18n="form.total">Session total</span><b id="session-total">€250</b></div><div><span data-i18n="form.due">Due now</span><b id="deposit-total">€100</b></div></div>
          <button class="button full full-field" type="submit" data-i18n="form.pay">Continue to secure payment</button><p class="form-status full-field" id="form-status" role="status" aria-live="polite"></p>
        </form>
      </div>
    </section>
  </main>
  <footer class="site-footer"><div class="wrap footer-main"><a class="brand" href="index.html"><img src="soundbunker-logo.png" alt="SoundBunker Algarve"></a><div><a href="mailto:bookings@soundbunker.pt">bookings@soundbunker.pt</a><a href="index.html#contact">Loulé, Algarve</a><a href="index.html#services">All services</a></div></div><div class="wrap footer-legal"><span>© <span id="year"></span> SoundBunker Algarve</span><span><a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a></span></div></footer>
</body>
</html>`;

for (const [file,key] of Object.entries(pages)) writeFileSync(file,template(file,key));

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('events.html'),css=read('ticketbunker-live-hero.css'),js=read('ticketbunker-live-hero.js');
test('TicketBunker uses a genuine live-band moving hero, not borrowed SoundBunker imagery',()=>{
 assert.match(html,/class="tb-hero tb-hero-standalone"/);
 assert.match(html,/id="tbLiveBandVideo"/);
 assert.match(html,/video-files\/854054\/854054-hd_1920_1080_25fps\.mp4/);
 assert.match(html,/video[^>]*muted playsinline loop preload="none"/);
 assert.match(html,/tb-live-band-scrim/);
 assert.match(html,/tbLiveBandVideo/);
 assert.doesNotMatch(html,/tb-hero-decoration|class="tb-stub"/);
 assert.doesNotMatch(html,/academy-performance\.jpg|hero-studio\.webp/);
 assert.match(html,/EVENT TICKETS\.<br><em>MADE SIMPLE\.<\/em>/);
 assert.match(html,/ticketbunker-live-hero\.css/);
 assert.match(html,/ticketbunker-live-hero\.js/);
});
test('video automatically handles unsupported playback, low data usage, reduced motion and loss of visibility',()=>{
 assert.match(js,/navigator\.connection\?\.saveData/);
 assert.match(js,/prefers-reduced-motion: reduce/);
 assert.match(js,/IntersectionObserver/);
 assert.match(js,/document\.hidden/);
 assert.match(js,/video\.addEventListener\('error'/);
 assert.match(js,/promise\.catch/);
 assert.match(js,/video\.muted = true/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.tb-live-band-media\{/);
 assert.match(css,/\.tb-live-band-video\.is-playing/);
 assert.match(css,/url\("https:\/\/images\.pexels\.com\/videos\/854054/);
});
test('background motion has a keyboard-operable, correctly labelled pause/play control',()=>{
 assert.match(html,/id="tbMotionToggle"/);
 assert.match(html,/type="button" aria-label="Pause band video background"/);
 assert.match(js,/toggle\.addEventListener\('click'/);
 assert.match(js,/toggle\.setAttribute\('aria-label'/);
 assert.match(js,/video\.pause\(\)/);
 assert.match(css,/\.tb-motion-toggle:focus-visible/);
});

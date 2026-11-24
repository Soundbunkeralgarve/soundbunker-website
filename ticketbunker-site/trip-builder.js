import {CITY_PAGES} from './city-places.js?v=20261122';
import {nearestCities} from './city-coords.js?v=20261122';
import {locate} from './place-finder.js?v=20261122';
import {tripOptions} from './trip-partners.js?v=20261125-dates';
import {cityBenefits} from './city-guide-benefits.js';
import {escapeHtml as esc} from './shared.js';
import {TRIP_BUILDER_KEY, BUILDER_STEPS, TRIP_PARTIES, normaliseDraft, openDraft, persistDraft, switchDestination,
  updateDetails, chooseOption, stepProgress, matchingNights, ticketBrowseHref, draftQuery, reconcileSelections, applyTripDetails,
  savedListingStep, transportBrowseHref} from './trip-builder-model.js?v=20261123-transit';

const host = typeof document !== 'undefined' && document.querySelector('[data-trip-builder]');
if (host) mountBuilder(host);

function mountBuilder(host) {
  const read = (key, fallback) => {try {return JSON.parse(localStorage.getItem(key) || 'null') || fallback;} catch {return fallback;}};
  let store = read(TRIP_BUILDER_KEY, {}), draft = openDraft(store, location.search), nights = [], providers = {};
  const names = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], {type:'region'}) : null;
  const countryName = cc => {try {return names?.of(cc) || cc;} catch {return cc;}};
  const countryCodes = [...new Set(CITY_PAGES.map(c => c[2]))].sort((a,b) => countryName(a).localeCompare(countryName(b)));
  const labels = Object.fromEntries(BUILDER_STEPS), partyNames = Object.fromEntries(TRIP_PARTIES);
  const progressLabel = status => ({unplanned:'To plan', planned:'Planned', confirmed:'Confirmed by you', skipped:'Skipped'}[status] || 'To plan');
  const providerId = (kind, p) => kind + ':' + (p.id || p.name);
  const selected = (step, id) => draft.selected[step].includes(id);
  const save = () => {
    store = persistDraft(store, draft);
    let persistent = true;
    try {localStorage.setItem(TRIP_BUILDER_KEY, JSON.stringify(store));} catch {persistent = false;}
    const saved = host.querySelector('.tb-builder-saved');
    if (saved) saved.textContent = persistent ? 'Saved on this device' : 'For this visit';
    history.replaceState(null, '', location.pathname + '?' + draftQuery(draft) + '#trip-builder');
  };
  const status = message => {host.querySelector('[data-builder-status]').textContent = message;};
  const dateText = n => {
    if (!n.startsAt) return 'Choose your date with the provider';
    try {return new Intl.DateTimeFormat('en-GB', {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:n.timezone || undefined}).format(new Date(n.startsAt));}
    catch {return 'Check the event date';}
  };
  function refreshOptions() {
    nights = matchingNights(read('tb-my-trip', []), draft);
    for(const n of nights) {
      const correct=savedListingStep(n.category);
      for(const step of ['tickets','travel','food']) if(step!==correct && draft.selected[step].includes(n.id)) {
        draft=chooseOption(draft,step,n.id,false);draft=chooseOption(draft,correct,n.id);
      }
    }
    providers = Object.fromEntries(tripOptions(draft.country, draft.city, {page:'trip-builder', spot:'step', trip:{from:draft.from, to:draft.to, adults:draft.adults}}).map(o => [o.kind, o.partners]));
    const allowed = {tickets:nights.filter(n=>savedListingStep(n.category)==='tickets').map(n => n.id), stay:(providers.stay || []).map(p => providerId('stay', p)),
      travel:[...nights.filter(n=>savedListingStep(n.category)==='travel').map(n=>n.id),...['travel','car','transfer'].flatMap(k => (providers[k] || []).map(p => providerId(k, p)))],
      food:[...nights.filter(n=>savedListingStep(n.category)==='food').map(n=>n.id),...(providers.eat || []).map(p => providerId('eat', p))]};
    draft = reconcileSelections(draft, allowed);
  }
  refreshOptions();
  const event = new URLSearchParams(location.search).get('event');
  const picked = nights.find(n => n.id === event);
  if(picked) {
    const step=savedListingStep(picked.category);
    if(!draft.selected[step].includes(event))draft=chooseOption(draft,step,event);
    if(step!=='tickets')draft.step=step;
  }
  if (picked?.startsAt && !draft.from) {
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:picked.timezone || undefined, year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date(picked.startsAt)).map(p => [p.type,p.value]));
      draft = updateDetails(draft, {from:`${parts.year}-${parts.month}-${parts.day}`});
    } catch { /* date stays optional */ }
  }
  host.innerHTML = `<div class="tb-builder-heading"><div><span class="label">YOUR WEEKEND, SORTED</span><h2 id="trip-builder-heading">Build your trip.</h2><p>Tickets first. Then a stay, the journey and somewhere good to eat.</p></div><span class="tb-builder-saved">Saved on this device</span></div>
    <form class="tb-builder-details" data-builder-details><div class="tb-builder-destination"><label>Country<select name="country">${countryCodes.map(c=>`<option value="${c}">${esc(countryName(c))}</option>`).join('')}</select></label><label>Town or city<input name="city" list="builder-cities" maxlength="80" required autocomplete="off"><datalist id="builder-cities"></datalist></label><button type="button" class="tb-builder-near" data-builder-near>Near me</button></div>
    <div class="tb-builder-dates"><label>From<input type="date" name="from"></label><label>To<input type="date" name="to"></label><label>Adults<input type="number" min="1" max="30" name="adults"></label><label>Children<input type="number" min="0" max="20" name="children"></label></div>
    <div class="tb-builder-party"><label>What kind of trip?<select name="party">${TRIP_PARTIES.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><button type="submit" class="tb-builder-update">Update trip</button></div></form>
    <p class="tb-builder-status" data-builder-status role="status" aria-live="polite"></p><nav class="tb-builder-steps" aria-label="Trip planning steps" data-builder-steps></nav>
    <div class="tb-builder-workspace"><section class="tb-builder-panel" data-builder-panel aria-labelledby="builder-step-heading"></section><aside class="tb-builder-summary" data-builder-summary aria-label="Your trip at a glance"></aside></div>`;
  document.querySelector('[data-guide-directory]')?.setAttribute('hidden','');
  const form = host.querySelector('[data-builder-details]');
  function cityList() {
    host.querySelector('#builder-cities').innerHTML = CITY_PAGES.filter(c => c[2] === form.elements.country.value).map(c => `<option value="${esc(c[1].replace(/^the /,''))}"></option>`).join('');
  }
  function syncForm() {
    for (const key of ['country','city','from','to','adults','children','party']) {form.elements[key].value = draft[key]; form.elements[key].setCustomValidity('');}
    cityList();
  }
  const providerRows = (kind, step) => (providers[kind] || []).map(p => {
    const id = providerId(kind,p);
    return `<article class="tb-builder-provider"><div><span class="tb-builder-provider-type">${esc(p.serviceLabel || ({stay:'Hotel search',travel:'Train & coach search',car:'Car hire search',eat:'Restaurants & offers',transfer:'Limos & private transport'}[kind]))}</span><h4>${esc(p.name)}</h4><p>${esc(p.description || 'Check current options, dates and the final total with the provider.')}</p></div><div class="tb-builder-provider-actions"><a href="${esc(p.url)}" target="_blank" rel="${p.commercial==='affiliate'?'sponsored ':''}noopener noreferrer">Search options ↗</a><label class="tb-builder-choice"><input type="checkbox" data-builder-option="${esc(id)}" data-builder-step="${step}" ${selected(step,id)?'checked':''}>Keep in my plan</label></div></article>`;
  }).join('');
  const activityLink = () => '/?' + new URLSearchParams({city:draft.city, country:draft.country, cat:['families','kids'].includes(draft.party)?'family':'daysout'});
  const savedRows = step => {
    const items=nights.filter(n=>savedListingStep(n.category)===step);
    return items.length?`<fieldset class="tb-builder-tickets"><legend>Saved ${step==='travel'?'transport':step==='food'?'dining':'events'} in ${esc(draft.city)}</legend>${items.map(n=>`<label class="tb-builder-ticket"><input type="checkbox" data-builder-option="${esc(n.id)}" data-builder-step="${step}" ${selected(step,n.id)?'checked':''}><span><strong>${esc(n.title)}</strong><small>${esc(dateText(n))} · ${esc(n.seller || 'TicketBunker')}</small><a href="${esc(n.url)}" target="_blank" rel="${n.external?'sponsored ':''}noopener noreferrer">Open listing & booking ↗</a></span></label>`).join('')}</fieldset>`:'';
  };
  function ticketsHtml() {
    const advice = {families:'Plan something everyone can enjoy. Check ages, timings and the journey home.', kids:'Check minimum ages, child tickets and opening times before choosing.', staghen:'Check group sizes and stag or hen policies with the venue before booking.', couples:'Find a show, an experience or a date worth making a weekend of.', weekend:'Pick the main event, then leave room for the rest of the city.'}[draft.party];
    return `<p>${advice}</p><div class="tb-builder-actions"><a class="tb-builder-primary" href="${esc(ticketBrowseHref(draft))}">Browse tickets in ${esc(draft.city)} ↗</a><a href="${esc(activityLink())}">Tours & days out ↗</a></div><p class="tb-builder-help">Choose an event’s “Build this trip” option to bring it back here. Your trip details stay saved.</p>
    ${savedRows('tickets') || '<div class="tb-builder-empty">Your selected events will appear here. Start with the city’s live listings above.</div>'}`;
  }
  function foodHtml() {
    const city = CITY_PAGES.find(c => c[2] === draft.country && [c[0], c[1].replace(/^the /,''), c[3]].some(n => n.toLowerCase() === draft.city.toLowerCase()));
    const benefits = city ? cityBenefits(city) : [];
    return `<p>Choose a table around your event and check the restaurant’s current offers.</p>${savedRows('food')}${providerRows('eat','food')}
      <h3 class="tb-builder-subheading">Dining offers & vouchers</h3>${benefits.length?benefits.map(b=>`<article class="tb-builder-offer"><span class="tb-builder-provider-type">${b.type==='voucher'?'Confirmed voucher':'Restaurant offer search'}</span><h4>${esc(b.title)}</h4><p>${esc(b.description || '')}</p>${b.type==='voucher'&&b.code?`<p>Code: <strong>${esc(b.code)}</strong></p>`:''}<p class="tb-builder-help">${esc(b.terms)}</p><a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">Check offer details ↗</a></article>`).join(''):'<p class="tb-builder-help">No confirmed voucher is listed for this destination yet. Check current restaurant offers with the provider.</p>'}
      ${city?`<a class="tb-builder-guide" href="/guides/${city[0]}">Open the ${esc(draft.city)} city guide ↗</a>`:''}`;
  }
  function optionsFor(step) {
    const saved=nights.filter(n => savedListingStep(n.category)===step && selected(step,n.id)).map(n => ({name:n.title,url:n.url,external:n.external,commercial:n.external?'affiliate':'direct'}));
    if (step === 'tickets') return saved;
    const kinds = step==='stay'?['stay']:step==='travel'?['travel','car','transfer']:['eat'];
    return [...saved,...kinds.flatMap(kind => (providers[kind] || []).filter(p=>selected(step,providerId(kind,p))).map(p=>({name:p.name,url:p.url,external:true,commercial:p.commercial})))];
  }
  function summaryHtml(full = false) {
    const rows = BUILDER_STEPS.filter(([id])=>id!=='review').map(([id,label]) => `<article class="tb-builder-review-step"><div><h4>${label}</h4><span class="tb-builder-progress ${draft.progress[id]}">${progressLabel(draft.progress[id])}</span></div>${optionsFor(id).length?`<ul>${optionsFor(id).map(p=>`<li>${full?`<a href="${esc(p.url)}" target="_blank" rel="${p.commercial==='affiliate'?'sponsored ':''}noopener noreferrer">${esc(p.name)} ↗</a>`:esc(p.name)}</li>`).join('')}</ul>`:'<p>No option saved.</p>'}${full?`<button type="button" data-builder-goto="${id}">Edit ${label.toLowerCase()}</button>`:''}</article>`).join('');
    return `<h3>${esc(draft.city)}${draft.country?', '+esc(countryName(draft.country)):''}</h3><p>${esc([draft.from && (draft.from + (draft.to?' → '+draft.to:'')),partyNames[draft.party],draft.adults+' adult'+(draft.adults===1?'':'s'),draft.children?draft.children+' child'+(draft.children===1?'':'ren'):''].filter(Boolean).join(' · '))}</p>${rows}`;
  }
  function render(focus = false) {
    const focusedOption = document.activeElement?.dataset?.builderOption;
    const focusedConfirmation = document.activeElement?.matches?.('[data-builder-confirm]');
    refreshOptions(); save();
    host.querySelector('[data-builder-steps]').innerHTML = BUILDER_STEPS.map(([id,label],i)=>`<button type="button" data-builder-goto="${id}" ${draft.step===id?'aria-current="step"':''}><span>${i+1}</span><b>${label}</b><small>${id==='review'?'Bring it together':progressLabel(draft.progress[id])}</small></button>`).join('');
    const idx = BUILDER_STEPS.findIndex(([id])=>id===draft.step), title = labels[draft.step];
    let body = draft.step==='tickets'?ticketsHtml():draft.step==='stay'?`<p>Find a stay around your plans. Check the map against the venue and compare the full room price and cancellation terms.</p>${providerRows('stay','stay')}`
      :draft.step==='travel'?`<p>Choose how to reach ${esc(draft.city)}, then sort any local rides separately.</p>${savedRows('travel')}<h3 class="tb-builder-subheading">Trains, buses, metro & river buses</h3><div class="tb-builder-actions"><a class="tb-builder-primary" href="${esc(transportBrowseHref(draft))}">Browse listed city transport ↗</a><a href="${esc(transportBrowseHref(draft,'transfer'))}">Private transfers & water taxis ↗</a></div><p class="tb-builder-help">Available rail tickets, metro cards and river-bus passes appear in the city’s listings. Check the exact route, zones, dates and inclusions with the provider.</p>${providerRows('travel','travel')}<h3 class="tb-builder-subheading">Flights</h3><div class="tb-builder-pending"><b>Flight booking · coming soon</b><p>Commercial flight sales are not active yet. You can keep planning your stay, rail travel and activities here.</p></div><h3 class="tb-builder-subheading">Car hire</h3>${providerRows('car','travel')}<h3 class="tb-builder-subheading">Limos, chauffeurs & airport transfers</h3><p class="tb-builder-help">Choose the actual vehicle and passenger capacity. A stretched limo must be specified in the provider’s listing.</p>${providerRows('transfer','travel')}`
      :draft.step==='food'?foodHtml():`<p>Your choices, together. Reopen a provider to complete or review its booking.</p>${summaryHtml(true)}<p class="tb-builder-help">“Planned” means saved here. “Confirmed by you” is your own record after receiving the provider’s confirmation. Opening a link does not mark a booking complete.</p><button type="button" class="tb-builder-primary" data-builder-finish>Keep my plan</button>`;
    const confirmation = draft.step!=='review' && draft.selected[draft.step].length ? `<label class="tb-builder-confirm"><input type="checkbox" data-builder-confirm ${draft.progress[draft.step]==='confirmed'?'checked':''}>I have received the provider’s booking confirmation for this step.</label>` : '';
    host.querySelector('[data-builder-panel]').innerHTML = `<span class="label">STEP ${idx+1} OF 5</span><h2 id="builder-step-heading" tabindex="-1">${title}</h2>${body}${confirmation}<p class="tb-builder-provider-note">Each booking is completed with the named provider under its prices, availability and terms. Use your trip dates and party details when searching. Some provider links may earn TicketBunker a commission.</p><div class="tb-builder-bottom">${idx?`<button type="button" data-builder-goto="${BUILDER_STEPS[idx-1][0]}">← Back</button>`:'<span></span>'}${draft.step!=='review'?`<button type="button" class="tb-builder-skip" data-builder-skip>Skip for now</button><button type="button" class="tb-builder-primary" data-builder-goto="${BUILDER_STEPS[idx+1][0]}">Next: ${BUILDER_STEPS[idx+1][1]} →</button>`:''}</div>`;
    host.querySelector('[data-builder-summary]').innerHTML = summaryHtml();
    host.querySelector('[data-builder-summary]').hidden = draft.step === 'review';
    host.querySelector('.tb-builder-workspace').classList.toggle('is-review',draft.step==='review');
    if (focus) {
      const heading=host.querySelector('#builder-step-heading');
      heading.focus({preventScroll:true});
      heading.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    }
    else if (focusedOption) [...host.querySelectorAll('[data-builder-option]')].find(el=>el.dataset.builderOption===focusedOption)?.focus({preventScroll:true});
    else if (focusedConfirmation) host.querySelector('[data-builder-confirm]')?.focus({preventScroll:true});
  }
  form.elements.country.addEventListener('change', () => {form.elements.city.value=''; cityList(); form.elements.city.focus();});
  function applyForm() {
    const keys=['country','city','from','to','adults','children','party'];
    for(const key of keys) form.elements[key].setCustomValidity('');
    const result=applyTripDetails(store,draft,Object.fromEntries(keys.map(k=>[k,form.elements[k].value])));
    if(result.error) {form.elements[result.field].setCustomValidity(result.error);form.elements[result.field].reportValidity();status(result.error);return false;}
    if(!form.reportValidity())return false;
    save();
    draft=result.draft;syncForm();return true;
  }
  form.addEventListener('submit', e => {
    e.preventDefault();if(!applyForm())return;
    render(); status('Trip updated and saved on this device.');
  });
  form.addEventListener('input',e=>e.target.setCustomValidity?.(''));
  form.elements.city.addEventListener('input',()=>form.elements.city.setCustomValidity(''));
  form.elements.to.addEventListener('input',()=>form.elements.to.setCustomValidity(''));
  for (const key of ['from','to','adults','children','party']) form.elements[key].addEventListener('change',()=>{
    const values = Object.fromEntries(['from','to','adults','children','party'].map(k=>[k,form.elements[k].value]));
    const badDates = values.from && values.to && values.to < values.from;
    form.elements.to.setCustomValidity(badDates ? 'Choose an end date on or after the start date.' : '');
    if (badDates || !form.elements.adults.checkValidity() || !form.elements.children.checkValidity()) {status('Check your dates and passenger numbers.'); return;}
    draft=updateDetails(draft,values); render(); status('Trip details saved.');
  });
  host.addEventListener('click',async e=>{
    const step = e.target.closest('[data-builder-goto]');
    if (step) {if(!applyForm())return;draft=normaliseDraft({...draft,step:step.dataset.builderGoto}); render(true); return;}
    if (e.target.closest('[data-builder-skip]')) {
      const current=draft.step,idx=BUILDER_STEPS.findIndex(([id])=>id===current);
      if(!applyForm())return;
      draft=stepProgress(draft,current,'skipped'); draft.step=BUILDER_STEPS[idx+1][0]; render(true); return;
    }
    if (e.target.closest('[data-builder-finish]')) {if(!applyForm())return;render(); status('Your plan is saved. Come back on this device to carry on.'); return;}
    const near=e.target.closest('[data-builder-near]');
    if (near) {
      near.disabled=true; status('Finding the closest city…');
      try {
        const [best]=nearestCities(await locate(),1), city=CITY_PAGES.find(c=>c[0]===best.slug);
        save(); draft=switchDestination(store,draft,city[2],city[1].replace(/^the /,'')); syncForm(); render(); status('Planning '+draft.city+'. Your location stays on this device.');
      } catch {status('Location is unavailable. Choose a country and city above.');}
      finally {near.disabled=false;}
    }
  });
  host.addEventListener('change',e=>{
    const option=e.target.closest('[data-builder-option]');
    if (option) {draft=chooseOption(draft,option.dataset.builderStep,option.dataset.builderOption,option.checked); render(); status('Option saved to your plan.');}
    if (e.target.matches('[data-builder-confirm]')) {draft=stepProgress(draft,draft.step,e.target.checked?'confirmed':'planned',{visitorConfirmed:e.target.checked}); render(); status('Your booking status has been updated.');}
  });
  window.addEventListener('storage',e=>{if(e.key==='tb-my-trip')render();});
  window.addEventListener('pageshow',()=>render());
  syncForm(); render();
}

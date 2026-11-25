// Account cards keep supplier bookings separate from tickets issued by TicketBunker.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function externalBookingUrl(value) {
 try {const u=new URL(String(value||''));return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')?u.href:'';}catch{return '';}
}
export function partnerBookingStatus(booking) {
 if(booking.status==='provider_confirmed'&&booking.verificationSource==='provider')return {label:'Confirmed by supplier',note:'Booking confirmed by the supplier. Use their ticket for entry.',className:'supplier-confirmed'};
 if(booking.status==='cancelled'&&booking.verificationSource==='provider')return {label:'Cancelled by supplier',note:'Check your supplier account for the latest booking and refund information.',className:'supplier-cancelled'};
 if(booking.status==='customer_added')return {label:'Added by you',note:'Not verified by the supplier. Your original ticket and their terms apply.',className:'customer-added'};
 return {label:'Booking unconfirmed',note:'Saved for later. Add your confirmation after buying.',className:'unconfirmed'};
}
export function renderPartnerBooking(booking) {
 const canEdit=!['provider_confirmed','cancelled'].includes(booking.status);
 const id=esc(booking.id),supplier=esc(booking.providerName||'External supplier'),status=partnerBookingStatus(booking),url=externalBookingUrl(booking.bookingUrl);
 const date=Date.parse(booking.startsAt);const when=Number.isFinite(date)?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'UTC'}).format(date):'Date not added';
 return `<article class="ticket-card partner-booking-card" data-partner-booking="${id}"><div class="poster partner-poster" aria-hidden="true"><span>PARTNER</span><b>BOOKING</b></div><div class="booking-details"><div class="booking-badges"><span class="booking-kind partner-kind">Partner booking</span><span class="status-tag ${status.className}">${esc(status.label)}</span></div><h2>${esc(booking.title||'Partner booking')}</h2><p class="booking-supplier">Booking provider: <strong>${supplier}</strong></p><p>${esc(when)}${booking.venue?' · '+esc(booking.venue):''}</p>${booking.bookingReference?`<p>Supplier reference: <strong>${esc(booking.bookingReference)}</strong></p>`:''}<p class="booking-status-note">${esc(status.note)}</p>${booking.hasDocument?`<p class="booking-document">Confirmation saved${booking.documentName?' · '+esc(booking.documentName):''}</p>`:''}</div><div class="ticket-actions">${url?`<a class="primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer" data-partner-no-save>View with supplier</a>`:''}${booking.hasDocument?`<button class="secondary" type="button" data-partner-action="download" data-booking="${id}">View confirmation</button>`:''}${canEdit?`<button class="secondary" type="button" data-partner-action="edit" data-booking="${id}">Add / edit details</button>`:''}<button class="text-button" type="button" data-partner-action="remove" data-booking="${id}">Remove from account</button></div><p class="partner-responsibility">Your original supplier handles tickets, changes and refunds.${url?` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" data-partner-no-save>Open supplier booking</a>`:''}</p><p class="partner-card-message" role="status"></p></article>`;
}
export function validateConfirmationFile(file) {
 if(!file)return;
 if(file.size>2_000_000)throw Error('Choose a PDF, JPG or PNG no larger than 2 MB.');
 if(!['application/pdf','image/jpeg','image/png'].includes(file.type))throw Error('Choose a PDF, JPG or PNG confirmation.');
}
export function confirmationBase64(file) {
 validateConfirmationFile(file);
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Unable to read this file. Please choose it again.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.readAsDataURL(file);});
}

// Each async response belongs to the account that started it, even after sign-out.
export function createAccountScope(){
 let generation=0,userId=null;
 return {begin(id){generation++;userId=id;},clear(){generation++;userId=null;},snapshot(){return {generation,userId};},isCurrent(snapshot){return snapshot.generation===generation&&snapshot.userId===userId;}};
}

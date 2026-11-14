(()=>{if(document.querySelector('script[data-sb-consent-loader]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='/consent-tracking.css';document.head.append(l);const s=document.createElement('script');s.src='/consent-tracking.js';s.defer=true;s.dataset.sbConsentLoader='1';document.head.append(s)})();
const translations = {
  en: {
    home: {
      title: "Online mixing & mastering",
      intro: "Send your stems or stereo mix from anywhere. Get a release-ready track back through your private client area.",
      prices: "View prices & order",
      upload: "Upload your files",
      services: "Choose what your track needs.",
      process: "Order online, pay securely and upload your audio when you’re ready.",
      mixing: "Mixing",
      mixingCopy: "Send your stems for a balanced mix with clarity, depth and impact.",
      mixingLink: "View mixing packages →",
      mastering: "Mastering",
      masteringCopy: "Send your finished stereo mix for a master ready to distribute.",
      masteringLink: "Order mastering →",
      both: "Mix + master",
      bothCopy: "Go from individual stems to a finished master in one order.",
      bothLink: "View mix + master packages →",
      order: "Order a mix or master",
      contact: "Contact",
      questions: "Questions about your track?",
      support: "Ask about a mix, a master, file uploads or an existing booking.",
      account: "Client area",
    },
    form: { service: "Service", name: "Full name", email: "Email", phone: "Phone", nif: "NIF / tax number", terms: "I accept the booking terms.", total: "Order total", due: "Due now", pay: "Continue to secure payment", loading: "Opening secure payment…", invalid: "Please complete the required fields.", error: "Payment could not be opened. Please try again.", unavailable: "No services are currently available." },
  },
  pt: {
    home: {
      title: "Mistura e masterização online",
      intro: "Envie as suas pistas ou mistura estéreo de onde estiver. Receba a faixa pronta para lançamento na sua área de cliente.",
      prices: "Ver preços e encomendar",
      upload: "Enviar ficheiros",
      services: "Escolha o que a sua faixa precisa.",
      process: "Encomende online, pague em segurança e envie o áudio quando estiver pronto.",
      mixing: "Mistura",
      mixingCopy: "Envie as suas pistas para uma mistura equilibrada, com clareza, profundidade e impacto.",
      mixingLink: "Ver opções de mistura →",
      mastering: "Masterização",
      masteringCopy: "Envie a sua mistura estéreo final para obter um master pronto a distribuir.",
      masteringLink: "Encomendar masterização →",
      both: "Mistura + master",
      bothCopy: "Passe das pistas individuais ao master final numa só encomenda.",
      bothLink: "Ver opções de mistura + master →",
      order: "Encomendar mistura ou masterização",
      contact: "Contacto",
      questions: "Tem dúvidas sobre a sua faixa?",
      support: "Fale connosco sobre misturas, masters, envio de ficheiros ou uma reserva existente.",
      account: "Área de cliente",
    },
    form: { service: "Serviço", name: "Nome completo", email: "Email", phone: "Telefone", nif: "NIF", terms: "Aceito os termos de reserva.", total: "Total da encomenda", due: "A pagar agora", pay: "Continuar para pagamento seguro", loading: "A abrir o pagamento seguro…", invalid: "Preencha os campos obrigatórios.", error: "Não foi possível abrir o pagamento. Tente novamente.", unavailable: "Atualmente não há serviços disponíveis." },
  },
  fr: {
    home: {
      title: "Mixage et mastering en ligne",
      intro: "Envoyez vos pistes ou votre mix stéréo où que vous soyez. Recevez votre morceau prêt à sortir dans votre espace client.",
      prices: "Voir les tarifs et commander",
      upload: "Envoyer vos fichiers",
      services: "Choisissez ce dont votre morceau a besoin.",
      process: "Commandez en ligne, payez en toute sécurité et envoyez votre audio quand vous êtes prêt.",
      mixing: "Mixage",
      mixingCopy: "Envoyez vos pistes pour un mix équilibré, clair et percutant.",
      mixingLink: "Voir les formules de mixage →",
      mastering: "Mastering",
      masteringCopy: "Envoyez votre mix stéréo final pour obtenir un master prêt à distribuer.",
      masteringLink: "Commander un mastering →",
      both: "Mixage + mastering",
      bothCopy: "Passez des pistes individuelles au master final en une seule commande.",
      bothLink: "Voir les formules de mixage + mastering →",
      order: "Commander un mixage ou un mastering",
      contact: "Contact",
      questions: "Des questions sur votre morceau ?",
      support: "Contactez-nous pour un mix, un master, un transfert de fichiers ou une réservation existante.",
      account: "Espace client",
    },
    form: { service: "Prestation", name: "Nom complet", email: "E-mail", phone: "Téléphone", nif: "Numéro fiscal", terms: "J’accepte les conditions de réservation.", total: "Total de la commande", due: "À payer maintenant", pay: "Accéder au paiement sécurisé", loading: "Ouverture du paiement sécurisé…", invalid: "Remplissez les champs obligatoires.", error: "Impossible d’ouvrir le paiement. Réessayez.", unavailable: "Aucune prestation disponible pour le moment." },
  },
  de: {
    home: {
      title: "Online-Mixing und Mastering",
      intro: "Sende deine Einzelspuren oder deinen Stereomix von überall. Den fertigen Track erhältst du in deinem privaten Kundenbereich.",
      prices: "Preise ansehen und bestellen",
      upload: "Dateien hochladen",
      services: "Wähle, was dein Track braucht.",
      process: "Bestelle online, bezahle sicher und lade deine Dateien hoch, sobald du bereit bist.",
      mixing: "Mixing",
      mixingCopy: "Sende uns deine Einzelspuren für einen klaren, ausgewogenen Mix mit Tiefe und Druck.",
      mixingLink: "Mixing-Pakete ansehen →",
      mastering: "Mastering",
      masteringCopy: "Sende deinen fertigen Stereomix für ein Master, das bereit für die Veröffentlichung ist.",
      masteringLink: "Mastering bestellen →",
      both: "Mix + Master",
      bothCopy: "Von den Einzelspuren zum fertigen Master in einer Bestellung.",
      bothLink: "Mixing- und Mastering-Pakete ansehen →",
      order: "Mixing oder Mastering bestellen",
      contact: "Kontakt",
      questions: "Fragen zu deinem Track?",
      support: "Schreib uns zu Mixing, Mastering, Datei-Uploads oder einer bestehenden Buchung.",
      account: "Kundenbereich",
    },
  },
};

const sessions = [
  {id:"mix-12",group:"mixing",price:125,deposit:125,noSlot:true,fullPayment:true,names:{en:"Mixing · up to 12 channels",pt:"Mistura · até 12 canais",fr:"Mixage · jusqu’à 12 pistes",de:"Mixing · bis 12 Kanäle"}},
  {id:"mix-24",group:"mixing",price:185,deposit:185,noSlot:true,fullPayment:true,names:{en:"Mixing · up to 24 channels",pt:"Mistura · até 24 canais",fr:"Mixage · jusqu’à 24 pistes",de:"Mixing · bis 24 Kanäle"}},
  {id:"mix-48",group:"mixing",price:270,deposit:270,noSlot:true,fullPayment:true,names:{en:"Mixing · up to 48 channels",pt:"Mistura · até 48 canais",fr:"Mixage · jusqu’à 48 pistes",de:"Mixing · bis 48 Kanäle"}},
  {id:"master",group:"mixing",price:75,deposit:75,noSlot:true,fullPayment:true,names:{en:"Mastering",pt:"Masterização",fr:"Mastering",de:"Mastering"}},
  {id:"mixmaster-12",group:"mixing",price:185,deposit:185,noSlot:true,fullPayment:true,names:{en:"Mix + master · up to 12 channels",pt:"Mistura + master · até 12 canais",fr:"Mix + master · jusqu’à 12 pistes",de:"Mix + Master · bis 12 Kanäle"}},
  {id:"mixmaster-24",group:"mixing",price:245,deposit:245,noSlot:true,fullPayment:true,names:{en:"Mix + master · up to 24 channels",pt:"Mistura + master · até 24 canais",fr:"Mix + master · jusqu’à 24 pistes",de:"Mix + Master · bis 24 Kanäle"}},
  {id:"mixmaster-48",group:"mixing",price:335,deposit:335,noSlot:true,fullPayment:true,names:{en:"Mix + master · up to 48 channels",pt:"Mistura + master · até 48 canais",fr:"Mix + master · jusqu’à 48 pistes",de:"Mix + Master · bis 48 Kanäle"}}
];

const form = document.querySelector('#booking-form');
const serviceSelect = form?.elements.service;
const submit = form?.querySelector('button[type=submit]');
const formStatus = document.querySelector('#form-status');
const requestedService = new URLSearchParams(location.search).get('service');
let currentLanguage = 'en';
let pricesLoaded = false;
let checkoutPending = false;
let promoTimer;
let promoSequence = 0;
let supabaseSdkPromise;

function getText(key) {
  const [section, label] = key.split('.');
  return translations[currentLanguage]?.[section]?.[label] ?? translations.en[section]?.[label];
}

function applyLanguage(language) {
  const supported = [...document.querySelectorAll('.lang')].map(button => button.dataset.lang);
  currentLanguage = supported.includes(language) ? language : 'en';
  document.documentElement.lang = currentLanguage;
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const value = getText(element.dataset.i18n);
    if (value) element.textContent = value;
  });
  document.querySelectorAll('.lang').forEach(button => {
    const active = button.dataset.lang === currentLanguage;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (form) renderServices();
}

function renderServices(selected = serviceSelect.value || requestedService) {
  const available = sessions.filter(item => item.enabled !== false);
  const options = available.map(item => new Option(
    `${item.names[currentLanguage]} — €${item.price}`, item.id
  ));
  serviceSelect.replaceChildren(...(options.length ? options : [new Option(getText('form.unavailable'), '')]));
  if (available.some(item => item.id === selected)) serviceSelect.value = selected;
  updateTotals();
}

function updateTotals() {
  const item = sessions.find(entry => entry.id === serviceSelect.value && entry.enabled !== false);
  document.querySelector('#session-total').textContent = item ? `€${item.price}` : '—';
  document.querySelector('#deposit-total').textContent = item ? `€${item.deposit}` : '—';
  submit.disabled = !pricesLoaded || !item || checkoutPending;
  schedulePromoQuote();
}

function loadSupabaseSdk() {
  if (window.supabase) return Promise.resolve();
  if (!supabaseSdkPromise) {
    supabaseSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = resolve;
      script.onerror = () => {
        supabaseSdkPromise = null;
        reject(new Error('Unable to load booking sign-in'));
      };
      document.head.append(script);
    });
  }
  return supabaseSdkPromise;
}

async function bookingBearer() {
  await loadSupabaseSdk();
  const cfg = await fetch('/api/supabase-config').then(response => response.json());
  if (!cfg.url || !cfg.key) return '';
  const auth = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
  const { data: { session } } = await auth.auth.getSession();
  return session?.access_token || '';
}

function schedulePromoQuote() {
  clearTimeout(promoTimer);
  const code = form.elements.promoCode.value.trim();
  const sequence = ++promoSequence;
  const status = document.querySelector('#promoStatus');
  status.textContent = '';
  if (!code || !serviceSelect.value || !pricesLoaded) return;
  promoTimer = setTimeout(async () => {
    status.textContent = 'Checking VIP code…';
    try {
      const bearer = await bookingBearer().catch(() => '');
      const response = await fetch('/api/discount-quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
        body: JSON.stringify({ service: serviceSelect.value, email: form.elements.email.value, code }),
      });
      const data = await response.json();
      if (sequence !== promoSequence) return;
      if (!response.ok) throw new Error(data.error || 'Code not available');
      document.querySelector('#session-total').textContent = `€${Number(data.total).toFixed(2)}`;
      document.querySelector('#deposit-total').textContent = `€${Number(data.due).toFixed(2)}`;
      status.textContent = `${data.code} applied · €${Number(data.discount).toFixed(2)} off the order total.`;
    } catch (error) {
      if (sequence === promoSequence) status.textContent = error.message;
    }
  }, 350);
}

async function loadLiveServices() {
  try {
    const response = await fetch('/api/services', { cache: 'no-store' });
    if (!response.ok) throw new Error('Service prices are temporarily unavailable');
    const { services } = await response.json();
    for (const local of sessions) {
      const item = services.find(entry => entry.id === local.id);
      local.enabled = item?.enabled === true;
      const price = document.querySelector(`[data-mix-price="${local.id}"]`);
      const card = document.querySelector(`[data-mix-card="${local.id}"]`);
      if (item) {
        local.price = item.price;
        local.deposit = item.deposit;
        if (price) price.textContent = `€${Number(item.price).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
      }
      if (card) card.hidden = !local.enabled;
    }
    pricesLoaded = true;
    renderServices();
  } catch (error) {
    formStatus.textContent = error.message;
  }
}

document.querySelectorAll('.lang').forEach(button => button.addEventListener('click', () => {
  localStorage.setItem('sb-language', button.dataset.lang);
  applyLanguage(button.dataset.lang);
}));
const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();
applyLanguage(localStorage.getItem('sb-language') || navigator.language.slice(0, 2));

if (form) {
  document.querySelectorAll('[data-service]').forEach(link =>
    link.addEventListener('click', () => renderServices(link.dataset.service))
  );
  serviceSelect.addEventListener('change', updateTotals);
  form.elements.promoCode.addEventListener('input', updateTotals);
  form.elements.email.addEventListener('change', updateTotals);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    if (!form.reportValidity()) {
      formStatus.textContent = getText('form.invalid');
      return;
    }
    checkoutPending = true;
    submit.disabled = true;
    formStatus.textContent = getText('form.loading');
    const payload = Object.fromEntries(new FormData(form));
    payload.language = currentLanguage;
    try {
      const bearer = await bookingBearer().catch(() => '');
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || getText('form.error'));
      location.assign(data.url);
    } catch (error) {
      checkoutPending = false;
      updateTotals();
      formStatus.textContent = error.message || getText('form.error');
    }
  });
  loadLiveServices();
}

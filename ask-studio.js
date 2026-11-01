// "Ask the Studio" chat button and panel. Answers come from /api/ask-studio.
(() => {
 if (document.querySelector('.ask-studio')) return;
 const copy = {
  en: { open: 'Ask the studio', title: 'Ask the studio', status: 'AI assistant · replies in any language', hello: 'Hi! Ask me anything about recording, prices, availability, parties or gift vouchers. If you need a person, I can pass you to the team.', placeholder: 'Type your question…', send: 'Send', close: 'Close chat', whatsapp: 'Continue on WhatsApp', thinking: 'Thinking…', error: 'Sorry, something went wrong. Please try again or message us on WhatsApp.', note: 'Answers are AI-generated. Bookings and payments happen on the booking form.' },
  pt: { open: 'Pergunte ao estúdio', title: 'Pergunte ao estúdio', status: 'Assistente IA · responde em qualquer língua', hello: 'Olá! Pergunte-me sobre gravações, preços, disponibilidade, festas ou vales-oferta. Se precisar de uma pessoa, passo-o à equipa.', placeholder: 'Escreva a sua pergunta…', send: 'Enviar', close: 'Fechar chat', whatsapp: 'Continuar no WhatsApp', thinking: 'A pensar…', error: 'Desculpe, algo correu mal. Tente novamente ou fale connosco no WhatsApp.', note: 'Respostas geradas por IA. Reservas e pagamentos são feitos no formulário de reserva.' },
  fr: { open: 'Demandez au studio', title: 'Demandez au studio', status: 'Assistant IA · répond dans toutes les langues', hello: 'Bonjour ! Posez-moi vos questions sur les enregistrements, les prix, les disponibilités, les fêtes ou les bons cadeaux. Si besoin, je vous mets en contact avec l’équipe.', placeholder: 'Écrivez votre question…', send: 'Envoyer', close: 'Fermer le chat', whatsapp: 'Continuer sur WhatsApp', thinking: 'Réflexion…', error: 'Désolé, une erreur est survenue. Réessayez ou écrivez-nous sur WhatsApp.', note: 'Réponses générées par IA. Les réservations et paiements se font via le formulaire.' },
  de: { open: 'Frag das Studio', title: 'Frag das Studio', status: 'KI-Assistent · antwortet in jeder Sprache', hello: 'Hallo! Frag mich alles zu Aufnahmen, Preisen, freien Terminen, Partys oder Gutscheinen. Wenn du eine Person brauchst, leite ich dich ans Team weiter.', placeholder: 'Deine Frage…', send: 'Senden', close: 'Chat schließen', whatsapp: 'Weiter auf WhatsApp', thinking: 'Denke nach…', error: 'Entschuldigung, da ist etwas schiefgelaufen. Bitte versuch es erneut oder schreib uns auf WhatsApp.', note: 'Antworten sind KI-generiert. Buchungen und Zahlungen laufen über das Buchungsformular.' },
 };
 const text = () => copy[(document.documentElement.lang || navigator.language || 'en').slice(0, 2)] || copy.en;
 const store = (area, key, value) => { try { if (value === undefined) return window[area].getItem(key); window[area].setItem(key, value); } catch { return null; } };
 let chatId = store('localStorage', 'sb-ask-studio-id');
 if (!chatId) { chatId = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-zA-Z0-9-]/g, ''); store('localStorage', 'sb-ask-studio-id', chatId); }
 let transcript = []; try { transcript = JSON.parse(store('sessionStorage', 'sb-ask-studio-log') || '[]'); } catch { transcript = []; }

 const root = document.createElement('div');
 root.className = 'ask-studio';
 root.innerHTML = `<button class="ask-studio-launcher" type="button" aria-expanded="false" aria-controls="ask-studio-panel"><span class="ask-studio-dot" aria-hidden="true"></span><span class="ask-studio-launch-label"></span></button>
<section class="ask-studio-panel" id="ask-studio-panel" role="dialog" aria-label="" hidden>
<header><div><strong class="ask-studio-title"></strong><small class="ask-studio-status"></small></div><button class="ask-studio-close" type="button"><span aria-hidden="true">×</span></button></header>
<div class="ask-studio-log" aria-live="polite"></div>
<form class="ask-studio-form"><label class="ask-studio-sr" for="ask-studio-input"></label><textarea id="ask-studio-input" rows="1" maxlength="1500" required></textarea><button type="submit" class="ask-studio-send"></button></form>
<p class="ask-studio-note"></p></section>`;
 document.body.append(root);
 const [launcher, panel, log, form, input] = ['.ask-studio-launcher', '.ask-studio-panel', '.ask-studio-log', '.ask-studio-form', 'textarea'].map(s => root.querySelector(s));

 function label() {
  const t = text();
  root.querySelector('.ask-studio-launch-label').textContent = t.open;
  root.querySelector('.ask-studio-title').textContent = t.title;
  root.querySelector('.ask-studio-status').textContent = t.status;
  root.querySelector('.ask-studio-close').setAttribute('aria-label', t.close);
  root.querySelector('.ask-studio-sr').textContent = t.placeholder;
  root.querySelector('.ask-studio-send').textContent = t.send;
  root.querySelector('.ask-studio-note').textContent = t.note;
  panel.setAttribute('aria-label', t.title);
  input.placeholder = t.placeholder;
 }
 function bubble(role, body, whatsappUrl) {
  const item = document.createElement('div');
  item.className = `ask-studio-msg ask-studio-${role}`;
  // Plain text with web addresses turned into links (never HTML from the reply).
  String(body).split(/(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)])/).forEach((part, index) => {
   if (index % 2) { const link = document.createElement('a'); link.href = part; link.textContent = part; if (!part.startsWith(location.origin)) { link.target = '_blank'; link.rel = 'noopener'; } item.append(link); }
   else item.append(part);
  });
  if (whatsappUrl) {
   const link = document.createElement('a');
   link.href = whatsappUrl; link.target = '_blank'; link.rel = 'noopener'; link.className = 'ask-studio-whatsapp'; link.textContent = text().whatsapp;
   item.append(document.createElement('br'), link);
  }
  log.append(item);
  log.scrollTop = log.scrollHeight;
  return item;
 }
 function render() {
  log.replaceChildren();
  bubble('assistant', text().hello);
  transcript.forEach(entry => bubble(entry.role, entry.body, entry.whatsappUrl));
 }
 function setOpen(open) {
  panel.hidden = !open;
  launcher.setAttribute('aria-expanded', String(open));
  root.classList.toggle('is-open', open);
  if (open) { render(); input.focus(); } else launcher.focus();
 }
 launcher.addEventListener('click', () => setOpen(panel.hidden));
 root.querySelector('.ask-studio-close').addEventListener('click', () => setOpen(false));
 document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) setOpen(false); });
 input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });
 input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
 form.addEventListener('submit', async event => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message || form.classList.contains('is-busy')) return;
  input.value = ''; input.style.height = 'auto';
  transcript.push({ role: 'client', body: message });
  bubble('client', message);
  form.classList.add('is-busy');
  const waiting = bubble('assistant ask-studio-waiting', text().thinking);
  let entry;
  try {
   const response = await fetch('/api/ask-studio', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chatId, message }) });
   const data = await response.json();
   entry = { role: 'assistant', body: data.reply || data.error || text().error, whatsappUrl: data.whatsappUrl };
  } catch { entry = { role: 'assistant', body: text().error, whatsappUrl: 'https://wa.me/351964895908' }; }
  waiting.remove();
  transcript.push(entry);
  transcript = transcript.slice(-40);
  store('sessionStorage', 'sb-ask-studio-log', JSON.stringify(transcript));
  bubble(entry.role, entry.body, entry.whatsappUrl);
  form.classList.remove('is-busy');
  input.focus();
 });
 new MutationObserver(() => { label(); if (!panel.hidden) render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
 label();
})();

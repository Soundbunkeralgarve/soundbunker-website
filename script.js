(()=>{if(document.querySelector('script[data-sb-consent-loader]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='/consent-tracking.css';document.head.append(l);const s=document.createElement('script');s.src='/consent-tracking.js';s.defer=true;s.dataset.sbConsentLoader='1';document.head.append(s)})();
const translations = {
  en: {
    home: {
      moveTitle: "SoundBunker is relocating.",
      moveCopy: "Studio recording, parties and voice-over are suspended until the new year.",
      heroEyebrow: "SoundBunker Algarve · Remote services",
      heroTitle: "Your sound, made real.",
      heroCopy: "Online mixing and mastering, one-to-one tuition, music production and remixes with Lofty.",
      explore: "Explore online services",
      orderMix: "Order a mix or master",
      proof1: "25+ years’ experience",
      proof2: "Release-ready sound",
      proof3: "Prices include VAT",
      mixing: "Mixing & mastering",
      tuition: "One-to-one online tuition",
      plugins: "Plug-ins",
      shop: "Merch shop",
      introEyebrow: "Built for artists",
      introTitle: "A serious studio without the attitude.",
      introCopy: "SoundBunker Algarve brings over 25 years of production, mixing and mastering experience to your project. Send a finished track or bring a rough idea to work on with Lofty, wherever you are.",
      serviceEyebrow: "SoundBunker services",
      serviceTitle: "Make music with us, wherever you are.",
      mixingCopy: "Send your stems or stereo mix and get release-ready audio back through your client area.",
      mixLink: "See prices and order",
      tuitionCopy: "Learn production live with Lofty over Zoom. Bring your own project or start a track from scratch.",
      tuitionLink: "Explore online tuition",
      production: "Music production",
      productionCopy: "Work remotely with Lofty to turn a demo, voice note or rough idea into a finished track.",
      productionLink: "Explore music production",
      remixes: "Remixes",
      remixCopy: "Commission a Lofty remix built around your track, reference sounds and release plans.",
      remixLink: "Explore remixes",
      packageTitle: "Your idea. Your sound. Your release.",
      packageCopy: "Bring a bare idea, a demo or a track that needs a new direction. Work with Lofty online on the arrangement, sound design and production, or send stems for a remix.",
      planTitle: "Tell Lofty what you’re making.",
      planCopy: "Share a demo, a couple of references and your target release date. Choose a production package or get in touch about a custom brief.",
      lessonTitle: "Make your next track with Lofty.",
      lessonCopy: "Get hands-on help over Zoom with arrangement, sound design or mixing. Work on your own music in Cubase or Logic and focus on the skills you want to build.",
      selectedClients: "Selected brands and productions",
      reviewsEyebrow: "Google reviews",
      reviewsTitle: "Hear it from the people we work with.",
      reviewsCopy: "Explore verified reviews or share your SoundBunker experience.",
      reviewsLink: "View Google reviews",
      bookTitle: "Let’s get to work.",
      bookCopy: "Order mixing, mastering or original song production online. Get in touch for tuition or a custom brief.",
      enquire: "Enquire about tuition, production or remixes",
      upload: "Upload files to the client area",
      contact: "Contact",
      contactTitle: "Talk to SoundBunker.",
      contactCopy: "Get in touch about a project, an existing booking or your files.",
      client: "Client area",
      redeem: "Redeem a voucher",
    },
    remote: {
      orderTitle: "Order original song production",
      title: "Music production, tuition & remixes",
      lead: "Work directly with Steve “Lofty” Liddle, wherever you make music.",
      lessonMode: "Live over Zoom",
      lessonCopy: "Make progress on your own music in a private screen-sharing session with Lofty. Learn arrangement, drum programming, sound design or mixing in Cubase or Logic. Bring an unfinished track or start from scratch.",
      lessonBrief: "Tell us which DAW you use, where you’re at and what you want to learn. We’ll agree a time and price by email.",
      lessonCta: "Enquire about tuition",
      productionCopy: "Send a demo, a voice note or a work in progress. Lofty can build a track around your idea or help finish the arrangement and production you’ve already started.",
      productionBrief: "Send a private link, a couple of references and your deadline. We’ll agree the work, deliverables and price before starting.",
      productionCta: "Discuss your production",
      remixCopy: "Commission a Lofty remix for your release. Send the original track, available stems and a few references for the sound you want.",
      remixBrief: "Tell us your release schedule and what versions you need so we can quote for the brief.",
      remixCta: "Request a remix quote",
      listen: "Listen to Lofty on Spotify",
      orderCopy: "Choose the payment plan or pay in full. Lofty will get in touch by email to go through your brief and arrange the remote sessions.",
      orderAudio: "Upload any demos, references and vocal takes you already have through the client area.",
      contact: "Email or WhatsApp to arrange a lesson or discuss a project. For mixing and mastering, you can order online.",
    },
    form: { service: "Service", name: "Full name", email: "Email", phone: "Phone", nif: "NIF / tax number", terms: "I accept the booking terms.", total: "Order total", due: "Due now", pay: "Continue to secure payment", loading: "Opening secure payment…", invalid: "Please complete the required fields.", error: "Payment could not be opened. Please try again.", unavailable: "No services are currently available." },
  },
  pt: {
    home: {
      heroEyebrow: "SoundBunker Algarve · Serviços à distância",
      heroTitle: "O seu som ganha vida.",
      heroCopy: "Mistura e masterização online, aulas individuais, produção musical e remixes com Lofty.",
      explore: "Explorar serviços online",
      orderMix: "Encomendar mistura ou masterização",
      moveTitle: "O SoundBunker está a mudar de instalações.",
      moveCopy: "Gravação em estúdio, festas e voz-off estão suspensos até ao novo ano.",
      proof1: "Mais de 25 anos de experiência",
      proof2: "Som pronto para lançamento",
      proof3: "Preços com IVA incluído",
      mixing: "Mistura e masterização",
      mixingCopy: "Envie as suas pistas ou a mistura estéreo. Receba os ficheiros prontos para lançamento na sua área de cliente.",
      mixLink: "Ver preços e encomendar",
      tuition: "Aulas individuais online",
      tuitionCopy: "Aprenda produção musical ao vivo com Lofty no Zoom. Traga o seu projeto ou comece uma faixa do zero.",
      tuitionLink: "Explorar aulas online",
      production: "Produção musical",
      productionCopy: "Trabalhe à distância com Lofty para transformar uma demo, uma nota de voz ou uma ideia numa faixa acabada.",
      productionLink: "Explorar produção musical",
      remixes: "Remixes",
      remixCopy: "Encomende um remix de Lofty pensado para a sua faixa, as referências e o lançamento.",
      remixLink: "Explorar remixes",
      plugins: "Plug-ins",
      shop: "Loja SoundBunker",
      introEyebrow: "Pensado para artistas",
      introTitle: "Um estúdio a sério, sem pretensões.",
      introCopy: "O SoundBunker Algarve traz mais de 25 anos de experiência em produção, mistura e masterização ao seu projeto. Envie uma faixa pronta ou trabalhe uma ideia com Lofty, esteja onde estiver.",
      serviceEyebrow: "Serviços SoundBunker",
      serviceTitle: "Faça música connosco, onde quer que esteja.",
      packageTitle: "A sua ideia. O seu som. O seu lançamento.",
      packageCopy: "Traga uma ideia, uma demo ou uma faixa que precise de um novo rumo. Trabalhe online com Lofty no arranjo, design de som e produção, ou envie as pistas para um remix.",
      planTitle: "Conte ao Lofty o que está a criar.",
      planCopy: "Partilhe uma demo, algumas referências e a data de lançamento prevista. Escolha um pacote de produção ou contacte-nos sobre um projeto personalizado.",
      lessonTitle: "Faça a sua próxima faixa com Lofty.",
      lessonCopy: "Receba ajuda prática pelo Zoom com arranjos, design de som ou mistura. Trabalhe na sua música em Cubase ou Logic e concentre-se no que quer aprender.",
      selectedClients: "Alguns dos clientes e projetos do SoundBunker",
      reviewsEyebrow: "Avaliações Google",
      reviewsTitle: "A opinião de quem trabalha connosco.",
      reviewsCopy: "Veja avaliações verificadas ou partilhe a sua experiência com o SoundBunker.",
      reviewsLink: "Ver avaliações Google",
      bookTitle: "Vamos trabalhar.",
      bookCopy: "Encomende online a mistura, a masterização ou a produção de uma música original. Contacte-nos para aulas ou projetos personalizados.",
      enquire: "Perguntar sobre aulas, produção ou remixes",
      upload: "Enviar ficheiros para a área de cliente",
      contact: "Contacto",
      contactTitle: "Fale com o SoundBunker.",
      contactCopy: "Contacte-nos sobre um projeto, uma reserva existente ou os seus ficheiros.",
      client: "Área de cliente",
      redeem: "Usar um vale",
    },
    remote: {
      title: "Produção musical, aulas e remixes",
      lead: "Trabalhe diretamente com Steve “Lofty” Liddle, onde quer que faça música.",
      lessonMode: "Em direto pelo Zoom",
      lessonCopy: "Avance com a sua música numa sessão privada com partilha de ecrã com Lofty. Aprenda arranjos, programação de bateria, design de som ou mistura em Cubase ou Logic. Traga uma faixa por acabar ou comece do zero.",
      lessonBrief: "Diga-nos que DAW usa, qual o seu nível e o que quer aprender. Combinamos o horário e o preço por email.",
      lessonCta: "Perguntar sobre aulas",
      productionCopy: "Envie uma demo, uma nota de voz ou um trabalho em curso. Lofty pode criar uma faixa a partir da sua ideia ou ajudar a terminar o arranjo e a produção que já começou.",
      productionBrief: "Envie um link privado, algumas referências e o seu prazo. Combinamos o trabalho, os ficheiros a entregar e o preço antes de começar.",
      productionCta: "Falar sobre a sua produção",
      orderTitle: "Encomendar a produção de uma música original",
      orderCopy: "Escolha o pagamento faseado ou pague na totalidade. O Lofty entrará em contacto por email para falar sobre o projeto e marcar as sessões online.",
      orderAudio: "Envie demos, referências e gravações de voz que já tenha através da área de cliente.",
      remixCopy: "Encomende um remix de Lofty para o seu lançamento. Envie a faixa original, as pistas disponíveis e algumas referências para o som que procura.",
      remixBrief: "Indique a data de lançamento e as versões de que precisa para prepararmos o orçamento.",
      remixCta: "Pedir orçamento para um remix",
      listen: "Ouvir Lofty no Spotify",
      contact: "Escreva por email ou WhatsApp para marcar uma aula ou falar sobre um projeto. Pode encomendar mistura e masterização online.",
    },
    form: { service: "Serviço", name: "Nome completo", email: "Email", phone: "Telefone", nif: "NIF", terms: "Aceito os termos de reserva.", total: "Total da encomenda", due: "A pagar agora", pay: "Continuar para pagamento seguro", loading: "A abrir o pagamento seguro…", invalid: "Preencha os campos obrigatórios.", error: "Não foi possível abrir o pagamento. Tente novamente.", unavailable: "Atualmente não há serviços disponíveis." },
  },
  fr: {
    home: {
      heroEyebrow: "SoundBunker Algarve · Prestations à distance",
      heroTitle: "Donnez vie à votre son.",
      heroCopy: "Mixage et mastering en ligne, cours individuels, production musicale et remixes avec Lofty.",
      explore: "Découvrir les services en ligne",
      orderMix: "Commander un mixage ou un mastering",
      moveTitle: "SoundBunker déménage.",
      moveCopy: "L’enregistrement en studio, les fêtes et la voix off sont suspendus jusqu’à la nouvelle année.",
      proof1: "Plus de 25 ans d’expérience",
      proof2: "Un son prêt à sortir",
      proof3: "Prix TTC",
      mixing: "Mixage et mastering",
      mixingCopy: "Envoyez vos pistes ou votre mix stéréo et retrouvez vos fichiers prêts à sortir dans votre espace client.",
      mixLink: "Voir les tarifs et commander",
      tuition: "Cours individuels en ligne",
      tuitionCopy: "Apprenez la production musicale en direct avec Lofty sur Zoom. Apportez votre projet ou créez un morceau de zéro.",
      tuitionLink: "Découvrir les cours en ligne",
      production: "Production musicale",
      productionCopy: "Travaillez à distance avec Lofty pour transformer une démo, une note vocale ou une idée en morceau abouti.",
      productionLink: "Découvrir la production musicale",
      remixes: "Remixes",
      remixCopy: "Commandez un remix signé Lofty en fonction de votre morceau, de vos références et de votre projet de sortie.",
      remixLink: "Découvrir les remixes",
      plugins: "Plug-ins",
      shop: "Boutique SoundBunker",
      introEyebrow: "Pensé pour les artistes",
      introTitle: "Un studio sérieux, sans prétention.",
      introCopy: "SoundBunker Algarve met plus de 25 ans d’expérience en production, mixage et mastering au service de votre projet. Envoyez un morceau terminé ou travaillez une idée avec Lofty, où que vous soyez.",
      serviceEyebrow: "Les services SoundBunker",
      serviceTitle: "Faites de la musique avec nous, où que vous soyez.",
      packageTitle: "Votre idée. Votre son. Votre sortie.",
      packageCopy: "Apportez une idée, une démo ou un morceau à réinventer. Travaillez en ligne avec Lofty sur l’arrangement, la création sonore et la production, ou envoyez vos pistes pour un remix.",
      planTitle: "Parlez de votre projet à Lofty.",
      planCopy: "Partagez votre démo, quelques références et la date de sortie prévue. Choisissez une formule de production ou contactez-nous pour un projet sur mesure.",
      lessonTitle: "Créez votre prochain morceau avec Lofty.",
      lessonCopy: "Travaillez sur vos arrangements, votre création sonore ou votre mix sur Zoom. Utilisez vos propres projets dans Cubase ou Logic et concentrez-vous sur ce que vous souhaitez apprendre.",
      selectedClients: "Quelques clients et projets SoundBunker",
      reviewsEyebrow: "Avis Google",
      reviewsTitle: "L’avis des personnes qui travaillent avec nous.",
      reviewsCopy: "Découvrez des avis vérifiés ou partagez votre expérience avec SoundBunker.",
      reviewsLink: "Voir les avis Google",
      bookTitle: "Au travail.",
      bookCopy: "Commandez en ligne un mixage, un mastering ou la production d’un titre original. Contactez-nous pour les cours ou les projets sur mesure.",
      enquire: "Demander des informations sur les cours, la production ou les remixes",
      upload: "Envoyer des fichiers dans l’espace client",
      contact: "Contact",
      contactTitle: "Contactez SoundBunker.",
      contactCopy: "Écrivez-nous au sujet d’un projet, d’une réservation ou de vos fichiers.",
      client: "Espace client",
      redeem: "Utiliser un bon",
    },
    remote: {
      title: "Production musicale, cours et remixes",
      lead: "Travaillez directement avec Steve « Lofty » Liddle, où que vous fassiez de la musique.",
      lessonMode: "En direct sur Zoom",
      lessonCopy: "Avancez sur votre musique lors d’une séance privée avec partage d’écran avec Lofty. Travaillez l’arrangement, la programmation de batterie, la création sonore ou le mixage dans Cubase ou Logic. Apportez un morceau en cours ou partez de zéro.",
      lessonBrief: "Indiquez votre logiciel, votre niveau et ce que vous souhaitez apprendre. Nous conviendrons d’un horaire et d’un tarif par e-mail.",
      lessonCta: "Se renseigner sur les cours",
      productionCopy: "Envoyez une démo, une note vocale ou un morceau en cours. Lofty peut créer un titre à partir de votre idée ou vous aider à terminer l’arrangement et la production que vous avez commencés.",
      productionBrief: "Envoyez un lien privé, quelques références et votre échéance. Nous convenons du travail, des livrables et du tarif avant de commencer.",
      productionCta: "Parler de votre production",
      orderTitle: "Commander la production d’un titre original",
      orderCopy: "Choisissez le paiement échelonné ou réglez la totalité. Lofty vous contactera par e-mail pour parler de votre projet et organiser les séances à distance.",
      orderAudio: "Envoyez vos démos, vos références et vos prises de voix existantes depuis l’espace client.",
      remixCopy: "Commandez un remix signé Lofty pour votre sortie. Envoyez le morceau original, les pistes disponibles et quelques références pour le son recherché.",
      remixBrief: "Indiquez votre calendrier de sortie et les versions souhaitées pour obtenir un devis.",
      remixCta: "Demander un devis pour un remix",
      listen: "Écouter Lofty sur Spotify",
      contact: "Écrivez-nous par e-mail ou WhatsApp pour organiser un cours ou parler de votre projet. Le mixage et le mastering se commandent en ligne.",
    },
    form: { service: "Prestation", name: "Nom complet", email: "E-mail", phone: "Téléphone", nif: "Numéro fiscal", terms: "J’accepte les conditions de réservation.", total: "Total de la commande", due: "À payer maintenant", pay: "Accéder au paiement sécurisé", loading: "Ouverture du paiement sécurisé…", invalid: "Remplissez les champs obligatoires.", error: "Impossible d’ouvrir le paiement. Réessayez.", unavailable: "Aucune prestation disponible pour le moment." },
  },
  de: {
    home: {
      heroEyebrow: "SoundBunker Algarve · Online-Angebote",
      heroTitle: "Dein Sound nimmt Form an.",
      heroCopy: "Online-Mixing und Mastering, Einzelunterricht, Musikproduktion und Remixe mit Lofty.",
      explore: "Online-Angebote ansehen",
      orderMix: "Mix oder Master bestellen",
      moveTitle: "SoundBunker zieht um.",
      moveCopy: "Studioaufnahmen, Partys und Voice-over pausieren bis ins neue Jahr.",
      proof1: "Über 25 Jahre Erfahrung",
      proof2: "Sound für deine Veröffentlichung",
      proof3: "Preise inklusive MwSt.",
      mixing: "Mixing und Mastering",
      mixingCopy: "Schicke deine Einzelspuren oder deinen Stereomix. Die fertigen Dateien erhältst du in deinem Kundenbereich.",
      mixLink: "Preise ansehen und bestellen",
      tuition: "Online-Einzelunterricht",
      tuitionCopy: "Lerne Musikproduktion live mit Lofty über Zoom. Bring dein Projekt mit oder starte einen neuen Track.",
      tuitionLink: "Online-Unterricht ansehen",
      production: "Musikproduktion",
      productionCopy: "Arbeite online mit Lofty und entwickle aus einem Demo, einer Sprachnotiz oder einer Idee einen fertigen Track.",
      productionLink: "Musikproduktion ansehen",
      remixes: "Remixe",
      remixCopy: "Lass Lofty einen Remix zu deinem Track, deinen Referenzen und deinen Release-Plänen produzieren.",
      remixLink: "Remixe ansehen",
      plugins: "Plug-ins",
      shop: "SoundBunker-Shop",
      introEyebrow: "Für Künstlerinnen und Künstler",
      introTitle: "Ein professionelles Studio ohne Allüren.",
      introCopy: "SoundBunker Algarve bringt über 25 Jahre Erfahrung in Produktion, Mixing und Mastering in dein Projekt ein. Schicke einen fertigen Track oder entwickle eine Idee mit Lofty, wo auch immer du bist.",
      serviceEyebrow: "SoundBunker-Angebote",
      serviceTitle: "Mach mit uns Musik, wo auch immer du bist.",
      packageTitle: "Deine Idee. Dein Sound. Dein Release.",
      packageCopy: "Bring eine Idee, ein Demo oder einen Track mit, der eine neue Richtung braucht. Arbeite online mit Lofty an Arrangement, Sounddesign und Produktion oder schicke deine Einzelspuren für einen Remix.",
      planTitle: "Erzähl Lofty von deinem Projekt.",
      planCopy: "Schick ein Demo, ein paar Referenzen und deinen geplanten Veröffentlichungstermin. Wähle ein Produktionspaket oder melde dich mit einem individuellen Projekt.",
      lessonTitle: "Produziere deinen nächsten Track mit Lofty.",
      lessonCopy: "Arbeite über Zoom an Arrangement, Sounddesign oder Mixing. Nutze deine eigene Musik in Cubase oder Logic und konzentriere dich auf das, was du lernen willst.",
      selectedClients: "Ausgewählte Kunden und Projekte von SoundBunker",
      reviewsEyebrow: "Google-Bewertungen",
      reviewsTitle: "Das sagen die Menschen, mit denen wir arbeiten.",
      reviewsCopy: "Lies verifizierte Bewertungen oder teile deine Erfahrungen mit SoundBunker.",
      reviewsLink: "Google-Bewertungen ansehen",
      bookTitle: "Legen wir los.",
      bookCopy: "Bestelle Mixing, Mastering oder die Produktion eines eigenen Songs online. Melde dich für Unterricht oder ein individuelles Projekt.",
      enquire: "Unterricht, Produktion oder Remix anfragen",
      upload: "Dateien im Kundenbereich hochladen",
      contact: "Kontakt",
      contactTitle: "Sprich mit SoundBunker.",
      contactCopy: "Melde dich zu einem Projekt, einer bestehenden Buchung oder deinen Dateien.",
      client: "Kundenbereich",
      redeem: "Gutschein einlösen",
    },
    remote: {
      title: "Musikproduktion, Unterricht und Remixe",
      lead: "Arbeite direkt mit Steve „Lofty“ Liddle, wo auch immer du Musik machst.",
      lessonMode: "Live über Zoom",
      lessonCopy: "Bring deine Musik in einer privaten Sitzung mit Lofty und Bildschirmfreigabe voran. Lerne Arrangement, Drum-Programmierung, Sounddesign oder Mixing in Cubase oder Logic. Bring einen unfertigen Track mit oder fange bei null an.",
      lessonBrief: "Sag uns, welche DAW du nutzt, wie viel Erfahrung du hast und was du lernen möchtest. Termin und Preis stimmen wir per E-Mail ab.",
      lessonCta: "Unterricht anfragen",
      productionCopy: "Schick ein Demo, eine Sprachnotiz oder einen unfertigen Track. Lofty entwickelt aus deiner Idee einen Track oder hilft dir, das Arrangement und die Produktion fertigzustellen.",
      productionBrief: "Schick einen privaten Link, ein paar Referenzen und deinen Zeitplan. Wir stimmen Arbeit, Lieferumfang und Preis vorab mit dir ab.",
      productionCta: "Deine Produktion besprechen",
      orderTitle: "Produktion eines eigenen Songs bestellen",
      orderCopy: "Wähle Ratenzahlung oder bezahle den vollen Betrag. Lofty meldet sich per E-Mail, um dein Projekt zu besprechen und die Online-Termine zu vereinbaren.",
      orderAudio: "Lade vorhandene Demos, Referenzen und Gesangsaufnahmen im Kundenbereich hoch.",
      remixCopy: "Beauftrage Lofty mit einem Remix für deinen Release. Schick den Originaltrack, die verfügbaren Einzelspuren und ein paar Referenzen für den gewünschten Sound.",
      remixBrief: "Nenne uns den geplanten Veröffentlichungstermin und die gewünschten Versionen, damit wir einen Preis anbieten können.",
      remixCta: "Angebot für einen Remix anfragen",
      listen: "Lofty auf Spotify hören",
      contact: "Schreib uns per E-Mail oder WhatsApp für einen Unterrichtstermin oder ein Projekt. Mixing und Mastering kannst du direkt online bestellen.",
    },
  },
};

const bookingLabels = {
  en: { notes: 'Project notes / references', promo: 'VIP discount code (optional)', termsLink: 'Terms', date: 'Date', time: 'Start time',
    pricesLoading: 'Loading services…', chooseDate: 'Choose a date first', checkingTimes: 'Checking availability…', chooseTime: 'Choose a time', noTimes: 'No times available' },
  pt: { notes: 'Notas e referências do projeto', promo: 'Código VIP (opcional)', termsLink: 'Termos', date: 'Data', time: 'Hora de início',
    pricesLoading: 'A carregar serviços…', chooseDate: 'Escolha primeiro uma data', checkingTimes: 'A verificar disponibilidade…', chooseTime: 'Escolha uma hora', noTimes: 'Não há horários disponíveis' },
  fr: { notes: 'Notes et références du projet', promo: 'Code VIP (facultatif)', termsLink: 'Conditions', date: 'Date', time: 'Heure de début',
    pricesLoading: 'Chargement des prestations…', chooseDate: 'Choisissez d’abord une date', checkingTimes: 'Vérification des disponibilités…', chooseTime: 'Choisissez une heure', noTimes: 'Aucun créneau disponible' },
  de: { notes: 'Projektnotizen und Referenzen', promo: 'VIP-Rabattcode (optional)', termsLink: 'Bedingungen', service: 'Leistung', name: 'Vollständiger Name',
    email: 'E-Mail', phone: 'Telefon', nif: 'Steuernummer', terms: 'Ich akzeptiere die Buchungsbedingungen.', total: 'Gesamtbetrag', due: 'Jetzt fällig',
    pay: 'Weiter zur sicheren Zahlung', loading: 'Sichere Zahlung wird geöffnet…', invalid: 'Bitte fülle alle Pflichtfelder aus.', unavailable: 'Derzeit sind keine Angebote verfügbar.', pricesLoading: 'Angebote werden geladen…' },
};

const sessionNames = [
  {id:"mix-12",group:"mixing",price:125,deposit:125,noSlot:true,fullPayment:true,names:{en:"Mixing · up to 12 channels",pt:"Mistura · até 12 canais",fr:"Mixage · jusqu’à 12 pistes",de:"Mixing · bis 12 Kanäle"}},
  {id:"mix-24",group:"mixing",price:185,deposit:185,noSlot:true,fullPayment:true,names:{en:"Mixing · up to 24 channels",pt:"Mistura · até 24 canais",fr:"Mixage · jusqu’à 24 pistes",de:"Mixing · bis 24 Kanäle"}},
  {id:"mix-48",group:"mixing",price:270,deposit:270,noSlot:true,fullPayment:true,names:{en:"Mixing · up to 48 channels",pt:"Mistura · até 48 canais",fr:"Mixage · jusqu’à 48 pistes",de:"Mixing · bis 48 Kanäle"}},
  {id:"master",group:"mixing",price:75,deposit:75,noSlot:true,fullPayment:true,names:{en:"Mastering",pt:"Masterização",fr:"Mastering",de:"Mastering"}},
  {id:"mixmaster-12",group:"mixing",price:185,deposit:185,noSlot:true,fullPayment:true,names:{en:"Mix + master · up to 12 channels",pt:"Mistura + master · até 12 canais",fr:"Mix + master · jusqu’à 12 pistes",de:"Mix + Master · bis 12 Kanäle"}},
  {id:"mixmaster-24",group:"mixing",price:245,deposit:245,noSlot:true,fullPayment:true,names:{en:"Mix + master · up to 24 channels",pt:"Mistura + master · até 24 canais",fr:"Mix + master · jusqu’à 24 pistes",de:"Mix + Master · bis 24 Kanäle"}},
  {id:"mixmaster-48",group:"mixing",price:335,deposit:335,noSlot:true,fullPayment:true,names:{en:"Mix + master · up to 48 channels",pt:"Mistura + master · até 48 canais",fr:"Mix + master · jusqu’à 48 pistes",de:"Mix + Master · bis 48 Kanäle"}},
  {id:"production",names:{en:"Original song production · Payment plan",pt:"Produção de música original · Pagamento faseado",fr:"Production d’un titre original · Paiement échelonné",de:"Produktion eines eigenen Songs · Ratenzahlung"}},
  {id:"production-upfront",names:{en:"Original song production · Pay in full",pt:"Produção de música original · Pagamento integral",fr:"Production d’un titre original · Paiement intégral",de:"Produktion eines eigenen Songs · Vollständige Zahlung"}},
  {id:"photo-mini",names:{en:"Photography Mini · 30 min",pt:"Fotografia Mini · 30 min",fr:"Photo Mini · 30 min"}},
  {id:"photo-signature",names:{en:"Photography Signature · 1 hour",pt:"Fotografia Signature · 1 hora",fr:"Photo Signature · 1 heure"}},
  {id:"photo-premium",names:{en:"Photography Premium · 90 min",pt:"Fotografia Premium · 90 min",fr:"Photo Premium · 90 min"}},
  {id:"photo-branding",names:{en:"Business branding photography",pt:"Fotografia para empresas",fr:"Photo pour entreprises"}},
];

const form = document.querySelector('#booking-form');
const serviceSelect = form?.elements.service;
const submit = form?.querySelector('button[type=submit]');
const formStatus = document.querySelector('#form-status');
const dateInput = form?.elements.date;
const timeSelect = form?.elements.time;
const serviceGroup = document.body.dataset.servicePage || 'mixing';
const requestedService = new URLSearchParams(location.search).get('service');
let sessions = serviceGroup === 'mixing' ? sessionNames.filter(item => item.group === 'mixing') : [];
let currentLanguage = 'en';
let pricesLoaded = false;
let checkoutPending = false;
let availabilityRequest;
let promoTimer;
let promoSequence = 0;
let supabaseSdkPromise;

function getText(key) {
  const [section, label] = key.split('.');
  if (section === 'form') {
    return translations[currentLanguage].form?.[label] ?? bookingLabels[currentLanguage]?.[label]
      ?? translations.en.form[label] ?? bookingLabels.en[label];
  }
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
    `${item.names?.[currentLanguage] || item.name} — €${item.price}`, item.id
  ));
  const emptyMessage = pricesLoaded ? 'form.unavailable' : 'form.pricesLoading';
  serviceSelect.replaceChildren(...(options.length ? options : [new Option(getText(emptyMessage), '')]));
  if (available.some(item => item.id === selected)) serviceSelect.value = selected;
  updateTotals();
}

function updateTotals() {
  const item = sessions.find(entry => entry.id === serviceSelect.value && entry.enabled !== false);
  document.querySelector('#session-total').textContent = item ? `€${item.price}` : '—';
  document.querySelector('#deposit-total').textContent = item ? `€${item.deposit}` : '—';
  submit.disabled = !pricesLoaded || !item || checkoutPending || Boolean(dateInput && !timeSelect.value);
  schedulePromoQuote();
}

async function loadAvailability() {
  availabilityRequest?.abort();
  const controller = new AbortController();
  availabilityRequest = controller;
  timeSelect.replaceChildren(new Option(getText('form.chooseDate'), ''));
  timeSelect.disabled = true;
  updateTotals();
  if (!dateInput.value || !serviceSelect.value || !pricesLoaded) return;
  timeSelect.options[0].textContent = getText('form.checkingTimes');
  try {
    const query = new URLSearchParams({ date: dateInput.value, service: serviceSelect.value });
    const response = await fetch('/api/availability?' + query, { signal: controller.signal });
    if (!response.ok) throw new Error('Availability is temporarily unavailable');
    const { slots } = await response.json();
    if (controller.signal.aborted) return;
    timeSelect.options[0].textContent = getText(slots.length ? 'form.chooseTime' : 'form.noTimes');
    for (const time of slots) timeSelect.add(new Option(time, time));
    timeSelect.disabled = !slots.length;
  } catch (error) {
    if (!controller.signal.aborted) timeSelect.options[0].textContent = error.message;
  }
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
    sessions = services.filter(item => item.group === serviceGroup).map(item => ({
      ...item, names: sessionNames.find(label => label.id === item.id)?.names,
    }));
    for (const card of document.querySelectorAll('[data-mix-card]')) {
      const item = sessions.find(entry => entry.id === card.dataset.mixCard);
      card.hidden = item?.enabled !== true;
      const price = card.querySelector('[data-mix-price]');
      if (item && price) price.textContent = `€${Number(item.price).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
    }
    pricesLoaded = true;
    renderServices();
    if (dateInput?.value) loadAvailability();
  } catch (error) {
    if (!sessions.length) serviceSelect.options[0].textContent = getText('form.unavailable');
    formStatus.textContent = error.message;
  }
}

async function loadGoogleReviews() {
  const list = document.querySelector('#reviewHighlights');
  if (!list) return;
  try {
    const response = await fetch('/api/google-reviews');
    if (!response.ok) return;
    const data = await response.json();
    if (!data.configured) return;
    if (data.rating != null && Number.isFinite(Number(data.rating))) {
      document.querySelector('#googleRating').textContent = `${Number(data.rating).toFixed(1)} ★`;
    }
    if (data.reviewCount != null && Number.isFinite(Number(data.reviewCount))) {
      document.querySelector('#googleReviewCount').textContent = `${data.reviewCount} Google reviews`;
    }
    const reviews = data.reviews.filter(review => !/\b(?:the\s+)?hub[\s-]+(?:culture|academy)\b|\bthehubculture\b/i.test(review.text));
    if (!reviews.length) return;
    for (const review of reviews) {
      const card = document.createElement('article');
      card.className = 'review-card';
      const stars = document.createElement('span');
      stars.className = 'stars';
      stars.setAttribute('aria-label', '5 out of 5 stars');
      stars.textContent = '★★★★★';
      const quote = document.createElement('p');
      quote.textContent = review.text;
      const footer = document.createElement('footer');
      footer.textContent = `${review.author} · Google review`;
      card.append(stars, quote, footer);
      list.append(card);
    }
    list.hidden = false;
  } catch {
    // The link to SoundBunker's Google reviews remains available.
  }
}

document.querySelectorAll('.lang').forEach(button => button.addEventListener('click', () => {
  localStorage.setItem('sb-language', button.dataset.lang);
  applyLanguage(button.dataset.lang);
}));
const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();
applyLanguage(localStorage.getItem('sb-language') || navigator.language.slice(0, 2));
loadGoogleReviews();

if (form) {
  document.querySelectorAll('[data-service]').forEach(link =>
    link.addEventListener('click', () => renderServices(link.dataset.service))
  );
  serviceSelect.addEventListener('change', dateInput ? loadAvailability : updateTotals);
  if (dateInput) {
    dateInput.min = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(new Date());
    dateInput.addEventListener('change', loadAvailability);
    timeSelect.addEventListener('change', updateTotals);
  }
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

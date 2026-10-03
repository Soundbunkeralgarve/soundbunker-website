const menu = document.querySelector('.academy-page .menu-toggle');
const navigation = document.querySelector('#academy-navigation');
menu?.addEventListener('click', () => {
  const expanded = menu.getAttribute('aria-expanded') === 'true';
  menu.setAttribute('aria-expanded', String(!expanded));
  menu.setAttribute('aria-label', expanded ? 'Open menu' : 'Close menu');
  navigation.classList.toggle('open', !expanded);
});
navigation?.addEventListener('click', event => {
  if (event.target.closest('a')) {
    navigation.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'Open menu');
  }
});

const academyDocuments = {
  leaflet: {
    filename: 'Creative_Clubs_Leaflet.pdf',
    url: 'downloads/hub-academy/Creative_Clubs_Leaflet.pdf'
  },
  registration: {
    filename: 'Creative_Clubs_Registration_Form.pdf',
    url: 'downloads/hub-academy/Creative_Clubs_Registration_Form.pdf'
  },
  proposal: {
    filename: 'Hub_Academy_Schools_Proposal.pdf',
    url: 'downloads/hub-academy/Hub_Academy_Schools_Proposal.pdf'
  }
};

document.querySelectorAll('[data-academy-doc]').forEach(button => {
  button.addEventListener('click', () => {
    const doc = academyDocuments[button.dataset.academyDoc];
    if (!doc) return;
    const link = document.createElement('a');
    link.href = doc.url;
    link.download = doc.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  });
});

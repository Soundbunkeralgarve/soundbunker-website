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
    parts: [
      'downloads/hub-academy/leaflet-00.b64',
      'downloads/hub-academy/leaflet-01.b64',
      'downloads/hub-academy/leaflet-02.b64',
      'downloads/hub-academy/leaflet-03.b64'
    ]
  },
  registration: {
    filename: 'Creative_Clubs_Registration_Form.pdf',
    parts: [
      'downloads/hub-academy/registration-00.b64',
      'downloads/hub-academy/registration-01.b64',
      'downloads/hub-academy/registration-02.b64'
    ]
  },
  proposal: {
    filename: 'Hub_Academy_Schools_Proposal.pdf',
    parts: [
      'downloads/hub-academy/proposal-00.b64',
      'downloads/hub-academy/proposal-01.b64',
      'downloads/hub-academy/proposal-02.b64',
      'downloads/hub-academy/proposal-03.b64',
      'downloads/hub-academy/proposal-04.b64',
      'downloads/hub-academy/proposal-05.b64',
      'downloads/hub-academy/proposal-06.b64',
      'downloads/hub-academy/proposal-07.b64'
    ]
  }
};

async function downloadAcademyDocument(key, button) {
  const doc = academyDocuments[key];
  if (!doc || button.dataset.loading === 'true') return;
  const original = button.innerHTML;
  button.dataset.loading = 'true';
  button.classList.add('is-loading');
  const label = button.querySelector('em');
  if (label) label.textContent = 'Preparing PDF…';
  try {
    const chunks = await Promise.all(doc.parts.map(async part => {
      const response = await fetch(part, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Could not load ${part}`);
      return (await response.text()).trim();
    }));
    const binary = atob(chunks.join(''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    if (label) label.textContent = 'Downloaded ✓';
  } catch (error) {
    console.error(error);
    button.innerHTML = original;
    const failed = button.querySelector('em');
    if (failed) failed.textContent = 'Try again ↓';
  } finally {
    button.dataset.loading = 'false';
    button.classList.remove('is-loading');
  }
}

document.querySelectorAll('[data-academy-doc]').forEach(button => {
  button.addEventListener('click', () => downloadAcademyDocument(button.dataset.academyDoc, button));
});

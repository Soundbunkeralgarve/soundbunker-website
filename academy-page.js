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

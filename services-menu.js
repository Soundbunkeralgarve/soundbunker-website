(() => {
  const navigation = document.querySelector('#site-nav');
  const group = navigation?.querySelector('.nav-services');
  const toggle = group?.querySelector('.services-toggle');
  if (!navigation || !group || !toggle) return;
  const setOpen = open => {
    group.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Hide services menu' : 'Show services menu');
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
  document.addEventListener('click', event => { if (!group.contains(event.target)) setOpen(false); });
})();
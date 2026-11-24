// Stag & hen page: the weekend-idea links follow the city chosen in the planner.
const form = document.querySelector('[data-guide-search]');
const viator = (city, term) => 'https://www.viator.com/searchResults/all?' + new URLSearchParams({
  text: city + ' ' + term, pid: 'P00333211', mcid: '42383', medium: 'link', campaign: 'tb-groups'});
function follow() {
  const city = String(form?.elements.city.value || new URLSearchParams(location.search).get('city') || 'London').trim().slice(0, 80) || 'London';
  for (const el of document.querySelectorAll('[data-idea-city]')) el.textContent = city;
  for (const a of document.querySelectorAll('[data-idea]')) a.href = viator(city, a.dataset.idea);
}
form?.addEventListener('submit', () => setTimeout(follow));
follow();

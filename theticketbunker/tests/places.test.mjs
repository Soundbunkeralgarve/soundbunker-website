import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {countryPlaces, matchingPlaces, submittedPlace, mapDestination} from '../lib/places.js';
import {cityMapHtml} from '../lib/mapHtml.js';

test('country choice scopes both search matches and selectable map destinations', () => {
  const portugal = countryPlaces('PT');
  assert.ok(portugal.length > 1 && portugal.every(city => city.country === 'PT'));
  assert.deepEqual(matchingPlaces('London', 'PT'), []);
  assert.equal(matchingPlaces('Algarve', 'PT')[0].slug, 'algarve');
  assert.equal(mapDestination('london', 'PT'), null);
  assert.equal(mapDestination('algarve', 'PT').country, 'PT');
  assert.equal(mapDestination('javascript:alert(1)', 'PT'), null);
  assert.deepEqual(countryPlaces('XX'), []);
});

test('search uses website destination aliases and never submits an ambiguous city', () => {
  assert.equal(submittedPlace('  LONDON ', 'GB').slug, 'london');
  assert.equal(submittedPlace('alga', 'PT').slug, 'algarve');
  assert.equal(submittedPlace(' ', 'GB'), null);
  assert.ok(matchingPlaces('st', 'GB').length > 1);
  assert.equal(submittedPlace('st', 'GB'), null);
  assert.equal(submittedPlace('London', 'PT'), null);
});

function runMap(html, {available = true} = {}) {
  const state = {views: [], markers: [], messages: [], fit: null, fallback: ''};
  const map = {
    setView(at, zoom) {state.views.push({at, zoom}); return this;},
    fitBounds(points, options) {state.fit = {points, options}; return this;}
  };
  const root = {set textContent(value) {state.fallback = value;}};
  const document = {
    getElementById: () => root,
    createElement: () => ({appendChild() {}})
  };
  const L = {
    map: () => map,
    tileLayer: () => ({addTo() {}}),
    latLngBounds: points => points,
    circleMarker: (at, options) => {
      const marker = {at, options, bindPopup() {return this;}, bindTooltip(text) {this.tooltip = text; return this;},
        addTo() {state.markers.push(this); return this;}, on(event, action) {this[event] = action; return this;}, openPopup() {this.open = true; return this;}};
      return marker;
    }
  };
  const window = {ReactNativeWebView: {postMessage: slug => state.messages.push(slug)}};
  if (available) window.L = L;
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  runInNewContext(script, {L, window, document});
  return state;
}

test('country map fits only its destinations and pin taps return a selectable slug', () => {
  const cities = countryPlaces('PT'), state = runMap(cityMapHtml(cities));
  assert.deepEqual(JSON.parse(JSON.stringify(state.fit.points)), cities.map(city => city.at));
  assert.equal(state.fit.options.maxZoom, 7);
  assert.equal(state.markers.length, cities.length);
  state.markers[0].click();
  assert.deepEqual(state.messages, [cities[0].slug]);
});

test('selected destination and Near me focus the exact coordinates, with a separate location pin', () => {
  const cities = countryPlaces('PT'), city = mapDestination('algarve', 'PT');
  const selected = runMap(cityMapHtml(cities, city.at, 11, {selectedSlug: city.slug}));
  assert.deepEqual(JSON.parse(JSON.stringify(selected.views.at(-1))), {at: city.at, zoom: 11});
  assert.equal(selected.markers.find(marker => marker.open).options.radius, 10);
  assert.equal(selected.fit, null);
  const at = [37.14, -8.02], nearby = runMap(cityMapHtml(cities, at, 11, {selectedSlug: city.slug, location: at}));
  assert.deepEqual(JSON.parse(JSON.stringify(nearby.views.at(-1))), {at, zoom: 11});
  assert.deepEqual(JSON.parse(JSON.stringify(nearby.markers.at(-1).at)), at);
  assert.equal(nearby.markers.at(-1).tooltip, 'Your area');
  assert.ok(nearby.markers.every(marker => !marker.open));
});

test('map remains usable with one point, drops invalid coordinates and handles a failed map library', () => {
  const cities = [{slug: 'one', name: '</script><script>broken()</script>', at: [37, -8]}, {slug: 'bad', name: 'Invalid', at: [200, 0]}];
  const html = cityMapHtml(cities), state = runMap(html);
  assert.equal(state.markers.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(state.views.at(-1))), {at: [37, -8], zoom: 7});
  assert.ok(!html.includes('</script><script>broken()'));
  assert.match(runMap(html, {available: false}).fallback, /map couldn’t load/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {gygPlace, GYG_PLACES} from '../gyg-box.js';

test('the GetYourGuide box follows the place being browsed', () => {
  assert.equal(gygPlace({}), 'algarve');
  assert.equal(gygPlace({city: 'Lagos'}), 'algarve');
  assert.equal(gygPlace({city: 'Portimão'}), 'algarve');
  assert.equal(gygPlace({city: 'Lisbon', country: 'PT'}), 'lisbon');
  assert.equal(gygPlace({country: 'ES'}), 'barcelona');
  assert.equal(gygPlace({city: 'Sevilla'}), 'seville');
  assert.equal(gygPlace({city: 'Manchester'}), '');
  assert.equal(gygPlace({country: 'DE'}), 'berlin');
  assert.equal(gygPlace({country: 'US'}), '');
  assert.equal(gygPlace({city: 'München'}), 'munich');
  assert.equal(gygPlace({city: 'Kraków'}), 'krakow');
  assert.equal(gygPlace({city: 'Roma'}), 'rome');
  assert.equal(gygPlace({city: 'Palma de Mallorca'}), 'mallorca');
  assert.equal(Object.keys(GYG_PLACES).length, 35);
  for (const id of Object.values(GYG_PLACES)) assert.ok(Number.isInteger(id) && id > 0);
});

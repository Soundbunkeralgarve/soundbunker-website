import test from 'node:test';
import assert from 'node:assert/strict';
import {positionFix, locationContext, locationError, watchLocation} from '../get-around-location.js';

test('device coordinates keep full precision and reported accuracy', () => {
  assert.deepEqual(positionFix({coords:{latitude:37.13907123,longitude:-8.02345678,accuracy:14},timestamp:1234}),{point:[37.13907123,-8.02345678],accuracy:14,at:1234});
  assert.deepEqual(positionFix({coords:{latitude:0,longitude:0},timestamp:0}),{point:[0,0],accuracy:null,at:0});
  assert.throws(() => positionFix({coords:{latitude:91,longitude:0}}), /invalid position/);
});
test('local context follows GPS across UK/EU and leaves uncovered areas unnamed', () => {
  assert.equal(locationContext([37.139,-8.023]).slug === 'algarve' || locationContext([37.139,-8.023]).slug === 'albufeira',true);
  assert.equal(locationContext([48.8566,2.3522]).slug,'paris');
  assert.equal(locationContext([53.48,-2.24]).slug,'manchester');
  assert.deepEqual(locationContext([0,0]),{slug:null,near:false});
});
test('location tracking requests a fresh accurate fix, updates and stops cleanly', () => {
  let success, failure, options, cleared;
  const geo = {watchPosition(ok,no,o){success=ok;failure=no;options=o;return 0;},clearWatch(id){cleared=id;}};
  const fixes=[], errors=[];
  const stop=watchLocation(x=>fixes.push(x),x=>errors.push(x),{geolocation:geo});
  assert.deepEqual(options,{enableHighAccuracy:true,timeout:20000,maximumAge:0});
  success({coords:{latitude:37.1,longitude:-8,accuracy:9},timestamp:1});
  success({coords:{latitude:37.2,longitude:-8,accuracy:6},timestamp:2});
  assert.deepEqual(fixes.map(x=>x.point),[[37.1,-8],[37.2,-8]]);
  failure({code:3}); assert.equal(errors.length,1);
  stop(); assert.equal(cleared,0);
  success({coords:{latitude:0,longitude:0,accuracy:5}}); assert.equal(fixes.length,2);
});
test('denied, unavailable and timeout responses explain recovery without claiming a fix', () => {
  assert.match(locationError({code:1}), /Allow location/);
  assert.match(locationError({code:2}), /Location Services/);
  assert.match(locationError({code:3}), /took too long/);
  const errors=[]; watchLocation(()=>assert.fail('No device'),e=>errors.push(e),{geolocation:null});
  assert.match(errors[0].message,/Choose a city/);
});

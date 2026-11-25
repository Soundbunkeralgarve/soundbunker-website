import {nearestCities, distanceKm} from './city-coords.js';

// Device coordinates stay in memory; city proximity never replaces the actual position.
export function positionFix(position) {
  const {latitude, longitude, accuracy} = position?.coords || {};
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw Error('Your device returned an invalid position. Try again.');
  return {point: [latitude, longitude], accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
    at: Number.isFinite(position.timestamp) ? position.timestamp : Date.now()};
}
export function locationContext(point) {
  const near = nearestCities(point, 1)[0];
  return near && near.km <= 60 ? {slug: near.slug, near: near.km > 8} : {slug: null, near: false};
}
export function locationError(error) {
  if (error?.code === 1) return 'Location access is off. Allow location for this website in your browser settings, then try again.';
  if (error?.code === 3) return 'Finding your position took too long. Try again outdoors or choose a city below.';
  return error?.message && !error?.code ? error.message : 'Your device could not find your position. Check Location Services and try again, or choose a city below.';
}
export function watchLocation(onPosition, onError, {geolocation = globalThis.navigator?.geolocation} = {}) {
  if (!geolocation) { onError(Error('This browser cannot share your position. Choose a city below.')); return () => {}; }
  const options = {enableHighAccuracy: true, timeout: 20000, maximumAge: 0};
  let stopped = false;
  const success = p => { if (stopped) return; try { onPosition(positionFix(p)); } catch (e) { onError(e); } };
  const failure = e => { if (!stopped) onError(e); };
  if (typeof geolocation.watchPosition !== 'function') {
    geolocation.getCurrentPosition(success, failure, options);
    return () => { stopped = true; };
  }
  const id = geolocation.watchPosition(success, failure, options);
  return () => { stopped = true; geolocation.clearWatch(id); };
}
export const movedMetres = (a, b) => a && b ? distanceKm(a, b) * 1000 : Infinity;

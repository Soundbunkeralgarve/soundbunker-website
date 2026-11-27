// The city map, drawn the same way as the site's (Leaflet + OpenStreetMap tiles) so it
// works on iPhone, iPad and Android without a maps API key. Tapping a pin selects that city.
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
export function cityMapHtml(cities, centre = null, zoom = 11, {selectedSlug = '', location = null} = {}) {
  const point = at => Array.isArray(at) && at.length === 2 && at.every(Number.isFinite) && Math.abs(at[0]) <= 90 && Math.abs(at[1]) <= 180;
  const pins = cities.filter(c => point(c.at)).map(c => [c.slug, c.name, c.at[0], c.at[1]]);
  const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
  const focused = point(centre) ? centre : null, nearby = point(location) ? location : null;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="${LEAFLET}leaflet.min.css">
<style>html,body,#m{margin:0;height:100%;background:#07070b}.leaflet-popup-content-wrapper{background:#101018;color:#f4f6f8;border-radius:18px}
.leaflet-popup-tip{background:#101018}.pop{font:700 17px -apple-system,Roboto,sans-serif;color:#00e0a6;padding:6px 2px;display:block;border:0;background:none}
.pop span{display:block;color:#f4f6f8;font-weight:400;font-size:14px;margin-top:4px}</style></head><body><div id="m"></div>
<script src="${LEAFLET}leaflet.min.js"></script><script>
if(!window.L){document.getElementById('m').textContent='The map couldn’t load. You can still search and choose a destination.';}
else {
const pins=${json(pins)}, focused=${json(focused)}, nearby=${json(nearby)}, selected=${json(selectedSlug)};
const map=L.map('m',{zoomControl:true,minZoom:3,maxZoom:13}).setView([50,6],4);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
for(const [slug,name,lat,lng] of pins){
 const b=document.createElement('button');b.className='pop';b.textContent=name;
 const hint=document.createElement('span');hint.textContent='Choose this destination →';b.appendChild(hint);
 b.onclick=()=>window.ReactNativeWebView.postMessage(slug);
 const marker=L.circleMarker([lat,lng],{radius:selected===slug?10:7,color:'#04140d',weight:2,fillColor:'#00e0a6',fillOpacity:.95}).bindPopup(b).addTo(map);
 marker.on('click',()=>window.ReactNativeWebView.postMessage(slug));
 if(selected===slug&&!nearby)marker.openPopup();
}
if(focused)map.setView(focused,${Math.max(3, Math.min(13, Number(zoom) || 11))});
else if(pins.length===1)map.setView(pins[0].slice(2),7);
else if(pins.length)map.fitBounds(L.latLngBounds(pins.map(p=>p.slice(2))),{padding:[24,24],maxZoom:7});
if(nearby)L.circleMarker(nearby,{radius:9,weight:3,color:'#fff',fillColor:'#00e0a6',fillOpacity:1}).bindTooltip('Your area').addTo(map);
}
</script></body></html>`;
}

// The city map, drawn the same way as the site's (Leaflet + OpenStreetMap tiles) so it
// works on iPhone, iPad and Android without a maps API key. Tapping a pin opens that city.
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
export function cityMapHtml(cities, centre = [50, 6], zoom = 4) {
  const pins = cities.filter(c => c.at).map(c => [c.slug, c.name, c.at[0], c.at[1]]);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="${LEAFLET}leaflet.min.css">
<style>html,body,#m{margin:0;height:100%;background:#07070b}.leaflet-popup-content-wrapper{background:#101018;color:#f4f6f8;border-radius:18px}
.leaflet-popup-tip{background:#101018}.pop{font:700 17px -apple-system,Roboto,sans-serif;color:#00e0a6;padding:6px 2px;display:block;border:0;background:none}
.pop span{display:block;color:#f4f6f8;font-weight:400;font-size:14px;margin-top:4px}</style></head><body><div id="m"></div>
<script src="${LEAFLET}leaflet.min.js"></script><script>
const pins=${JSON.stringify(pins)};
const map=L.map('m',{zoomControl:true,minZoom:3,maxZoom:12}).setView(${JSON.stringify(centre)},${Number(zoom) || 4});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
for(const [slug,name,lat,lng] of pins){
 const b=document.createElement('button');b.className='pop';b.innerHTML=name.replace(/[&<>]/g,'')+'<span>See everything on →</span>';
 b.onclick=()=>window.ReactNativeWebView.postMessage(slug);
 L.circleMarker([lat,lng],{radius:8,color:'#04140d',weight:2,fillColor:'#00e0a6',fillOpacity:.95}).bindPopup(b).addTo(map);
}
</script></body></html>`;
}

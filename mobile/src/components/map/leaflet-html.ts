/** Leaflet + OpenStreetMap page rendered in a WebView on phones (no Google Maps key needed).
 *  The page exposes window.sahUpdate(data) for live updates and posts {lat,lng} back when the pin moves. */
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';

export function leafletPage(mode: 'live' | 'pick'): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="${LEAFLET}/leaflet.css">
<style>html,body,#m{height:100%;margin:0;background:#E5E7EB}.leaflet-control-attribution{font-size:9px}</style>
</head><body><div id="m"></div>
<script src="${LEAFLET}/leaflet.js"></script>
<script>
var MODE='${mode}', map=L.map('m',{zoomControl:true,attributionControl:true}).setView([36.81,10.17],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
function dot(c,s,label){var b=label?'<span style="position:absolute;left:'+(s+4)+'px;top:50%;transform:translateY(-50%);white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;background:'+c+';color:#fff;font:600 11px system-ui,sans-serif;padding:2px 6px;border-radius:999px">'+label+'</span>':'';
  return L.divIcon({className:'',iconSize:[s,s],iconAnchor:[s/2,s/2],html:'<div style="position:relative;width:'+s+'px;height:'+s+'px;border-radius:50%;background:'+c+';border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">'+b+'</div>'});}
function post(o){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(o));}
var layers={}, fitted='';
function set(name,ll,icon,opts){if(!ll){if(layers[name]){map.removeLayer(layers[name]);delete layers[name];}return;}
  if(layers[name]){layers[name].setLatLng(ll);if(icon)layers[name].setIcon(icon);}else{layers[name]=L.marker(ll,Object.assign({icon:icon},opts||{})).addTo(map);}}
window.sahUpdate=function(d){
  if(MODE==='live'){
    if(layers.route)map.removeLayer(layers.route);
    if(d.route&&d.route.length>1)layers.route=L.polyline(d.route.map(function(p){return[p.lat,p.lng]}),{color:d.colors.route,weight:4,opacity:.8}).addTo(map);
    set('hospital',[d.hospital.lat,d.hospital.lng],dot(d.colors.hospital,18,d.hospital.name));
    set('patient',d.patient?[d.patient.lat,d.patient.lng]:null,dot(d.colors.patient,16,d.labels.you));
    set('ambulance',d.ambulance?[d.ambulance.lat,d.ambulance.lng]:null,dot(d.colors.ambulance,20,d.labels.ambulance),{zIndexOffset:1000});
    var key=(d.patient?d.patient.lat+','+d.patient.lng:'')+'|'+(d.route||[]).length;
    if(key!==fitted){fitted=key;var pts=[[d.hospital.lat,d.hospital.lng]];if(d.patient)pts.push([d.patient.lat,d.patient.lng]);if(d.ambulance)pts.push([d.ambulance.lat,d.ambulance.lng]);(d.route||[]).forEach(function(p){pts.push([p.lat,p.lng])});
      if(pts.length>1)map.fitBounds(L.latLngBounds(pts),{padding:[36,36]});else map.setView(pts[0],14);}
  } else {
    var ll=[d.lat,d.lng];
    if(!layers.you){layers.you=L.marker(ll,{icon:dot(d.color,20,d.label),draggable:true}).addTo(map);
      layers.you.on('dragend',function(e){var p=e.target.getLatLng();post({lat:p.lat,lng:p.lng});});
      map.on('click',function(e){post({lat:e.latlng.lat,lng:e.latlng.lng});});}
    else layers.you.setLatLng(ll);
    if(layers.acc)map.removeLayer(layers.acc);
    if(d.accuracy)layers.acc=L.circle(ll,{radius:d.accuracy,color:d.color,weight:1,fillOpacity:.12}).addTo(map);
    map.setView(ll,Math.max(map.getZoom(),15));
  }
};
post({ready:true});
</script></body></html>`;
}

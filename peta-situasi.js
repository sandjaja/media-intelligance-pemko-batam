(()=>{'use strict';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v||0);
const normName=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(kecamatan|kec\.)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const findRegion=(id,name)=>{const rows=data?.data?.regions||[];return rows.find(x=>String(x.district_id??'')===String(id??''))||rows.find(x=>normName(x.district_name)===normName(name));};
const api=async p=>{const r=await fetch(API+p,{credentials:'include',cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||j.message||('HTTP '+r.status));return j};
const viewerOnly=()=>{const r=new Set(window.MEDIA_CURRENT_USER?.roles||[]);return r.has('viewer')&&!['super_admin','humas','executive','opd','district'].some(x=>r.has(x))};
const scoped=()=>{const r=new Set(window.MEDIA_CURRENT_USER?.roles||[]);return r.has('opd')||r.has('district')};
const scopeQuery=()=>{const q=new URLSearchParams();if(scoped())return q;const op=$('opdSelect')?.value;if(op&&op!=='all')q.set('opdId',op);const d=$('districtSelect')?.value;if(d&&d!=='all')q.set('districtId',d);return q};
let data=null,selected=null,panelTab='issues',leafletMap=null,leafletLayer=null,leafletLoadPromise=null,loadVersion=0;
const icon=name=>'<i class="fa-solid fa-'+name+'" aria-hidden="true"></i>';
const rows=()=>data?.data?.regions||[];
const riskInfo=value=>{if(value==null||value===''||!Number.isFinite(Number(value)))return{label:'Belum dinilai',color:'#94a3b8',level:'unknown'};const score=Number(value);return score>=80?{label:'Sangat tinggi',color:'#ef4765',level:'critical'}:score>=60?{label:'Tinggi',color:'#fb9160',level:'high'}:score>=40?{label:'Sedang',color:'#f4ce61',level:'medium'}:score>=20?{label:'Rendah',color:'#86ca8b',level:'low'}:{label:'Aman',color:'#4db6ac',level:'safe'}};
const regionRisk=r=>{const scores=(r?.issues||[]).map(i=>i.risk_score).filter(v=>v!=null&&Number.isFinite(Number(v)));return scores.length?riskInfo(Math.max(...scores.map(Number))):{label:n(r?.active_issue_count)?'Belum dinilai':'Belum ada isu',color:'#cbd5e1',level:'unknown'}};
function destroyMap(){if(leafletMap)leafletMap.remove();leafletMap=null;leafletLayer=null;}
function loadLeaflet(){
 if(window.L)return Promise.resolve(window.L);
 if(leafletLoadPromise)return leafletLoadPromise;
 leafletLoadPromise=new Promise((resolve,reject)=>{
  if(!document.querySelector('link[data-leaflet-css]')){const l=document.createElement('link');l.rel='stylesheet';l.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';l.dataset.leafletCss='1';document.head.appendChild(l)}
  const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';const fail=m=>{s.remove();reject(Error(m))};s.onload=()=>window.L?resolve(window.L):fail('Leaflet gagal dimuat');s.onerror=()=>fail('Periksa koneksi internet lalu coba lagi.');document.head.appendChild(s);
 }).catch(e=>{leafletLoadPromise=null;throw e});return leafletLoadPromise;
}
function mapStyle(f){const p=f.properties||{},r=findRegion(p.districtId,p.districtName||p.name),on=String(selected)===String(p.districtId);return{color:on?'#1674df':'#ffffff',weight:on?3:1.2,fillColor:regionRisk(r).color,fillOpacity:on?.68:.42,opacity:.95}}
function selectRegion(id,focus=false){
 selected=String(id);panelTab='issues';renderInfo();
 leafletLayer?.setStyle(mapStyle);
 if(focus&&leafletLayer){const layers=[];leafletLayer.eachLayer(l=>{if(String(l.feature?.properties?.districtId)===selected)layers.push(l)});if(layers.length){const bounds=window.L.featureGroup(layers).getBounds();if(bounds.isValid())leafletMap.fitBounds(bounds,{padding:[35,35],maxZoom:12});layers[0].openPopup();}}
}
async function initLeaflet(){
 const node=$('leafletMap'),version=loadVersion;if(!node)return;
 try{const L=await loadLeaflet();if(version!==loadVersion||!node.isConnected||!window.__petaSituasiOpen)return;
  destroyMap();node.innerHTML='';leafletMap=L.map(node,{zoomControl:false,scrollWheelZoom:false,preferCanvas:true});
  const base=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(leafletMap);
  L.control.zoom({position:'topleft'}).addTo(leafletMap);L.control.scale({imperial:false,position:'bottomleft'}).addTo(leafletMap);
  leafletLayer=L.geoJSON(data.data.geojson,{style:mapStyle,onEachFeature:(f,layer)=>{const p=f.properties||{},r=findRegion(p.districtId,p.districtName||p.name),name=r?.district_name||p.districtName||p.name||'Kecamatan';layer.bindTooltip(esc(name),{sticky:true});layer.bindPopup('<div class="ps-popup"><b>'+esc(name)+'</b><br>'+n(r?.active_issue_count)+' isu WATCH / ACTIVE · '+esc(regionRisk(r).label)+'</div>');layer.on('click',()=>selectRegion(p.districtId));}}).addTo(leafletMap);
  const markers=L.layerGroup(),seen=new Set();leafletLayer.eachLayer(layer=>{const p=layer.feature.properties||{},id=String(p.districtId),r=findRegion(id,p.districtName||p.name);if(seen.has(id)||!n(r?.active_issue_count))return;seen.add(id);const high=n(r.high_risk_count)>0;const marker=L.marker(layer.getBounds().getCenter(),{title:r.district_name,icon:L.divIcon({className:'ps-marker-wrap',html:'<span class="ps-marker" style="background:'+regionRisk(r).color+'">'+icon(high?'exclamation':'info')+'</span>',iconSize:[28,28],iconAnchor:[14,14]})});marker.bindTooltip(esc(r.district_name));marker.on('click',()=>selectRegion(id,true));marker.addTo(markers)});markers.addTo(leafletMap);
  L.control.layers({'OpenStreetMap':base},{'Warna risiko':leafletLayer,'Penanda isu':markers},{position:'topleft'}).addTo(leafletMap);
  fitAll();setTimeout(()=>{if(version===loadVersion)leafletMap?.invalidateSize()},100);
 }catch(e){if(version!==loadVersion||!node.isConnected)return;node.innerHTML='<div class="ps-empty" role="alert">'+icon('triangle-exclamation')+'<h3>Peta belum dapat dimuat</h3><p>'+esc(e.message)+'</p><button type="button" id="petaRetryMap" class="ps-button">Coba lagi</button></div>';$('petaRetryMap')?.addEventListener('click',initLeaflet)}
}
function fitAll(){const b=leafletLayer?.getBounds();if(b?.isValid())leafletMap.fitBounds(b,{padding:[24,24]});else leafletMap?.setView([1.08,104.03],10)}
function ensureSection(){
  if(!$('petaSituasi')){const s=document.createElement('section');s.id='petaSituasi';s.className='hidden space-y-5';$('dashboard')?.parentElement?.appendChild(s);}
}
function ensureNav(){
  const tabs=$('tabs');if(!tabs||tabs.querySelector('[data-peta-situasi]'))return;
  const b=document.createElement('button');b.type='button';b.dataset.petaSituasi='1';b.className='px-3 py-2 rounded-lg border border-transparent text-xs text-slate-400 hover:text-white';b.innerHTML='<i class="fa-solid fa-map-location-dot mr-2"></i>Peta Situasi';b.onclick=openPage;const anchor=tabs.querySelector('[data-tab="highlights"]');anchor?tabs.insertBefore(b,anchor):tabs.appendChild(b);
}
function activateNav(){
  const tabs=$('tabs');if(!tabs)return;
  const on=window.__petaSituasiOpen===true;
  if(on)tabs.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  tabs.querySelectorAll('[data-peta-situasi]').forEach(b=>{
    b.classList.toggle('bg-cyan-500',on);
    b.classList.toggle('text-slate-950',on);
    b.classList.toggle('font-black',on);
    b.classList.toggle('text-slate-400',!on);
    b.classList.toggle('active',false);
  });
}
function openPage(){
  ensureSection();window.__petaSituasiOpen=true;window.rememberMediaTab?.('petaSituasi');
  document.querySelectorAll('main > section').forEach(s=>{if(s.id!=='commandCenterFilters')s.classList.add('hidden')});
  $('commandCenterFilters')?.classList.add('hidden');$('petaSituasi').classList.remove('hidden');ensureNav();activateNav();loadMap();
}
window.openMediaSituationMap=openPage;
function closePage(){window.__petaSituasiOpen=false;loadVersion++;destroyMap();$('petaSituasi')?.classList.add('hidden');activateNav();}
function patchDashboard(){
  const root=$('dashboard');if(!root)return;
  const old=root.querySelector('#ccMapExpand');
  if(old&&!old.dataset.patched){old.dataset.patched='1';old.textContent='Buka Peta Situasi';old.innerHTML='<i class="fa-solid fa-map-location-dot mr-2"></i>Buka Peta Situasi';old.onclick=openPage;old.removeAttribute('id');}
  const modal=root.querySelector('#ccMapModal');if(modal)modal.remove();
}

function clarificationCount(r){if(!data.pipeline)return null;const ids=new Set((r.issue_ids||r.issues?.map(i=>i.id)||[]).map(String));return new Set((data.pipeline.stages||[]).find(s=>s.key==='CLARIFICATION')?.items?.filter(i=>ids.has(String(i.issueId))).map(i=>String(i.issueId))||[]).size}
function issueCard(i){const risk=riskInfo(i.risk_score),status=String(i.status||'').toUpperCase();return (viewerOnly()?'<div class="ps-issue">':'<button type="button" data-map-issue="'+esc(i.id)+'" class="ps-issue">')+'<span class="ps-issue-icon" style="background:'+risk.color+'">'+icon(Number(i.risk_score)>=60?'exclamation':'info')+'</span><span class="ps-issue-body"><span class="ps-issue-heading"><strong>'+esc(i.title)+'</strong><span class="ps-badges"><span class="ps-badge '+(status==='ACTIVE'?'ps-red':'ps-amber')+'">'+esc(status)+'</span><span class="ps-badge">'+esc(risk.label)+'</span></span></span><span class="ps-issue-meta">'+icon('gauge-high')+' Risiko '+(i.risk_score==null?'belum dinilai':Math.round(Number(i.risk_score))+'/100')+'</span>'+(viewerOnly()?'':'<span class="ps-issue-link">Buka detail isu '+icon('arrow-right')+'</span>')+'</span>'+(viewerOnly()?'</div>':'</button>')}
function regionInfo(id){const r=findRegion(id);if(!r)return '<div class="ps-empty">Pilih kecamatan pada peta untuk melihat detail isu.</div>';const count=n(r.active_issue_count),clarification=clarificationCount(r);const metrics=[['WATCH',r.watch_issue_count,'Dipantau','ps-blue'],['ACTIVE',r.active_status_count,'Aktif','ps-amber'],['HIGH RISK',r.high_risk_count,'Risiko ≥ 60','ps-red'],['KLARIFIKASI',clarification,'Dalam proses','ps-amber']];
 return '<div class="ps-region-heading"><span class="ps-pin">'+icon('location-dot')+'</span><div><h3>Kecamatan '+esc(String(r.district_name).replace(/^kecamatan\s+/i,''))+'</h3><p>Kota Batam, Kepulauan Riau</p></div><span class="ps-badge ps-red">'+count+' isu WATCH / ACTIVE</span></div><div class="ps-metrics">'+metrics.map(([title,value,sub,color])=>'<div class="ps-metric '+color+'"><b>'+(value==null?'—':n(value))+'</b><strong>'+title+'</strong><small>'+sub+'</small></div>').join('')+'</div><div class="ps-tabs" role="tablist" aria-label="Detail kecamatan"><button id="psIssuesTab" role="tab" aria-selected="'+(panelTab==='issues')+'" aria-controls="psPanel" data-panel="issues">Daftar Isu</button><button id="psRegionTab" role="tab" aria-selected="'+(panelTab==='region')+'" aria-controls="psPanel" data-panel="region">Informasi Wilayah</button></div><div id="psPanel" role="tabpanel" aria-labelledby="'+(panelTab==='issues'?'psIssuesTab':'psRegionTab')+'">'+(panelTab==='issues'?'<div class="ps-list-label">3 isu teratas berdasarkan risiko</div><div class="ps-issue-list">'+((r.issues||[]).map(issueCard).join('')||'<div class="ps-empty">'+icon('circle-check')+'<p>Belum ada isu WATCH / ACTIVE di kecamatan ini.</p></div>')+'</div><p class="ps-footnote">Klik kartu untuk membuka Manajemen Isu.</p>':regionDetails(r))+'</div>';
}
function regionDetails(r){const b=data.data.boundary||{};return '<dl class="ps-details">'+[['Kecamatan',r.district_name],['Jumlah isu WATCH / ACTIVE',r.active_issue_count],['Risiko tertinggi',regionRisk(r).label],['Sumber batas wilayah',b.sourceName||b.name||'Tidak tersedia'],['Tahun sumber',b.sourceYear||'Tidak tersedia']].map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl><p class="ps-footnote">Warna wilayah mengikuti skor tertinggi dari isu WATCH / ACTIVE yang sudah dinilai. Abu-abu berarti belum ada skor risiko.</p>'}
function renderInfo(){const panel=$('petaInfo');if(panel)panel.innerHTML=regionInfo(selected);panel?.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>{panelTab=b.dataset.panel;renderInfo();$(panelTab==='issues'?'psIssuesTab':'psRegionTab')?.focus()});bindIssueButtons()}
function bindIssueButtons(){if(viewerOnly())return;$('petaSituasi')?.querySelectorAll('[data-map-issue]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.mapIssue);if(!id)return;if(typeof window.openManagementIssuePage==='function'){closePage();window.openManagementIssuePage(id)}})}
function legend(){return '<details class="ps-legend" open><summary>Legenda Risiko</summary><div class="ps-legend-content">'+[[80,'Sangat tinggi (80–100)'],[60,'Tinggi (60–79)'],[40,'Sedang (40–59)'],[20,'Rendah (20–39)'],[0,'Aman (0–19)'],[null,'Belum ada skor']].map(([v,label])=>'<div><span style="background:'+riskInfo(v).color+'"></span>'+label+'</div>').join('')+'<p>Skor tertinggi per kecamatan</p><hr><b>Penanda isu</b><div>'+icon('circle-exclamation')+' Risiko tinggi</div><div>'+icon('circle-info')+' Isu WATCH / ACTIVE</div></div></details>'}
function citywide(){const a=data?.data?.citywideIssues||[];return a.length?'<section class="ps-citywide"><h3>'+icon('city')+' Isu Tingkat Kota</h3><p>Isu yang mencakup seluruh Kota Batam.</p><div>'+a.map(issueCard).join('')+'</div></section>':''}
function renderPage(){
 ensureSection();destroyMap();const root=$('petaSituasi');if(!root)return;
 root.innerHTML='<header class="ps-header"><span class="ps-header-icon">'+icon('map-location-dot')+'</span><div><h2>PETA SITUASI WILAYAH</h2><p>Peta interaktif sebaran isu dan kondisi wilayah Kota Batam. Klik pada kecamatan untuk melihat detail isu.</p></div><button type="button" id="petaRefresh" class="ps-button">'+icon('rotate')+' Refresh</button></header>'+(data?.data?.geojson?'<div class="ps-layout"><section class="ps-map-card" aria-label="Peta situasi kecamatan"><div class="ps-search"><form id="petaSearchForm"><label for="petaSearch" class="ps-sr-only">Cari kecamatan atau isu</label>'+icon('magnifying-glass')+'<input id="petaSearch" type="search" list="petaDistrictOptions" placeholder="Cari kecamatan atau isu…"><button type="submit" aria-label="Cari">'+icon('magnifying-glass')+'</button></form><datalist id="petaDistrictOptions">'+[...new Set(rows().map(r=>r.district_name))].map(name=>'<option value="'+esc(name)+'"></option>').join('')+'</datalist><div id="petaSearchStatus" role="status"></div><div id="petaSearchResults"></div></div><div id="leafletMap"></div>'+legend()+'<button type="button" id="petaResetView" class="ps-map-reset">'+icon('expand')+' Tampilkan semua</button></section><aside id="petaInfo" class="ps-info" aria-label="Detail kecamatan"></aside></div>'+citywide():'<div class="ps-empty">'+icon('map')+'<h3>Batas wilayah belum tersedia</h3><p>Belum ada peta wilayah untuk cakupan akun atau filter yang dipilih.</p></div>');
 $('petaRefresh').onclick=loadMap;if(!data?.data?.geojson)return;if(window.matchMedia?.('(max-width:850px)').matches)root.querySelector('.ps-legend').open=false;renderInfo();initLeaflet();$('petaSearchForm').onsubmit=e=>{e.preventDefault();searchMap()};$('petaResetView').onclick=()=>{fitAll();leafletMap?.closePopup();$('petaSearch').value='';$('petaSearchStatus').textContent='Menampilkan semua kecamatan';$('petaSearchResults').innerHTML=''};
}
function searchMap(){const q=normName($('petaSearch').value),result=$('petaSearchResults'),status=$('petaSearchStatus');result.innerHTML='';if(!q){status.textContent='Masukkan nama kecamatan atau judul isu.';return}const seen=new Set();const matches=rows().filter(r=>{const id=String(r.district_id);if(seen.has(id))return false;seen.add(id);return normName(r.district_name).includes(q)||(r.issues||[]).some(i=>normName(i.title).includes(q))});const exact=matches.find(r=>normName(r.district_name)===q);if(exact||matches.length===1){const r=exact||matches[0];selectRegion(r.district_id,true);status.textContent='Menampilkan '+r.district_name;return}status.textContent=matches.length?matches.length+' kecamatan cocok. Pilih wilayah:':'Tidak ditemukan pada kecamatan atau 3 isu teratas.';result.innerHTML=matches.map(r=>'<button type="button" data-search-region="'+esc(r.district_id)+'">'+esc(r.district_name)+icon('arrow-right')+'</button>').join('');result.querySelectorAll('[data-search-region]').forEach(b=>b.onclick=()=>{selectRegion(b.dataset.searchRegion,true);result.innerHTML='';status.textContent='Menampilkan '+findRegion(b.dataset.searchRegion).district_name})}
async function loadMap(){
 if(!window.__petaSituasiOpen)return;const version=++loadVersion;destroyMap();ensureSection();const root=$('petaSituasi');root.innerHTML='<div class="ps-empty" role="status">'+icon('spinner fa-spin')+'<p>Memuat Peta Situasi…</p></div>';
 try{const q=scopeQuery(),suffix=q.toString()?'?'+q.toString():'';const [map,pipeline]=await Promise.all([api('/command-center/map'+suffix),api('/command-center/workflow-pipeline'+suffix).catch(()=>null)]);if(version!==loadVersion||!window.__petaSituasiOpen)return;data={data:map.data,pipeline};if(!rows().some(r=>String(r.district_id)===String(selected)))selected=rows().slice().sort((a,b)=>n(b.high_risk_count)-n(a.high_risk_count)||n(b.active_issue_count)-n(a.active_issue_count))[0]?.district_id??null;renderPage()}catch(e){if(version!==loadVersion||!window.__petaSituasiOpen)return;root.innerHTML='<div class="ps-empty" role="alert"><h3>Peta Situasi gagal dimuat</h3><p>'+esc(e.message)+'</p><button type="button" id="petaRetry" class="ps-button">Coba lagi</button></div>';$('petaRetry').onclick=loadMap}
}
const sheet=document.createElement('style');sheet.id='petaSituasiStyles';sheet.textContent=`
#petaSituasi{--ps-bg:#fff;--ps-text:#183153;--ps-muted:#647b96;--ps-border:#e2ebf2;--ps-soft:#f7fafc;color:var(--ps-text);font-family:inherit}
html.dark #petaSituasi{--ps-bg:#152235;--ps-text:#e3ecf7;--ps-muted:#a3b6ce;--ps-border:#304157;--ps-soft:#1c2d43}
#petaSituasi *{box-sizing:border-box}
#petaSituasi button,#petaSituasi input{font:inherit}
#petaSituasi button{cursor:pointer}
#petaSituasi button:focus-visible,#petaSituasi input:focus-visible,#petaSituasi summary:focus-visible{outline:3px solid #16a5c0;outline-offset:3px}
#petaSituasi .ps-header{display:flex;align-items:center;gap:14px;background:var(--ps-bg);border:1px solid var(--ps-border);border-radius:12px;padding:16px 18px;margin-bottom:16px}
#petaSituasi .ps-header-icon{display:grid;place-items:center;width:42px;height:42px;flex-shrink:0;border-radius:9px;background:#12a0b9;color:#fff;font-size:22px}
#petaSituasi .ps-header h2{margin:0 0 5px;color:#159bb3;font-size:16px;font-weight:800;letter-spacing:.02em}
#petaSituasi .ps-header p{margin:0;font-size:12px;line-height:1.6;color:var(--ps-muted)}
#petaSituasi .ps-button{border:1px solid var(--ps-border);background:var(--ps-bg);color:var(--ps-text);padding:10px 14px;border-radius:8px;white-space:nowrap;font-size:12px}
#petaSituasi .ps-header .ps-button{margin-left:auto}
#petaSituasi .ps-layout{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(350px,1fr);gap:16px;align-items:start}
#petaSituasi .ps-map-card{position:relative;min-width:0;isolation:isolate;border:1px solid #b5dbe5;border-radius:12px;overflow:hidden;background:#abdce7}
#petaSituasi #leafletMap{width:100%;height:clamp(610px,76vh,850px);z-index:0;background:#abdce7}
#petaSituasi .ps-search{position:absolute;top:14px;left:14px;z-index:500;width:min(340px,calc(100% - 230px))}
#petaSituasi .ps-search form{display:flex;align-items:center;gap:9px;background:var(--ps-bg);color:var(--ps-muted);border-radius:8px;padding:4px 10px;box-shadow:0 2px 8px #193b5920}
#petaSituasi .ps-search input{min-width:0;width:100%;border:0!important;background:var(--ps-bg)!important;color:var(--ps-text)!important;padding:9px 0;font-size:12px;outline-offset:0}
#petaSituasi .ps-search button{border:0;background:transparent;color:var(--ps-muted);min-width:30px;min-height:34px}
#petaSituasi #petaSearchStatus:not(:empty),#petaSituasi #petaSearchResults:not(:empty){background:var(--ps-bg);color:var(--ps-text);border-radius:6px;margin-top:5px;padding:8px;font-size:12px;line-height:1.5}
#petaSituasi #petaSearchResults{max-height:240px;overflow:auto}
#petaSituasi #petaSearchResults button{display:flex;justify-content:space-between;text-align:left;width:100%;gap:12px;padding:7px}
#petaSituasi .ps-legend{position:absolute;right:12px;top:14px;z-index:500;background:var(--ps-bg);color:var(--ps-text);box-shadow:0 2px 9px #17364b25;border-radius:9px;padding:12px 14px;width:188px;font-size:11px}
#petaSituasi .ps-legend summary{font-weight:800;cursor:pointer;font-size:12px}
#petaSituasi .ps-legend-content>div{display:flex;align-items:center;gap:9px;margin-top:11px;line-height:1.5}
#petaSituasi .ps-legend-content>div>span{width:15px;height:15px;flex-shrink:0;border-radius:50%}
#petaSituasi .ps-legend p{font-size:10px;color:var(--ps-muted);line-height:1.5;margin:12px 0}
#petaSituasi .ps-legend hr{border:0;border-top:1px solid var(--ps-border);margin:12px 0}
#petaSituasi .leaflet-top.leaflet-left{top:70px;left:4px}
#petaSituasi .ps-map-reset{position:absolute;bottom:28px;right:12px;z-index:500;border:1px solid var(--ps-border);border-radius:7px;padding:8px 10px;background:var(--ps-bg);color:var(--ps-text);font-size:11px;box-shadow:0 2px 6px #17364b20}
#petaSituasi .ps-marker{display:grid;place-items:center;width:28px;height:28px;border:2px solid white;border-radius:50%;color:#183153;box-shadow:0 2px 5px #193b5940;font-size:13px;font-weight:900}
#petaSituasi .ps-popup{font-size:12px;line-height:1.8;color:#183153}
#petaSituasi .ps-info{min-width:0;background:var(--ps-bg);border:1px solid var(--ps-border);border-radius:12px;padding:20px;box-shadow:0 3px 12px #23435a05}
#petaSituasi .ps-region-heading{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;margin-bottom:20px}
#petaSituasi .ps-pin{font-size:28px;color:#13a1b8}
#petaSituasi .ps-region-heading>div{flex:1;min-width:150px}
#petaSituasi .ps-region-heading h3{font-size:22px;font-weight:800;line-height:1.25;margin:0;overflow-wrap:anywhere}
#petaSituasi .ps-region-heading p{font-size:12px;color:var(--ps-muted);margin:5px 0 0}
#petaSituasi .ps-badge{display:inline-flex;align-items:center;align-self:flex-start;border-radius:7px;background:var(--ps-soft);color:var(--ps-muted);padding:5px 7px;font-size:10px;font-weight:700;line-height:1.3;white-space:nowrap}
#petaSituasi .ps-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:18px}
#petaSituasi .ps-metric{min-width:0;border:1px solid var(--ps-border);background:var(--ps-soft);border-radius:8px;padding:12px 8px;display:flex;flex-direction:column;gap:6px}
#petaSituasi .ps-metric b{font-size:24px;line-height:1.1}
#petaSituasi .ps-metric strong{font-size:10px;overflow-wrap:anywhere}
#petaSituasi .ps-metric small{font-size:10px;color:var(--ps-muted)}
#petaSituasi .ps-red{color:#dc4562}#petaSituasi .ps-amber{color:#c07816}#petaSituasi .ps-blue{color:#227db6}
#petaSituasi .ps-badge.ps-red{background:#fff0f3}#petaSituasi .ps-badge.ps-amber{background:#fff4df}
html.dark #petaSituasi .ps-red{color:#ff8aa0}html.dark #petaSituasi .ps-amber{color:#f6c266}html.dark #petaSituasi .ps-blue{color:#81c9ff}
html.dark #petaSituasi .ps-badge.ps-red{background:#442c3b}html.dark #petaSituasi .ps-badge.ps-amber{background:#443a29}
#petaSituasi .ps-tabs{display:flex;border-top:1px solid var(--ps-border);border-bottom:1px solid var(--ps-border);gap:20px;margin-bottom:12px}
#petaSituasi .ps-tabs button{border:0;border-bottom:2px solid transparent;background:transparent;color:var(--ps-muted);font-size:12px;font-weight:700;padding:14px 4px}
#petaSituasi .ps-tabs button[aria-selected=true]{color:#159bb3;border-bottom-color:#159bb3}
#petaSituasi .ps-list-label{font-size:11px;color:var(--ps-muted);margin:0 0 10px}
#petaSituasi .ps-issue-list{display:grid;gap:10px}
#petaSituasi .ps-issue{display:flex;width:100%;text-align:left;gap:10px;border:1px solid var(--ps-border);border-radius:9px;background:var(--ps-bg);color:var(--ps-text);padding:14px 12px;transition:border-color .15s,background .15s}
#petaSituasi .ps-issue:hover{border-color:#13a1b8;background:var(--ps-soft)}
#petaSituasi .ps-issue-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;flex-shrink:0;font-size:13px;color:#183153}
#petaSituasi .ps-issue-body{display:flex;flex-direction:column;gap:14px;min-width:0;flex:1}
#petaSituasi .ps-issue-heading{display:flex;flex-wrap:wrap;gap:9px;align-items:start}
#petaSituasi .ps-issue-heading strong{font-size:13px;line-height:1.6;flex:1 1 155px;overflow-wrap:anywhere}
#petaSituasi .ps-badges{display:flex;flex-wrap:wrap;gap:5px}
#petaSituasi .ps-issue-meta{font-size:11px;color:var(--ps-muted)}
#petaSituasi .ps-issue-link{color:#168caa;font-size:11px;font-weight:700}
#petaSituasi .ps-footnote{font-size:11px;line-height:1.7;color:var(--ps-muted);margin:14px 0 0}
#petaSituasi .ps-details{margin:0}#petaSituasi .ps-details>div{padding:12px 0;border-bottom:1px solid var(--ps-border)}
#petaSituasi .ps-details dt{font-size:11px;color:var(--ps-muted)}#petaSituasi .ps-details dd{font-size:13px;font-weight:600;margin:5px 0;overflow-wrap:anywhere}
#petaSituasi .ps-empty{background:var(--ps-bg);color:var(--ps-muted);padding:45px 20px;text-align:center;border-radius:12px;font-size:13px;line-height:1.8}
#petaSituasi .ps-empty>i{font-size:28px;color:#18a1b7}
#petaSituasi .ps-citywide{border:1px solid var(--ps-border);background:var(--ps-bg);border-radius:12px;padding:18px;margin-top:16px}
#petaSituasi .ps-citywide h3{font-size:15px;margin:0;font-weight:800}
#petaSituasi .ps-citywide>p{font-size:12px;color:var(--ps-muted);margin:8px 0 14px}
#petaSituasi .ps-citywide>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
#petaSituasi .ps-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
@media(min-width:1600px){#petaSituasi .ps-layout{grid-template-columns:minmax(0,1.9fr) minmax(450px,1fr)}}
@media(max-width:1100px){#petaSituasi .ps-layout{grid-template-columns:minmax(0,1.35fr) minmax(330px,1fr)}#petaSituasi .ps-search{width:calc(100% - 28px);right:14px}#petaSituasi .ps-legend{top:74px;width:165px}#petaSituasi .ps-info{padding:14px}#petaSituasi .ps-region-heading h3{font-size:20px}}
@media(max-width:850px){#petaSituasi .ps-layout{grid-template-columns:1fr}#petaSituasi #leafletMap{height:560px}#petaSituasi .ps-citywide>div{grid-template-columns:1fr}#petaSituasi .ps-region-heading>.ps-badge{margin-left:auto}}
@media(max-width:480px){#petaSituasi .ps-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}#petaSituasi .ps-header{padding:12px;gap:10px;flex-wrap:wrap}#petaSituasi .ps-header>div{flex:1}#petaSituasi .ps-header h2{font-size:13px}#petaSituasi .ps-header p{font-size:11px}#petaSituasi .ps-header .ps-button{padding:8px 10px}#petaSituasi #leafletMap{height:480px}#petaSituasi .ps-legend{width:154px;font-size:10px;padding:10px}#petaSituasi .ps-legend-content>div{margin-top:7px}#petaSituasi .ps-metric{padding:10px 6px}#petaSituasi .ps-metric strong{font-size:9px}#petaSituasi .ps-info{padding:14px}#petaSituasi .ps-tabs{gap:16px}}
`;document.head.appendChild(sheet);

let observer;
function init(){
  ensureSection();ensureNav();patchDashboard();
  observer=new MutationObserver(()=>{ensureNav();patchDashboard()});observer.observe(document.body,{subtree:true,childList:true});
  window.addEventListener('media:authenticated',()=>{ensureSection();ensureNav();patchDashboard()});
  window.addEventListener('command-center-scope-changed',()=>{if(window.__petaSituasiOpen)loadMap()});
  window.addEventListener('media-intelligence-tab',e=>{if(window.__petaSituasiOpen)closePage()});
}
init();
})();

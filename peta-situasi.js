(()=>{'use strict';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v||0);
const api=async p=>{const r=await fetch(API+p,{credentials:'include',cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||j.message||('HTTP '+r.status));return j};
const scoped=()=>{const r=new Set(window.MEDIA_CURRENT_USER?.roles||[]);return r.has('opd')||r.has('district')};
const scopeQuery=()=>{const q=new URLSearchParams();if(scoped())return q;const op=$('opdSelect')?.value;if(op&&op!=='all')q.set('opdId',op);const d=$('districtSelect')?.value;if(d&&d!=='all')q.set('districtId',d);return q};
let data=null,zoom=1,panX=0,panY=0,drag=false,lastX=0,lastY=0,selected=null;

function ensureSection(){
  if(!$('petaSituasi')){const s=document.createElement('section');s.id='petaSituasi';s.className='hidden space-y-5';$('dashboard')?.parentElement?.appendChild(s);}
}
function ensureNav(){
  const tabs=$('tabs');if(!tabs||tabs.querySelector('[data-peta-situasi]'))return;
  const b=document.createElement('button');b.type='button';b.dataset.petaSituasi='1';b.className='px-3 py-2 rounded-lg border border-transparent text-xs text-slate-400 hover:text-white';b.innerHTML='<i class="fa-solid fa-map-location-dot mr-2"></i>Peta Situasi';b.onclick=openPage;tabs.appendChild(b);
}
function activateNav(){
  $('tabs')?.querySelectorAll('[data-peta-situasi]').forEach(b=>b.classList.toggle('active',(window.__petaSituasiOpen===true)));
}
function openPage(){
  ensureSection();window.__petaSituasiOpen=true;
  document.querySelectorAll('main > section').forEach(s=>{if(s.id!=='commandCenterFilters')s.classList.add('hidden')});
  $('commandCenterFilters')?.classList.add('hidden');$('petaSituasi').classList.remove('hidden');ensureNav();activateNav();renderPage();loadMap();
}
function closePage(){window.__petaSituasiOpen=false;$('petaSituasi')?.classList.add('hidden');activateNav();}
function patchDashboard(){
  const root=$('dashboard');if(!root)return;
  const old=root.querySelector('#ccMapExpand');
  if(old&&!old.dataset.patched){old.dataset.patched='1';old.textContent='Buka Peta Situasi';old.innerHTML='<i class="fa-solid fa-map-location-dot mr-2"></i>Buka Peta Situasi';old.onclick=openPage;old.removeAttribute('id');}
  const modal=root.querySelector('#ccMapModal');if(modal)modal.remove();
}
function mapPoints(g){const pts=[];const walk=x=>{if(Array.isArray(x)&&typeof x[0]==='number')pts.push(x);else if(Array.isArray(x))x.forEach(walk)};(g.features||[]).forEach(f=>walk(f.geometry?.coordinates));return pts}
function geometryPath(z,tx,ty){const ring=r=>r.map((p,i)=>(i?'L':'M')+tx(p[0]).toFixed(2)+' '+ty(p[1]).toFixed(2)).join(' ')+' Z';if(z?.type==='Polygon')return z.coordinates.map(ring).join(' ');if(z?.type==='MultiPolygon')return z.coordinates.flat().map(ring).join(' ');return ''}
function buildSvg(g,large=false){
  const pts=mapPoints(g);if(!pts.length)return '';
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const W=1000,H=700,pad=35,s=Math.min((W-pad*2)/(maxX-minX||1),(H-pad*2)/(maxY-minY||1)),tx=x=>pad+(x-minX)*s,ty=y=>H-pad-(y-minY)*s;
  const regionMap=new Map((g.features||[]).map(f=>[String(f.properties?.districtId),f]));
  const shapes=(g.features||[]).map(f=>{const p=f.properties||{},id=String(p.districtId||''),r=data?.data?.regions?.find(x=>String(x.district_id)===id),hi=n(r?.high_risk_count),ac=n(r?.active_issue_count),fill=hi?'rgba(244,63,94,.52)':ac?'rgba(245,158,11,.42)':'rgba(16,185,129,.22)',sel=selected&&String(selected)===id;return '<path data-region="'+esc(id)+'" d="'+geometryPath(f.geometry,tx,ty)+'" fill="'+fill+'" stroke="'+(sel?'#fff':'rgba(34,211,238,.9)')+'" stroke-width="'+(sel?'3':'1.2')+'" vector-effect="non-scaling-stroke" class="cursor-pointer"></path>'}).join('');
  const labels=(g.features||[]).map(f=>{const p=f.properties||{},coords=[];const walk=x=>{if(Array.isArray(x)&&typeof x[0]==='number')coords.push(x);else if(Array.isArray(x))x.forEach(walk)};walk(f.geometry?.coordinates);if(!coords.length)return '';const cx=coords.reduce((a,p)=>a+tx(p[0]),0)/coords.length,cy=coords.reduce((a,p)=>a+ty(p[1]),0)/coords.length;return '<text x="'+cx.toFixed(1)+'" y="'+cy.toFixed(1)+'" text-anchor="middle" pointer-events="none" font-size="'+(large?12:9)+'" font-weight="700" fill="white" stroke="#020617" stroke-width="3" paint-order="stroke">'+esc(p.districtName||p.name||'')+'</text>'}).join('');
  return '<svg id="petaSvg" viewBox="0 0 '+W+' '+H+'" class="w-full h-full select-none touch-none" preserveAspectRatio="xMidYMid meet"><g id="petaLayer" transform="translate('+panX+' '+panY+') scale('+zoom+')">'+shapes+labels+'</g></svg>';
}
function regionInfo(id){
  const r=data?.data?.regions?.find(x=>String(x.district_id)===String(id));if(!r)return '<div class="text-xs text-slate-500">Wilayah tidak tersedia.</div>';
  const ids=new Set((r.issues||[]).map(i=>Number(i.id)));
  const alerts=(data.alerts||[]).filter(a=>ids.has(Number(a.issue_id)));
  const stages={GAP:0,CLARIFICATION:0};
  (data.pipeline?.stages||[]).forEach(s=>{if(stages[s.key]!=null)stages[s.key]=(s.items||[]).filter(i=>ids.has(Number(i.issueId))).length});
  const attention=alerts.length||n(r.high_risk_count)>0?'TINGGI':n(r.active_issue_count)>0||stages.GAP||stages.CLARIFICATION?'PERHATIAN':'NORMAL';
  return '<div class="flex items-start justify-between gap-3"><div><div class="text-[10px] font-black tracking-widest text-cyan-400">SITUASI WILAYAH</div><h3 class="text-xl font-black mt-1">'+esc(r.district_name)+'</h3></div><span class="px-2 py-1 rounded-lg border text-[10px] font-black '+(attention==='TINGGI'?'text-rose-300 border-rose-500/30 bg-rose-500/10':attention==='PERHATIAN'?'text-amber-300 border-amber-500/30 bg-amber-500/10':'text-emerald-300 border-emerald-500/30 bg-emerald-500/10')+'">'+attention+'</span></div>'+
  '<div class="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">'+[['WATCH/ACTIVE',r.active_issue_count],['HIGH RISK',r.high_risk_count],['OPEN ALERT',alerts.length],['GAP',stages.GAP],['KLARIFIKASI',stages.CLARIFICATION]].map(x=>'<div class="rounded-lg bg-slate-950/70 border border-slate-800 p-3"><b class="text-lg">'+n(x[1])+'</b><div class="text-[9px] text-slate-500 mt-1">'+x[0]+'</div></div>').join('')+'</div>'+
  '<div class="mt-4"><div class="text-[10px] font-black tracking-wider text-cyan-300">3 ISU TERATAS</div><div class="space-y-2 mt-2">'+((r.issues||[]).length?(r.issues||[]).slice(0,3).map(i=>'<button type="button" data-map-issue="'+i.id+'" class="block w-full rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left hover:border-cyan-400/50"><div class="font-bold text-sm">'+esc(i.title)+'</div><div class="text-[10px] text-slate-500 mt-1">'+esc(String(i.status||'').toUpperCase())+(i.risk_score==null?'':' · Risk '+Math.round(Number(i.risk_score))+'/100')+'</div></button>').join(''):'<div class="text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl p-3">Tidak ada Issue spesifik kecamatan.</div>')+'</div></div>';
}
function citywide(){const a=data?.data?.citywideIssues||[];if(!a.length)return '';return '<div class="glass rounded-2xl p-5"><div class="text-[10px] font-black tracking-wider text-violet-300">ISU TINGKAT KOTA</div><div class="space-y-2 mt-3">'+a.slice(0,3).map(i=>'<button type="button" data-map-issue="'+i.id+'" class="block w-full rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left"><b>'+esc(i.title)+'</b><div class="text-[10px] text-slate-500 mt-1">'+esc(String(i.status||'').toUpperCase())+(i.risk_score==null?'':' · Risk '+Math.round(Number(i.risk_score))+'/100')+'</div></button>').join('')+'</div></div>'}
function renderPage(){
  ensureSection();const root=$('petaSituasi');if(!root)return;
  if(!data){root.innerHTML='<div class="glass rounded-2xl p-5 text-sm text-cyan-300"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat Peta Situasi...</div>';return}
  root.innerHTML='<div class="flex flex-wrap items-start justify-between gap-3"><div><div class="text-[10px] text-cyan-400 font-black tracking-[.22em]">COMMAND CENTER · PETA SITUASI</div><h2 class="text-2xl font-black mt-1">Peta Situasi Wilayah</h2><p class="text-xs text-slate-500 mt-2">Eksplorasi wilayah tanpa mengunci halaman. Warna memakai sinyal Issue yang sudah ada.</p></div><button id="petaRefresh" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold"><i class="fa-solid fa-rotate mr-1"></i>Refresh</button></div>'+
  '<div class="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4"><section class="glass rounded-2xl p-3"><div id="petaStage" class="relative min-h-[520px] md:min-h-[680px] rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center">'+buildSvg(data.data.geojson,true)+'</div><div class="flex flex-wrap gap-2 mt-3"><button data-zoom="in" class="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 font-black">+</button><button data-zoom="out" class="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 font-black">−</button><button data-zoom="reset" class="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs font-bold">Reset</button><span class="text-[10px] text-slate-500 self-center">Pinch/scroll untuk zoom · geser untuk pan</span></div><div class="flex flex-wrap gap-3 mt-3 text-[10px]"><span class="text-emerald-300">● Normal</span><span class="text-amber-300">● Ada WATCH/ACTIVE</span><span class="text-rose-300">● High Risk / Alert</span></div></section><aside id="petaInfo" class="glass rounded-2xl p-5"><div class="text-xs text-slate-500">Pilih kecamatan pada peta untuk melihat situasi wilayah.</div></aside></div>'+
  '<div id="petaTopIssues" class="glass rounded-2xl p-5"><div class="text-[10px] font-black tracking-wider text-cyan-300">ISU WILAYAH TERATAS</div><div class="grid md:grid-cols-3 gap-2 mt-3">'+topIssues().map(i=>'<button type="button" data-map-issue="'+i.id+'" class="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left"><b class="text-sm">'+esc(i.title)+'</b><div class="text-[10px] text-slate-500 mt-1">'+esc(i.district_name||'Wilayah')+' · '+esc(String(i.status||'').toUpperCase())+(i.risk_score==null?'':' · Risk '+Math.round(Number(i.risk_score))+'/100')+'</div></button>').join('')||'<div class="text-xs text-slate-500">Belum ada Issue spesifik kecamatan.</div>'+'</div></div>'+citywide();
  bindInteractions();
}
function topIssues(){const seen=new Set(),a=[];(data?.data?.regions||[]).forEach(r=>(r.issues||[]).forEach(i=>{if(!seen.has(Number(i.id))){seen.add(Number(i.id));a.push({...i,district_name:r.district_name})}}));return a.sort((a,b)=>(n(b.risk_score)-n(a.risk_score))||((String(a.status).toLowerCase()==='active'?0:1)-(String(b.status).toLowerCase()==='active'?0:1))).slice(0,3)}
function bindInteractions(){
  const root=$('petaSituasi'),stage=$('petaStage');if(!root||!stage)return;
  root.querySelectorAll('[data-region]').forEach(b=>b.onclick=()=>{selected=b.dataset.region;renderPage()});
  root.querySelectorAll('[data-map-issue]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.mapIssue);if(id)window.openManagementIssuePage?.(id)});
  root.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>{const a=b.dataset.zoom;if(a==='reset'){zoom=1;panX=panY=0}else zoom=Math.max(1,Math.min(7,zoom*(a==='in'?1.35:1/1.35)));renderPage()});
  stage.addEventListener('pointerdown',e=>{drag=true;lastX=e.clientX;lastY=e.clientY;stage.setPointerCapture?.(e.pointerId)});
  stage.addEventListener('pointermove',e=>{if(!drag)return;panX+=e.clientX-lastX;panY+=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;const layer=$('petaLayer');if(layer)layer.setAttribute('transform','translate('+panX+' '+panY+') scale('+zoom+')')});
  stage.addEventListener('pointerup',()=>drag=false);stage.addEventListener('pointercancel',()=>drag=false);
  stage.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(1,Math.min(7,zoom*(e.deltaY<0?1.15:1/1.15)));const layer=$('petaLayer');if(layer)layer.setAttribute('transform','translate('+panX+' '+panY+') scale('+zoom+')')},{passive:false});
  let pinch=0;stage.addEventListener('touchstart',e=>{if(e.touches.length===2)pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)},{passive:true});stage.addEventListener('touchmove',e=>{if(e.touches.length===2&&pinch){zoom=Math.max(1,Math.min(7,zoom*(Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)/pinch)));pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);const layer=$('petaLayer');if(layer)layer.setAttribute('transform','translate('+panX+' '+panY+') scale('+zoom+')')}},{passive:false});
  root.querySelector('#petaRefresh').onclick=()=>loadMap();
}
async function loadMap(){
  if(!window.__petaSituasiOpen)return;ensureSection();const root=$('petaSituasi');root.innerHTML='<div class="glass rounded-2xl p-5 text-sm text-cyan-300"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat Peta Situasi...</div>';
  try{const q=scopeQuery(),suffix=q.toString()?'?'+q.toString():'';const [map,alerts,pipeline]=await Promise.all([api('/command-center/map'+suffix),api('/intelligence/alerts?status=active&limit=100'),api('/command-center/workflow-pipeline'+suffix)]);data={data:map.data,alerts:alerts.data?.alerts||[],pipeline};zoom=1;panX=panY=0;renderPage()}catch(e){root.innerHTML='<div class="glass rounded-2xl p-5 text-sm text-rose-300">Peta Situasi gagal dimuat: '+esc(e.message)+'</div>'}
}
let observer;
function init(){
  ensureSection();ensureNav();patchDashboard();
  observer=new MutationObserver(()=>{ensureNav();patchDashboard()});observer.observe(document.body,{subtree:true,childList:true});
  window.addEventListener('media:authenticated',()=>{ensureSection();ensureNav();patchDashboard()});
  window.addEventListener('command-center-scope-changed',()=>{if(window.__petaSituasiOpen)loadMap()});
  window.addEventListener('media-intelligence-tab',e=>{if(e.detail!=='dashboard'&&window.__petaSituasiOpen)closePage()});
}
init();
})();
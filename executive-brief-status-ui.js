(()=>{
'use strict';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>{try{return new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}catch{return String(v||'-');}};
const time=v=>new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'}).format(v);
let last=null,version=0,lastLoadedAt=null;
function render(box,payload,warning=''){
 const data=payload?.data,brief=data?.brief_json,state=payload?.state||{};
 box.className='mt-4 pt-4 border-t border-slate-700';
 box.innerHTML='<div class="flex flex-wrap items-center justify-between gap-2"><b class="text-xs">Brief harian tersimpan</b><button type="button" data-brief-refresh class="px-3 py-2 rounded-lg border border-slate-600 text-xs font-bold">Perbarui data &amp; analisis</button></div><p data-brief-status class="text-xs text-slate-400 mt-2" role="status" aria-live="polite">'+esc(warning||state.message||'Brief belum tersedia.')+(!warning&&lastLoadedAt?' · Dimuat '+esc(time(lastLoadedAt))+' WIB':'')+'</p>'+(brief?'<p class="text-xs text-slate-400 mt-2">'+esc(brief.mode==='ai'?'Ringkasan AI':'Ringkasan database tanpa AI')+' · '+esc(date(data.generated_at||data.brief_date))+(state.outdated?' · Hasil terakhir, belum diperbarui hari ini':'')+'</p>'+(brief.period?'<p class="text-[11px] text-slate-500 mt-1">Berita: '+esc(date(brief.period.from))+' – '+esc(date(brief.period.to))+' WIB. Media cetak mengikuti tanggal edisi; isu berjalan mencakup WATCH/ACTIVE.</p>':'')+(brief.coverage?.collection?.status&&brief.coverage.collection.status!=='SUCCESS'?'<p class="text-xs text-amber-400 mt-2">Pengumpulan belum lengkap ('+esc(brief.coverage.collection.status)+'). Ringkasan mengikuti data final yang tersedia.</p>':'')+'<h4 class="font-bold text-sm mt-3">'+esc(brief.headline)+'</h4><p class="text-xs text-slate-300 mt-2">'+esc(brief.situation)+'</p><p class="text-xs text-slate-400 mt-2">'+esc(brief.implications)+'</p><ul class="mt-2 space-y-1 text-xs text-slate-300">'+(Array.isArray(brief.actions)?brief.actions:[]).slice(0,5).map(a=>'<li>• '+esc(a)+'</li>').join('')+'</ul>':'');
 box.querySelector('[data-brief-refresh]').onclick=async()=>{
  const button=box.querySelector('[data-brief-refresh]'),status=box.querySelector('[data-brief-status]');
  button.disabled=true;button.setAttribute('aria-busy','true');button.innerHTML='<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Memperbarui...';
  if(status)status.textContent='Memperbarui data database dan memuat hasil analisis tersimpan...';
  if(typeof window.renderCommandCenter==='function')await window.renderCommandCenter();else await load('');
 };
}
async function load(scope=''){
 const ticket=++version,box=document.getElementById('ccStoredExecutiveBrief'),roles=new Set(window.MEDIA_CURRENT_USER?.roles||[]);
 if(!box)return;
 if(scope||roles.has('opd')||roles.has('district')){box.innerHTML='';box.className='';return;}
 if(last)render(box,last);else box.textContent='Memuat brief tersimpan...';
 const button=box.querySelector('[data-brief-refresh]');if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.innerHTML='<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Memuat...';}
 try{
  const response=await fetch(API+'/executive-brief/cached',{credentials:'include',cache:'no-store'});
  if(!response.ok)throw Error('BRIEF_READ_FAILED');
  const payload=await response.json();
  if(ticket!==version||!box.isConnected)return;
  last=payload;lastLoadedAt=new Date();render(box,payload);
 }catch{if(ticket===version&&box.isConnected)render(box,last,'Brief belum dapat dimuat. Hasil tersimpan terakhir tetap ditampilkan jika tersedia.');}
}
window.renderStoredExecutiveBrief=load;
})();

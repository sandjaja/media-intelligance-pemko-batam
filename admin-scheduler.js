(()=>{
'use strict';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,options={}){const r=await fetch(API+path,{credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.detail||d.error||`HTTP ${r.status}`);return d}
function toast(msg,ok=true){const t=$('#toast');if(!t)return;t.textContent=msg;t.className=`fixed bottom-5 right-5 glass rounded-xl px-4 py-3 text-xs shadow-2xl ${ok?'text-emerald-300':'text-rose-300'}`;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),3500)}
function fmt(v){if(!v)return'-';try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(v))}catch{return String(v)}}
function selectedSocialPlatforms(){return ['Youtube','Instagram','Tiktok'].filter(p=>$('#sched'+p)?.checked).map(p=>p.toLowerCase())}
function syncSocialPlatforms(){const enabled=$('#schedSocial')?.checked&&!$('#schedSocial')?.disabled;document.querySelectorAll('#schedSocialPlatforms input').forEach(input=>{input.disabled=!enabled})}
function historyDetails(result){if(!result)return '';const labels={online:'Media Online',owned:'Owned Channel',social:'YouTube'};const parts=[];for(const [key,label] of Object.entries(labels)){const r=result[key];if(r?.skipped&&r.reason==='YOUTUBE_NOT_SELECTED'){parts.push(esc(label)+': tidak dipilih');continue;}if(r)parts.push(esc(label)+': '+Number(r.succeeded||0)+' berhasil · '+Number(r.failed||0)+' gagal'+(r.error?' · '+esc(r.error):''));}if(result.apify){const a=result.apify;parts.push('Apify: '+esc(a.status)+(a.period?' · '+esc(a.period.date)+' WIB':'')+(a.error?' · '+esc(a.error):''));for(const step of a.steps||[])parts.push(esc(step.kind)+': '+esc(step.status)+' · '+Number(step.counts?.succeeded||0)+' tersimpan/diperbarui'+(step.error?' · '+esc(step.error):''));}return parts.join('<br>');}
function ensureUI(){
 const ws=$('#workspace');if(!ws)return false;if($('#schedulerPanel'))return true;
 const nav=ws.querySelector('.flex.gap-2.border-b')||ws.querySelector('.border-b');if(!nav)return false;
 const b=document.createElement('button');b.dataset.tab='scheduler';b.className='tab px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-bold text-sm';b.textContent='Scheduler';nav.appendChild(b);
 ws.insertAdjacentHTML('beforeend',`<section id="schedulerPanel" class="hidden space-y-5">
 <details id="schedMainDetails" class="glass rounded-2xl p-5"><summary class="cursor-pointer font-black text-lg mb-3">Scheduler Pengumpulan Data</summary><div class="flex flex-wrap items-start justify-between gap-3"><div><div class="text-[10px] tracking-widest text-cyan-400 font-black">DATA COLLECTION ORCHESTRATOR</div><h2 class="text-xl font-black mt-1">Scheduler Pengumpulan Data</h2><p class="text-xs text-slate-500 mt-1">Satu jadwal untuk mengendalikan collector Media Online, Owned Channel, dan Media Sosial.</p></div><span id="schedState" class="px-3 py-1 rounded-full text-xs font-black bg-slate-800">NONAKTIF</span></div>
 <p id="schedEnvNote" class="text-xs text-amber-500 mt-3"></p><form id="schedForm" class="mt-5 space-y-5"><div class="grid md:grid-cols-3 gap-4"><label class="rounded-xl border border-slate-800 p-4"><div class="text-xs text-slate-400">Pengumpulan otomatis</div><div class="mt-2 flex items-center gap-2"><input id="schedEnabled" type="checkbox" class="w-5 h-5"><b>Aktifkan Scheduler</b></div><div class="mt-3 text-[11px] leading-relaxed text-slate-500"><b class="text-slate-300">Cara menonaktifkan:</b> hilangkan centang <b>Aktifkan Scheduler</b>, lalu tekan <b>Simpan Pengaturan</b>. Pengumpulan baru untuk seluruh sumber yang dipilih tidak dimulai selama Scheduler nonaktif.</div></label><label class="rounded-xl border border-slate-800 p-4"><div class="text-xs text-slate-400">Jam eksekusi otomatis</div><div class="mt-2 font-bold">08:00 WIB</div><div class="text-[10px] text-amber-300 mt-1">Tetap selama menggunakan Vercel Hobby.</div><input id="schedTime" type="hidden" value="08:00"></label><div class="rounded-xl border border-slate-800 p-4"><div class="text-xs text-slate-400">Timezone</div><div class="mt-2 font-bold">Asia/Jakarta · WIB</div></div></div>
 <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-4" id="schedSourceCards">
 <label class="rounded-xl border border-slate-800 p-4 flex gap-3"><input id="schedOnline" type="checkbox" class="w-5 h-5 mt-1"><div><b>Media Online</b><div class="text-xs text-slate-500 mt-1">Portal berita/media eksternal.</div></div></label>
 <label class="rounded-xl border border-slate-800 p-4 flex gap-3"><input id="schedOwned" type="checkbox" class="w-5 h-5 mt-1"><div><b>Owned Channel</b><div class="text-xs text-slate-500 mt-1">Website resmi Pemko/OPD/Kecamatan.</div></div></label>
 <div id="schedSocialCard" class="rounded-xl border border-slate-800 p-4"><label class="flex gap-3"><input id="schedSocial" type="checkbox" class="w-5 h-5 mt-1"><b>Media Sosial</b></label><div class="mt-3 space-y-2" id="schedSocialPlatforms"><label class="flex items-center gap-2 text-sm"><input id="schedYoutube" type="checkbox" value="youtube">YouTube</label><label class="flex items-center gap-2 text-sm"><input id="schedInstagram" type="checkbox" value="instagram">Instagram</label><label class="flex items-center gap-2 text-sm"><input id="schedTiktok" type="checkbox" value="tiktok">TikTok</label></div><p id="schedSocialNote" class="text-xs text-slate-500 mt-3">Hanya platform yang dicentang akan ditarik. Instagram/TikTok memakai Actor aktif serta batas biaya Admin; data kemarin WIB.</p></div>
 <div class="rounded-xl border border-slate-800 p-4"><label class="flex gap-3"><input id="schedExecutiveBrief" type="checkbox" class="w-5 h-5 mt-1"><div><b>Executive Brief</b><div class="text-xs text-slate-500 mt-1">Gemini otomatis pukul 09.30 WIB, setelah jadwal pengumpulan. Waktu dapat bergeser dalam satu jam pada Vercel Hobby. Maksimal sekali sehari.</div></div></label><div class="mt-4 border-t border-slate-800 pt-4"><button id="schedBriefRetry" type="button" disabled class="rounded-lg border border-amber-600 px-4 py-2.5 font-bold">Memeriksa Executive Brief...</button><p class="text-xs text-amber-400 mt-2">Jika belum ada, Admin dapat membuat analisis pertama hari ini secara manual. Jika gagal, tersedia satu percobaan ulang pada hari yang sama. Keduanya memakai kuota Gemini.</p><button id="schedBriefStatusReload" type="button" class="mt-2 rounded-lg border border-slate-600 px-3 py-2 text-xs">Perbarui Status Analisis</button><p id="schedBriefRetryResult" class="text-xs text-slate-400 mt-2" aria-live="polite"></p></div></div></div>
 <div class="flex flex-wrap gap-2"><button type="submit" class="px-4 py-2.5 rounded-lg bg-cyan-400 text-slate-950 font-black">Simpan Pengaturan</button><button id="schedRunNow" type="button" class="px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 font-bold">Jalankan Sekarang</button></div></form></details>
 <details id="schedHistoryDetails" class="glass rounded-2xl p-5"><summary class="cursor-pointer font-black text-lg mb-3">Riwayat Pengumpulan</summary><p id="schedLast" class="text-xs text-slate-500 mt-1">Belum pernah dijalankan.</p><div id="schedHistory" class="mt-4 space-y-2"></div></details></section>`);
 // Each source card collapses independently; the checkbox remains accessible in its header.
 $('#schedSourceCards').querySelectorAll('label').forEach(card=>{
  const input=card.querySelector('input[type="checkbox"]');
  const info=card.querySelector('div > div.text-xs');
  const title=card.querySelector('b');
  if(!input||!info||!title)return;
  const header=document.createElement('button');
  header.type='button';
  header.className='ml-auto self-start text-slate-400 hover:text-cyan-300 text-xs font-bold shrink-0';
  header.setAttribute('aria-expanded','false');
  header.setAttribute('aria-label','Buka rincian '+title.textContent);
  header.textContent='▼';
  info.classList.add('hidden');
  header.addEventListener('click',e=>{
   e.preventDefault();e.stopPropagation();
   const expanded=info.classList.toggle('hidden')===false;
   header.setAttribute('aria-expanded',String(expanded));
   header.setAttribute('aria-label',(expanded?'Tutup':'Buka')+' rincian '+title.textContent);
   header.textContent=expanded?'▲':'▼';
  });
  card.appendChild(header);
 });
 $('#schedForm').addEventListener('submit',save);
 $('#schedSocial').addEventListener('change',syncSocialPlatforms);
 $('#schedRunNow').addEventListener('click',runNow);
 $('#schedBriefRetry').addEventListener('click',retryBrief);$('#schedBriefStatusReload')?.addEventListener('click',loadRetryStatus);
 return true;
}
async function load(){
 if(!ensureUI())return;
 loadRetryStatus();
 try{const d=(await api('/admin/collection-scheduler')).data,c=d.config||{};$('#schedEnabled').checked=!!c.enabled;$('#schedExecutiveBrief').checked=!!d.executiveBriefEnabled;$('#schedOnline').checked=!!c.online_enabled;$('#schedOwned').checked=!!c.owned_enabled;const socialReady=d.socialReady===true;$('#schedSocial').disabled=!socialReady;$('#schedSocial').checked=socialReady&&!!c.social_enabled;const platforms=c.social_platforms??['youtube','instagram','tiktok'];for(const platform of ['Youtube','Instagram','Tiktok'])$('#sched'+platform).checked=platforms.includes(platform.toLowerCase());syncSocialPlatforms();$('#schedSocialCard')?.classList.toggle('opacity-60',!socialReady);if($('#schedSocialNote'))$('#schedSocialNote').textContent=socialReady?'Hanya platform yang dicentang akan ditarik. Instagram/TikTok memakai Actor aktif serta batas biaya Admin; data kemarin WIB.':'Collector media sosial belum siap.';$('#schedState').textContent=c.enabled?'AKTIF':'NONAKTIF';$('#schedState').className=`px-3 py-1 rounded-full text-xs font-black ${c.enabled?'bg-emerald-500/10 text-emerald-300':'bg-slate-800 text-slate-400'}`;if($('#schedEnvNote'))$('#schedEnvNote').textContent=d.deploymentEnvironment==='preview'?'Deployment Preview: jadwal otomatis Vercel hanya berjalan di Production.':'Jadwal harian sekitar 08.00 WIB. Actor Apify dan batas biayanya mengikuti pengaturan integrasi Admin.';const h=d.history||[];$('#schedLast').textContent=h[0]?`Terakhir: ${fmt(h[0].started_at)} · ${h[0].status}`:'Belum pernah dijalankan.';$('#schedHistory').innerHTML=h.map(x=>`<div class="rounded-lg border border-slate-800 p-3 flex flex-wrap justify-between gap-2"><div><b class="text-sm">${esc(x.trigger_type)}</b><div class="text-xs text-slate-500">${fmt(x.started_at)}</div></div><span class="text-xs font-bold">${esc(x.status)}</span><div class="w-full text-xs text-slate-500">${historyDetails(x.result)}</div></div>`).join('')||'<div class="text-sm text-slate-500">Belum ada riwayat.</div>'}catch(e){toast(e.message,false)}
}
async function save(e){e.preventDefault();if($('#schedSocial').checked&&!selectedSocialPlatforms().length)return toast('Pilih minimal satu platform Media Sosial.',false);const button=e.currentTarget.querySelector('button[type="submit"]');button.disabled=true;button.setAttribute('aria-busy','true');try{await api('/admin/collection-scheduler',{method:'PUT',body:JSON.stringify({enabled:$('#schedEnabled').checked,runTime:$('#schedTime').value,onlineEnabled:$('#schedOnline').checked,ownedEnabled:$('#schedOwned').checked,socialEnabled:!$('#schedSocial').disabled&&$('#schedSocial').checked,socialPlatforms:selectedSocialPlatforms(),executiveBriefEnabled:$('#schedExecutiveBrief').checked})});toast('Pengaturan scheduler disimpan.');await load()}catch(e){toast(e.message,false)}finally{button.disabled=false;button.removeAttribute('aria-busy')}}
async function runNow(){const sources=[];if($('#schedOnline').checked)sources.push('online');if($('#schedOwned').checked)sources.push('owned');if(!$('#schedSocial').disabled&&$('#schedSocial').checked)sources.push('social');if(sources.includes('social')&&!selectedSocialPlatforms().length)return toast('Pilih minimal satu platform Media Sosial.',false);if(!sources.length)return toast('Pilih minimal satu sumber untuk dijalankan.',false);if(!confirm(`Jalankan pengumpulan sekarang untuk: ${sources.join(', ')}?${sources.includes('social')?' Platform sosial: '+selectedSocialPlatforms().join(', ')+'. Instagram/TikTok terpilih memakai batas biaya Admin.':''}`))return;const b=$('#schedRunNow');b.disabled=true;b.textContent='Sedang menjalankan...';try{const j=await api('/admin/collection-scheduler/run',{method:'POST',body:JSON.stringify({sources,socialPlatforms:selectedSocialPlatforms()})});toast(j.data?.skipped?'Pengumpulan sudah berjalan atau sudah dijalankan.':j.data?.status==='RUNNING'?'Pengumpulan berjalan. Hasil Apify akan diimpor otomatis.':j.data?.status==='SUCCESS'?'Pengumpulan selesai.':'Pengumpulan selesai dengan catatan; periksa riwayat.',j.data?.status!=='FAILED');await load()}catch(e){toast(e.message,false)}finally{b.disabled=false;b.textContent='Jalankan Sekarang'}}
async function loadRetryStatus(){
 const button=$('#schedBriefRetry'),status=$('#schedBriefRetryResult');if(!button)return;
 button.disabled=true;status.textContent='Memeriksa status analisis hari ini...';
 try{const result=await api('/admin/executive-brief/retry-status');const reason=result.data?.reason;button.dataset.briefAction=reason==='not_generated'?'generate':reason==='available'?'retry':'';button.textContent=reason==='not_generated'?'Buat Executive Brief Hari Ini':reason==='available'?'Analisis Ulang Executive Brief':'Analisis Executive Brief Tidak Tersedia';button.disabled=!button.dataset.briefAction;status.textContent=reason==='not_generated'?'Belum ada analisis hari ini. Anda dapat membuatnya sekali secara manual. Jadwal otomatis tidak berjalan pada deployment Preview.':result.data?.message||'Status belum tersedia.';}
 catch{status.textContent='Status analisis belum dapat dimuat. Tekan Perbarui Status Analisis.';}
}
async function retryBrief(){
 const button=$('#schedBriefRetry'),status=$('#schedBriefRetryResult');
 const action=button.dataset.briefAction;if(!['generate','retry'].includes(action))return;
 if(!confirm(action==='generate'?'Buat Executive Brief hari ini? Ini akan memanggil Gemini dan memakai kuota AI harian. Analisis pertama hanya sekali sehari.':'Analisis ulang Executive Brief yang gagal hari ini? Ini akan memanggil Gemini dan memakai kuota AI harian. Hanya satu percobaan ulang.'))return;
 button.disabled=true;status.textContent=action==='generate'?'Membuat analisis hari ini...':'Menjalankan analisis ulang...';
 try{
  const result=await api(action==='generate'?'/admin/executive-brief/generate':'/admin/executive-brief/retry',{method:'POST',body:'{}'});
  status.textContent=result.data?.status==='created'?'Berhasil. Executive Brief hari ini tersimpan dan dapat dilihat di dashboard.':result.data?.status==='already_claimed'?'Analisis hari ini sudah tercatat. Perbarui status.':'Analisis gagal. Perbarui status untuk melihat apakah satu percobaan ulang tersedia.';
  }catch(e){status.textContent='Analisis tidak dapat dijalankan: '+e.message;}
 finally{await loadRetryStatus();}
}
function setupExecutiveBriefControl(){
 const panel=document.getElementById('schedulerPanel');
 if(!panel||document.getElementById('aiExecutiveBriefSection'))return;
 const section=document.createElement('details');
 section.id='aiExecutiveBriefSection';
 section.className='glass rounded-2xl p-5 space-y-3';
 section.innerHTML='<summary class="cursor-pointer font-bold text-lg">Pengujian Executive Brief (Manual)</summary><p class="text-xs text-slate-400 mt-2">Executive Brief otomatis diatur melalui checkbox Scheduler utama, pukul 09.30 WIB. Membuka dashboard hanya membaca hasil tersimpan.</p><div id="aiExecutiveBriefStatus" class="text-xs text-slate-400 mt-2">Memuat status...</div><div id="aiExecutiveBriefScheduleStatus" class="mt-2 text-xs text-slate-400">Jadwal belum dimuat</div><button type="button" id="aiExecutiveBriefReload" class="mt-2 rounded-lg border border-slate-600 px-3 py-2 text-xs">Perbarui Status</button><button type="button" id="aiExecutiveBriefPreflight" class="mt-2 ml-2 rounded-lg border border-cyan-600 px-3 py-2 text-xs">Uji Jadwal (Tanpa AI)</button><div id="aiExecutiveBriefPreflightResult" class="mt-2 text-xs text-slate-400"></div><button type="button" id="aiExecutiveBriefRunOnce" class="mt-2 rounded-lg border border-amber-600 px-3 py-2 text-xs">Smoke Test AI Sekali (Manual)</button><div id="aiExecutiveBriefRunOnceResult" class="mt-2 text-xs text-slate-400"></div><p class="text-xs text-amber-400 mt-2">Smoke test manual memakai kuota AI dan dibatasi sekali per hari.</p>';
 panel.insertBefore(section,document.getElementById('schedHistoryDetails'));
 async function reload(){
  const status=section.querySelector('#aiExecutiveBriefStatus');
  status.textContent='Memuat status...';
  try{
   const r=await fetch('/api/executive-brief/cached',{credentials:'include',cache:'no-store'});
   const j=await r.json();
   if(!r.ok)throw Error(j.error||'HTTP '+r.status);
   const b=j.data;
   status.textContent=b?.status==='ready'
    ?'Analisis terakhir: '+String(b.generated_at||b.brief_date)+' · tersimpan di database.'
    :'Belum ada Executive Brief harian tersimpan. Periksa status aktivasi Scheduler utama.';
  }catch(e){status.textContent='Status tidak tersedia: '+e.message;}
 }
 async function loadSchedule(){
  const status=section.querySelector('#aiExecutiveBriefScheduleStatus');
  try{
   const r=await fetch('/api/admin/executive-brief/schedule',{credentials:'include',cache:'no-store'});
   const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);
   status.textContent='Jadwal: 09.30 WIB · '+(j.data.enabled?'AKTIF':'NONAKTIF')+'. Aktivasi melalui checkbox Scheduler utama.';
  }catch(e){status.textContent='Pengaturan belum tersedia: '+e.message;}
 }
 section.addEventListener('toggle',()=>{if(section.open){reload();loadSchedule();}});
 section.querySelector('#aiExecutiveBriefPreflight').addEventListener('click',async()=>{
  const status=section.querySelector('#aiExecutiveBriefPreflightResult');
  status.textContent='Memeriksa jadwal...';
  try{
   const r=await fetch('/api/admin/executive-brief/schedule/preflight',{credentials:'include',cache:'no-store'});
   const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);
   const labels={disabled:'Jadwal nonaktif',not_due:'Belum waktunya',already_recorded:'Sudah tercatat untuk hari ini',due:'Memenuhi syarat jadwal (simulasi)'};
   status.textContent='Simulasi '+j.data.date+': '+(labels[j.data.reason]||j.data.reason)+'. Tidak ada pemanggilan Gemini.';
  }catch(e){status.textContent='Pemeriksaan gagal: '+e.message;}
 });
 section.querySelector('#aiExecutiveBriefRunOnce').addEventListener('click',async()=>{
  if(!confirm('Jalankan satu kali analisis Executive Brief menggunakan kuota AI? Jadwal otomatis tetap nonaktif.'))return;
  const btn=section.querySelector('#aiExecutiveBriefRunOnce'),status=section.querySelector('#aiExecutiveBriefRunOnceResult');
  btn.disabled=true;status.textContent='Memproses analisis AI...';
  try{
   const r=await fetch('/api/admin/executive-brief/generate',{method:'POST',credentials:'include'});
   const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);
   const state=j.data?.status;
   status.textContent=state==='created'?'Berhasil: Executive Brief hari ini tersimpan. Periksa dashboard.'
    :state==='already_claimed'?'Sudah diuji hari ini. Hasil atau kegagalan sebelumnya tercatat; AI tidak dipanggil ulang.'
    :state==='failed'?'Gagal: mesin AI tidak menghasilkan Executive Brief yang valid. Catatan kegagalan tersimpan; AI tidak akan diulang otomatis hari ini.'
    :'Status tidak dikenal: '+String(state||'tidak tersedia');
   await reload();await loadSchedule();
  }catch(e){status.textContent='Smoke test gagal: '+e.message;}finally{btn.disabled=false;}
 });
 section.querySelector('#aiExecutiveBriefReload').addEventListener('click',reload);
}
const start=()=>{ensureUI();setupExecutiveBriefControl();load()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,300));else setTimeout(start,300);
})();

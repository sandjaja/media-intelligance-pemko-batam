(()=>{
'use strict';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,options={}){const r=await fetch(API+path,{credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.detail||d.error||`HTTP ${r.status}`);return d}
function toast(msg,ok=true){const t=$('#toast');if(!t)return;t.textContent=msg;t.className=`fixed bottom-5 right-5 glass rounded-xl px-4 py-3 text-xs shadow-2xl ${ok?'text-emerald-300':'text-rose-300'}`;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),3500)}
function fmt(v){if(!v)return'-';try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(v))}catch{return String(v)}}
function historyDetails(result){if(!result)return '';const labels={online:'Media Online',owned:'Owned Channel',social:'YouTube'};const parts=[];for(const [key,label] of Object.entries(labels)){const r=result[key];if(r)parts.push(esc(label)+': '+Number(r.succeeded||0)+' berhasil · '+Number(r.failed||0)+' gagal'+(r.error?' · '+esc(r.error):''));}if(result.apify){const a=result.apify;parts.push('Apify: '+esc(a.status)+(a.period?' · '+esc(a.period.date)+' WIB':'')+(a.error?' · '+esc(a.error):''));for(const step of a.steps||[])parts.push(esc(step.kind)+': '+esc(step.status)+' · '+Number(step.counts?.succeeded||0)+' tersimpan/diperbarui'+(step.error?' · '+esc(step.error):''));}return parts.join('<br>');}
function ensureUI(){
 const ws=$('#workspace');if(!ws)return false;if($('#schedulerPanel'))return true;
 const nav=ws.querySelector('.flex.gap-2.border-b')||ws.querySelector('.border-b');if(!nav)return false;
 const b=document.createElement('button');b.dataset.tab='scheduler';b.className='tab px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-bold text-sm';b.textContent='Scheduler';nav.appendChild(b);
 ws.insertAdjacentHTML('beforeend',`<section id="schedulerPanel" class="hidden space-y-5">
 <div class="glass rounded-2xl p-5"><div class="flex flex-wrap items-start justify-between gap-3"><div><div class="text-[10px] tracking-widest text-cyan-400 font-black">DATA COLLECTION ORCHESTRATOR</div><h2 class="text-xl font-black mt-1">Scheduler Pengumpulan Data</h2><p class="text-xs text-slate-500 mt-1">Satu jadwal untuk mengendalikan collector Media Online, Owned Channel, dan Media Sosial.</p></div><span id="schedState" class="px-3 py-1 rounded-full text-xs font-black bg-slate-800">NONAKTIF</span></div>
 <p id="schedEnvNote" class="text-xs text-amber-500 mt-3"></p><form id="schedForm" class="mt-5 space-y-5"><div class="grid md:grid-cols-3 gap-4"><label class="rounded-xl border border-slate-800 p-4"><div class="text-xs text-slate-400">Pengumpulan otomatis</div><div class="mt-2 flex items-center gap-2"><input id="schedEnabled" type="checkbox" class="w-5 h-5"><b>Aktifkan Scheduler</b></div><div class="mt-3 text-[11px] leading-relaxed text-slate-500"><b class="text-slate-300">Cara menonaktifkan:</b> hilangkan centang <b>Aktifkan Scheduler</b>, lalu tekan <b>Simpan Pengaturan</b>. Pengumpulan baru untuk seluruh sumber yang dipilih tidak dimulai selama Scheduler nonaktif.</div></label><label class="rounded-xl border border-slate-800 p-4"><div class="text-xs text-slate-400">Jam eksekusi otomatis</div><div class="mt-2 font-bold">08:00 WIB</div><div class="text-[10px] text-amber-300 mt-1">Tetap selama menggunakan Vercel Hobby.</div><input id="schedTime" type="hidden" value="08:00"></label><div class="rounded-xl border border-slate-800 p-4"><div class="text-xs text-slate-400">Timezone</div><div class="mt-2 font-bold">Asia/Jakarta · WIB</div></div></div>
 <div class="grid md:grid-cols-3 gap-4">
 <label class="rounded-xl border border-slate-800 p-4 flex gap-3"><input id="schedOnline" type="checkbox" class="w-5 h-5 mt-1"><div><b>Media Online</b><div class="text-xs text-slate-500 mt-1">Portal berita/media eksternal.</div></div></label>
 <label class="rounded-xl border border-slate-800 p-4 flex gap-3"><input id="schedOwned" type="checkbox" class="w-5 h-5 mt-1"><div><b>Owned Channel</b><div class="text-xs text-slate-500 mt-1">Website resmi Pemko/OPD/Kecamatan.</div></div></label>
 <label id="schedSocialCard" class="rounded-xl border border-slate-800 p-4 flex gap-3"><input id="schedSocial" type="checkbox" class="w-5 h-5 mt-1"><div><b>Media Sosial</b><div id="schedSocialNote" class="text-xs text-slate-500 mt-1">YouTube serta Actor Instagram/TikTok yang aktif di Admin. Apify menyimpan data kemarin WIB; biaya dan batas jumlah mengikuti pengaturan Admin.</div></div></label></div>
 <div class="flex flex-wrap gap-2"><button type="submit" class="px-4 py-2.5 rounded-lg bg-cyan-400 text-slate-950 font-black">Simpan Pengaturan</button><button id="schedRunNow" type="button" class="px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 font-bold">Jalankan Sekarang</button></div></form></div>
 <div class="glass rounded-2xl p-5"><h3 class="font-black">Riwayat Pengumpulan</h3><p id="schedLast" class="text-xs text-slate-500 mt-1">Belum pernah dijalankan.</p><div id="schedHistory" class="mt-4 space-y-2"></div></div></section>`);
 $('#schedForm').addEventListener('submit',save);
 $('#schedRunNow').addEventListener('click',runNow);
 return true;
}
async function load(){
 if(!ensureUI())return;
 try{const d=(await api('/admin/collection-scheduler')).data,c=d.config||{};$('#schedEnabled').checked=!!c.enabled;$('#schedOnline').checked=!!c.online_enabled;$('#schedOwned').checked=!!c.owned_enabled;const socialReady=d.socialReady===true;$('#schedSocial').disabled=!socialReady;$('#schedSocial').checked=socialReady&&!!c.social_enabled;$('#schedSocialCard')?.classList.toggle('opacity-60',!socialReady);if($('#schedSocialNote'))$('#schedSocialNote').textContent=socialReady?'YouTube serta Actor Instagram/TikTok yang aktif di Admin. Apify menyimpan data kemarin WIB; biaya dan batas jumlah mengikuti pengaturan Admin.':'Collector media sosial belum siap.';$('#schedState').textContent=c.enabled?'AKTIF':'NONAKTIF';$('#schedState').className=`px-3 py-1 rounded-full text-xs font-black ${c.enabled?'bg-emerald-500/10 text-emerald-300':'bg-slate-800 text-slate-400'}`;if($('#schedEnvNote'))$('#schedEnvNote').textContent=d.deploymentEnvironment==='preview'?'Deployment Preview: jadwal otomatis Vercel hanya berjalan di Production.':'Jadwal harian sekitar 08.00 WIB. Actor Apify dan batas biayanya mengikuti pengaturan integrasi Admin.';const h=d.history||[];$('#schedLast').textContent=h[0]?`Terakhir: ${fmt(h[0].started_at)} · ${h[0].status}`:'Belum pernah dijalankan.';$('#schedHistory').innerHTML=h.map(x=>`<div class="rounded-lg border border-slate-800 p-3 flex flex-wrap justify-between gap-2"><div><b class="text-sm">${esc(x.trigger_type)}</b><div class="text-xs text-slate-500">${fmt(x.started_at)}</div></div><span class="text-xs font-bold">${esc(x.status)}</span><div class="w-full text-xs text-slate-500">${historyDetails(x.result)}</div></div>`).join('')||'<div class="text-sm text-slate-500">Belum ada riwayat.</div>'}catch(e){toast(e.message,false)}
}
async function save(e){e.preventDefault();try{await api('/admin/collection-scheduler',{method:'PUT',body:JSON.stringify({enabled:$('#schedEnabled').checked,runTime:$('#schedTime').value,onlineEnabled:$('#schedOnline').checked,ownedEnabled:$('#schedOwned').checked,socialEnabled:!$('#schedSocial').disabled&&$('#schedSocial').checked})});toast('Pengaturan scheduler disimpan.');await load()}catch(e){toast(e.message,false)}}
async function runNow(){const sources=[];if($('#schedOnline').checked)sources.push('online');if($('#schedOwned').checked)sources.push('owned');if(!$('#schedSocial').disabled&&$('#schedSocial').checked)sources.push('social');if(!sources.length)return toast('Pilih minimal satu sumber untuk dijalankan.',false);if(!confirm(`Jalankan pengumpulan sekarang untuk: ${sources.join(', ')}?${sources.includes('social')?' Actor Apify aktif ikut dijalankan dengan batas biaya Admin.':''}`))return;const b=$('#schedRunNow');b.disabled=true;b.textContent='Sedang menjalankan...';try{const j=await api('/admin/collection-scheduler/run',{method:'POST',body:JSON.stringify({sources})});toast(j.data?.skipped?'Pengumpulan sudah berjalan atau sudah dijalankan.':j.data?.status==='RUNNING'?'Pengumpulan berjalan. Hasil Apify akan diimpor otomatis.':j.data?.status==='SUCCESS'?'Pengumpulan selesai.':'Pengumpulan selesai dengan catatan; periksa riwayat.',j.data?.status!=='FAILED');await load()}catch(e){toast(e.message,false)}finally{b.disabled=false;b.textContent='Jalankan Sekarang'}}
function setupExecutiveBriefControl(){
 const panel=document.getElementById('schedulerPanel');
 if(!panel||document.getElementById('aiExecutiveBriefSection'))return;
 const section=document.createElement('details');
 section.id='aiExecutiveBriefSection';
 section.className='glass rounded-2xl p-5 space-y-3';
 section.innerHTML='<summary class="cursor-pointer font-bold text-lg">Jadwal Executive Brief Harian</summary><p class="text-xs text-slate-400 mt-2">Jadwal yang disarankan: 06.30 WIB. Scheduler otomatis belum diaktifkan. Membuka dashboard hanya membaca hasil tersimpan, tanpa menggunakan kuota Gemini.</p><div id="aiExecutiveBriefStatus" class="text-xs text-slate-400 mt-2">Memuat status...</div><div class="mt-3 flex flex-wrap items-center gap-2 text-xs"><label for="aiExecutiveBriefHour">Jam WIB</label><input id="aiExecutiveBriefHour" type="number" min="0" max="23" value="6" class="w-16 rounded border border-slate-600 bg-transparent px-2 py-1"><span>:</span><input id="aiExecutiveBriefMinute" type="number" min="0" max="59" value="30" aria-label="Menit WIB" class="w-16 rounded border border-slate-600 bg-transparent px-2 py-1"><button type="button" id="aiExecutiveBriefSave" class="rounded-lg border border-cyan-600 px-3 py-2 text-xs">Simpan Jam (Nonaktif)</button></div><div id="aiExecutiveBriefScheduleStatus" class="mt-2 text-xs text-slate-400">Jadwal belum dimuat</div><div class="mt-3 flex items-center gap-3 text-xs"><label class="flex items-center gap-2"><input type="checkbox" id="aiExecutiveBriefEnabled"> Aktifkan Executive Brief Otomatis</label><span id="aiExecutiveBriefActivationStatus" class="text-amber-400">Belum tersedia — penghubung cron belum diuji</span></div><button type="button" id="aiExecutiveBriefReload" class="mt-2 rounded-lg border border-slate-600 px-3 py-2 text-xs">Perbarui Status</button><button type="button" id="aiExecutiveBriefPreflight" class="mt-2 ml-2 rounded-lg border border-cyan-600 px-3 py-2 text-xs">Uji Jadwal (Tanpa AI)</button><div id="aiExecutiveBriefPreflightResult" class="mt-2 text-xs text-slate-400"></div><button type="button" id="aiExecutiveBriefRunOnce" class="mt-2 rounded-lg border border-amber-600 px-3 py-2 text-xs">Smoke Test AI Sekali (Manual)</button><div id="aiExecutiveBriefRunOnceResult" class="mt-2 text-xs text-slate-400"></div><p class="text-xs text-amber-400 mt-2">Pembuatan analisis manual belum dibuka melalui UI sampai smoke test pengaman kuota selesai.</p>';
 panel.appendChild(section);
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
    :'Belum ada Executive Brief harian tersimpan. Scheduler otomatis NONAKTIF.';
  }catch(e){status.textContent='Status tidak tersedia: '+e.message;}
 }
 async function loadSchedule(){
  const status=section.querySelector('#aiExecutiveBriefScheduleStatus');
  try{
   const r=await fetch('/api/admin/executive-brief/schedule',{credentials:'include',cache:'no-store'});
   const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);
   section.querySelector('#aiExecutiveBriefHour').value=j.data.hour_wib;
   section.querySelector('#aiExecutiveBriefMinute').value=j.data.minute_wib;
   activation.checked=!!j.data.enabled;
   status.textContent='Tersimpan: '+String(j.data.hour_wib).padStart(2,'0')+':'+String(j.data.minute_wib).padStart(2,'0')+' WIB · '+(j.data.enabled?'AKTIF':'NONAKTIF')+' · '+(j.scheduler_connected?'runner terhubung':'aktivasi otomatis belum tersedia')+'.';
  }catch(e){status.textContent='Pengaturan belum tersedia: '+e.message;}
 }
 const activation=section.querySelector('#aiExecutiveBriefEnabled');
 activation.disabled=true;
 activation.addEventListener('change',async()=>{
  activation.checked=false;
  section.querySelector('#aiExecutiveBriefActivationStatus').textContent='Belum dapat diaktifkan sebelum penghubung cron selesai diuji.';
 });
 section.querySelector('#aiExecutiveBriefSave').addEventListener('click',async()=>{
  const btn=section.querySelector('#aiExecutiveBriefSave'),status=section.querySelector('#aiExecutiveBriefScheduleStatus');
  const hour=Number(section.querySelector('#aiExecutiveBriefHour').value),minute=Number(section.querySelector('#aiExecutiveBriefMinute').value);
  if(!Number.isInteger(hour)||hour<0||hour>23||!Number.isInteger(minute)||minute<0||minute>59){status.textContent='Jam tidak valid.';return;}
  btn.disabled=true;
  try{
   const r=await fetch('/api/admin/executive-brief/schedule',{method:'PUT',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({hour_wib:hour,minute_wib:minute})});
   const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);
   await loadSchedule();
  }catch(e){status.textContent='Gagal menyimpan: '+e.message;}finally{btn.disabled=false;}
 });
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
   status.textContent='Respons server: '+JSON.stringify(j.data).slice(0,600)+' · Periksa hasil tersimpan dan riwayat AI.';
   await reload();await loadSchedule();
  }catch(e){status.textContent='Smoke test gagal: '+e.message;}finally{btn.disabled=false;}
 });
 section.querySelector('#aiExecutiveBriefReload').addEventListener('click',reload);
}
const start=()=>{if(ensureUI())setupExecutiveBriefControl();load()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,300));else setTimeout(start,300);
})();
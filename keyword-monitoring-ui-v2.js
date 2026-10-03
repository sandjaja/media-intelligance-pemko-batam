(()=>{'use strict';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,opts={}){const r=await fetch(API+path,{credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},...opts}),j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.detail||j.error||`HTTP ${r.status}`);return j}
function root(){return document.getElementById('sources')}
function shell(){return window.dataIssueShell?.shell?.('issues','keywords')||''}
function bind(el){window.dataIssueShell?.bindShell?.(el)}
function splitPreview(v){return [...new Set(String(v||'').split(/[\n,;|]+/).map(x=>x.trim()).filter(Boolean).map(x=>x.replace(/\s+/g,' ')))];}
function legacyTarget(k){return k.target_type==='district'?(k.district_name||'Kecamatan'):(k.opd_name||'OPD')}
async function openKeywordMonitoringV2(){
 const el=root();if(!el)return;el.classList.remove('hidden');el.innerHTML=shell()+'<div class="glass rounded-2xl p-5">Memuat Keyword Monitoring...</div>';bind(el);
 try{
  const [tr,kr]=await Promise.all([api('/admin/issue-taxonomy/taxonomies'),api('/admin/keywords')]);
  const tax=(tr.data||[]).filter(t=>t.active),legacy=kr.data||[];
  el.innerHTML=shell()+`<div class="space-y-4">
   <div class="glass rounded-2xl p-5 border-l-4 border-violet-500">
    <div class="text-[10px] tracking-widest text-violet-400 font-black">KEYWORD MONITORING V2</div>
    <div class="flex flex-wrap items-start justify-between gap-3 mt-1"><div><h2 class="text-lg font-black">Keyword Berbasis Taxonomy</h2><p class="text-xs text-slate-500 mt-1 max-w-3xl">Admin cukup memilih taxonomy lalu memasukkan satu atau banyak keyword. Sistem akan menyimpan satu keyword sebagai satu record dan menghubungkannya ke taxonomy terpilih.</p></div><span class="px-3 py-1 rounded-full text-[10px] font-bold border border-violet-500/30 bg-violet-500/10 text-violet-300">UI PREVIEW</span></div>
   </div>
   <div class="grid xl:grid-cols-[420px_1fr] gap-5">
    <form id="kwV2Form" class="glass rounded-2xl p-5 space-y-4">
     <div><div class="text-[10px] tracking-widest text-violet-400 font-black">TAMBAH KEYWORD</div><h3 class="font-black mt-1">Konfigurasi Monitoring</h3></div>
     <label class="block text-xs text-slate-400">Taxonomy<select id="kwV2Tax" required class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5"><option value="">Pilih taxonomy...</option>${tax.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>
     <label class="block text-xs text-slate-400">Keyword / frasa<textarea id="kwV2Text" rows="9" required class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 resize-y" placeholder="Trans Batam\ntransportasi publik\njukir\njuru parkir\nPJU Batam\nPenerangan Jalan Umum"></textarea></label>
     <div class="rounded-xl border border-sky-500/25 bg-sky-500/10 p-3 text-[11px] leading-relaxed text-slate-300"><div class="font-black text-sky-300 mb-1.5">Cara memasukkan keyword</div><p><b>Satu kata atau satu frasa = satu keyword.</b> Frasa yang memiliki spasi tetap dibaca sebagai satu keyword.</p><p class="mt-1.5">Pisahkan beberapa keyword dengan <b>Enter</b> atau <b>koma</b>. Titik koma dan garis vertikal juga dapat digunakan.</p><div class="mt-2 rounded-lg bg-slate-950/50 border border-slate-800 p-2"><div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Contoh yang benar</div><span class="text-emerald-300">jukir</span>, <span class="text-emerald-300">juru parkir</span>, <span class="text-emerald-300">parkir liar</span>, <span class="text-emerald-300">tarif parkir</span></div><p class="mt-2 text-amber-200"><b>Singkatan dan istilah alternatif dibuat terpisah.</b> Contoh: masukkan <b>PJU Batam</b> dan <b>Penerangan Jalan Umum</b> sebagai dua keyword, bukan “PJU Batam (Penerangan Jalan Umum)”.</p></div>
     <div id="kwV2Preview" class="hidden rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div class="flex items-center justify-between gap-2"><div class="text-[10px] uppercase tracking-wider text-slate-500">Preview keyword</div><div id="kwV2PreviewCount" class="text-[10px] font-bold text-violet-300"></div></div><div id="kwV2PreviewList" class="flex flex-wrap gap-1.5 mt-2"></div><p class="mt-2 text-[10px] text-slate-500">Setiap chip di atas akan diperlakukan sebagai satu keyword/frasa.</p></div>
     <label class="flex items-center gap-2 text-sm"><input id="kwV2Active" type="checkbox" checked class="w-4 h-4"> Aktif untuk monitoring</label>
     <p class="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-[10px] leading-relaxed text-slate-500">Teknis pencocokan dan pembobotan dikelola otomatis oleh engine. Admin cukup menentukan taxonomy dan keyword yang ingin dimonitor.</p>
     <div id="kwV2Info" class="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Tampilan ini sudah memakai konsep baru. Penyimpanan taxonomy-keyword akan diaktifkan setelah API bulk-save dan deduplikasi V2 dibuat.</div>
     <button id="kwV2Submit" type="submit" disabled class="w-full bg-violet-500 text-white font-black rounded-lg py-2.5">SIMPAN KEYWORD</button>
    </form>
    <div class="space-y-4">
     <div class="grid sm:grid-cols-2 gap-3"><div class="glass rounded-xl p-4"><div class="text-2xl font-black text-violet-300">${tax.length}</div><div class="text-[10px] uppercase text-slate-500 mt-1">Taxonomy aktif</div></div><div class="glass rounded-xl p-4"><div class="text-2xl font-black">${legacy.length}</div><div class="text-[10px] uppercase text-slate-500 mt-1">Keyword lama</div></div></div>
     <div class="glass rounded-2xl p-5 overflow-x-auto"><div class="flex flex-wrap justify-between gap-3 mb-4"><div><h3 class="font-black">Daftar Keyword Monitoring</h3><p class="text-xs text-slate-500 mt-1">Setelah backend V2 aktif, tabel utama akan menampilkan Keyword → Taxonomy.</p></div><div class="relative"><input id="kwV2Search" placeholder="Cari keyword..." class="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs w-52"></div></div><table class="w-full text-xs"><thead class="text-slate-500"><tr><th class="text-left p-2">Keyword</th><th class="text-left p-2">Taxonomy</th><th class="text-center p-2">Status</th><th class="text-right p-2">Aksi</th></tr></thead><tbody id="kwV2Rows"><tr><td colspan="4" class="p-6 text-center text-slate-500">Belum ada relasi keyword-taxonomy yang ditampilkan melalui API V2.</td></tr></tbody></table></div>
     ${legacy.length?`<details class="glass rounded-2xl overflow-hidden"><summary class="cursor-pointer px-5 py-4 text-xs font-bold text-amber-300">${legacy.length} keyword lama menunggu migrasi ke taxonomy</summary><div class="p-5 border-t border-slate-800 overflow-x-auto"><table class="w-full text-xs"><thead class="text-slate-500"><tr><th class="text-left p-2">Keyword lama</th><th class="text-left p-2">Target lama</th><th class="text-center p-2">Status</th></tr></thead><tbody id="kwV2LegacyRows">${legacy.map(k=>`<tr class="border-t border-slate-800"><td class="p-2">${esc(k.keyword)}</td><td class="p-2"><span class="text-[10px] uppercase text-slate-500">${k.target_type==='district'?'Kecamatan':'OPD'}</span><div>${esc(legacyTarget(k))}</div></td><td class="text-center p-2">${k.active?'AKTIF':'NONAKTIF'}</td></tr>`).join('')}</tbody></table></div></details>`:''}
    </div>
   </div>
  </div>`;
  bind(el);
  const text=el.querySelector('#kwV2Text'),preview=el.querySelector('#kwV2Preview'),list=el.querySelector('#kwV2PreviewList'),count=el.querySelector('#kwV2PreviewCount');
  const refreshPreview=()=>{const items=splitPreview(text.value);if(!items.length){preview.classList.add('hidden');list.innerHTML='';count.textContent='';return}preview.classList.remove('hidden');count.textContent=`${items.length} keyword akan disimpan`;list.innerHTML=items.slice(0,40).map(x=>`<span class="px-2 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-[10px] text-violet-200">${esc(x)}</span>`).join('')+(items.length>40?`<span class="text-[10px] text-slate-500 px-2 py-1">+${items.length-40} lainnya</span>`:'')};
  text.addEventListener('input',refreshPreview);
  el.querySelector('#kwV2Form').addEventListener('submit',e=>e.preventDefault());
  const search=el.querySelector('#kwV2Search');search?.addEventListener('input',()=>{});
 }catch(e){el.innerHTML=shell()+`<div class="glass rounded-2xl p-5 text-rose-300">${esc(e.message)}</div>`;bind(el)}
}
window.openKeywordSourceManagement=openKeywordMonitoringV2;
document.addEventListener('click',e=>{const b=e.target?.closest?.('[data-di-sub="keywords"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();openKeywordMonitoringV2().catch(()=>{})},true);
})();
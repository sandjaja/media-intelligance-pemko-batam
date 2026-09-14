(()=>{'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const root=()=>document.getElementById('sources');
  const STORAGE='mi_topik_pantauan_ui_draft_v1';
  const sample=[
    {name:'Banjir Musim Hujan',keywords:'banjir, genangan, drainase meluap',opd:'BPBD / Humas',district:'Sei Beduk, Sagulung',period:'Sep–Des 2026',status:'AKTIF'},
    {name:'Keluhan Sampah Bengkong',keywords:'sampah, tumpukan sampah, keluhan kebersihan',opd:'DLH / Humas',district:'Bengkong',period:'Sep 2026',status:'AKTIF'}
  ];
  const draft=()=>{try{return JSON.parse(localStorage.getItem(STORAGE)||'null')}catch{return null}};
  const saveDraft=v=>localStorage.setItem(STORAGE,JSON.stringify(v));
  function shell(){
    const dataIssueShell=window.dataIssueShell;
    if(dataIssueShell?.shell)return dataIssueShell.shell('issues','keywords');
    return '';
  }
  function render(){
    const el=root();if(!el)return;el.classList.remove('hidden');
    const d=draft()||{};
    el.innerHTML=shell()+`<div class="space-y-5">
      <div class="glass rounded-2xl p-5 border border-cyan-500/20">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div><div class="text-[10px] tracking-widest text-cyan-400 font-black">RANCANGAN UI</div><h2 class="font-black text-lg mt-1">Topik Pantauan</h2><p class="text-xs text-slate-400 mt-1 max-w-3xl">Topik Pantauan digunakan Humas/Admin untuk menentukan isu atau tema khusus yang ingin dipantau dalam periode tertentu. Topik ini <b class="text-slate-200">tidak menentukan OPD utama artikel</b>; routing OPD tetap berasal dari Master Klasifikasi.</p></div>
          <span class="text-[10px] px-2 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">Prototype · belum menulis database</span>
        </div>
      </div>
      <div class="grid xl:grid-cols-[420px_1fr] gap-5">
        <form id="tpForm" class="glass rounded-2xl p-5 space-y-3">
          <div><div class="text-[10px] tracking-widest text-violet-400 font-black">BUAT TOPIK</div><h3 class="font-black mt-1">Tambah / Edit Topik Pantauan</h3></div>
          <label class="block text-xs text-slate-400">Nama Topik<input id="tpName" required value="${esc(d.name||'')}" class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" placeholder="Contoh: Banjir Musim Hujan"></label>
          <label class="block text-xs text-slate-400">Keyword / Frasa Pantauan<textarea id="tpKeywords" required rows="3" class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" placeholder="banjir, genangan, drainase meluap">${esc(d.keywords||'')}</textarea><span class="text-[10px] text-slate-500">Dipakai untuk mendeteksi artikel/mention yang masuk ke topik ini.</span></label>
          <label class="block text-xs text-slate-400">OPD Pemantau<select id="tpOpd" class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"><option>Humas Pemko</option><option>BPBD</option><option>DLH</option><option>Dishub</option><option>Dinas Kesehatan</option><option>Lintas OPD</option></select><span class="text-[10px] text-slate-500">Menentukan pemilik/pemantau topik, bukan routing OPD artikel.</span></label>
          <label class="block text-xs text-slate-400">Wilayah / Kecamatan<select id="tpDistrict" class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"><option>Semua Kecamatan</option><option>Batam Kota</option><option>Bengkong</option><option>Sei Beduk</option><option>Sagulung</option><option>Sekupang</option></select></label>
          <div class="grid grid-cols-2 gap-2"><label class="block text-xs text-slate-400">Mulai<input id="tpStart" type="date" value="${esc(d.start||'')}" class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"></label><label class="block text-xs text-slate-400">Selesai<input id="tpEnd" type="date" value="${esc(d.end||'')}" class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"></label></div>
          <label class="flex gap-2 text-sm"><input id="tpActive" type="checkbox" ${d.active===false?'':'checked'}> Aktif dipantau</label>
          <div class="flex gap-2"><button class="flex-1 bg-violet-500 hover:bg-violet-400 text-white font-black rounded-lg py-2">SIMPAN RANCANGAN</button><button id="tpReset" type="button" class="px-4 bg-slate-800 border border-slate-700 rounded-lg">RESET</button></div>
          <div class="text-[10px] text-slate-500">Untuk tahap ini tombol hanya menyimpan rancangan di browser agar UI bisa kita koreksi sebelum membuat schema database permanen.</div>
        </form>
        <div class="space-y-5">
          <div class="grid sm:grid-cols-3 gap-3">
            <div class="glass rounded-xl p-4"><div class="text-[10px] text-slate-500">TOPIK AKTIF</div><div class="text-2xl font-black mt-1">2</div></div>
            <div class="glass rounded-xl p-4"><div class="text-[10px] text-slate-500">MENTION 7 HARI</div><div class="text-2xl font-black mt-1">—</div></div>
            <div class="glass rounded-xl p-4"><div class="text-[10px] text-slate-500">COMM. GAP</div><div class="text-2xl font-black mt-1">—</div></div>
          </div>
          <div class="glass rounded-2xl p-5 overflow-x-auto"><div class="flex flex-wrap justify-between gap-2 mb-3"><div><h3 class="font-black">Daftar Topik Pantauan</h3><p class="text-xs text-slate-500">Contoh tampilan untuk evaluasi UI dan alur kerja.</p></div><button id="tpCommGap" type="button" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold"><i class="fa-solid fa-chart-line mr-2 text-cyan-300"></i>Lihat Communications Gap</button></div>
            <table class="w-full text-xs min-w-[820px]"><thead class="text-slate-500"><tr><th class="text-left p-2">Topik</th><th class="text-left">Keyword</th><th class="text-left">Pemantau</th><th class="text-left">Wilayah</th><th class="text-left">Periode</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${sample.map(x=>`<tr class="border-t border-slate-800"><td class="p-2 font-bold">${esc(x.name)}</td><td class="max-w-[260px] text-slate-300">${esc(x.keywords)}</td><td>${esc(x.opd)}</td><td>${esc(x.district)}</td><td>${esc(x.period)}</td><td class="text-center"><span class="text-emerald-300">${x.status}</span></td><td class="text-center whitespace-nowrap"><button class="text-violet-300 mr-3">Edit</button><button class="text-slate-400">Detail</button></td></tr>`).join('')}</tbody></table>
          </div>
          <div class="glass rounded-2xl p-5 border-l-4 border-cyan-500"><div class="font-black text-sm">Alur yang dirancang</div><div class="text-xs text-slate-400 mt-2 leading-6">Topik Pantauan → artikel/mention yang cocok → ringkasan volume & sentimen → bila percakapan publik tinggi tetapi respons resmi rendah → sinyal masuk ke <b class="text-cyan-300">Communications Gap</b>.</div></div>
        </div>
      </div>
    </div>`;
    window.dataIssueShell?.bindShell?.(el);
    const label=el.querySelector('[data-di-sub="keywords"]');if(label)label.textContent='Topik Pantauan';
    el.querySelector('#tpForm')?.addEventListener('submit',e=>{e.preventDefault();saveDraft({name:el.querySelector('#tpName').value.trim(),keywords:el.querySelector('#tpKeywords').value.trim(),start:el.querySelector('#tpStart').value,end:el.querySelector('#tpEnd').value,active:el.querySelector('#tpActive').checked});window.toast?.('Rancangan Topik Pantauan disimpan di browser.');});
    el.querySelector('#tpReset')?.addEventListener('click',()=>{localStorage.removeItem(STORAGE);render();});
    el.querySelector('#tpCommGap')?.addEventListener('click',()=>{if(typeof window.showTab==='function')window.showTab('commgap');else document.querySelector('[data-tab="commgap"]')?.click();});
  }
  function patchNav(){const el=root();if(!el)return;const b=el.querySelector('[data-di-sub="keywords"]');if(b){b.textContent='Topik Pantauan';if(!b.dataset.tpBound){b.dataset.tpBound='1';b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();render();},true);}}}
  const obs=new MutationObserver(()=>patchNav());const start=()=>{const el=root();if(el){obs.observe(el,{childList:true,subtree:true});patchNav();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  window.openTopicMonitoring=render;
})();
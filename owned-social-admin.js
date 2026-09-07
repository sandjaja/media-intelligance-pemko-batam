(()=>{
  const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(path,options={}){const r=await fetch(API+path,{credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);return data;}
  const toast=(msg,ok=true)=>{const t=$('#toast');if(!t)return;t.textContent=msg;t.className=`fixed bottom-5 right-5 glass rounded-xl px-4 py-3 text-xs shadow-2xl ${ok?'text-emerald-300':'text-rose-300'}`;clearTimeout(window.__ownedSocialToast);window.__ownedSocialToast=setTimeout(()=>t.classList.add('hidden'),3200)};
  const workspace=$('#workspace'); if(!workspace) return;
  const nav=workspace.querySelector('.flex.gap-2.border-b')||workspace.querySelector('.border-b'); if(!nav) return;

  const tab=document.createElement('button');
  tab.dataset.tab='ownedSocial';
  tab.className='tab px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-bold text-sm';
  tab.textContent='Akun Resmi';
  const usersTab=nav.querySelector('[data-tab="users"]');
  if(usersTab) nav.insertBefore(tab,usersTab); else nav.appendChild(tab);

  workspace.insertAdjacentHTML('beforeend',`
  <section id="ownedSocialPanel" class="hidden space-y-4">
    <div class="grid lg:grid-cols-[440px_1fr] gap-5">
      <form id="ownedSocialForm" class="glass rounded-2xl p-5 space-y-4">
        <div><div class="text-[10px] tracking-widest text-sky-400 font-black">OWNED SOCIAL INTELLIGENCE</div><h2 class="text-lg font-black mt-1">Tambah Akun Resmi</h2><p class="text-xs text-slate-500 mt-1">Master akun resmi Pemko Batam/Humas/OPD untuk analitik kanal milik pemerintah.</p></div>
        <input type="hidden" id="ownedSocialId">
        <label class="block text-xs text-slate-400">OPD Pemilik<select id="ownedSocialOpd" class="mt-1 w-full rounded-lg px-3 py-2.5"><option value="">Pemko Batam / lintas OPD</option></select></label>
        <label class="block text-xs text-slate-400">Platform<select id="ownedSocialPlatform" class="mt-1 w-full rounded-lg px-3 py-2.5"><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option><option value="x">X</option><option value="youtube">YouTube</option><option value="linkedin">LinkedIn</option><option value="threads">Threads</option></select></label>
        <label class="block text-xs text-slate-400">Nama Akun<input id="ownedSocialName" required maxlength="200" class="mt-1 w-full rounded-lg px-3 py-2.5" placeholder="Pemko Batam"></label>
        <label class="block text-xs text-slate-400">Username / Handle<input id="ownedSocialHandle" required maxlength="200" class="mt-1 w-full rounded-lg px-3 py-2.5" placeholder="@pemkobatam"></label>
        <label class="block text-xs text-slate-400">URL Profil<input id="ownedSocialUrl" type="url" maxlength="1000" class="mt-1 w-full rounded-lg px-3 py-2.5" placeholder="https://..."></label>
        <label class="block text-xs text-slate-400">Tipe Akun<select id="ownedSocialType" class="mt-1 w-full rounded-lg px-3 py-2.5"><option value="primary">Utama</option><option value="supporting" selected>Pendukung</option></select></label>
        <label class="flex items-center gap-2 text-sm"><input id="ownedSocialActive" type="checkbox" checked class="w-4 h-4"> Aktif untuk monitoring</label>
        <div class="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-500">Password dan token media sosial tidak disimpan di master ini. Integrasi API akan menggunakan credential store terpisah.</div>
        <div class="flex gap-2"><button class="flex-1 px-4 py-2.5 rounded-lg bg-sky-400 text-slate-950 font-black" type="submit">Simpan</button><button id="ownedSocialReset" type="button" class="px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 font-bold">Reset</button></div>
      </form>
      <div class="glass rounded-2xl p-5 overflow-hidden">
        <div class="flex items-center justify-between mb-4"><div><h2 class="font-black">Daftar Akun Resmi</h2><p class="text-xs text-slate-500">Akun resmi untuk Owned Social Intelligence dan pengukuran performa kanal.</p></div><span id="ownedSocialCount" class="text-xs px-2 py-1 rounded-full bg-slate-800 text-slate-300">0</span></div>
        <div class="overflow-x-auto"><table class="w-full text-sm"><thead class="text-[10px] uppercase tracking-wider text-slate-500"><tr><th class="text-left p-2">Platform</th><th class="text-left p-2">Akun</th><th class="text-left p-2">OPD</th><th class="text-center p-2">Tipe</th><th class="text-center p-2">Status</th><th class="text-right p-2">Aksi</th></tr></thead><tbody id="ownedSocialRows"></tbody></table></div>
      </div>
    </div>
  </section>`);

  let accounts=[];
  function hideOwnedUnlessSelected(id){$('#ownedSocialPanel')?.classList.toggle('hidden',id!=='ownedSocial');}
  nav.addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;const id=b.dataset.tab;hideOwnedUnlessSelected(id);if(id==='ownedSocial'){
    ['opd','sources','districts','keywords','users'].forEach(x=>document.querySelector(`#${x}Panel`)?.classList.add('hidden'));
    document.querySelectorAll('.tab').forEach(x=>x.className='tab px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-bold text-sm');
    b.className='tab px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-black text-sm';
    loadAccounts().catch(err=>toast(err.message,false));
  }});

  async function loadOpdOptions(){const opds=(await api('/admin/opd')).data||[];$('#ownedSocialOpd').innerHTML='<option value="">Pemko Batam / lintas OPD</option>'+opds.map(x=>`<option value="${x.id}">${esc(x.name)} (${esc(x.code)})</option>`).join('');}
  function reset(){ $('#ownedSocialId').value='';$('#ownedSocialOpd').value='';$('#ownedSocialPlatform').value='instagram';$('#ownedSocialName').value='';$('#ownedSocialHandle').value='';$('#ownedSocialUrl').value='';$('#ownedSocialType').value='supporting';$('#ownedSocialActive').checked=true; }
  function render(){ $('#ownedSocialCount').textContent=accounts.length;$('#ownedSocialRows').innerHTML=accounts.map(x=>`<tr class="border-t border-slate-800"><td class="p-2 uppercase text-xs text-sky-300">${esc(x.platform)}</td><td class="p-2"><b>${esc(x.account_name)}</b><div class="text-[10px] text-slate-500">${esc(x.handle)}</div></td><td class="p-2 text-xs">${esc(x.opd_name||'Pemko Batam')}</td><td class="p-2 text-center text-xs">${x.account_type==='primary'?'UTAMA':'PENDUKUNG'}</td><td class="p-2 text-center"><span class="px-2 py-1 rounded-full text-[10px] ${x.active?'bg-emerald-500/10 text-emerald-300':'bg-slate-800 text-slate-500'}">${x.active?'AKTIF':'NONAKTIF'}</span></td><td class="p-2 text-right whitespace-nowrap"><button data-owned-edit="${x.id}" class="px-2 py-1 rounded bg-slate-800 text-sky-300 mr-1">Edit</button>${x.active?`<button data-owned-off="${x.id}" class="px-2 py-1 rounded bg-rose-500/10 text-rose-300">Nonaktifkan</button>`:''}</td></tr>`).join('')||`<tr><td colspan="6" class="p-8 text-center text-slate-500">Belum ada akun resmi.</td></tr>`;}
  async function loadAccounts(){accounts=(await api('/admin/owned-social-accounts')).data||[];render();}

  $('#ownedSocialForm').addEventListener('submit',async e=>{e.preventDefault();const id=$('#ownedSocialId').value;const opd=$('#ownedSocialOpd').value;const body={opdId:opd?Number(opd):null,platform:$('#ownedSocialPlatform').value,accountName:$('#ownedSocialName').value.trim(),handle:$('#ownedSocialHandle').value.trim(),profileUrl:$('#ownedSocialUrl').value.trim(),accountType:$('#ownedSocialType').value,active:$('#ownedSocialActive').checked};try{await api(id?`/admin/owned-social-accounts/${id}`:'/admin/owned-social-accounts',{method:id?'PATCH':'POST',body:JSON.stringify(body)});toast('Akun resmi disimpan.');reset();await loadAccounts()}catch(err){toast(err.message,false)}});
  $('#ownedSocialReset').addEventListener('click',reset);
  document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.ownedEdit){const x=accounts.find(v=>String(v.id)===b.dataset.ownedEdit);if(!x)return;$('#ownedSocialId').value=x.id;$('#ownedSocialOpd').value=x.opd_id||'';$('#ownedSocialPlatform').value=x.platform;$('#ownedSocialName').value=x.account_name;$('#ownedSocialHandle').value=x.handle;$('#ownedSocialUrl').value=x.profile_url||'';$('#ownedSocialType').value=x.account_type;$('#ownedSocialActive').checked=!!x.active;window.scrollTo({top:0,behavior:'smooth'});}if(b.dataset.ownedOff){try{await api(`/admin/owned-social-accounts/${b.dataset.ownedOff}`,{method:'DELETE'});toast('Akun resmi dinonaktifkan.');await loadAccounts()}catch(err){toast(err.message,false)}}});

  Promise.all([loadOpdOptions(),loadAccounts()]).catch(err=>toast(err.message,false));
})();
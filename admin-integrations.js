(()=>{'use strict';
const api=async(path,opt={})=>{const r=await fetch(path,{credentials:'include',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'REQUEST_FAILED');return j};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function load(){
 const box=document.getElementById('integrationRows'); if(!box)return;
 box.innerHTML='<div class="text-sm text-slate-500">Memuat integrasi...</div>';
 try{const {data=[]}=await api('/api/admin/integrations');box.innerHTML=data.map(p=>`
 <article class="glass rounded-2xl p-5 space-y-3">
  <div class="flex justify-between gap-3"><div><div class="text-xs text-cyan-400 font-black">${esc(p.code).toUpperCase()}</div><h3 class="font-black">${esc(p.name)}</h3><p class="text-xs text-slate-500">${esc(p.auth_type)}</p></div>
  <span class="text-xs px-2 py-1 h-fit rounded-full bg-slate-800">${esc(p.last_status||'belum dikonfigurasi')}</span></div>
  <div class="text-xs text-slate-400">Credential: <b class="text-slate-200">${esc(p.credential_hint||'Belum ada')}</b></div>
  <div class="flex flex-wrap gap-2"><button data-save="${esc(p.code)}" class="px-3 py-2 rounded-lg bg-cyan-500 text-slate-950 font-black text-xs">Simpan Credential</button>
  <button data-test="${esc(p.code)}" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 font-bold text-xs" ${p.credential_hint?'':'disabled'}>Test Connection</button>
  <button data-toggle="${esc(p.code)}" data-enabled="${p.enabled?'1':'0'}" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 font-bold text-xs" ${p.credential_hint?'':'disabled'}>${p.enabled?'Nonaktifkan':'Aktifkan'}</button>
  ${p.code==='youtube'?'<button data-social-settings="'+esc(p.code)+'" data-query="'+esc(p.settings?.query||'')+'" data-max="'+esc(p.settings?.maxResults||25)+'" class="px-3 py-2 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs">Pengaturan Penarikan</button>':''}</div>
  ${p.last_error?'<p class="text-xs text-rose-400">'+esc(p.last_error)+'</p>':''}
 </article>`).join('')||'<div class="text-sm text-slate-500">Belum ada provider.</div>'}catch(e){box.innerHTML='<div class="text-sm text-rose-400">'+esc(e.message)+'</div>'}
}
document.addEventListener('click',async e=>{
 const save=e.target.closest?.('[data-save]'),test=e.target.closest?.('[data-test]'),toggle=e.target.closest?.('[data-toggle]'),settings=e.target.closest?.('[data-social-settings]');
 try{
  if(save){const credential=prompt('Masukkan credential/API key. Nilai ini akan dikirim ke backend untuk dienkripsi dan tidak ditampilkan kembali.');if(!credential)return;await api('/api/admin/integrations/'+encodeURIComponent(save.dataset.save)+'/credential',{method:'PUT',body:JSON.stringify({credential,enabled:false})});await load();}
  if(test){test.disabled=true;await api('/api/admin/integrations/'+encodeURIComponent(test.dataset.test)+'/test',{method:'POST',body:JSON.stringify({})});alert('Koneksi berhasil. Credential provider valid dan dapat digunakan.');await load();}
  if(toggle){toggle.disabled=true;await api('/api/admin/integrations/'+encodeURIComponent(toggle.dataset.toggle),{method:'PATCH',body:JSON.stringify({enabled:toggle.dataset.enabled!=='1'})});await load();}
  if(settings){const query=prompt('Query penarikan Media Sosial:',settings.dataset.query||'');if(!query)return;const raw=prompt('Jumlah kandidat per penarikan (1-25):',settings.dataset.max||'25');if(raw===null)return;const maxResults=Number(raw);if(!Number.isInteger(maxResults)||maxResults<1||maxResults>25)throw new Error('Jumlah kandidat harus 1 sampai 25.');await api('/api/admin/integrations/'+encodeURIComponent(settings.dataset.socialSettings)+'/settings',{method:'PUT',body:JSON.stringify({query,maxResults})});alert('Pengaturan penarikan tersimpan. Manual dan otomatis akan memakai konfigurasi yang sama.');await load();}
 }catch(err){alert(err.message);await load();}
});
window.loadAdminIntegrations=load;
document.addEventListener('DOMContentLoaded',load);
})();
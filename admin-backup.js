(()=>{
'use strict';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const form=document.createElement('section');form.id='backupPanel';form.className='hidden space-y-4';
form.innerHTML=`<div class="glass rounded-2xl p-5 space-y-4 max-w-4xl">
 <div><div class="text-[10px] tracking-widest text-cyan-400 font-black">SUPER ADMIN</div><h2 class="text-lg font-black mt-1">Backup Database</h2><p class="text-sm text-slate-400 mt-2">Pilih kelompok data yang akan diunduh. Ini ekspor data terpilih pada instalasi satu organisasi; tidak mencakup tabel akun, password, token, kredensial integrasi, skema database, atau berkas lampiran. Untuk pemulihan server lengkap gunakan pg_dump dan backup berkas privat.</p></div>
 <fieldset id="backupGroups" class="grid sm:grid-cols-2 gap-2 text-sm"><legend class="font-bold mb-2">Data yang dibackup</legend></fieldset>
 <label class="block text-sm">Format<select id="backupFormat" class="block mt-1 rounded-lg p-2 w-full max-w-xs"><option value="sql">SQL (data terpilih)</option><option value="json">JSON</option><option value="csv">CSV (ZIP per tabel)</option><option value="all">Semua format (ZIP)</option></select></label>
 <p id="backupLimits" class="text-xs text-slate-400"></p>
 <button id="backupDownload" type="button" class="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-black text-sm">Unduh backup</button>
 <p id="backupStatus" role="status" aria-live="polite" class="text-sm text-slate-300"></p>
 <p class="text-xs text-amber-300">File dapat berisi data internal. Simpan di tempat terbatas, lalu uji pemulihan pada lingkungan terpisah. SQL terpilih memerlukan skema dan dependensi yang cocok.</p>
 </div>`;
async function init(){
 const me=await fetch(API+'/rbac/me',{credentials:'include',cache:'no-store'}).then(r=>r.json());
 const u=me.user||{};if(!(u.roles||[]).includes('super_admin')&&u.role!=='admin')return;
 const ws=document.getElementById('workspace');if(!ws)return;
 const tab=document.createElement('button');tab.dataset.tab='backup';tab.className='tab px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-bold text-sm';tab.textContent='Backup Database';
 ws.querySelector('[data-tab="integrations"]')?.parentElement?.append(tab);ws.append(form);
 const response=await fetch(API+'/admin/database-backup/options',{credentials:'include',cache:'no-store'});
 if(!response.ok)throw Error('Opsi backup belum tersedia pada backend.');
 const data=await response.json(),groups=document.getElementById('backupGroups');
 for(const group of data.groups||[]){const l=document.createElement('label');l.className='flex gap-2 items-start rounded-lg border border-slate-700 p-3';const input=document.createElement('input');input.type='checkbox';input.name='backupGroup';input.value=group.id;input.checked=true;input.className='mt-1';const span=document.createElement('span');span.textContent=group.label+' ('+group.tables.length+' tabel)';l.append(input,span);groups.append(l)}
 document.getElementById('backupLimits').textContent=`Batas unduhan: ${data.limits?.maxRows||5000} baris total dan ${Math.round((data.limits?.maxBytes||0)/1048576)} MB. Jika melebihi batas, gunakan backup server oleh pengelola.`;
 document.getElementById('backupDownload').addEventListener('click',download);
}
async function download(){
 const button=document.getElementById('backupDownload'),status=document.getElementById('backupStatus');
 const groups=[...document.querySelectorAll('input[name="backupGroup"]:checked')].map(x=>x.value);
 if(!groups.length){status.textContent='Pilih setidaknya satu kelompok data.';return}
 button.disabled=true;button.textContent='Menyiapkan backup…';status.textContent='Memeriksa data dan menyiapkan berkas. Jangan tutup halaman.';
 try{
  const r=await fetch(API+'/admin/database-backup/download',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({groups,format:document.getElementById('backupFormat').value})});
  if(!r.ok){const e=await r.json().catch(()=>({}));const messages={SINGLE_ORGANIZATION_REQUIRED:'Backup melalui menu ini hanya tersedia untuk instalasi satu organisasi.',BACKUP_AUDIT_UNAVAILABLE:'Catatan audit gagal disimpan; unduhan dibatalkan.',BACKUP_SCHEMA_INCOMPLETE:'Ada tabel yang belum tersedia pada skema database: '+(e.missingTables||[]).join(', ')};throw Error(r.status===413?'Data terlalu besar untuk backup melalui halaman ini. Hubungi pengelola server untuk pg_dump.':messages[e.error]||e.error||'Unduhan gagal.');}
  const disposition=r.headers.get('content-disposition')||'',name=disposition.match(/filename="([a-zA-Z0-9._-]+)"/)?.[1]||'media-intelligence-backup.zip';
  const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent=`Backup ${name} berhasil disiapkan (${(blob.size/1048576).toFixed(1)} MB).`;
 }catch(e){status.textContent=e.message||'Backup gagal.'}finally{button.disabled=false;button.textContent='Unduh backup'}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(e=>{const s=document.getElementById('backupStatus');if(s)s.textContent=e.message}));else init().catch(()=>{});
})();

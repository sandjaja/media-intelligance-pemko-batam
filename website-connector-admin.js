(()=>{
'use strict';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const $=s=>document.querySelector(s);
const toast=(msg,ok=true)=>{const t=$('#toast');if(!t)return;t.textContent=msg;t.className=`fixed bottom-5 right-5 glass rounded-xl px-4 py-3 text-xs shadow-2xl ${ok?'text-emerald-300':'text-rose-300'}`;clearTimeout(window.__websiteConnectorToast);window.__websiteConnectorToast=setTimeout(()=>t.classList.add('hidden'),6500)};
async function api(path,options={}){const r=await fetch(API+path,{credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const data=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(data.message||data.error||`HTTP ${r.status}`);e.status=r.status;e.payload=data;throw e}return data}
function showStatus(kind,title,detail){
  const box=$('#ownedWebsiteSyncStatus');if(!box)return;
  const ok=kind==='success',warn=kind==='warning';
  box.className=`rounded-xl border p-4 text-xs ${ok?'border-emerald-500/30 bg-emerald-500/10 text-emerald-200':warn?'border-amber-500/30 bg-amber-500/10 text-amber-200':'border-rose-500/30 bg-rose-500/10 text-rose-200'}`;
  box.innerHTML=`<div class="flex items-start gap-3"><i class="fa-solid ${ok?'fa-circle-check':warn?'fa-triangle-exclamation':'fa-circle-xmark'} mt-0.5 text-base"></i><div><div class="font-black text-sm">${title}</div><div class="mt-1 opacity-90 leading-relaxed">${detail}</div></div></div>`;
  box.classList.remove('hidden');
}
function init(){
  const form=$('#ownedSocialBulkForm');
  const row=document.querySelector('[data-platform-row="website"]');
  const reload=$('#ownedSocialReload');
  if(!form||!row||!reload||$('#ownedWebsiteSync'))return;
  const btn=document.createElement('button');
  btn.id='ownedWebsiteSync';
  btn.type='button';
  btn.className='px-4 py-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold';
  btn.innerHTML='<i class="fa-solid fa-arrows-rotate mr-1"></i>Sinkronkan Website';
  reload.parentElement?.insertBefore(btn,reload);
  const status=document.createElement('div');
  status.id='ownedWebsiteSyncStatus';
  status.className='hidden';
  reload.parentElement?.parentElement?.appendChild(status);
  btn.addEventListener('click',async()=>{
    const accountId=row.dataset.accountId;
    const url=row.querySelector('[data-field="url"]')?.value?.trim();
    const name=row.querySelector('[data-field="name"]')?.value?.trim()||'Website Resmi';
    if(!accountId){toast('Simpan Website Resmi terlebih dahulu sebelum sinkronisasi.',false);showStatus('error','Sinkronisasi belum dapat dijalankan','Website Resmi harus disimpan terlebih dahulu.');return;}
    if(!url){toast('URL Website Resmi belum diisi.',false);showStatus('error','Sinkronisasi belum dapat dijalankan','URL Website Resmi belum diisi.');return;}
    const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin mr-1"></i>Menyinkronkan...';
    showStatus('warning','Sinkronisasi sedang berjalan',`${name} sedang diperiksa dan artikel terbaru sedang diproses.`);
    try{
      const result=(await api(`/social/ingestion/website/${accountId}`,{method:'POST',body:'{}'})).data||{};
      const fetched=Number(result.fetched||0),succeeded=Number(result.succeeded||0),failed=Number(result.failed||0);
      const source=result.feedUrl?` Sumber: ${result.feedUrl}`:'';
      if(failed===0){
        const detail=fetched===0?`${name} berhasil diperiksa. Tidak ada artikel yang ditemukan pada sinkronisasi ini.${source}`:`${name} berhasil disinkronkan. ${fetched} artikel ditemukan dan ${succeeded} artikel berhasil diproses.${source}`;
        toast(`✅ Sinkronisasi berhasil: ${succeeded}/${fetched} artikel diproses.`,true);
        showStatus('success','Sinkronisasi website berhasil',detail);
      }else{
        toast(`Sinkronisasi selesai dengan peringatan: ${succeeded}/${fetched} berhasil, ${failed} gagal.`,false);
        showStatus('warning','Sinkronisasi selesai dengan peringatan',`${name}: ${fetched} artikel ditemukan, ${succeeded} berhasil diproses, dan ${failed} gagal.${source}`);
      }
    }catch(e){
      toast(`Sinkronisasi website gagal: ${e.message}`,false);
      showStatus('error','Sinkronisasi website gagal',`${name} belum berhasil disinkronkan. ${e.message}`);
    }finally{btn.disabled=false;btn.innerHTML=old}
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));else setTimeout(init,0);
})();

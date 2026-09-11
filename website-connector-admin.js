(()=>{
'use strict';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const $=s=>document.querySelector(s);
const toast=(msg,ok=true)=>{const t=$('#toast');if(!t)return;t.textContent=msg;t.className=`fixed bottom-5 right-5 glass rounded-xl px-4 py-3 text-xs shadow-2xl ${ok?'text-emerald-300':'text-rose-300'}`;clearTimeout(window.__websiteConnectorToast);window.__websiteConnectorToast=setTimeout(()=>t.classList.add('hidden'),5000)};
async function api(path,options={}){const r=await fetch(API+path,{credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const data=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(data.message||data.error||`HTTP ${r.status}`);e.status=r.status;e.payload=data;throw e}return data}
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
  btn.addEventListener('click',async()=>{
    const accountId=row.dataset.accountId;
    const url=row.querySelector('[data-field="url"]')?.value?.trim();
    if(!accountId){toast('Simpan Website Resmi terlebih dahulu sebelum sinkronisasi.',false);return;}
    if(!url){toast('URL Website Resmi belum diisi.',false);return;}
    const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin mr-1"></i>Menyinkronkan...';
    try{
      const result=(await api(`/social/ingestion/website/${accountId}`,{method:'POST'})).data||{};
      const fetched=Number(result.fetched||0),succeeded=Number(result.succeeded||0),failed=Number(result.failed||0);
      const feed=result.feedUrl?` Feed: ${result.feedUrl}`:'';
      toast(`Website selesai disinkronkan: ${succeeded}/${fetched} artikel diproses${failed?`, ${failed} gagal`:''}.${feed}`,failed===0);
    }catch(e){toast(`Sinkronisasi website gagal: ${e.message}`,false)}finally{btn.disabled=false;btn.innerHTML=old}
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));else setTimeout(init,0);
})();

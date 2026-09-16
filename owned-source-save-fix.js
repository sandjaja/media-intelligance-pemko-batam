(()=>{
'use strict';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const domainFromUrl=v=>{try{return new URL(v).hostname.replace(/^www\./,'')}catch{return ''}};
async function api(path,options={}){
 const r=await fetch(API+path,{credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
 const data=await r.json().catch(()=>({}));
 if(!r.ok){const detail=data?.details?.fieldErrors?Object.entries(data.details.fieldErrors).flatMap(([k,v])=>(v||[]).map(x=>`${k}: ${x}`)).join('; '):'';throw new Error(detail||data.detail||data.error||`HTTP ${r.status}`)}
 return data;
}
function notify(msg,ok=true){if(window.toast)window.toast(msg,ok);}
function patch(){
 const form=document.querySelector('#ownedBulkForm');
 if(!form||form.dataset.saveFix==='1')return;
 form.dataset.saveFix='1';
 const owner=form.querySelector('#ownedOwner');
 const submit=form.querySelector('button[type="submit"]');
 if(!owner||!submit)return;
 let status=form.querySelector('#ownedSaveStatus');
 if(!status){status=document.createElement('div');status.id='ownedSaveStatus';status.className='hidden rounded-lg border px-3 py-2 text-xs';const buttonRow=submit.parentElement;buttonRow?.parentElement?.insertBefore(status,buttonRow)}
 const showStatus=(msg,type='info')=>{status.textContent=msg;status.className=`rounded-lg border px-3 py-2 text-xs ${type==='error'?'border-rose-500/30 bg-rose-500/10 text-rose-300':type==='success'?'border-emerald-500/30 bg-emerald-500/10 text-emerald-300':'border-sky-500/30 bg-sky-500/10 text-sky-200'}`};
 form.onsubmit=async ev=>{
  ev.preventDefault();
  if(submit.disabled)return;
  const opdId=owner.value?Number(owner.value):null,isPemko=!opdId,jobs=[];
  const rows=[...form.querySelectorAll('[data-platform-row]')];
  try{
   for(const r of rows){
    const platform=r.dataset.platformRow;
    const name=r.querySelector('[data-field="name"]')?.value.trim()||'';
    const url=r.querySelector('[data-field="url"]')?.value.trim()||'';
    const active=!!r.querySelector('[data-field="active"]')?.checked;
    const isPrimarySource=isPemko&&!!r.querySelector('[data-field="primary"]')?.checked;
    const id=r.dataset.accountId||'';
    let handle=r.querySelector('[data-field="handle"]')?.value.trim()||'';
    if(!name&&!handle&&!url)continue;
    if(platform==='website'){
      if(!name||!url)throw new Error('Website Resmi: Nama dan URL wajib diisi.');
      handle=domainFromUrl(url);
      if(!handle)throw new Error('Website Resmi: URL tidak valid.');
    }else if(!name||!handle){
      throw new Error(`${platform}: Nama akun dan handle wajib diisi.`);
    }
    jobs.push({id,body:{opdId,platform,accountName:name,handle,profileUrl:url,accountType:'supporting',active,isPrimarySource}});
   }
   if(!jobs.length)throw new Error('Isi minimal satu kanal resmi.');
   submit.disabled=true;const old=submit.innerHTML;submit.dataset.oldLabel=old;submit.innerHTML='<i class="fa-solid fa-spinner fa-spin mr-1"></i>Menyimpan...';showStatus(`Menyimpan ${jobs.length} kanal...`);
   let done=0;
   for(const j of jobs){await api(j.id?`/admin/owned-social-accounts/${j.id}`:'/admin/owned-social-accounts',{method:j.id?'PATCH':'POST',body:JSON.stringify(j.body)});done++;showStatus(`Menyimpan kanal ${done} dari ${jobs.length}...`)}
   showStatus(`${jobs.length} kanal berhasil disimpan.`,'success');notify(`${jobs.length} kanal berhasil disimpan.`);
   setTimeout(()=>window.openOwnedSourceManagement?.(),500);
  }catch(e){const msg=e?.message||'Gagal menyimpan kanal.';showStatus(msg,'error');notify(msg,false)}finally{submit.disabled=false;submit.innerHTML=submit.dataset.oldLabel||'<i class="fa-solid fa-layer-group mr-1"></i>Simpan Semua Kanal'}
 };
}
const observer=new MutationObserver(()=>patch());
observer.observe(document.documentElement,{childList:true,subtree:true});
patch();
})();
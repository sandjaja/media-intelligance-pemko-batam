(()=>{
 let brandingPromise=null,brandingCache=null;
 async function getBranding(){
  if(brandingCache)return brandingCache;if(brandingPromise)return brandingPromise;
  brandingPromise=(async()=>{try{const r=await fetch('/api/branding/active',{credentials:'include'});if(!r.ok)return null;brandingCache=(await r.json())?.data||null;return brandingCache}catch{return null}finally{brandingPromise=null}})();return brandingPromise;
 }
 async function applyBranding(){
  const reports=document.getElementById('reports');if(!reports)return;
  const b=await getBranding();const name=b?.short_name||b?.government_name||'Pemerintah Daerah';
  for(const el of reports.querySelectorAll('h1,h2'))if(/Daily Media Intelligence Report|Laporan Media Intelligence Harian/i.test(el.textContent||''))el.textContent=`Daily Media Intelligence Report ${name}`;
 }
 let scheduled=false;const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;void applyBranding()})});
 window.addEventListener('load',()=>{const reports=document.getElementById('reports');if(reports)observer.observe(reports,{childList:true,subtree:true});void applyBranding()});
 window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='reports')void applyBranding()});
})();

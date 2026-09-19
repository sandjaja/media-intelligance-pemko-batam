(()=>{
 async function getBranding(){
  try{const r=await fetch('/api/branding/active',{credentials:'include'});if(!r.ok)return null;return (await r.json())?.data||null}catch{return null}
 }
 async function applyBranding(){
  const reports=document.getElementById('reports');if(!reports)return;
  const b=await getBranding();const name=b?.short_name||b?.government_name||'Pemerintah Daerah';
  for(const el of reports.querySelectorAll('h1,h2'))if(/Daily Media Intelligence Report|Laporan Media Intelligence Harian/i.test(el.textContent||''))el.textContent=`Daily Media Intelligence Report ${name}`;
 }
 const observer=new MutationObserver(()=>void applyBranding());
 window.addEventListener('load',()=>{const reports=document.getElementById('reports');if(reports)observer.observe(reports,{childList:true,subtree:true});void applyBranding()});
 window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='reports')void applyBranding()});
})();

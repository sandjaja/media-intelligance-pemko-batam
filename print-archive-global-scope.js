(()=>{
'use strict';
const selectedText=id=>{const s=document.getElementById(id);return s?.value&&s.value!=='all'?(s.options[s.selectedIndex]?.text||'').trim():''};
function apply(){
 const root=document.getElementById('printarchive');if(!root||root.classList.contains('hidden'))return;
 const opd=selectedText('opdSelect'),district=selectedText('districtSelect');
 const all=Array.isArray(window.__phase2gPrintArchiveRows)?window.__phase2gPrintArchiveRows:[];
 const filtered=all.filter(a=>(!opd||String(a.opd_name||'')===opd)&&(!district||String(a.district_name||'')===district));
 root.querySelectorAll('#paList article').forEach((el,i)=>{const a=all[i];el.style.display=a&&filtered.includes(a)?'':'none'});
 const stats=root.querySelectorAll('#paStats > div b');
 if(stats.length>=4){stats[0].textContent=String(filtered.length);stats[1].textContent=String(filtered.filter(x=>x.status==='needs_review').length);stats[2].textContent=String(filtered.filter(x=>x.status==='verified').length);stats[3].textContent=String(filtered.filter(x=>x.is_headline).length)}
 window.__phase2gPrintArchiveRowsUnfiltered=all;
 window.__phase2gPrintArchiveRows=filtered;
 const t=document.getElementById('alertText');if(t)t.textContent=`Scope Arsip Media Cetak: ${opd||'Seluruh OPD'} · ${district||'Seluruh Kecamatan'} · ${filtered.length} clipping.`;
}
window.applyPrintArchiveGlobalScope=apply;
['opdSelect','districtSelect'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>setTimeout(apply,180)));
window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='printarchive')setTimeout(apply,220)});
})();
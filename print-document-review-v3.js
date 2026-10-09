(()=>{
'use strict';
const $=id=>document.getElementById(id);
const NOISE=/^(?:\W*\d+[!|I]?\s*)?(?:info|halaman|page|kamis|jumat|sabtu|minggu|senin|selasa|rabu|edisi|www\.|https?:|batam\s*pos\b|tribun\s*batam\b)/i;
const DATE=/\b(?:senin|selasa|rabu|kamis|jumat|sabtu|minggu)?\s*,?\s*\d{1,2}\s+(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+20\d{2}\b/i;
function cleanLine(s){return String(s||'').replace(/^[-–—|:;,.!\s]+/,'').replace(/\s+/g,' ').trim();}
function bestTitle(text){
 const lines=String(text||'').split(/\n+/).map(cleanLine).filter(x=>x.length>=18&&x.length<=180&&!/^---\s*HALAMAN/i.test(x)&&!NOISE.test(x)&&!DATE.test(x));
 const scored=lines.map((x,i)=>({x,score:(x.length>=28&&x.length<=110?4:0)+(i<18?2:0)+(x.split(/\s+/).length>=4?2:0)-((x.match(/\d/g)||[]).length>6?4:0)-(x===x.toUpperCase()&&x.length>100?2:0)})).sort((a,b)=>b.score-a.score);
 return scored[0]?.x||'';
}
function cleanSummary(text){return String(text||'').replace(/---\s*HALAMAN[^\n]*---/gi,' ').replace(/\s+/g,' ').trim().slice(0,900);}
function hideLegacyClassification(root=document){
 ['pcOpd','pcDistrict','pcKeywords'].forEach(id=>{const el=$(id);if(!el)return;el.value='';const label=el.closest('label');if(label)label.style.display='none';});
 const form=$('pcForm');if(form){const note=[...form.querySelectorAll('div')].find(x=>/OCR mengisi draft/i.test(x.textContent||''));if(note)note.innerHTML='OCR hanya mengisi <b>draft dokumen</b>. Operator memeriksa media, tanggal, judul, isi OCR, headline, berita bersambung, dan evidence. <b>OPD, Kecamatan, Keyword, Taxonomy, Sentiment dan Risk ditentukan setelah VERIFIED oleh Intelligence Engine.</b> Status awal: <b>Needs Review</b>.';}
 ['peOpd','peDistrict','peKeywords'].forEach(id=>{const el=$(id);if(!el)return;const label=el.closest('label');if(label)label.style.display='none';});
}
function improveOcrDraft(){
 const text=$('pcText')?.value||'';if(!text)return;
 const title=bestTitle(text);if(title)$('pcTitle').value=title;
 if($('pcSummary'))$('pcSummary').value=cleanSummary(text);
 if($('pcKeywords'))$('pcKeywords').value='';
 if($('pcOpd'))$('pcOpd').value='';
 if($('pcDistrict'))$('pcDistrict').value='';
 if($('pcContinued'))$('pcContinued').checked=false;
 const confText=$('pcConf')?.textContent||'',m=confText.match(/confidence\s+(\d+)/i),confidence=m?+m[1]:null;
 let warning=$('printOcrQualityWarning');if(warning)warning.remove();
 if(confidence!=null&&confidence<60){warning=document.createElement('div');warning.id='printOcrQualityWarning';warning.className='mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[10px] text-amber-200';warning.innerHTML=`<b>OCR QUALITY WARNING · ${confidence}%</b><div class="mt-1">Confidence rendah. Cocokkan judul dan teks OCR dengan evidence asli sebelum menyimpan/verifikasi.</div>`;$('pcPages')?.after(warning);}
}
function afterOcr(){let n=0;const timer=setInterval(()=>{n++;hideLegacyClassification();const status=$('pcStatus')?.textContent||'';if(/NEEDS REVIEW|ERROR/i.test(status)||n>600){clearInterval(timer);if(/NEEDS REVIEW/i.test(status))improveOcrDraft();}},250);}
document.addEventListener('click',e=>{if(e.target.closest?.('#pcOcr'))afterOcr();},true);
const observer=new MutationObserver(()=>hideLegacyClassification());observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('media-intelligence-tab',()=>setTimeout(()=>hideLegacyClassification(),80));
window.addEventListener('load',()=>setTimeout(()=>hideLegacyClassification(),250));
})();
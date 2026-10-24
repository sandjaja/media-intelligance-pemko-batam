(()=>{
'use strict';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const fmt=v=>v?new Date(v).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'long',year:'numeric'}):'Belum tersedia';
const hours=v=>v==null?'Belum tersedia':Number(v).toLocaleString('id-ID')+' jam';
const css=`@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#0f172a;background:#fff;font-size:10px;line-height:1.5}.page{width:100%;max-width:190mm;margin:auto;break-before:page}.page:first-child{break-before:auto}.brand{display:flex;align-items:center;gap:12px;border-bottom:2px solid #1e293b;padding-bottom:10px;break-inside:avoid}.brand img{width:48px;height:58px;object-fit:contain}.gov{font-size:10px;font-weight:900;color:#0f766e;letter-spacing:.04em}.cc{font-size:19px;font-weight:900}.meta{font-size:9px;color:#64748b;margin-top:3px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:12px 0;break-inside:avoid}.metric{border:1px solid #d7dde5;border-radius:8px;padding:8px}.metric span{display:block;font-size:7.5px;color:#64748b;text-transform:uppercase}.metric b{display:block;font-size:11px;margin-top:3px}.box{border:1px solid #d7dde5;border-radius:9px;padding:11px;margin-top:10px}.box h2{font-size:12px;margin:0 0 8px;break-after:avoid}h1{font-size:16px;margin:12px 0 5px;break-after:avoid}.facts{display:grid;grid-template-columns:90px 1fr;gap:5px 8px;font-size:9px;break-inside:avoid}.facts b{color:#475569}.summary{font-size:10px;line-height:1.6;color:#475569;white-space:pre-wrap}p{margin:5px 0}ul{margin:0;padding-left:17px}li{margin:5px 0;break-inside:avoid}.footer{display:flex;justify-content:space-between;gap:12px;border-top:2px solid #1e293b;margin-top:12px;padding-top:7px;font-size:8px;color:#64748b;break-inside:avoid}.footer div:last-child{text-align:right}p,li,h1,.facts span{overflow-wrap:anywhere}p,li{orphans:3;widows:3}@media print{.page{max-width:none}}`;
async function api(path){const r=await fetch(API+path,{credentials:'include',cache:'no-store'}),j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Pustaka pembelajaran belum dapat dimuat.');return j;}
function approvedDetail(d){
 if(d.saved?.status!=='APPROVED')throw Error('Hanya pembelajaran yang telah disetujui Humas yang dapat dicetak.');
 const w=d.source.workflow;
 return {workflowId:w.id,issueId:w.issue_id,cycleNumber:w.cycle_number,closedAt:w.closed_at,title:w.issue_title,leadOpd:w.lead_opd_name,evaluation:{...d.saved.evaluation,status:'APPROVED',version:d.saved.version,metrics:d.saved.metrics||d.metrics,updatedAt:d.saved.updatedAt}};
}
async function entriesForPrint(workflowId,query){
 if(workflowId)return [approvedDetail((await api('/knowledge/cycles/'+encodeURIComponent(workflowId)+'?view=library')).data)];
 const entries=[],seen=new Set();let page=1;
 for(;;){
  const r=await api('/knowledge/cycles?'+new URLSearchParams({view:'library',q:query||'',page:String(page),limit:'20'}));
  const rows=arr(r.data);if(!rows.length)break;
  for(const row of rows)if(row.evaluation?.status==='APPROVED'&&!seen.has(String(row.workflowId))){seen.add(String(row.workflowId));entries.push(row);}
  if(page*20>=Number(r.total))break;page++;
 }
 if(!entries.length)throw Error('Belum ada pembelajaran yang disetujui untuk dicetak.');
 return entries;
}
function section(title,values){return '<section class="box"><h2>'+esc(title)+'</h2>'+(arr(values).length?'<ul>'+values.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>':'<p class="summary">Belum dicatat.</p>')+'</section>';}
function printTable(entries,query){
 const b=window.getMediaBranding?.()||window.MEDIA_BRANDING||{},gov=b.government_name||'Pemerintah Kota Batam',logo=b.logo_url||window.BATAM_LOGO_DATA_URI||window.BATAM_LOGO_URL||'';
 const points=values=>arr(values).length?'<ul>'+values.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>':'Belum dicatat.';
 const rows=entries.map((row,index)=>{const e=row.evaluation,m=e.metrics||{};return '<tr><td>'+esc(index+1)+'</td><td><b>'+esc(row.title)+'</b><p>'+esc(row.leadOpd||'OPD belum tercatat')+'</p><p>Isu #'+esc(row.issueId)+' · Siklus #'+esc(row.cycleNumber)+'</p><p>Ditutup '+esc(fmt(row.closedAt))+'</p></td><td><p>'+esc(e.summary)+'</p><p><b>Bukti:</b> '+esc(({SUFFICIENT:'Memadai',LIMITED:'Terbatas',INSUFFICIENT:'Belum memadai'})[m.evidenceSufficiency]||'Belum dinilai')+'</p></td><td>'+points(e.lessons)+'</td><td>'+points(e.recommendations)+'</td></tr>';}).join('');
 return '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daftar Pustaka Pembelajaran</title><style>'+css+'@page{size:A4 landscape;margin:10mm}.page{max-width:none}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:12px;font-size:9px}thead{display:table-header-group}th,td{border:1px solid #cbd5e1;padding:7px;vertical-align:top;overflow-wrap:anywhere}th{text-align:left;background:#eef6f6;color:#0f172a}tr{break-inside:auto}td ul{padding-left:13px}td p{margin:0 0 5px}</style></head><body><main class="page"><header class="brand">'+(logo?'<img src="'+esc(logo)+'" alt="Logo '+esc(gov)+'">':'')+'<div><div class="gov">'+esc(gov.toUpperCase())+'</div><div class="cc">Daftar Pustaka Pembelajaran</div><div class="meta">Media Intelligence Command Center · '+entries.length+' siklus disetujui Humas</div></div></header>'+(query?'<p>Pencarian: '+esc(query)+'</p>':'')+'<table><colgroup><col style="width:4%"><col style="width:19%"><col style="width:29%"><col style="width:25%"><col style="width:23%"></colgroup><thead><tr><th>No.</th><th>Isu / OPD / Siklus</th><th>Ringkasan evaluasi &amp; bukti</th><th>Pelajaran dan batas penerapannya</th><th>Rekomendasi</th></tr></thead><tbody>'+rows+'</tbody></table><footer class="footer"><div>'+esc(gov)+' · Media Intelligence Command Center</div><div>Dicetak '+esc(new Date().toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}))+' WIB</div></footer></main></body></html>';
}
function printDocument(entries,query){
 const b=window.getMediaBranding?.()||window.MEDIA_BRANDING||{},gov=b.government_name||'Pemerintah Kota Batam',short=b.short_name||'Pemko Batam',logo=b.logo_url||window.BATAM_LOGO_DATA_URI||window.BATAM_LOGO_URL||'';
 const printed=new Date().toLocaleString('id-ID',{timeZone:'Asia/Jakarta'});
 const body=entries.map((row,index)=>{
  const e=row.evaluation,m=e.metrics||{};
  return `<article class="page"><header class="brand">${logo?`<img src="${esc(logo)}" alt="Logo ${esc(gov)}">`:''}<div><div class="gov">${esc(gov.toUpperCase())}</div><div class="cc">Pustaka Pembelajaran</div><div class="meta">Media Intelligence Command Center · Disetujui Humas · ${index+1} dari ${entries.length} siklus</div></div></header><h1>${esc(row.title)}</h1><div class="facts"><b>Isu / Siklus</b><span>#${esc(row.issueId)} / #${esc(row.cycleNumber)} · Workflow #${esc(row.workflowId)}</span><b>OPD Utama</b><span>${esc(row.leadOpd||'OPD belum tercatat')}</span><b>Siklus ditutup</b><span>${esc(fmt(row.closedAt))}</span><b>Disetujui</b><span>${esc(fmt(e.updatedAt))} · Versi #${esc(e.version)}</span><b>Keyword / Tag</b><span>${esc(arr(e.tags).join(', ')||'Belum dicatat.')}</span>${query?`<b>Pencarian</b><span>${esc(query)}</span>`:''}</div><div class="metrics">${[['Durasi siklus',hours(m.cycleHours)],['Awal siklus → publikasi',hours(m.publicationHours)],['Penugasan → klarifikasi',hours(m.clarificationHours)],['Evidence monitoring',m.evidenceTotal==null?'Belum tersedia':m.evidenceTotal+' berita']].map(([label,value])=>`<div class="metric"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</div><section class="box"><h2>Ringkasan evaluasi</h2><p class="summary">${esc(e.summary)}</p></section><section class="box"><h2>Kecukupan bukti</h2><b>${esc(({SUFFICIENT:'Bukti memadai',LIMITED:'Bukti terbatas',INSUFFICIENT:'Bukti belum memadai'})[m.evidenceSufficiency]||'Belum dinilai')}</b><p class="summary">${esc(m.conclusion||'Efektivitas komunikasi perlu ditinjau berdasarkan kecukupan bukti monitoring.')}</p></section>${section('Yang berjalan baik',e.strengths)}${section('Keterbatasan dan hal yang perlu diperbaiki',e.weaknesses)}${section('Pelajaran dan batas penerapannya',e.lessons)}${section('Rekomendasi untuk penanganan berikutnya',e.recommendations)}<footer class="footer"><div><b>${esc(gov)}</b><br>${esc(short)} · Media Intelligence Command Center</div><div>Pembelajaran yang telah disetujui Humas<br>Dicetak ${esc(printed)} WIB</div></footer></article>`;
 }).join('');
 return '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pustaka Pembelajaran</title><style>'+css+'</style></head><body>'+body+'</body></html>';
}
window.printKnowledgeLibrary=async({workflowId=null,query=''}={})=>{
 // Open synchronously within the click to preserve popup permission on mobile.
 const popup=window.open('','_blank','width=950,height=850');
 if(!popup)throw Error('Popup cetak diblokir browser. Izinkan popup untuk mencetak pustaka.');
 popup.document.write('<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Menyiapkan cetak</title></head><body><p role="status">Menyiapkan Pustaka Pembelajaran…</p></body></html>');popup.document.close();
 try{
  const entries=await entriesForPrint(workflowId,query);
  if(popup.closed)throw Error('Jendela cetak telah ditutup.');
  popup.document.open();popup.document.write(workflowId?printDocument(entries,query):printTable(entries,query));popup.document.close();
  await Promise.race([Promise.all(Array.from(popup.document.images).map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;}))),new Promise(resolve=>setTimeout(resolve,8000))]);
  if(popup.closed)return;
  popup.focus();popup.print();
 }catch(error){
  if(!popup.closed){popup.document.open();popup.document.write('<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Cetak belum berhasil</title></head><body><p>'+esc(error.message)+'</p></body></html>');popup.document.close();}
  throw error;
 }
};
})();

(()=>{
 const esc=v=>String(v??'').replace(/[&<>\'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
 const pages=x=>Array.isArray(x?.page_numbers)&&x.page_numbers.length?x.page_numbers.join(', '):'—';
 const issueText=x=>{const a=Array.isArray(x?.linked_issues)?x.linked_issues:[];return a.length?a.map(i=>`#${i.id} ${i.title}`).join(' · '):'—'};
 const alertText=x=>{const a=Array.isArray(x?.active_alerts)?x.active_alerts:[];return a.length?a.map(i=>`#${i.id} ${i.title}`).join(' · '):'—'};
 function brandReport(){
  const reports=document.getElementById('reports'); if(!reports)return;
  const uiTitle=[...reports.querySelectorAll('h2')].find(x=>/Daily Media Intelligence Report/i.test(x.textContent||''));
  if(uiTitle)uiTitle.textContent='Daily Media Intelligence Report Pemko Batam';
  const printable=document.getElementById('printableReport'); if(!printable)return;
  const oldTitle=[...printable.querySelectorAll('h1')].find(x=>/Laporan Media Intelligence Harian|Daily Media Intelligence Report/i.test(x.textContent||''));
  if(oldTitle)oldTitle.textContent='Daily Media Intelligence Report Pemko Batam';
  const header=oldTitle?.parentElement; if(header&&!header.querySelector('[data-pemko-report-logo]')){
   const row=document.createElement('div'); row.setAttribute('data-pemko-report-logo','1'); row.className='flex items-center gap-3 mb-3';
   row.innerHTML=`<img src="${esc(window.BATAM_LOGO_DATA_URI||'')}" alt="Logo Pemerintah Kota Batam" style="width:54px;height:64px;object-fit:contain"/><div><div class="text-[10px] font-black tracking-widest text-cyan-400">PEMERINTAH KOTA BATAM</div><div class="text-sm font-bold">Media Intelligence Command Center</div></div>`;
   header.insertBefore(row,header.firstChild);
  }
 }
 function exportLocalizedCsv(e){
  const btn=e.target.closest?.('#reportCsv'); if(!btn)return;
  e.preventDefault(); e.stopImmediatePropagation();
  const r=window.__dailyReport;if(!r)return window.toast?.('Generate laporan terlebih dahulu.');
  const rows=[['Tanggal','Jenis','ID','Nama Media','Edisi','Halaman','Judul','OPD','Kecamatan','Sentiment','Risk','Risk Score','Importance','Linked Issue','Active Alert']];
  (r.articles||[]).forEach(x=>rows.push([r.day,'Media Online',x.id||'',x.source_name||'','','',x.title||'','','',x.sentiment||'',x.risk_level||'',x.risk_score??'',x.importance_score??'','','']));
  (r.prints||[]).forEach(x=>rows.push([r.day,'Media Cetak',x.id||'',x.source_name||'',x.edition_name||x.edition_date||'',pages(x),x.title||'',x.opd_name||'',x.district_name||'',x.sentiment||'',x.risk_level||'',x.risk_score??'',x.importance_score??'',issueText(x),alertText(x)]));
  (r.socials||[]).forEach(x=>rows.push([r.day,'Media Sosial',x.id||'',x.source_name||x.account_name||'','','',x.title||x.content||'',x.opd_name||'',x.district_name||'',x.sentiment||'',x.risk_level||'',x.risk_score??'',x.importance_score??'','','']));
  const csv='\ufeff'+rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`media-intelligence-pemko-batam-${r.day}.csv`;a.click();URL.revokeObjectURL(url);
 }
 document.addEventListener('click',exportLocalizedCsv,true);
 const observer=new MutationObserver(()=>brandReport());
 window.addEventListener('load',()=>{const reports=document.getElementById('reports');if(reports)observer.observe(reports,{childList:true,subtree:true});setTimeout(brandReport,500)});
 window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='reports')setTimeout(brandReport,150)});
})();

(()=>{
 const esc=v=>String(v??'').replace(/[&<>\'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
 const csvDate=v=>{const s=String(v??'').slice(0,10);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:s};
 const pages=x=>{const p=x?.page_numbers;if(Array.isArray(p))return p.filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='').join(', ');if(typeof p==='number')return String(p);if(typeof p==='string'){const s=p.trim();if(!s)return '';try{const j=JSON.parse(s);if(Array.isArray(j))return j.join(', ')}catch{}return s.replace(/^\[|\]$/g,'').replace(/["']/g,'').trim()}return x?.page_number??x?.page??''};
 const issueText=x=>{const a=Array.isArray(x?.linked_issues)?x.linked_issues:[];return a.length?a.map(i=>`#${i.id} ${i.title}`).join(' · '):'—'};
 const alertText=x=>{const a=Array.isArray(x?.active_alerts)?x.active_alerts:[];return a.length?a.map(i=>`#${i.id} ${i.title}`).join(' · '):'—'};
 function applyBranding(){
  const reports=document.getElementById('reports');if(!reports)return;
  const outer=[...reports.querySelectorAll('h2')].find(x=>/Daily Media Intelligence Report/i.test(x.textContent||''));
  if(outer)outer.textContent='Daily Media Intelligence Report Pemko Batam';
  const printable=document.getElementById('printableReport');if(!printable)return;
  const inner=[...printable.querySelectorAll('h1')].find(x=>/Laporan Media Intelligence Harian|Daily Media Intelligence Report/i.test(x.textContent||''));
  if(inner)inner.textContent='Laporan Media Intelligence Harian';
  const header=inner?.parentElement;
  if(header&&!header.querySelector('[data-pemko-report-logo]')){
   const row=document.createElement('div');row.dataset.pemkoReportLogo='1';row.className='flex items-center gap-3 mb-3';
   row.innerHTML=`<img src="${esc(window.BATAM_LOGO_DATA_URI||'')}" alt="Logo Pemerintah Kota Batam" style="width:54px;height:64px;object-fit:contain"><div><div class="text-[10px] font-black tracking-widest text-cyan-400">PEMERINTAH KOTA BATAM</div><div class="text-sm font-bold">Media Intelligence Command Center</div></div>`;
   header.insertBefore(row,header.firstChild);
  }
 }
 function scheduleBranding(){setTimeout(applyBranding,250);setTimeout(applyBranding,900)}
 window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='reports')scheduleBranding()});
 document.addEventListener('click',e=>{if(e.target.closest?.('#reportBtn,#reportGenerate'))scheduleBranding()});
 document.addEventListener('click',e=>{
  if(!e.target.closest?.('#reportCsv'))return;
  const r=window.__dailyReport;if(!r)return;
  e.preventDefault();e.stopImmediatePropagation();
  const rows=[['Tanggal','Jenis','ID','Nama Media','Edisi','Halaman','Judul','OPD','Kecamatan','Sentiment','Risk','Risk Score','Importance','Linked Issue','Active Alert']];
  (r.articles||[]).forEach(x=>rows.push([csvDate(r.day),'Media Online',x.id||'',x.source_name||'','','',x.title||'','','',x.sentiment||'',x.risk_level||'',x.risk_score??'',x.importance_score??'','','']));
  (r.prints||[]).forEach(x=>rows.push([csvDate(r.day),'Media Cetak',x.id||'',x.source_name||'',x.edition_name||x.edition_date||'',pages(x),x.title||'',x.opd_name||'',x.district_name||'',x.sentiment||'',x.risk_level||'',x.risk_score??'',x.importance_score??'',issueText(x),alertText(x)]));
  (r.socials||[]).forEach(x=>rows.push([csvDate(r.day),'Media Sosial',x.id||'',x.source_name||x.account_name||'','','',x.title||x.content||'',x.opd_name||'',x.district_name||'',x.sentiment||'',x.risk_level||'',x.risk_score??'',x.importance_score??'','','']));
  const csv=rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`media-intelligence-pemko-batam-${r.day}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 },true);
})();

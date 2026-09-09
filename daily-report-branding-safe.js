(()=>{
 const clean=v=>String(v??'').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\r?\n/g,' ').trim();
 const csvDate=v=>{const s=clean(v).slice(0,10);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:s};
 const pageCount=x=>{const n=Number(x?.page_count);if(Number.isFinite(n)&&n>=1)return Math.trunc(n);const p=x?.page_numbers;if(Array.isArray(p)&&p.length)return p.filter(v=>v!==null&&v!==undefined&&clean(v)!=='').length||1;return x?.is_continued?2:1};
 const issueText=x=>{const a=Array.isArray(x?.linked_issues)?x.linked_issues:[];return a.length?a.map(i=>`#${i.id} ${clean(i.title)}`).join(' | '):''};
 const alertText=x=>{const a=Array.isArray(x?.active_alerts)?x.active_alerts:[];return a.length?a.map(i=>`#${i.id} ${clean(i.title)}`).join(' | '):''};
 let embeddedLogo='',logoPromise=null;
 function preloadLogo(){if(embeddedLogo)return Promise.resolve(embeddedLogo);if(logoPromise)return logoPromise;const src=window.BATAM_LOGO_DATA_URI||'';if(/^data:image\//i.test(src)){embeddedLogo=src;return Promise.resolve(src)}logoPromise=fetch(src,{cache:'force-cache'}).then(r=>{if(!r.ok)throw Error('logo');return r.blob()}).then(blob=>new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(String(fr.result||''));fr.onerror=reject;fr.readAsDataURL(blob)})).then(data=>{embeddedLogo=data;return data}).catch(()=>src);return logoPromise}
 function ensurePrintStyle(){if(document.getElementById('phase2g-report-print-style'))return;const s=document.createElement('style');s.id='phase2g-report-print-style';s.textContent='@media print{#reports>div>div:first-child{display:none!important}#reportOutput{margin-top:0!important}#printableReport{margin-top:0!important}[data-pemko-report-header] img{display:block!important;visibility:visible!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}}';document.head.appendChild(s)}
 function applyBranding(){
  const reports=document.getElementById('reports');if(!reports)return;
  const outer=[...reports.querySelectorAll('h2')].find(x=>/Daily Media Intelligence Report/i.test(x.textContent||''));if(outer)outer.textContent='Daily Media Intelligence Report Pemko Batam';
  const printable=document.getElementById('printableReport');if(!printable)return;
  let row=printable.querySelector('[data-pemko-report-header]');
  if(row){const img=row.querySelector('img');if(img&&(embeddedLogo||window.BATAM_LOGO_DATA_URI))img.src=embeddedLogo||window.BATAM_LOGO_DATA_URI;return}
  const inner=[...printable.querySelectorAll('h1')].find(x=>/Laporan Media Intelligence Harian|Daily Media Intelligence Report/i.test(x.textContent||''));if(!inner)return;
  const header=inner.parentElement;
  const eyebrow=[...header.children].find(n=>/PEMERINTAH KOTA BATAM.*MEDIA INTELLIGENCE/i.test(n.textContent||''));if(eyebrow)eyebrow.remove();
  row=document.createElement('div');row.dataset.pemkoReportHeader='1';row.className='flex items-center gap-4 mb-2';
  row.innerHTML='<img alt="Logo Pemerintah Kota Batam" style="width:58px;height:70px;object-fit:contain;flex:none"><div class="min-w-0"><div class="text-2xl font-black leading-tight">Daily Media Intelligence Report Pemko Batam</div></div>';
  const img=row.querySelector('img');if(img&&(embeddedLogo||window.BATAM_LOGO_DATA_URI))img.src=embeddedLogo||window.BATAM_LOGO_DATA_URI;
  inner.replaceWith(row);
 }
 function scheduleBranding(){ensurePrintStyle();preloadLogo().then(()=>applyBranding());setTimeout(applyBranding,200)}
 window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='reports')scheduleBranding()});
 document.addEventListener('click',e=>{if(e.target.closest?.('#reportBtn,#reportGenerate'))scheduleBranding()});
 document.addEventListener('click',e=>{if(!e.target.closest?.('#reportCsv'))return;const r=window.__dailyReport;if(!r)return;e.preventDefault();e.stopImmediatePropagation();const rows=[['Tanggal','Jenis','ID','Nama Media','Edisi','Jumlah Halaman','Judul','OPD','Kecamatan','Sentiment','Risk','Risk Score','Importance','Linked Issue','Active Alert']];(r.articles||[]).forEach(x=>rows.push([csvDate(r.day),'Media Online',x.id||'',x.source_name||'','','',x.title||'','','',x.sentiment||'',x.risk_level||'',x.risk_score??'',x.importance_score??'','','']));(r.prints||[]).forEach(x=>rows.push([csvDate(r.day),'Media Cetak',x.id||'',x.source_name||'',x.edition_name||x.edition_date||'',pageCount(x),x.title||'',x.opd_name||'',x.district_name||'',x.sentiment||'',x.risk_level||'',x.risk_score??'',x.importance_score??'',issueText(x),alertText(x)]));(r.socials||[]).forEach(x=>rows.push([csvDate(r.day),'Media Sosial',x.id||'',x.source_name||x.account_name||'','','',x.title||x.content||'',x.opd_name||'',x.district_name||'',x.sentiment||'',x.risk_level||'',x.risk_score??'',x.importance_score??'','','']));const csv=rows.map(row=>row.map(v=>`"${clean(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`media-intelligence-pemko-batam-${r.day}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)},true);
 ensurePrintStyle();preloadLogo();
})();
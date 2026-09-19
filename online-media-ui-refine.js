(()=>{
  let refining=false,scheduled=false,busy=false;
  const selected=new Set();
  const api=()=>window.MEDIA_INTELLIGENCE_API||'/api';
  function setText(el,text){if(el&&el.textContent!==text)el.textContent=text;}
  function articleId(article){return article.getAttribute('data-online-article-id')||article.querySelector('[data-correct-id],[data-approve-id],[data-support-id],[data-irrel-id]')?.dataset.correctId||article.querySelector('[data-approve-id]')?.dataset.approveId||article.querySelector('[data-support-id]')?.dataset.supportId||article.querySelector('[data-irrel-id]')?.dataset.irrelId||null;}
  function visibleArticles(root){return [...root.querySelectorAll('article[data-online-article-id]')].filter(a=>a.offsetParent!==null);}
  function approvable(article){const t=String(article.textContent||'');return /\bUTAMA\b/.test(t)&&/\bAUTO\b/.test(t)&&!t.includes('AMBIGU')&&!t.includes('Terverifikasi')&&!!article.querySelector('[data-approve-id]');}
  function selectedArticles(root){const map=new Map(visibleArticles(root).map(a=>[String(articleId(a)),a]));return [...selected].map(id=>map.get(String(id))).filter(Boolean);}
  function sync(root){
    const chosen=selectedArticles(root),approveCount=chosen.filter(approvable).length;
    const re=root.querySelector('#onlineReanalyzeSelected');if(re){re.textContent=selected.size?`Analisa Ulang Terpilih (${selected.size})`:'Analisa Ulang Terpilih';re.disabled=busy||selected.size===0;}
    const ap=root.querySelector('#onlineApproveSelected');if(ap){ap.textContent=approveCount?`Setujui Terpilih (${approveCount})`:'Setujui Terpilih';ap.disabled=busy||approveCount===0;}
    const all=root.querySelector('#onlineSelectAll');if(all){const boxes=[...root.querySelectorAll('input[data-online-article-checkbox]')];const checked=boxes.filter(x=>x.checked).length;all.checked=boxes.length>0&&checked===boxes.length;all.indeterminate=checked>0&&checked<boxes.length;}
    const count=root.querySelector('#onlineSelectedCount');if(count)count.textContent=selected.size?`${selected.size} berita dipilih`:'Pilih berita untuk aksi bulk';
  }
  async function post(path,body){const r=await fetch(api()+path,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.message||b.error||`HTTP ${r.status}`);return b;}
  async function reanalyzeSelected(root){const ids=[...selected].map(Number).filter(Number.isInteger);if(!ids.length)return;busy=true;sync(root);try{const b=await post('/online/reanalyze',{articleIds:ids});selected.clear();window.toast?.(`Analisa ulang selesai: ${b.analyzed||0} berhasil${b.failed?`, ${b.failed} gagal`:''}.`);window.renderOnlineMediaWorkspace?.();}catch(e){window.toast?.(`Analisa ulang gagal: ${e.message}`);}finally{busy=false;sync(root);}}
  async function approveSelected(root){
    const eligible=selectedArticles(root).filter(approvable).map(a=>({id:articleId(a),title:a.querySelector('a[target="_blank"]')?.textContent?.trim()||''}));if(!eligible.length)return;
    if(!confirm(`Setujui ${eligible.length} klasifikasi UTAMA · AUTO yang tidak ambigu?`))return;
    busy=true;sync(root);let ok=0,failed=0;
    for(const item of eligible){try{await post(`/admin/articles/${encodeURIComponent(item.id)}/classification-verification`,{action:'APPROVE'});ok++;selected.delete(String(item.id));}catch{failed++;}}
    busy=false;window.toast?.(`Bulk Setujui selesai: ${ok} disetujui${failed?`, ${failed} gagal`:''}.`);window.renderOnlineMediaWorkspace?.();
  }
  function installToolbar(root){
    const feed=[...root.querySelectorAll('.glass')].find(x=>String(x.textContent||'').includes('Feed Berita'));if(!feed)return;
    const heading=[...feed.querySelectorAll('h3')].find(x=>String(x.textContent||'').includes('Feed Berita'));const bar=heading?.parentElement;if(!bar)return;
    if(!feed.querySelector('#onlineBulkBar')){
      const bulk=document.createElement('div');bulk.id='onlineBulkBar';bulk.className='w-full mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3';
      bulk.innerHTML='<label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer"><input id="onlineSelectAll" type="checkbox" class="accent-violet-500"> Pilih Semua</label><span id="onlineSelectedCount" class="text-[10px] text-slate-500 mr-auto">Pilih berita untuk aksi bulk</span><button id="onlineReanalyzeSelected" class="px-3 py-2 rounded-lg bg-violet-700 disabled:bg-slate-800 disabled:text-slate-500 text-xs font-bold" disabled>Analisa Ulang Terpilih</button><button id="onlineApproveSelected" class="px-3 py-2 rounded-lg bg-emerald-700 disabled:bg-slate-800 disabled:text-slate-500 text-xs font-bold" disabled>Setujui Terpilih</button>';
      bar.insertAdjacentElement('afterend',bulk);
      bulk.querySelector('#onlineReanalyzeSelected')?.addEventListener('click',()=>reanalyzeSelected(root));bulk.querySelector('#onlineApproveSelected')?.addEventListener('click',()=>approveSelected(root));bulk.querySelector('#onlineSelectAll')?.addEventListener('change',e=>{const checked=e.target.checked;root.querySelectorAll('input[data-online-article-checkbox]').forEach(cb=>{cb.checked=checked;const id=cb.dataset.articleId;if(id){if(checked)selected.add(id);else selected.delete(id);}});sync(root);});
    }
    root.querySelector('#onlineReanalyzeSelected:not(#onlineBulkBar #onlineReanalyzeSelected)')?.remove();
  }
  function installSelection(root){
    installToolbar(root);
    root.querySelectorAll('article[data-online-article-id]').forEach(article=>{
      if(article.querySelector('[data-online-select]'))return;const id=articleId(article);if(!id)return;
      const label=document.createElement('label');label.dataset.onlineSelect='1';label.className='float-right ml-3 flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer';
      const cb=document.createElement('input');cb.type='checkbox';cb.className='accent-violet-500';cb.dataset.onlineArticleCheckbox='1';cb.dataset.articleId=String(id);cb.checked=selected.has(String(id));cb.addEventListener('change',()=>{if(cb.checked)selected.add(String(id));else selected.delete(String(id));sync(root);});
      label.append(cb,document.createTextNode('Pilih'));article.prepend(label);
    });sync(root);
  }
  function refine(){if(refining)return;refining=true;try{const root=document.getElementById('online');if(!root)return;root.querySelector('#onlineRunTest')?.remove();for(const el of root.querySelectorAll('div')){const txt=String(el.textContent||'').trim();if(txt==='TOTAL AKTIF')setText(el,'BERITA AKTIF 7 HARI');if(txt==='TOTAL TIDAK RELEVAN')setText(el,'BERITA TIDAK RELEVAN 7 HARI');}for(const table of root.querySelectorAll('table')){const heads=[...table.querySelectorAll('thead th')].map(x=>String(x.textContent||'').trim().toLowerCase());const foundIdx=heads.findIndex(x=>x.includes('ditemukan terakhir')),newIdx=heads.findIndex(x=>x.includes('baru terakhir'));if(foundIdx>=0||newIdx>=0){[...table.querySelectorAll('tr')].forEach(row=>{const cells=[...row.children];[newIdx,foundIdx].filter(i=>i>=0).sort((a,b)=>b-a).forEach(i=>cells[i]?.remove());});const stored=[...table.querySelectorAll('thead th')].find(x=>String(x.textContent||'').trim().toLowerCase().includes('tersimpan 7 hari'));if(stored)setText(stored,'Berita 7 hari');}}const oldPanel=[...root.querySelectorAll('.glass')].find(x=>String(x.textContent||'').includes('Hasil Uji Koneksi Terakhir')||String(x.textContent||'').includes('Hasil Uji Terakhir'));if(oldPanel)oldPanel.remove();root.querySelector('#onlineBulkBar')?.remove();root.querySelectorAll('[data-online-select]').forEach(x=>x.remove());}finally{refining=false;}}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refine();});}
  function loadLatest(){if(document.querySelector('script[data-online-latest-news]'))return;const s=document.createElement('script');s.src='./online-latest-news.js?v=20260916-cluster2';s.dataset.onlineLatestNews='1';document.head.appendChild(s);}
  const obs=new MutationObserver(schedule);const start=()=>{const root=document.getElementById('online');if(root){obs.observe(root,{childList:true,subtree:true});refine();}loadLatest();};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='online')setTimeout(()=>{refine();loadLatest();},100)});
})();

(()=>{
  const esc=v=>String(v??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]));
  const toks=s=>new Set(String(s||'').toLowerCase().replace(/[^\p{L}\p{N} ]/gu,' ').split(/\s+/).filter(w=>w.length>3&&!['yang','dengan','untuk','dari','pada','dalam','akan','atau','oleh','ini','itu','kota','batam'].includes(w)));
  const overlap=(a,b)=>{const x=toks(a),y=toks(b);if(!x.size||!y.size)return 0;let n=0;x.forEach(w=>{if(y.has(w))n++});return n/(x.size+y.size-n)};
  const riskLevel=r=>String(r?.risk_level||r?.riskLevel||'').toUpperCase();
  const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  async function getJSON(url){try{const r=await fetch(url,{credentials:'include'});if(!r.ok)throw new Error(r.status);return await r.json()}catch(e){return null}}
  async function run(){
    const host=document.getElementById('sowhat'); if(!host)return;
    const opd=document.getElementById('opdSelect')?.value||'all';
    const q=opd!=='all'?`&opdId=${encodeURIComponent(opd)}`:'';
    const [a,s]=await Promise.all([getJSON(`/api/articles?limit=200${q}`),getJSON(`/api/media-scans?limit=200${q}`)]);
    const articles=Array.isArray(a?.data)?a.data:Array.isArray(a)?a:[];
    const scans=Array.isArray(s?.data)?s.data:Array.isArray(s)?s:[];
    const social=scans.filter(x=>x.category==='social'||x.media_kind==='social'||x.analysis?.media_kind==='social'||x.analysis?.platform);
    const all=[...articles.map(x=>({...x,kind:'online',text:`${x.title||''} ${x.summary||x.content||''}`})),...social.map(x=>({...x,kind:'social',text:`${x.analysis?.headline||x.file_name||''} ${x.analysis?.summary||x.ocr_text||''}`}))];
    const neg=all.filter(x=>String(x.sentiment||x.analysis?.sentiment||'').toLowerCase().includes('neg'));const high=all.filter(x=>['HIGH','CRITICAL'].includes(riskLevel(x)||riskLevel(x.analysis)));
    let edges=0,highEdges=0,maxLag=0;
    for(const x of all)for(const y of all){if(x===y||x.kind===y.kind)continue;const tx=new Date(x.published_at||x.created_at||x.analysis?.edition_date||0).getTime(),ty=new Date(y.published_at||y.created_at||y.analysis?.edition_date||0).getTime();const lag=(ty-tx)/36e5;if(lag<0||lag>168)continue;const m=overlap(x.text,y.text);if(m>=.22){edges++;if(['HIGH','CRITICAL'].includes(riskLevel(y)||riskLevel(y.analysis)))highEdges++;maxLag=Math.max(maxLag,lag)}}
    const sources=new Set(all.map(x=>x.source_name||x.media_name||x.analysis?.media_name||x.analysis?.platform).filter(Boolean)).size;
    const opdSpread=new Set(all.map(x=>x.opd_id||x.opdId||x.analysis?.opd_id).filter(Boolean)).size;
    const score=Math.min(100,neg.length*7+high.length*12+edges*5+highEdges*6+Math.max(0,sources-1)*3+Math.max(0,opdSpread-1)*4+(social.length?8:0));
    const status=score>=75?'CRITICAL':score>=50?'ESCALATING':score>=25?'WATCH':'EARLY';
    const window=status==='CRITICAL'?'SEGERA / 0–1 JAM':status==='ESCALATING'?'1–6 JAM':status==='WATCH'?'6–24 JAM':'MONITORING';
    const trigger=high[0]?.title||neg[0]?.title||all[0]?.title||'Belum ada sinyal signifikan';
    const action=status==='CRITICAL'?'Aktifkan PIC lintas fungsi, verifikasi fakta, siapkan holding statement, dan pantau propagasi secara real-time.':status==='ESCALATING'?'Verifikasi isu, tetapkan PIC, siapkan pesan kunci, dan pantau media/sosial lebih rapat.':status==='WATCH'?'Validasi sinyal dan siapkan respons jika volume atau risiko meningkat.':'Lanjutkan monitoring dan kumpulkan baseline untuk mendeteksi perubahan.';
    const color={EARLY:'emerald',WATCH:'yellow',ESCALATING:'orange',CRITICAL:'red'}[status];
    host.querySelector('[data-ew]')?.remove();
    host.insertAdjacentHTML('afterbegin',`<div data-ew class="glass rounded-2xl p-5 border border-${color}-400/30 shadow-xl"><div class="flex flex-wrap items-start justify-between gap-4"><div><div class="text-[10px] tracking-[.25em] font-black text-cyan-400">NARRATIVE EARLY WARNING</div><h2 class="text-xl font-black mt-1">${esc(status)} <span class="text-slate-400 text-sm font-medium">· score ${score}/100</span></h2><p class="text-xs text-slate-400 mt-1">Peringatan dini berbasis volume, risiko, diversitas sumber, propagasi lintas media, dan sebaran OPD.</p></div><div class="text-right"><div class="text-[10px] text-slate-500">RESPONSE WINDOW</div><div class="font-black text-${color}-300">${window}</div></div></div><div class="grid md:grid-cols-4 gap-3 mt-4"><div class="bg-slate-950/60 rounded-xl p-3"><div class="text-[10px] text-slate-500">NEGATIVE</div><div class="text-2xl font-black">${neg.length}</div></div><div class="bg-slate-950/60 rounded-xl p-3"><div class="text-[10px] text-slate-500">HIGH / CRITICAL</div><div class="text-2xl font-black">${high.length}</div></div><div class="bg-slate-950/60 rounded-xl p-3"><div class="text-[10px] text-slate-500">PROPAGATION EDGES</div><div class="text-2xl font-black">${edges}</div></div><div class="bg-slate-950/60 rounded-xl p-3"><div class="text-[10px] text-slate-500">SOURCE / OPD SPREAD</div><div class="text-2xl font-black">${sources} / ${opdSpread}</div></div></div><div class="grid lg:grid-cols-2 gap-4 mt-4"><div class="rounded-xl border border-slate-800 p-4"><div class="text-[10px] font-black tracking-widest text-slate-500">TRIGGER SIGNAL</div><div class="font-bold mt-1">${esc(trigger)}</div><div class="text-xs text-slate-400 mt-2">${esc(action)}</div></div><div class="rounded-xl border border-slate-800 p-4"><div class="text-[10px] font-black tracking-widest text-slate-500">COMMANDER'S CHECKLIST</div><ul class="text-xs text-slate-300 mt-2 space-y-1"><li>• VERIFY — cek fakta dan sumber primer.</li><li>• COORDINATE — tetapkan PIC dan OPD terkait.</li><li>• MESSAGE — siapkan pesan kunci/holding statement.</li><li>• MONITOR — pantau volume, risiko, dan propagasi.</li></ul></div></div><div class="text-[10px] text-slate-500 mt-4">Decision support only. Propagation match adalah sinyal probabilistik, bukan bukti hubungan sebab-akibat.</div></div>`);
    window.MEDIA_EARLY_WARNING={status,score,responseWindow:window,trigger,metrics:{negative:neg.length,highCritical:high.length,edges,sources,opdSpread,maxLag}};
    window.dispatchEvent(new CustomEvent('media:early-warning',{detail:window.MEDIA_EARLY_WARNING}));
  }
  window.renderNarrativeEarlyWarning=run;
  document.addEventListener('DOMContentLoaded',()=>{run();setInterval(run,60000);document.getElementById('opdSelect')?.addEventListener('change',()=>setTimeout(run,100))});
})();
(() => {
  const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const getOpd = () => document.getElementById('opdSelect')?.value;
  const state = { articles: [], loading: false };
  const stop = ['yang','dan','dengan','untuk','dari','pada','dalam','akan','ini','itu','ada','oleh','ke','di','batam','pemko','kota','terhadap','sebagai','karena','lebih','telah','dapat','jadi','agar','atau','juga','para','berita'];
  const tokenize = text => String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g,' ').split(/\s+/).filter(w => w.length >= 5 && !stop.includes(w));
  const build = rows => {
    const groups = new Map();
    rows.forEach(a => {
      const words = [...new Set(tokenize(`${a.title} ${a.summary || ''}`))];
      words.forEach(w => {
        if (!groups.has(w)) groups.set(w,{word:w,count:0,negative:0,risk:0,impact:0,sources:new Set(),opds:new Set(),latest:a.published_at});
        const g=groups.get(w); g.count++; if(a.sentiment==='negative')g.negative++; g.risk+=Number(a.risk_score||0); g.impact+=Number(a.impact_score||0); if(a.source_name)g.sources.add(a.source_name); if(a.opd_name)g.opds.add(a.opd_name); if(new Date(a.published_at||0)>new Date(g.latest||0))g.latest=a.published_at;
      });
    });
    return [...groups.values()].map(g=>({...g,velocity:Math.min(100,g.count*18 + g.negative*12),riskAvg:Math.round(g.risk/g.count),impactAvg:Math.round(g.impact/g.count),sourceCount:g.sources.size,opdCount:g.opds.size})).filter(g=>g.count>=2).sort((a,b)=>(b.velocity+b.riskAvg+b.impactAvg)-(a.velocity+a.riskAvg+a.impactAvg)).slice(0,12);
  };
  function render(){
    const el=document.getElementById('dashboard'); if(!el)return;
    let panel=document.getElementById('narrativeRadarPanel');
    if(!panel){panel=document.createElement('section');panel.id='narrativeRadarPanel';panel.className='glass rounded-2xl p-5';el.appendChild(panel);}
    if(state.loading){panel.innerHTML='<div class="text-xs text-slate-400">Memetakan narrative velocity dan media influence…</div>';return;}
    const g=build(state.articles);
    const top=g[0];
    const rows=g.map((x,i)=>`<tr class="border-t border-slate-800"><td class="py-3 pr-3 font-bold text-cyan-300">${i+1}</td><td class="py-3 pr-3"><div class="font-bold">${esc(x.word)}</div><div class="text-[10px] text-slate-500">${x.sourceCount} media · ${x.opdCount} OPD</div></td><td class="py-3 pr-3">${x.count}</td><td class="py-3 pr-3">${x.negative?'<span class="text-rose-300">NEGATIF</span>':'<span class="text-slate-400">NETRAL</span>'}</td><td class="py-3 pr-3"><span class="font-black">${x.velocity}</span>/100</td><td class="py-3"><span class="font-black">${x.riskAvg}</span>/100</td></tr>`).join('');
    panel.innerHTML=`<div class="flex flex-wrap items-start justify-between gap-3"><div><div class="text-[10px] tracking-[.25em] font-black text-cyan-400">NARRATIVE & MEDIA INFLUENCE RADAR</div><h2 class="text-xl font-black mt-1">${top?`Narasi tumbuh: “${esc(top.word)}”`:'Belum ada pola narasi yang cukup kuat'}</h2><p class="text-xs text-slate-400 mt-1">Deteksi pola kata lintas berita, velocity, risiko, dan penyebaran lintas sumber.</p></div><button id="radarRefresh" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold">↻ REFRESH RADAR</button></div>${top?`<div class="grid md:grid-cols-4 gap-3 mt-5"><div class="rounded-xl bg-slate-950/70 p-4"><div class="text-[10px] text-slate-500">VELOCITY</div><div class="text-2xl font-black">${top.velocity}<span class="text-xs text-slate-500">/100</span></div></div><div class="rounded-xl bg-slate-950/70 p-4"><div class="text-[10px] text-slate-500">RISK</div><div class="text-2xl font-black">${top.riskAvg}<span class="text-xs text-slate-500">/100</span></div></div><div class="rounded-xl bg-slate-950/70 p-4"><div class="text-[10px] text-slate-500">MEDIA SPREAD</div><div class="text-2xl font-black">${top.sourceCount}</div></div><div class="rounded-xl bg-slate-950/70 p-4"><div class="text-[10px] text-slate-500">OPD EXPOSED</div><div class="text-2xl font-black">${top.opdCount}</div></div></div>`:''}<div class="overflow-x-auto mt-5"><table class="w-full text-xs"><thead><tr class="text-left text-slate-500"><th class="pb-2">#</th><th class="pb-2">NARASI</th><th class="pb-2">MENTIONS</th><th class="pb-2">SENTIMEN</th><th class="pb-2">VELOCITY</th><th class="pb-2">RISK</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="py-5 text-slate-500">Belum cukup data untuk membentuk cluster narasi.</td></tr>'}</tbody></table></div><div class="mt-4 p-3 rounded-xl border border-amber-400/20 bg-amber-400/5 text-[11px] text-slate-400"><b class="text-amber-300">EARLY WARNING:</b> Radar ini adalah sinyal deteksi pola, bukan klaim bahwa satu kata merupakan narasi publik secara definitif. Konfirmasi dilakukan melalui artikel dan sumber primer.</div>`;
    document.getElementById('radarRefresh')?.addEventListener('click',load);
  }
  async function load(){state.loading=true;render();try{const p=new URLSearchParams({limit:'100'});const o=getOpd();if(o&&o!=='all')p.set('opdId',o);const r=await fetch('/api/articles?'+p.toString(),{credentials:'include'});const j=await r.json();state.articles=j.data||[];}catch(e){state.articles=[];}finally{state.loading=false;render();}}
  window.addEventListener('DOMContentLoaded',()=>{load();document.getElementById('opdSelect')?.addEventListener('change',load);setInterval(load,60000);});
})();
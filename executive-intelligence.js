(() => {
  const API_BASE = window.MEDIA_INTELLIGENCE_API || '/api';
  const esc = v => String(v ?? '').replace(/[&<>\'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const n = v => Math.max(0, Math.min(100, Number(v || 0)));
  const api = async path => { const r = await fetch(API_BASE + path, {credentials:'include'}); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };

  function fallback(rows) {
    const top = rows[0];
    if (!top) return {priority:'WATCH', headline:'Belum ada sinyal media untuk dianalisis.', situation:'Database belum memiliki artikel yang cukup.', implications:'Belum ada dampak publik yang dapat disimpulkan.', actions:['Pastikan feed media aktif.','Jalankan monitoring terbaru.'], message:'Pemko terus memantau perkembangan informasi dan menyampaikan informasi resmi melalui kanal pemerintah.'};
    const critical = rows.filter(x => ['critical','high'].includes(String(x.risk_level).toLowerCase()));
    const negative = rows.filter(x => String(x.sentiment).toLowerCase() === 'negative');
    const priority = rows.some(x => String(x.risk_level).toLowerCase() === 'critical') ? 'IMMEDIATE' : critical.length ? 'HIGH' : negative.length ? 'MEDIUM' : 'WATCH';
    return {priority,headline:top.title,situation:`${top.source_name || 'Media'} menjadi sinyal teratas dengan risk ${n(top.risk_score)}/100, impact ${n(top.impact_score)}/100 dan velocity ${n(top.velocity_score)}/100.`,implications:`Terdapat ${negative.length} sinyal negatif dan ${critical.length} sinyal high/critical dalam kumpulan teratas.`,actions:priority==='IMMEDIATE'?['Validasi fakta lintas OPD segera.','Tetapkan satu juru bicara.','Siapkan holding statement dan Q&A.','Pantau eskalasi secara real-time.']:priority==='HIGH'?['Validasi fakta dan dampak publik.','Siapkan key message lintas OPD.','Pantau follow-up media.']:['Monitor perkembangan dan siapkan konteks berbasis data.'],message:String(top.sentiment).toLowerCase()==='negative'?'Pemko memahami perhatian publik, melakukan verifikasi fakta dan koordinasi penanganan, serta akan menyampaikan perkembangan melalui kanal resmi.':'Pemko terus memperkuat informasi berbasis data yang dapat diverifikasi publik.'};
  }

  function render(brief, rows, ai=false) {
    const el=document.getElementById('dashboard'); if(!el) return;
    let panel=document.getElementById('executiveIntelligencePanel');
    if(!panel){panel=document.createElement('section');panel.id='executiveIntelligencePanel';panel.className='glass rounded-2xl p-5';el.appendChild(panel);}
    const cls=brief.priority==='IMMEDIATE'?'border-rose-500/50 text-rose-300':brief.priority==='HIGH'?'border-orange-500/50 text-orange-300':brief.priority==='MEDIUM'?'border-amber-500/40 text-amber-300':'border-cyan-500/30 text-cyan-300';
    panel.innerHTML=`<div class="flex flex-wrap justify-between gap-3"><div><div class="text-[10px] tracking-[.22em] font-black text-purple-300">EXECUTIVE INTELLIGENCE BRIEF</div><h2 class="text-lg font-black mt-1">Decision Brief · ${esc(brief.priority)}</h2><p class="text-xs text-slate-400 mt-1">${ai?'AI-assisted analysis':'Deterministic intelligence fallback'} · fakta dan rekomendasi dipisahkan</p></div><button id="refreshExecutiveBtn" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold"><i class="fa-solid fa-rotate mr-1"></i> Refresh</button></div><div class="grid lg:grid-cols-3 gap-3 mt-4"><div class="lg:col-span-2 rounded-xl bg-slate-950/70 border ${cls} p-4"><div class="text-[9px] font-black tracking-widest">TOP SIGNAL</div><h3 class="text-base font-bold mt-2 text-slate-100">${esc(brief.headline)}</h3><p class="text-xs text-slate-400 mt-2">${esc(brief.situation)}</p></div><div class="rounded-xl bg-slate-950/70 border ${cls} p-4"><div class="text-[9px] font-black tracking-widest">IMPLICATION</div><p class="text-xs text-slate-300 mt-2">${esc(brief.implications)}</p></div></div><div class="grid lg:grid-cols-2 gap-3 mt-3"><div class="rounded-xl bg-slate-950/70 border border-slate-800 p-4"><b class="text-rose-300 text-[10px] tracking-widest">RECOMMENDED ACTION</b><ol class="mt-2 space-y-2 text-xs text-slate-300">${(brief.actions||[]).map((x,i)=>`<li><span class="text-cyan-400 font-black mr-2">${i+1}.</span>${esc(x)}</li>`).join('')}</ol></div><div class="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-4"><b class="text-cyan-300 text-[10px] tracking-widest">KEY MESSAGE</b><p class="text-sm font-semibold mt-2">“${esc(brief.message || brief.key_message || '')}”</p></div></div>`;
    panel.querySelector('#refreshExecutiveBtn')?.addEventListener('click',load);
  }

  async function load(){
    try{
      const opd=document.getElementById('opdSelect')?.value;
      const qs=opd&&opd!=='all'?`?opdId=${encodeURIComponent(opd)}&limit=25`:'?limit=25';
      const payload=await api(`/articles${qs}`);
      const rows=(payload.data||[]).sort((a,b)=>n(b.risk_score)-n(a.risk_score)||n(b.impact_score)-n(a.impact_score));
      let brief=fallback(rows), ai=false;
      const provider=window.MEDIA_INTELLIGENCE_AI_URL;
      if(provider){
        try{const r=await fetch(provider,{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify({task:'executive_brief',articles:rows.slice(0,10)})});if(r.ok){const x=await r.json();if(x&&x.headline){brief=x;ai=true;}}}catch{}
      }
      render(brief,rows,ai);
    }catch(e){const el=document.getElementById('dashboard');if(el){let p=document.getElementById('executiveIntelligencePanel');if(!p){p=document.createElement('section');p.id='executiveIntelligencePanel';p.className='glass rounded-2xl p-5';el.appendChild(p);}p.innerHTML=`<div class="text-xs text-amber-300">Executive Intelligence belum dapat dimuat: ${esc(e.message)}</div>`;}}
  }
  function boot(){
    const original=window.showTab;
    if(typeof original==='function'&&!window.__executiveWrapped){window.showTab=function(id){original(id);if(id==='dashboard')load();};window.__executiveWrapped=true;}
    document.getElementById('opdSelect')?.addEventListener('change',()=>{if(!document.getElementById('dashboard')?.classList.contains('hidden'))load();});
    if(!document.getElementById('dashboard')?.classList.contains('hidden'))load();
    setInterval(()=>{if(!document.getElementById('dashboard')?.classList.contains('hidden'))load();},60000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.refreshExecutiveIntelligence=load;
})();

(()=>{'use strict';
const root=document.getElementById('aiUsagePanel');if(!root)return;
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=document.getElementById('aiUsageStatus');
async function get(path){const r=await fetch(API+path,{credentials:'include',cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||('HTTP '+r.status));return d.data||[]}
async function load(){
 status.textContent='Memuat data...';
 const results=await Promise.allSettled([get('/admin/ai/usage?limit=100'),get('/admin/ai/gemini-feature-usage?days=7')]);
 const [logs,quota]=results;
 if(logs.status==='fulfilled'){
  const rows=logs.value;
  document.getElementById('aiUsageResults').innerHTML='<h4 class="font-bold text-sm mb-2">Eksekusi AI (100 terbaru)</h4><div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr><th class="p-2 text-left">Waktu</th><th class="p-2 text-left">Task</th><th class="p-2 text-left">Provider / Model</th><th class="p-2 text-left">Status</th><th class="p-2 text-right">Token masuk</th><th class="p-2 text-right">Token keluar</th></tr></thead><tbody>'+ (rows.map(x=>'<tr class="border-t border-slate-700"><td class="p-2">'+esc(new Date(x.created_at).toLocaleString('id-ID'))+'</td><td class="p-2">'+esc(x.task_code||'-')+'</td><td class="p-2">'+esc(x.provider_code||'-')+' / '+esc(x.model_code||'-')+'</td><td class="p-2">'+esc(x.status)+'</td><td class="p-2 text-right">'+esc(x.input_tokens??'-')+'</td><td class="p-2 text-right">'+esc(x.output_tokens??'-')+'</td></tr>').join('')||'<tr><td colspan="6" class="p-3 text-slate-500">Belum ada eksekusi tercatat.</td></tr>')+'</tbody></table></div>';
 }else{document.getElementById('aiUsageResults').textContent='Log eksekusi tidak tersedia: '+logs.reason.message}
 if(quota.status==='fulfilled'){
  const rows=quota.value;
  const summary=new Map();
  for(const x of rows){const key=String(x.feature_code)+' / '+String(x.model_code);summary.set(key,(summary.get(key)||0)+Number(x.reserved_requests||0))}
  document.getElementById('aiGeminiFeatureResults').innerHTML='<h4 class="font-bold text-sm mb-1">Reservasi Gemini per Fitur (7 Hari)</h4><p class="text-xs text-slate-500 mb-2">Reservasi bukan bukti eksekusi berhasil.</p>'+(summary.size?[...summary].map(([name,count])=>'<div class="flex justify-between border-t border-slate-700 py-2 text-xs gap-3"><span>'+esc(name)+'</span><b>'+esc(count)+'</b></div>').join(''):'<p class="text-xs text-slate-500">Belum ada reservasi tercatat.</p>');
 }else{document.getElementById('aiGeminiFeatureResults').textContent='Reservasi Gemini tidak tersedia: '+quota.reason.message}
 status.textContent=results.every(x=>x.status==='fulfilled')?'Data berhasil dimuat.':'Sebagian data tidak tersedia.';
}
root.addEventListener('toggle',()=>{if(root.open)load().catch(e=>{status.textContent=e.message})});
document.getElementById('aiUsageRefresh')?.addEventListener('click',()=>load().catch(e=>{status.textContent=e.message}));
})();

(()=>{
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
function clippingId(){const marker=document.querySelector('#paEdit [class*="text-cyan"]');const m=(marker?.textContent||'').match(/CLIPPING\s*#(\d+)/i);return m?Number(m[1]):null;}
function notify(message){if(typeof window.toast==='function')window.toast(message);else alert(message);}
function paint(row,status){status=String(status||'candidate').toUpperCase();if(!row||status==='CANDIDATE')return;const linked=status==='LINKED';const badge=[...row.querySelectorAll('span')].find(x=>['CANDIDATE','LINKED','REJECTED'].includes((x.textContent||'').trim().toUpperCase()));if(badge){badge.textContent=status;badge.classList.remove('text-amber-300','text-emerald-300','text-slate-500');badge.classList.add(linked?'text-emerald-300':'text-slate-500');}row.querySelectorAll('[data-issue-decision]').forEach(b=>b.remove());row.classList.remove('border-amber-500/20','border-emerald-500/30','border-slate-800');row.classList.add(linked?'border-emerald-500/30':'border-slate-800');}
let syncing=false,lastKey='';async function syncPersisted(){const id=clippingId();const rows=[...document.querySelectorAll('[data-issue-row]')];if(!id||!rows.length||syncing)return;const key=id+':'+rows.map(r=>r.dataset.issueRow).join(',');if(key===lastKey)return;syncing=true;try{const r=await fetch(`${API}/print/articles/${id}/issue-linkage`,{credentials:'include',cache:'no-store'}),j=await r.json().catch(()=>({}));if(!r.ok)return;const data=j.data||{};const candidates=Array.isArray(data.candidates)?data.candidates:[];for(const c of candidates){const row=document.querySelector(`[data-issue-row="${Number(c.issueId)}"]`);paint(row,c.linkageStatus);}lastKey=key;}finally{syncing=false;}}
async function decide(btn){
 const id=clippingId();const issueId=Number(btn.dataset.issueId||0);const decision=btn.dataset.issueDecision;
 if(!id||!issueId||!['linked','rejected'].includes(decision)){notify('Keputusan issue gagal: clipping atau issue tidak dikenali.');return;}
 const label=decision==='linked'?'Hubungkan clipping ini ke issue?':'Tolak kandidat issue ini?';
 if(!confirm(label))return;
 const reason=decision==='linked'?'Dikonfirmasi operator: clipping terkait dengan issue.':'Dikonfirmasi operator: kandidat issue tidak terkait dengan clipping.';
 const row=btn.closest('[data-issue-row]');const buttons=row?.querySelectorAll('[data-issue-decision]')||[];buttons.forEach(b=>b.disabled=true);
 btn.textContent=decision==='linked'?'MENGHUBUNGKAN...':'MENOLAK...';
 try{
  const r=await fetch(`${API}/print/articles/${id}/issue-linkage/${issueId}/decision`,{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision,reason})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||j.error||`HTTP ${r.status}`);
  paint(row,decision);lastKey='';notify(decision==='linked'?'Clipping berhasil dihubungkan ke issue.':'Kandidat issue berhasil ditolak.');
 }catch(err){buttons.forEach(b=>b.disabled=false);btn.textContent=decision==='linked'?'HUBUNGKAN KE ISSUE':'TOLAK KANDIDAT';notify(`Keputusan issue gagal: ${err.message}`);}
}
document.addEventListener('click',ev=>{const btn=ev.target.closest?.('[data-issue-decision]');if(!btn)return;ev.preventDefault();ev.stopImmediatePropagation();decide(btn);},true);
const observer=new MutationObserver(()=>{lastKey='';setTimeout(syncPersisted,0);});observer.observe(document.body,{childList:true,subtree:true});setTimeout(syncPersisted,250);
})();

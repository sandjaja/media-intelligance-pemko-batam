(()=>{
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
function clippingId(){const marker=document.querySelector('#paEdit [class*="text-cyan"]');const m=(marker?.textContent||'').match(/CLIPPING\s*#(\d+)/i);return m?Number(m[1]):null;}
function notify(message){if(typeof window.toast==='function')window.toast(message);else alert(message);}
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
  const status=decision==='linked'?'LINKED':'REJECTED';
  const badge=row?.querySelector('span.font-black');if(badge){badge.textContent=status;badge.classList.remove('text-amber-300');badge.classList.add(decision==='linked'?'text-emerald-300':'text-slate-500');}
  buttons.forEach(b=>b.remove());
  row?.classList.remove('border-amber-500/20');row?.classList.add(decision==='linked'?'border-emerald-500/30':'border-slate-800');
  notify(decision==='linked'?'Clipping berhasil dihubungkan ke issue.':'Kandidat issue berhasil ditolak.');
 }catch(err){buttons.forEach(b=>b.disabled=false);btn.textContent=decision==='linked'?'HUBUNGKAN KE ISSUE':'TOLAK KANDIDAT';notify(`Keputusan issue gagal: ${err.message}`);}
}
document.addEventListener('click',ev=>{const btn=ev.target.closest?.('[data-issue-decision]');if(!btn)return;ev.preventDefault();ev.stopImmediatePropagation();decide(btn);},true);
})();

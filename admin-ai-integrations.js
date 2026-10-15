(()=>{'use strict';
const names={gemini:'Gemini',openai:'OpenAI',anthropic:'Claude (Anthropic)'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
async function load(){const root=document.getElementById('aiAdminProviders'),status=document.getElementById('aiAdminStatus');if(!root||!status)return;
try{const r=await fetch('/api/admin/ai/providers',{credentials:'include'});if(!r.ok)throw Error('Gagal memuat provider AI (HTTP '+r.status+')');const j=await r.json();const providers=Array.isArray(j.data)?j.data:[];const cr=await fetch('/api/admin/ai/credentials/status',{credentials:'include'});if(!cr.ok)throw Error('Gagal memuat status credential AI (HTTP '+cr.status+')');const cj=await cr.json();const credentials=Array.isArray(cj.data)?cj.data:[];
const expandedProviders=new Set([...root.querySelectorAll('details[data-ai-card][open]')].map(x=>x.dataset.aiCard));const mr=await fetch('/api/admin/ai/models',{credentials:'include'});if(!mr.ok)throw Error('Gagal memuat model AI (HTTP '+mr.status+')');const mj=await mr.json();const models=Array.isArray(mj.data)?mj.data:[];
root.innerHTML=Object.entries(names).map(([code,name])=>{const p=providers.find(x=>String(x.code).toLowerCase()===code),c=credentials.find(x=>x.code===code);return '<details class="rounded-xl border border-slate-700 p-4 space-y-2" data-ai-card="'+code+'"><summary class="font-black cursor-pointer">'+esc(name)+' <span class="inline-block rounded-full px-2 py-0.5 text-xs '+(code==='gemini'?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-900')+'">'+(code==='gemini'?'GRATIS':'BERBAYAR')+'</span></summary><div class="mt-3 space-y-2"><div class="text-xs">'+(p?'Provider terdaftar':'Provider otomatis terdaftar saat menyimpan API key')+'</div><div class="text-xs text-slate-500">API key: '+(c?.credential_hint?esc(c.credential_hint):'Belum disimpan')+'</div><div class="flex gap-2"><input type="password" autocomplete="new-password" data-ai-key="'+code+'" '+' aria-label="API key '+esc(name)+'" placeholder="Masukkan API key baru" class="min-w-0 flex-1 rounded-lg border border-slate-700 px-2 py-2 text-xs"><button type="button" data-ai-eye="'+code+'" '+' aria-label="Tampilkan API key" class="rounded-lg border border-slate-700 px-2 py-2 text-xs">👁</button></div><button type="button" data-ai-save="'+code+'" '+' class="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold">Simpan API Key</button> <button type="button" data-ai-test="'+code+'" '+(p&&c?.credential_hint?'':'disabled')+' class="rounded-lg border border-slate-600 px-3 py-2 text-xs">Uji Koneksi</button><div class="border-t border-slate-700 pt-3 space-y-2"><div class="text-sm font-bold">Model AI</div><button type="button" data-ai-verify="'+code+'" class="rounded-lg border border-cyan-700 px-2 py-1 text-xs">Verifikasi ID Model</button><div data-ai-verify-result="'+code+'" class="text-xs text-slate-400"></div>'+models.filter(m=>m.provider_code===code).map(m=>'<div class="flex items-center justify-between gap-2 text-xs"><span>'+esc(m.name)+' <span class="text-slate-500">('+esc(m.code)+')</span></span><button type="button" data-ai-model-edit="'+m.id+'" data-ai-model-code-current="'+esc(m.code)+'" class="rounded-lg border border-slate-600 px-2 py-1">Edit</button><button type="button" data-ai-model-delete="'+m.id+'" data-ai-model-label="'+esc(m.code)+'" class="rounded-lg border border-red-700 px-2 py-1">Hapus</button></div>').join('')+'<div class="flex gap-2"><input data-ai-model-code="'+code+'" placeholder="ID model resmi" class="min-w-0 flex-1 rounded-lg border border-slate-700 px-2 py-2 text-xs"><button type="button" data-ai-model-add="'+code+'" class="rounded-lg bg-slate-700 px-2 py-2 text-xs">Tambah model</button></div></div></details>';}).join('');
const summary=await fetch('/api/admin/ai/usage/summary?days=30',{credentials:'include'});
if(summary.ok){const usage=await summary.json();const rows=Array.isArray(usage.data)?usage.data:[];const total=rows.reduce((n,x)=>n+Number(x.total_tokens||0),0);const container=document.createElement('details');container.className='rounded-xl border border-slate-700 p-4 mt-4 space-y-2';container.innerHTML='<summary class="font-bold cursor-pointer">Penggunaan token Humas dan AI — 30 hari</summary><div class="text-sm">Total token tercatat: '+total.toLocaleString('id-ID')+'</div><div class="text-xs text-slate-400">Riwayat hanya mencakup permintaan yang sudah tercatat. Penggunaan tanpa identitas pengguna ditandai sebagai belum teratribusi.</div><div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr><th class="text-left p-2">Pengguna</th><th class="text-left p-2">Model</th><th class="text-left p-2">Fitur</th><th class="text-right p-2">Input</th><th class="text-right p-2">Output</th><th class="text-right p-2">Total</th></tr></thead><tbody>'+rows.map(x=>'<tr class="border-t border-slate-700"><td class="p-2">'+esc(x.user_email||'Belum teratribusi')+'</td><td class="p-2">'+esc(x.model_code||'-')+'</td><td class="p-2">'+esc(x.task_code||'-')+'</td><td class="p-2 text-right">'+Number(x.input_tokens||0).toLocaleString('id-ID')+'</td><td class="p-2 text-right">'+Number(x.output_tokens||0).toLocaleString('id-ID')+'</td><td class="p-2 text-right">'+Number(x.total_tokens||0).toLocaleString('id-ID')+'</td></tr>').join('')+'</tbody></table></div>';
root.appendChild(container);
}
status.textContent='API key tersimpan terenkripsi. Eksekusi berbayar wajib melalui pemeriksaan anggaran dan kuota server.';
}catch(e){status.textContent=e.message;root.replaceChildren();}}
document.addEventListener('click',async event=>{const eye=event.target.closest('[data-ai-eye]');if(eye){const input=document.querySelector('[data-ai-key="'+eye.dataset.aiEye+'"]');if(!input)return;const visible=input.type==='password';input.type=visible?'text':'password';eye.setAttribute('aria-label',visible?'Sembunyikan API key':'Tampilkan API key');return;}const save=event.target.closest('[data-ai-save]');if(!save)return;const code=save.dataset.aiSave,input=document.querySelector('[data-ai-key="'+code+'"]');if(!names[code]||!input)return;const credential=input.value.trim();if(credential.length<8){alert('API key minimal 8 karakter.');return;}save.disabled=true;try{const r=await fetch('/api/admin/ai/credentials/'+code,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential})});if(!r.ok)throw Error('Gagal menyimpan API key (HTTP '+r.status+')');input.value='';await load();}catch(error){alert(error.message);save.disabled=false;}});
document.addEventListener('click',async event=>{const button=event.target.closest('[data-ai-test]');if(!button)return;const code=button.dataset.aiTest;if(!names[code])return;button.disabled=true;try{const response=await fetch('/api/admin/ai/credentials/'+code+'/test',{method:'POST',credentials:'include'});const result=await response.json();if(!response.ok)throw Error(result.error||'Uji koneksi gagal');alert(result.data?.connected?'Koneksi '+names[code]+' berhasil.':'Koneksi '+names[code]+' gagal (HTTP '+result.data?.httpStatus+').');}catch(error){alert(error.message);}finally{button.disabled=false;}});
document.addEventListener('click',async event=>{const add=event.target.closest('[data-ai-model-add]');if(!add)return;const button=add;button.disabled=true;try{let url,method,body;if(add){const code=add.dataset.aiModelAdd;const input=document.querySelector('[data-ai-model-code="'+code+'"]');const modelCode=input?.value.trim();if(!modelCode)throw Error('Masukkan ID model resmi.');const response=await fetch('/api/admin/ai/providers',{credentials:'include'});if(!response.ok)throw Error('Gagal memuat provider');const data=await response.json();const provider=data.data?.find(p=>p.code===code);if(!provider)throw Error('Provider belum terdaftar');url='/api/admin/ai/models';method='POST';body={providerId:provider.id,code:modelCode,name:modelCode,enabled:true};}const response=await fetch(url,{method,credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw Error('Gagal menyimpan model (HTTP '+response.status+')');await load();}catch(error){alert(error.message);button.disabled=false;}});
document.addEventListener('click',async event=>{const edit=event.target.closest('[data-ai-model-edit]'),del=event.target.closest('[data-ai-model-delete]');if(!edit&&!del)return;const button=edit||del;const id=edit?.dataset.aiModelEdit||del.dataset.aiModelDelete;let method,body;if(edit){const code=prompt('Ubah ID model:',edit.dataset.aiModelCodeCurrent);if(code===null)return;const next=code.trim();if(next.length<2||next.length>150){alert('ID model harus 2–150 karakter.');return;}method='PATCH';body={code:next,name:next};}else{if(!confirm('Hapus model '+del.dataset.aiModelLabel+'? Model yang dipakai konfigurasi tidak dapat dihapus.'))return;method='DELETE';}button.disabled=true;try{const response=await fetch('/api/admin/ai/models/'+id,{method,credentials:'include',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error==='AI_MODEL_IN_USE'?'Model sedang digunakan. Nonaktifkan atau ubah konfigurasi tugas terlebih dahulu.':'Gagal menyimpan perubahan model (HTTP '+response.status+')');await load();}catch(error){alert(error.message);button.disabled=false;}});
document.addEventListener('click',async event=>{const button=event.target.closest('[data-ai-verify]');if(!button)return;const code=button.dataset.aiVerify;const output=document.querySelector('[data-ai-verify-result="'+code+'"]');button.disabled=true;if(output)output.textContent='Memeriksa daftar model resmi...';try{const response=await fetch('/api/admin/ai/models/verify?provider='+encodeURIComponent(code),{credentials:'include'});const result=await response.json();if(!response.ok)throw Error(result.error||'Verifikasi gagal');if(output)output.textContent=result.data.models.map(m=>m.code+': '+(m.available?'Tersedia':'Tidak ditemukan')).join(' | ')+(result.data.partial?' (daftar provider belum lengkap)':'');}catch(error){if(output)output.textContent=error.message;}finally{button.disabled=false;}});

// Reconciliation is read-only and visible only in the existing admin AI panel.
async function loadManualBalances(){
 const root=document.getElementById('aiManualBalanceRows');if(!root)return;
 root.textContent='Memuat saldo manual...';
 try{
  const response=await fetch('/api/admin/ai/manual-balances',{credentials:'include',cache:'no-store'});
  const result=await response.json();if(!response.ok)throw Error(result.error||'HTTP '+response.status);
  root.innerHTML=(result.data||[]).map(p=>{
   const remaining=p.remaining_usd==null?'—':'$'+Number(p.remaining_usd).toFixed(4);
   const balance=p.balance_usd==null?'Belum diinput':'$'+Number(p.balance_usd).toFixed(4);
   return '<div class="rounded-lg border border-slate-700 p-3 space-y-2" data-manual-balance="'+esc(p.provider_code)+'"><div class="font-semibold">'+esc(names[p.provider_code]||p.provider_code)+'</div><div class="text-xs">Saldo saat input: '+balance+' · Sisa internal: '+remaining+'</div><label class="block text-xs">Saldo aktual USD<input data-balance-amount type="number" min="0" step="0.0001" class="mt-1 w-full rounded border border-slate-600 p-2"></label><label class="block text-xs">Alasan pembaruan<input data-balance-reason maxlength="500" class="mt-1 w-full rounded border border-slate-600 p-2"></label><button type="button" data-balance-save class="rounded bg-cyan-700 px-3 py-2 text-xs font-bold">Simpan saldo</button></div>';
  }).join('')||'Provider berbayar tidak ditemukan.';
 }catch(error){root.textContent='Gagal memuat saldo manual: '+error.message;}
}
function setupManualBalances(){
 const panel=document.getElementById('aiAdminPanel');if(!panel||document.getElementById('aiManualBalanceSection'))return;
 const section=document.createElement('details');section.id='aiManualBalanceSection';section.className='border-t border-slate-700 pt-4 mt-4';
 section.innerHTML='<summary class="cursor-pointer font-bold">Saldo Manual AI Berbayar</summary><p class="text-xs text-slate-400 mt-2">Masukkan saldo tersisa yang terlihat di akun provider. Saldo ini adalah input manual, bukan hasil API provider.</p><div id="aiManualBalanceRows" class="grid gap-3 mt-3"></div>';
 panel.appendChild(section);
 section.addEventListener('toggle',()=>{if(section.open)loadManualBalances();});
 section.addEventListener('click',async event=>{
  const button=event.target.closest?.('[data-balance-save]');if(!button)return;
  const row=button.closest('[data-manual-balance]');
  const raw=row.querySelector('[data-balance-amount]').value;
  const amount=Number(raw),reason=row.querySelector('[data-balance-reason]').value.trim();
  if(!raw||!Number.isFinite(amount)||amount<0||reason.length<5){alert('Isi saldo valid dan alasan minimal 5 karakter.');return;}
  if(!confirm('Ganti saldo acuan provider dengan angka ini?'))return;
  button.disabled=true;
  try{
   const response=await fetch('/api/admin/ai/manual-balances',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({providerCode:row.dataset.manualBalance,balanceUsd:amount,reason})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'HTTP '+response.status);
   await loadManualBalances();
  }catch(error){alert('Gagal menyimpan saldo: '+error.message);}finally{button.disabled=false;}
 });
}
async function loadReconciliation(){
 const output=document.getElementById('aiReconciliationRows');if(!output)return;
 output.textContent='Memuat rekonsiliasi...';
 try{
  const [pendingResponse,balanceResponse]=await Promise.all([
   fetch('/api/admin/ai/budget/pending-reservations?minAgeMinutes=30&limit=100',{credentials:'include',cache:'no-store'}),
   fetch('/api/admin/ai/manual-balances',{credentials:'include',cache:'no-store'})
  ]);
  if(!pendingResponse.ok||!balanceResponse.ok)throw Error('HTTP '+(!pendingResponse.ok?pendingResponse.status:balanceResponse.status));
  const pending=await pendingResponse.json(),balances=await balanceResponse.json();
  const rows=(pending.data||[]).filter(p=>['openai','anthropic','claude'].includes(String(p.provider_code||'').toLowerCase()));
  const summary=document.getElementById('aiReconciliationBudgetSummary');
  if(summary)summary.innerHTML='<div class="grid md:grid-cols-2 gap-3">'+(balances.data||[]).map(p=>{
   return '<details class="rounded-xl border border-slate-700 p-3"><summary class="font-bold cursor-pointer">'+esc(names[p.provider_code]||p.provider_code)+'</summary><div class="mt-2 text-xs space-y-1"><div>Saldo saat input: '+(p.balance_usd==null?'Belum diinput':'$'+Number(p.balance_usd).toFixed(4))+'</div><div>Pemakaian sejak input: '+(p.used_since_update_usd==null?'—':'$'+Number(p.used_since_update_usd).toFixed(4))+'</div><div class="font-bold">Sisa internal: '+(p.remaining_usd==null?'—':'$'+Number(p.remaining_usd).toFixed(4))+'</div></div></details>';
  }).join('')+'</div><p class="text-xs text-slate-400 mt-2">Saldo manual Admin; pemakaian berasal dari ledger aplikasi, bukan API tagihan provider.</p>';
  output.innerHTML='<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr><th class="p-2 text-left">ID</th><th class="p-2 text-left">Provider</th><th class="p-2 text-left">Tugas</th><th class="p-2 text-right">USD</th></tr></thead><tbody>'+
   (rows.map(p=>'<tr class="border-t border-slate-700"><td class="p-2">'+esc(p.reservation_id)+'</td><td class="p-2">'+esc(p.provider_code)+'</td><td class="p-2">'+esc(p.task_code)+'</td><td class="p-2 text-right">'+esc(p.reserved_usd)+'</td></tr>').join('')||'<tr><td colspan="4" class="p-4 text-center">Tidak ada reservasi tertunda.</td></tr>')+'</tbody></table></div>';
 }catch(error){output.textContent='Gagal memuat rekonsiliasi: '+error.message;}
}
function setupReconciliation(){
 const panel=document.getElementById('aiAdminPanel');if(!panel||document.getElementById('aiReconciliationPanel'))return;
 const section=document.createElement('section');section.id='aiReconciliationPanel';section.className='border-t border-slate-700 pt-4 mt-4';
 section.innerHTML='<button type="button" id="aiReconciliationToggle" aria-expanded="false" class="rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-cyan-300">Rekonsiliasi AI ▾</button><div id="aiReconciliationContent" class="hidden mt-3 space-y-3"><p class="text-xs text-slate-400">Read-only: biaya yang belum terverifikasi tetap dicadangkan.</p><button type="button" id="aiReconciliationRefresh" class="rounded-lg border border-slate-600 px-3 py-2 text-xs">Muat ulang</button><div id="aiReconciliationBudgetSummary"></div><div id="aiReconciliationRows"></div></div>';
 panel.appendChild(section);
 section.querySelector('#aiReconciliationToggle').addEventListener('click',()=>{const content=section.querySelector('#aiReconciliationContent');const show=content.classList.contains('hidden');content.classList.toggle('hidden',!show);section.querySelector('#aiReconciliationToggle').setAttribute('aria-expanded',String(show));if(show)loadReconciliation();});
 section.querySelector('#aiReconciliationRefresh').addEventListener('click',loadReconciliation);
}
async function loadGeminiQuotas(){
 const root=document.getElementById('aiGeminiQuotaRows');if(!root)return;
 root.textContent='Memuat pengaturan kuota...';
 try{
  const response=await fetch('/api/admin/ai/gemini-quotas',{credentials:'include'});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Pengaturan kuota belum tersedia');
  root.innerHTML=(data.data||[]).map(m=>'<div class="rounded-lg border border-slate-700 p-3 space-y-2" data-gemini-quota="'+Number(m.model_id)+'"><div class="text-sm font-bold">'+esc(m.model_name||m.model_code)+'</div><div class="text-xs text-slate-400">Reservasi hari ini (UTC): '+Number(m.reserved_today||0)+'</div><label class="text-xs">Batas permintaan per hari <input data-quota-limit type="number" min="1" max="100000" value="'+Number(m.max_requests??(String(m.model_code).includes('flash-lite')?50:20))+'" class="w-full rounded bg-slate-900 border border-slate-700 p-2"></label><label class="flex items-center gap-2 text-xs"><input data-quota-enabled type="checkbox" '+(m.enabled?'checked':'')+'>Aktifkan kuota</label><button type="button" data-quota-save class="rounded bg-cyan-700 px-3 py-2 text-xs font-bold">Simpan kuota</button></div>').join('')||'<p class="text-xs">Belum ada model Gemini.</p>';
 }catch(err){root.textContent='Kuota belum tersedia: '+err.message;}
}
function setupGeminiQuotas(){
 const panel=document.getElementById('aiAdminProviders')?.parentElement;if(!panel||document.getElementById('aiGeminiQuotaSection'))return;
 const section=document.createElement('details');section.id='aiGeminiQuotaSection';section.className='mt-5 rounded-xl border border-slate-700 p-4 space-y-3';
 section.innerHTML='<summary class="font-bold cursor-pointer">Kuota Harian Gemini</summary><p class="text-xs text-slate-400">Batasi permintaan Gemini per model. Saat kuota nonaktif, permintaan Gemini akan ditolak. Penghitungan menggunakan UTC.</p><button type="button" id="aiGeminiQuotaRefresh" class="rounded border border-slate-600 px-3 py-2 text-xs">Muat ulang kuota</button><div id="aiGeminiQuotaRows" class="grid gap-3"></div>';
 panel.appendChild(section);
 section.querySelector('#aiGeminiQuotaRefresh').addEventListener('click',loadGeminiQuotas);
 section.addEventListener('click',async e=>{
  const btn=e.target.closest?.('[data-quota-save]');if(!btn)return;
  const row=btn.closest('[data-gemini-quota]'),modelId=Number(row.dataset.geminiQuota);
  const limit=Number(row.querySelector('[data-quota-limit]').value),enabled=row.querySelector('[data-quota-enabled]').checked;
  if(!Number.isInteger(limit)||limit<1||limit>100000){alert('Batas kuota harus 1–100000.');return;}
  btn.disabled=true;
  try{
   const r=await fetch('/api/admin/ai/gemini-quotas/'+modelId,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({max_requests:limit,enabled})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Gagal menyimpan kuota');
   await loadGeminiQuotas();
  }catch(err){alert('Gagal menyimpan: '+err.message);}finally{btn.disabled=false;}
 });
 loadGeminiQuotas();
}
document.addEventListener('DOMContentLoaded',()=>{setupReconciliation();setupManualBalances();setupGeminiQuotas();load();});
})();
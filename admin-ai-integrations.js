(()=>{'use strict';
const names={gemini:'Gemini',openai:'OpenAI',anthropic:'Claude (Anthropic)'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
async function load(){const root=document.getElementById('aiAdminProviders'),status=document.getElementById('aiAdminStatus');if(!root||!status)return;
try{const r=await fetch('/api/admin/ai/providers',{credentials:'include'});if(!r.ok)throw Error('Gagal memuat provider AI (HTTP '+r.status+')');const j=await r.json();const providers=Array.isArray(j.data)?j.data:[];
root.innerHTML=Object.entries(names).map(([code,name])=>{const p=providers.find(x=>String(x.code).toLowerCase()===code);return '<article class="rounded-xl border border-slate-700 p-4 space-y-2"><div class="font-black">'+esc(name)+'</div><div class="text-xs">'+(p?(p.enabled?'Aktif':'Nonaktif'):'Belum terdaftar')+'</div><div class="text-xs text-slate-500">API key: belum tersedia di halaman ini</div><button type="button" data-register-ai="'+code+'" class="px-3 py-2 rounded-lg bg-slate-800 text-xs" '+(p?'disabled':'')+'>'+(p?'Terdaftar':'Daftarkan provider')+'</button></article>';}).join('');
status.textContent='Provider dan model dikelola Superadmin. Pengisian API key menunggu penyimpanan secret server yang aman.';
}catch(e){status.textContent=e.message;root.replaceChildren();}}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-register-ai]');if(!b)return;const code=b.dataset.registerAi;if(!names[code])return;b.disabled=true;try{const r=await fetch('/api/admin/ai/providers',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,name:names[code],enabled:false})});if(!r.ok)throw Error('Gagal mendaftarkan provider');await load();}catch(e){alert(e.message);b.disabled=false;}});
document.addEventListener('DOMContentLoaded',load);
})();
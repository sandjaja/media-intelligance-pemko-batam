(()=>{'use strict';
const api=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
function viewer(){const u=window.MEDIA_CURRENT_USER,roles=u?.roles||[];return roles.length===1&&roles[0]==='viewer'&&!u.opdId&&!u.districtId;}
function open(){
 if(!viewer())return;document.getElementById('tvActivationDialog')?.remove();
 const dialog=document.createElement('dialog');dialog.id='tvActivationDialog';dialog.className='glass rounded-2xl p-6';dialog.style.cssText='width:min(440px,calc(100% - 32px));color:inherit';
 dialog.innerHTML='<form class="space-y-4"><h2 class="font-bold text-xl">Mode TV / Papan Informasi</h2><p class="text-sm">Peta situasi, berita hari ini, dan isu hari ini beserta KPI akan berganti otomatis. Akses layar berlaku 30 hari dan dapat dicabut admin.</p><label class="block text-sm">Nama perangkat<input name="displayName" required maxlength="80" value="TV / Papan Informasi" class="block w-full mt-2 rounded-lg border border-slate-600 p-3"></label><p data-status role="status" class="text-sm"></p><div class="flex gap-2"><button type="submit" class="bg-cyan-700 text-white rounded-lg px-4 py-3 font-bold">Aktifkan Mode TV</button><button type="button" data-cancel class="rounded-lg border border-slate-600 px-4 py-3">Batal</button></div></form>';
 document.body.append(dialog);dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
 dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=dialog.querySelector('button[type="submit"]'),status=dialog.querySelector('[data-status]');button.disabled=true;button.setAttribute('aria-busy','true');status.textContent='Mendaftarkan layar…';
  try{const response=await fetch(api+'/tv/devices',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:dialog.querySelector('input').value.trim()})});const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error==='GLOBAL_VIEWER_REQUIRED'?'Gunakan akun viewer tanpa pembatasan OPD/kecamatan.':response.status===401?'Sesi berakhir. Silakan login kembali.':'Mode TV belum dapat diaktifkan. Coba lagi.');location.assign('./tv.html');}
  catch(e){status.textContent=e.message;button.disabled=false;button.removeAttribute('aria-busy');}
 };dialog.showModal();
}
function add(){if(!viewer()){document.getElementById('viewerTvBanner')?.remove();return}if(document.getElementById('viewerTvBanner'))return;const main=document.querySelector('main');if(!main)return;const box=document.createElement('div');box.id='viewerTvBanner';box.className='glass rounded-xl p-4 mx-4 mt-4 flex items-center justify-between gap-3';box.innerHTML='<span class="text-sm">Tampilkan peta, berita, dan isu pada TV atau meja pimpinan.</span><button id="viewerTvModeBtn" type="button" class="shrink-0 rounded-lg bg-cyan-700 text-white font-bold px-4 py-3">Mode TV</button>';main.before(box);box.querySelector('button').onclick=open;}
window.addEventListener('media:authenticated',add);if(document.body?.dataset.auth==='ok')add();
})();

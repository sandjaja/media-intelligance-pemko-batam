(()=>{
'use strict';
let token=new URLSearchParams(location.hash.slice(1)).get('token')||'';
history.replaceState(null,'',location.pathname);
window.addEventListener('hashchange',()=>{if(new URLSearchParams(location.hash.slice(1)).has('token'))location.reload();});
const form=document.getElementById('resetForm'),result=document.getElementById('result'),button=document.getElementById('submit');
if(!/^[A-Za-z0-9_-]{64}$/.test(token)){form.hidden=true;result.textContent='Tautan reset tidak valid. Silakan minta tautan baru dari halaman login.';return;}
form.addEventListener('submit',async event=>{
 event.preventDefault();const password=document.getElementById('password').value;
 if(password!==document.getElementById('confirmPassword').value){result.textContent='Konfirmasi password belum sama.';return;}
 button.disabled=true;button.setAttribute('aria-busy','true');result.textContent='Menyimpan password...';
 try{
  const response=await fetch((window.MEDIA_INTELLIGENCE_API||'/api')+'/auth/reset-password',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,password})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'UNAVAILABLE');
  token='';form.reset();form.hidden=true;result.textContent='Password berhasil diubah. Silakan login menggunakan password baru.';
 }catch(error){result.textContent=error.message==='RESET_LINK_INVALID_OR_EXPIRED'?'Tautan sudah digunakan atau kedaluwarsa. Minta tautan baru dari halaman login.':responseMessage(error.message);}
 finally{button.disabled=false;button.removeAttribute('aria-busy');}
});
function responseMessage(code){return code==='INVALID_PASSWORD_RESET'?'Password minimal 8 karakter.':'Password belum dapat disimpan. Periksa koneksi lalu coba lagi.';}
})();

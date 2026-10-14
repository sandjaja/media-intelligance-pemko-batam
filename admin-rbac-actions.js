(()=>{
  const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
  const $=s=>document.querySelector(s);
  const toast=(msg,ok=true)=>{const t=$('#toast');if(!t)return;t.textContent=msg;t.className=`fixed bottom-5 right-5 glass rounded-xl px-4 py-3 text-xs shadow-2xl ${ok?'text-emerald-300':'text-rose-300'}`;t.classList.remove('hidden');clearTimeout(window.__rbacToast);window.__rbacToast=setTimeout(()=>t.classList.add('hidden'),5000)};
  async function request(path,options={}){const hasBody=options.body!==undefined;const headers={...(hasBody?{'Content-Type':'application/json'}:{}),...(options.headers||{})};const r=await fetch(API+path,{credentials:'include',cache:'no-store',headers,...options});const d=await r.json().catch(()=>({}));if(!r.ok){const err=new Error(d.message||d.error||`HTTP ${r.status}`);err.status=r.status;err.code=d.error;throw err}return d;}

  function patchCopy(){
    const p=$('#usersPanel h2')?.parentElement?.querySelector('p');
    if(p)p.textContent='5 role Command Center dengan permission terstruktur.';
    const hint=$('#userOpdWrap span');if(hint)hint.textContent='Wajib untuk role OPD.';
  }
  function patchOpdScope(){
    const role=$('#userRole'),wrap=$('#userOpdWrap'),opd=$('#userOpd');if(!role||!wrap||!opd)return;
    if(!$('#userOpdType')){
      const original=[...opd.options].filter(o=>o.value).map(o=>({value:o.value,text:o.textContent.trim()}));
      const type=document.createElement('select');type.id='userOpdType';type.className=opd.className;type.innerHTML='<option value="">Pilih jenis OPD</option>';
      ['DINAS','BADAN','BAGIAN','LAINNYA'].forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=k==='LAINNYA'?'Lainnya':k[0]+k.slice(1).toLowerCase();type.appendChild(o)});
      opd.insertAdjacentElement('beforebegin',type);opd.classList.add('mt-2');
      const kind=n=>/^Dinas\b/i.test(n)||/^[A-Z0-9]+\s+[—-]\s+Dinas\b/i.test(n)?'DINAS':/^Badan\b/i.test(n)||/^[A-Z0-9]+\s+[—-]\s+Badan\b/i.test(n)?'BADAN':/^Bagian\b/i.test(n)||/^[A-Z0-9]+\s+[—-]\s+Bagian\b/i.test(n)?'BAGIAN':'LAINNYA';
      const refill=()=>{const selected=type.value;opd.innerHTML='<option value="">Pilih OPD</option>';original.filter(x=>selected&&kind(x.text)===selected).forEach(x=>{const o=document.createElement('option');o.value=x.value;o.textContent=x.text;opd.appendChild(o)});opd.disabled=!selected};
      type.addEventListener('change',refill);refill();
    }
    const type=$('#userOpdType');
    const sync=()=>{const scoped=role.value==='opd';wrap.classList.toggle('hidden',!scoped);if(!scoped){opd.value='';if(type){type.value='';type.dispatchEvent(new Event('change'))}}};
    role.addEventListener('change',()=>setTimeout(sync,0));sync();
  }
  function patchDeleteButtons(){
    document.querySelectorAll('#userRows button[data-user-edit]').forEach(edit=>{
      if(edit.parentElement?.querySelector('[data-user-delete]'))return;
      const del=document.createElement('button');del.type='button';del.dataset.userDelete=edit.dataset.userEdit;del.className='px-2 py-1 rounded bg-rose-500/10 text-rose-300 ml-1';del.textContent='Hapus';edit.insertAdjacentElement('afterend',del);
    });
  }
  function resetQueueCard(){let card=$('#passwordResetQueue');if(card)return card;const panel=$('#usersPanel');if(!panel)return null;card=document.createElement('section');card.id='passwordResetQueue';card.className='mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4';card.innerHTML='<div class="flex items-center justify-between gap-3 mb-3"><div><h3 class="font-black text-sm text-amber-200">Permintaan Reset Password <span id="passwordResetCount" class="ml-1 px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300">0</span></h3><p class="text-xs text-slate-400 mt-1">Permintaan dari halaman login. Password baru diberikan langsung oleh Administrator kepada pemilik akun.</p></div><button type="button" id="passwordResetReload" class="px-3 py-2 rounded-lg bg-slate-800 text-xs font-bold">Refresh</button></div><div id="passwordResetRows" class="space-y-2"><div class="text-xs text-slate-500">Memuat permintaan...</div></div>';panel.prepend(card);card.querySelector('#passwordResetReload').onclick=loadResetQueue;return card;}
  async function loadResetQueue(){const card=resetQueueCard();if(!card)return;const rows=card.querySelector('#passwordResetRows'),count=card.querySelector('#passwordResetCount');try{const data=await request('/admin/password-reset-requests');const pending=(data.data||[]).filter(x=>x.status==='PENDING');count.textContent=String(pending.length);rows.innerHTML=pending.length?pending.map(x=>`<div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/60 p-3"><div><div class="text-sm font-bold text-slate-100">${String(x.email||'')}</div><div class="text-[11px] text-slate-400">Diminta ${new Date(x.requested_at).toLocaleString('id-ID')}</div></div><button type="button" data-password-reset="${Number(x.id)}" data-reset-email="${String(x.email||'').replace(/"/g,'&quot;')}" class="px-3 py-2 rounded-lg bg-amber-400/15 text-amber-200 text-xs font-black">Reset Password</button></div>`).join(''):'<div class="text-xs text-slate-500 py-2">Tidak ada permintaan reset password yang menunggu.</div>';}catch(err){rows.innerHTML=`<div class="text-xs text-rose-300">Gagal memuat permintaan: ${err.message}</div>`;}}
  async function handlePasswordReset(button){const id=button.dataset.passwordReset,email=button.dataset.resetEmail||'akun';const password=prompt(`Masukkan password sementara baru untuk ${email}:\nMinimal 8 karakter.`);if(!password)return;if(password.length<8){toast('Password minimal 8 karakter.',false);return}const confirmPassword=prompt('Ulangi password sementara baru:');if(confirmPassword!==password){toast('Konfirmasi password tidak sama.',false);return}const old=button.textContent;button.disabled=true;button.textContent='Mereset...';try{await request(`/admin/password-reset-requests/${id}/reset`,{method:'POST',body:JSON.stringify({password})});toast(`Password ${email} berhasil direset. Sampaikan password sementara kepada pemilik akun melalui kanal internal yang aman.`);await loadResetQueue();}catch(err){toast(err.code==='RESET_REQUEST_NOT_PENDING'?'Permintaan ini sudah ditangani.':err.message||'Reset password gagal.',false);button.disabled=false;button.textContent=old;}}
  async function deleteUser(id){
    try{return await request(`/admin/rbac/users/${id}`,{method:'DELETE',body:'{}'})}
    catch(err){
      if(err.status===404||err.status===405)return request(`/admin/rbac/users/${id}/delete`,{method:'POST',body:'{}'});
      throw err;
    }
  }
  async function saveUserFromForm(form){
    const id=$('#userId')?.value||'';
    const role=$('#userRole')?.value||'viewer';
    const opdRaw=$('#userOpd')?.value||'';
    const districtRaw=$('#userDistrict')?.value||'';
    if(role==='opd'&&!opdRaw){toast('Role OPD wajib memilih OPD.',false);return;}
    if(role==='district'&&!districtRaw){toast('Role Kecamatan wajib memilih Kecamatan.',false);return;}
    const body={
      email:$('#userEmail').value.trim(),
      role,
      active:$('#userActive').checked,
      opdId:role==='opd'?Number(opdRaw):null,
      districtId:role==='district'?Number(districtRaw):null,
    };
    const password=$('#userPassword').value;
    if(!id||password)body.password=password;
    const submit=form.querySelector('button[type="submit"]');const old=submit?.innerHTML;if(submit)submit.disabled=true;
    try{
      await request(id?`/admin/rbac/users/${id}`:'/admin/rbac/users',{method:id?'PATCH':'POST',body:JSON.stringify(body)});
      toast('Pengguna disimpan.');
      setTimeout(()=>location.reload(),350);
    }catch(err){
      const messages={OPD_REQUIRED_FOR_ROLE:'Role OPD wajib memiliki scope OPD.',GLOBAL_ROLE_CANNOT_HAVE_OPD_SCOPE:'Role global tidak boleh memiliki scope OPD.',USER_ALREADY_EXISTS:'Email pengguna sudah terdaftar.',CANNOT_DISABLE_SELF:'Akun yang sedang digunakan tidak dapat dinonaktifkan.',CANNOT_REMOVE_OWN_SUPER_ADMIN:'Super Admin tidak dapat mencabut role Super Admin miliknya sendiri.'};
      toast(messages[err.code]||err.message||'Pengguna gagal disimpan.',false);
    }finally{if(submit){submit.disabled=false;if(old!=null)submit.innerHTML=old;}}
  }
  document.addEventListener('submit',e=>{
    if(e.target?.id!=='userForm')return;
    e.preventDefault();e.stopImmediatePropagation();
    saveUserFromForm(e.target);
  },true);
  document.addEventListener('click',async e=>{
    const reset=e.target.closest('button[data-password-reset]');if(reset){e.preventDefault();e.stopPropagation();await handlePasswordReset(reset);return}
    const b=e.target.closest('button[data-user-delete]');if(!b)return;
    e.preventDefault();e.stopPropagation();
    const row=b.closest('tr'),email=row?.querySelector('td')?.textContent?.trim()||'akun ini';
    if(!confirm(`Hapus akun ${email}?\n\nAkun akan dihapus permanen dan tidak dapat login lagi.`))return;
    const original=b.textContent;b.disabled=true;b.textContent='Menghapus...';
    try{
      const result=await deleteUser(b.dataset.userDelete);
      if(!result?.data?.deleted)throw new Error('Server tidak mengonfirmasi penghapusan akun.');
      row?.remove();
      const count=$('#userCount');if(count)count.textContent=String(document.querySelectorAll('#userRows tr').length);
      toast(`Akun ${email} berhasil dihapus.`);
    }catch(err){
      const messages={CANNOT_DELETE_SELF:'Akun yang sedang Anda gunakan tidak dapat dihapus.',CANNOT_DELETE_LAST_SUPER_ADMIN:'Super Admin terakhir tidak dapat dihapus.',FORBIDDEN:'Anda tidak memiliki izin menghapus pengguna.',USER_NOT_FOUND:'Akun sudah tidak ada atau telah dihapus.',USER_DELETE_FAILED:'Server gagal menghapus akun. Coba lagi setelah deployment terbaru aktif.'};
      toast(messages[err.code]||err.message||'Akun gagal dihapus.',false);b.disabled=false;b.textContent=original;
    }
  },true);
  const start=()=>{patchCopy();patchOpdScope();patchDeleteButtons();resetQueueCard();loadResetQueue();const rows=$('#userRows');if(rows)new MutationObserver(patchDeleteButtons).observe(rows,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,300));else setTimeout(start,300);
})();
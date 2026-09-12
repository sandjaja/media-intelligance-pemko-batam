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
    const sync=()=>{const scoped=role.value==='opd';wrap.classList.toggle('hidden',!scoped);if(!scoped)opd.value='';};
    role.addEventListener('change',()=>setTimeout(sync,0));sync();
  }
  function patchDeleteButtons(){
    document.querySelectorAll('#userRows button[data-user-edit]').forEach(edit=>{
      if(edit.parentElement?.querySelector('[data-user-delete]'))return;
      const del=document.createElement('button');del.type='button';del.dataset.userDelete=edit.dataset.userEdit;del.className='px-2 py-1 rounded bg-rose-500/10 text-rose-300 ml-1';del.textContent='Hapus';edit.insertAdjacentElement('afterend',del);
    });
  }
  async function deleteUser(id){
    try{return await request(`/admin/rbac/users/${id}`,{method:'DELETE',body:'{}'})}
    catch(err){
      if(err.status===404||err.status===405)return request(`/admin/rbac/users/${id}/delete`,{method:'POST',body:'{}'});
      throw err;
    }
  }
  document.addEventListener('click',async e=>{
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
  const start=()=>{patchCopy();patchOpdScope();patchDeleteButtons();const rows=$('#userRows');if(rows)new MutationObserver(patchDeleteButtons).observe(rows,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,300));else setTimeout(start,300);
})();

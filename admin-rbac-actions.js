(()=>{
  const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
  const $=s=>document.querySelector(s);
  const toast=(msg,ok=true)=>{const t=$('#toast');if(!t)return;t.textContent=msg;t.className=`fixed bottom-5 right-5 glass rounded-xl px-4 py-3 text-xs shadow-2xl ${ok?'text-emerald-300':'text-rose-300'}`;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),3200)};
  async function api(path,options={}){const r=await fetch(API+path,{credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d;}

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
  document.addEventListener('click',async e=>{
    const b=e.target.closest('button[data-user-delete]');if(!b)return;
    const row=b.closest('tr'),email=row?.querySelector('td')?.textContent?.trim()||'akun ini';
    if(!confirm(`Hapus akun ${email}?\n\nAkun akan dihapus permanen dan tidak dapat login lagi.`))return;
    b.disabled=true;b.textContent='Menghapus...';
    try{await api(`/admin/rbac/users/${b.dataset.userDelete}`,{method:'DELETE'});toast(`Akun ${email} dihapus.`);row?.remove();const count=$('#userCount');if(count)count.textContent=String(document.querySelectorAll('#userRows tr').length)}catch(err){toast(err.message,false);b.disabled=false;b.textContent='Hapus'}
  });
  const start=()=>{patchCopy();patchOpdScope();patchDeleteButtons();const rows=$('#userRows');if(rows)new MutationObserver(patchDeleteButtons).observe(rows,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,300));else setTimeout(start,300);
})();

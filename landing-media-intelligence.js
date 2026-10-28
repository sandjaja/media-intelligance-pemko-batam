const toggle=document.querySelector('.menu-toggle');const nav=document.querySelector('#nav-links');toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Tutup navigasi':'Buka navigasi');nav.classList.toggle('open',open)});nav?.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{nav.classList.remove('open');toggle?.setAttribute('aria-expanded','false');toggle?.setAttribute('aria-label','Buka navigasi')}));
const dialog=document.querySelector('.shot-dialog');
const dialogImage=dialog?.querySelector('.dialog-image');
document.querySelectorAll('.open-shot').forEach(button=>button.addEventListener('click',()=>{
  if(!dialog || !dialogImage) return;
  dialogImage.src=button.dataset.image;
  dialogImage.alt=button.querySelector('img')?.alt || '';
  dialog.querySelector('.dialog-caption').textContent=button.dataset.caption || 'Cuplikan aplikasi';
  dialog.showModal();
}));
dialog?.querySelector('.dialog-close')?.addEventListener('click',()=>dialog.close());
dialog?.addEventListener('click',event=>{if(event.target===dialog) dialog.close()});

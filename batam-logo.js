(()=>{
  const fallback='';
  try{
    const xhr=new XMLHttpRequest();
    xhr.open('GET',new URL('./assets/batam-logo.svg',document.baseURI).href,false);
    xhr.send(null);
    if(xhr.status>=200&&xhr.status<300){
      const m=xhr.responseText.match(/href=["']data:image\/jpeg;base64,([^"']+)["']/i);
      if(m&&m[1]){
        const data='data:image/jpeg;base64,'+m[1];
        window.BATAM_LOGO_DATA_URI=data;
        window.BATAM_LOGO_URL=data;
        return;
      }
    }
  }catch(e){console.warn('Logo Pemko gagal dimuat:',e)}
  window.BATAM_LOGO_DATA_URI=fallback;
  window.BATAM_LOGO_URL=fallback;
})();
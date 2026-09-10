(()=>{
  const official=new URL('./assets/batam-logo.svg',document.baseURI).href;
  window.BATAM_LOGO_DATA_URI=official;
  window.BATAM_LOGO_URL=official;
})();
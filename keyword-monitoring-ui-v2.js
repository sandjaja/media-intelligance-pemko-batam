(()=>{'use strict';
  function load(){
    if(document.querySelector('script[data-topik-pantauan]'))return;
    const s=document.createElement('script');
    s.src='./topik-pantauan-ui.js?v=20260915-topic1';
    s.dataset.topikPantauan='1';
    document.head.appendChild(s);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load);else load();
})();
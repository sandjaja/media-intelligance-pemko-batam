(()=>{
'use strict';
const priorOpen=window.open.bind(window);
let reserved=null,reservedAt=0;
function reserve(){if(reserved&&!reserved.closed)return reserved;reserved=priorOpen('','_blank','width=1000,height=850');reservedAt=Date.now();if(reserved){try{reserved.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Menyiapkan Laporan</title><style>body{margin:0;background:#fff;color:#0f172a;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh}.box{text-align:center}.spin{width:38px;height:38px;border:4px solid #cbd5e1;border-top-color:#0891b2;border-radius:50%;margin:0 auto 14px;animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style></head><body><div class="box"><div class="spin"></div><b>Menyiapkan Laporan Media Cetak...</b><div style="font-size:12px;color:#64748b;margin-top:8px">Jendela ini akan berubah menjadi halaman cetak setelah data siap.</div></div></body></html>');reserved.document.close()}catch{}}return reserved}
document.addEventListener('click',e=>{if(e.target.closest?.('#prAll,#prDay,#prRange'))reserve()},true);
window.open=(...args)=>{if(reserved&&!reserved.closed&&Date.now()-reservedAt<60000){const w=reserved;reserved=null;document.getElementById('printPreparingOverlay')?.remove();return w}return priorOpen(...args)};
setInterval(()=>{if(reserved&&(reserved.closed||Date.now()-reservedAt>60000)){try{reserved.close()}catch{}reserved=null}},5000);
})();
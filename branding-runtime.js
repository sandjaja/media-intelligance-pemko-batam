(()=>{
'use strict';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const fallback={government_name:'Pemerintah Kota Batam',short_name:'Pemko Batam',city_name:'Batam',tagline:'Batam Maju, Masyarakat Sejahtera',logo_url:window.BATAM_LOGO_DATA_URI||window.BATAM_LOGO_URL||''};
window.MEDIA_BRANDING=window.MEDIA_BRANDING||fallback;
function value(k){return String((window.MEDIA_BRANDING||{})[k]||fallback[k]||'')}
function apply(){const b=window.MEDIA_BRANDING||fallback,logo=value('logo_url');if(logo){window.BATAM_LOGO_DATA_URI=logo;window.BATAM_LOGO_URL=logo}
 const mark=document.getElementById('headerBrandMark');if(mark&&logo)mark.innerHTML=`<img src="${logo}" alt="${value('government_name')}" style="width:44px;height:52px;object-fit:contain;display:block;filter:drop-shadow(0 3px 8px rgba(0,0,0,.35))">`;
 const loginLogo=document.querySelector('#authGate .mi-logo');if(loginLogo&&logo){loginLogo.src=logo;loginLogo.alt=`Logo ${value('government_name')}`}
 const gov=document.querySelector('#authGate .mi-gov');if(gov)gov.textContent=value('government_name').toUpperCase();
 const motto=document.querySelector('#authGate .mi-motto');if(motto&&value('tagline'))motto.textContent=value('tagline').toUpperCase();
 const opd=document.querySelector('#opdSelect option[value="all"]');if(opd)opd.textContent=`Semua OPD / ${value('short_name')}`;
 const dist=document.querySelector('#districtSelect option[value="all"]');if(dist)dist.textContent=`Semua Kecamatan / ${value('city_name')}`;
 document.querySelectorAll('[data-government-name]').forEach(el=>el.textContent=value('government_name'));
 document.querySelectorAll('[data-government-short-name]').forEach(el=>el.textContent=value('short_name'));
 document.querySelectorAll('[data-government-tagline]').forEach(el=>el.textContent=value('tagline'));
 window.dispatchEvent(new CustomEvent('media-branding-ready',{detail:b}));
}
window.getMediaBranding=()=>window.MEDIA_BRANDING||fallback;
window.applyMediaBranding=apply;
async function load(){try{const r=await fetch(API+'/branding/active',{credentials:'include',cache:'no-store'}),j=await r.json().catch(()=>({}));if(r.ok&&j.data){window.MEDIA_BRANDING={...fallback,...j.data};try{sessionStorage.setItem('mi.branding',JSON.stringify(window.MEDIA_BRANDING))}catch{}}else throw Error('branding unavailable')}catch{try{const c=JSON.parse(sessionStorage.getItem('mi.branding')||'null');if(c)window.MEDIA_BRANDING={...fallback,...c}}catch{}finally{apply()}}
}
try{const c=JSON.parse(sessionStorage.getItem('mi.branding')||'null');if(c)window.MEDIA_BRANDING={...fallback,...c}}catch{}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
load();
})();
(()=>{
'use strict';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const fallback={government_name:'Pemerintah Kota Batam',short_name:'Pemko Batam',city_name:'Batam',tagline:'Batam Maju, Masyarakat Sejahtera',logo_url:window.BATAM_LOGO_DATA_URI||window.BATAM_LOGO_URL||''};
window.MEDIA_BRANDING=window.MEDIA_BRANDING||fallback;
const style=document.createElement('style');style.id='brandingBootStyle';style.textContent='body:not([data-branding-loaded="1"]) #authGate .mi-logo{visibility:hidden!important}';document.head.appendChild(style);
function value(k){return String((window.MEDIA_BRANDING||{})[k]||fallback[k]||'')}
function floodTransparentLogo(src){return new Promise(resolve=>{if(!src||!src.startsWith('data:image/'))return resolve(src);const img=new Image();img.onerror=()=>resolve(src);img.onload=()=>{try{const c=document.createElement('canvas'),w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;if(!w||!h||w*h>1600000)return resolve(src);c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,w,h);const d=x.getImageData(0,0,w,h),p=d.data,seen=new Uint8Array(w*h),stack=[];const white=i=>p[i]>=238&&p[i+1]>=238&&p[i+2]>=238&&Math.max(p[i],p[i+1],p[i+2])-Math.min(p[i],p[i+1],p[i+2])<18;const add=(px,py)=>{if(px<0||py<0||px>=w||py>=h)return;const n=py*w+px;if(seen[n])return;const i=n*4;if(!white(i))return;seen[n]=1;stack.push(n)};for(let xx=0;xx<w;xx++){add(xx,0);add(xx,h-1)}for(let yy=0;yy<h;yy++){add(0,yy);add(w-1,yy)}while(stack.length){const n=stack.pop(),xx=n%w,yy=(n/w)|0;p[n*4+3]=0;add(xx-1,yy);add(xx+1,yy);add(xx,yy-1);add(xx,yy+1)}x.putImageData(d,0,0);resolve(c.toDataURL('image/png'))}catch{resolve(src)}};img.src=src})}
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
async function load(){try{const r=await fetch(API+'/branding/active',{credentials:'include',cache:'no-store'}),j=await r.json().catch(()=>({}));if(r.ok&&j.data){const raw={...fallback,...j.data};raw.logo_url=await floodTransparentLogo(raw.logo_url);window.MEDIA_BRANDING=raw;try{sessionStorage.setItem('mi.branding',JSON.stringify(raw))}catch{}}else throw Error('branding unavailable')}catch{try{const c=JSON.parse(sessionStorage.getItem('mi.branding')||'null');if(c)window.MEDIA_BRANDING={...fallback,...c}}catch{}}finally{document.body.dataset.brandingLoaded='1';apply()}return window.MEDIA_BRANDING}
try{const c=JSON.parse(sessionStorage.getItem('mi.branding')||'null');if(c)window.MEDIA_BRANDING={...fallback,...c}}catch{}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
window.MEDIA_BRANDING_READY=load();
})();
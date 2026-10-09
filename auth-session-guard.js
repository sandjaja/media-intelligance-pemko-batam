(()=>{
'use strict';
const LOGOUT_KEY='mi.loggedOut';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const forceLogin=()=>new URLSearchParams(location.search).get('auth')==='login';
const originalFetch=window.fetch.bind(window);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let refreshPromise=null;
let redirecting=false;

function loginUrl(){const u=new URL(location.href);u.searchParams.set('auth','login');return u.pathname+u.search+u.hash}
function goLogin(reason='SESSION_EXPIRED'){
  if(redirecting||forceLogin())return;
  redirecting=true;
  try{sessionStorage.setItem('mi.authReason',reason)}catch{}
  location.replace(loginUrl());
}
function ensureForcedLogin(){
  if(localStorage.getItem(LOGOUT_KEY)!=='1'||forceLogin())return;
  goLogin('LOGGED_OUT');
}
function requestUrl(input){try{return new URL(typeof input==='string'?input:input?.url||'',location.origin)}catch{return null}}
function isApi(url){return !!url&&(url.origin===location.origin||url.pathname.startsWith('/api/'))&&url.pathname.includes('/api/')}
function excluded(url){return /\/api\/auth\/(?:login|refresh|logout)(?:\/|$)/.test(url?.pathname||'')}
async function refreshAccess(){
  if(refreshPromise)return refreshPromise;
  refreshPromise=(async()=>{
    try{
      const r=await originalFetch(API+'/auth/refresh',{method:'POST',credentials:'include',cache:'no-store',headers:{'Cache-Control':'no-cache'}});
      return r.ok;
    }catch{return false}
  })();
  refreshPromise.finally(()=>setTimeout(()=>{refreshPromise=null},1500));
  return refreshPromise;
}

window.fetch=async function(input,init={}){
  const url=requestUrl(input);
  let response=await originalFetch(input,init);
  if(response.status!==401||!isApi(url)||excluded(url)||forceLogin())return response;

  const refreshed=await refreshAccess();
  if(!refreshed)return response;

  for(const delay of [80,180,350]){
    await sleep(delay);
    try{
      response=await originalFetch(input,init);
      if(response.status!==401)return response;
    }catch{}
  }
  return response;
};

window.MEDIA_AUTH_REFRESH=refreshAccess;

async function sessionCheck(){
  // Never run a background session probe while auth-ui is still bootstrapping.
  // On mobile, focus/visibility events fire during page reload and previously raced
  // the initial /me request, causing a false redirect to ?auth=login.
  if(forceLogin()||redirecting||document.body?.dataset?.auth!=='ok')return;
  try{
    const r=await window.fetch(API+'/me',{credentials:'include',cache:'no-store',headers:{'Cache-Control':'no-cache'}});
    if(r.ok){localStorage.removeItem(LOGOUT_KEY);return}
    if(r.status===401)goLogin('SESSION_EXPIRED');
  }catch{}
}

ensureForcedLogin();
document.addEventListener('submit',e=>{
  if(e.target?.id!=='loginForm')return;
  localStorage.removeItem(LOGOUT_KEY);
},true);
document.addEventListener('click',e=>{
  const b=e.target.closest?.('#logoutNavBtn,[data-action="logout"]');
  if(!b)return;
  localStorage.setItem(LOGOUT_KEY,'1');
},true);
window.addEventListener('media:authenticated',()=>localStorage.removeItem(LOGOUT_KEY));
window.addEventListener('focus',()=>setTimeout(sessionCheck,350));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(sessionCheck,350)});
// Avoid permanent /api/me polling on every open browser tab. Session validity is
// still checked on focus/visibility and API 401 responses trigger refresh.


// Idle auto-logout: 15 minutes without user activity, with a 60-second warning.
const IDLE_LIMIT_MS=15*60*1000;
const IDLE_WARNING_MS=60*1000;
const ACTIVITY_KEY='mi.lastActivityAt';
let idleStarted=false;
let lastActivityAt=Date.now();
let lastActivityWrite=0;
let idleWarning=null;
let idleCheckTimer=null;
let autoLogoutRunning=false;

function authenticated(){return document.body?.dataset?.auth==='ok'&&!forceLogin()&&!redirecting}
function closeIdleWarning(){idleWarning?.remove();idleWarning=null}
function resetIdleActivity(write=true){
  if(!authenticated()||autoLogoutRunning)return;
  lastActivityAt=Date.now();
  closeIdleWarning();
  if(write&&lastActivityAt-lastActivityWrite>4000){
    lastActivityWrite=lastActivityAt;
    try{localStorage.setItem(ACTIVITY_KEY,String(lastActivityAt))}catch{}
  }
}
function showIdleWarning(){
  if(idleWarning||autoLogoutRunning||!authenticated())return;
  const overlay=document.createElement('div');
  overlay.id='miIdleLogoutWarning';
  overlay.setAttribute('role','alertdialog');
  overlay.setAttribute('aria-modal','true');
  overlay.style.cssText='position:fixed;inset:0;z-index:100001;background:rgba(2,6,23,.82);display:grid;place-items:center;padding:20px;font-family:Inter,ui-sans-serif,system-ui,sans-serif';
  const card=document.createElement('div');
  card.style.cssText='width:min(440px,100%);box-sizing:border-box;background:#0f172a;color:#f8fafc;border:1px solid #475569;border-radius:18px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.55)';
  card.innerHTML='<div style="font-size:11px;letter-spacing:.16em;font-weight:900;color:#22d3ee">KEAMANAN SESI</div><h2 style="font-size:21px;font-weight:850;margin:8px 0">Anda masih di sini?</h2><p style="font-size:14px;line-height:1.6;color:#cbd5e1;margin:0 0 18px">Sesi akan berakhir karena tidak ada aktivitas. Pilih “Tetap masuk” untuk melanjutkan.</p><div id="miIdleCountdown" style="font-size:13px;color:#fbbf24;margin-bottom:18px">Logout dalam 60 detik.</div><div style="display:flex;gap:10px;flex-wrap:wrap"><button id="miIdleStay" type="button" style="flex:1;min-width:140px;padding:12px;border:0;border-radius:10px;background:#0891b2;color:white;font-weight:800;cursor:pointer">Tetap masuk</button><button id="miIdleExit" type="button" style="padding:12px 16px;border:1px solid #475569;border-radius:10px;background:#1e293b;color:#e2e8f0;font-weight:700;cursor:pointer">Keluar</button></div>';
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  idleWarning=overlay;
  card.querySelector('#miIdleStay').addEventListener('click',()=>resetIdleActivity(true));
  card.querySelector('#miIdleExit').addEventListener('click',()=>performIdleLogout());
}
async function performIdleLogout(){
  if(autoLogoutRunning)return;
  autoLogoutRunning=true;
  closeIdleWarning();
  try{localStorage.setItem(LOGOUT_KEY,'1')}catch{}
  try{sessionStorage.setItem('mi.authReason','IDLE_TIMEOUT')}catch{}
  try{await originalFetch(API+'/auth/logout',{method:'POST',credentials:'include',cache:'no-store',headers:{'Cache-Control':'no-cache'}})}catch{}
  if(!forceLogin())location.replace(loginUrl());
}
function startIdleLogout(){
  if(idleStarted||!authenticated())return;
  idleStarted=true;
  lastActivityAt=Date.now();
  try{localStorage.setItem(ACTIVITY_KEY,String(lastActivityAt))}catch{}
  const activity=()=>resetIdleActivity(true);
  ['pointerdown','keydown','touchstart','click','input','scroll'].forEach(type=>document.addEventListener(type,activity,{passive:true,capture:true}));
  window.addEventListener('storage',event=>{
    if(event.key===LOGOUT_KEY&&event.newValue==='1'){goLogin('LOGGED_OUT');return}
    if(event.key!==ACTIVITY_KEY||!event.newValue)return;
    const value=Number(event.newValue);
    if(Number.isFinite(value)&&value>lastActivityAt){
      lastActivityAt=value;
      closeIdleWarning();
    }
  });
  idleCheckTimer=setInterval(()=>{
    if(!authenticated()||autoLogoutRunning)return;
    const idleFor=Date.now()-lastActivityAt;
    if(idleFor>=IDLE_LIMIT_MS){performIdleLogout();return}
    if(idleFor>=IDLE_LIMIT_MS-IDLE_WARNING_MS){
      showIdleWarning();
      const label=idleWarning?.querySelector('#miIdleCountdown');
      if(label)label.textContent='Logout dalam '+Math.max(1,Math.ceil((IDLE_LIMIT_MS-idleFor)/1000))+' detik.';
    }else closeIdleWarning();
  },1000);
}
window.addEventListener('media:authenticated',startIdleLogout);
if(authenticated())startIdleLogout();
else{
  const authObserver=new MutationObserver(()=>{
    if(authenticated()){startIdleLogout();authObserver.disconnect()}
  });
  if(document.body)authObserver.observe(document.body,{attributes:true,attributeFilter:['data-auth']});
}

})();
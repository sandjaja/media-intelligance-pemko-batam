(()=>{
'use strict';
const LOGOUT_KEY='mi.loggedOut';
const MODE_KEY='mi.sessionMode';
const ACTIVE_KEY='mi.sessionActive';
const PENDING_KEY='mi.pendingRemember';
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const forceLogin=()=>new URLSearchParams(location.search).get('auth')==='login';
const originalFetch=window.fetch.bind(window);
let refreshPromise=null;
let redirecting=false;

function loginUrl(){const u=new URL(location.href);u.searchParams.set('auth','login');return u.pathname+u.search+u.hash}
function goLogin(reason='SESSION_EXPIRED'){
  if(redirecting||forceLogin())return;
  redirecting=true;
  try{sessionStorage.setItem('mi.authReason',reason)}catch{}
  location.replace(loginUrl());
}
function clearLocalSessionState(){
  try{sessionStorage.removeItem(ACTIVE_KEY);sessionStorage.removeItem(PENDING_KEY)}catch{}
}
function ensureForcedLogin(){
  if(localStorage.getItem(LOGOUT_KEY)!=='1'||forceLogin())return;
  goLogin('LOGGED_OUT');
}
function finalizePendingLogin(){
  let pending=null;
  try{pending=sessionStorage.getItem(PENDING_KEY)}catch{}
  if(pending!=='remember'&&pending!=='session')return false;
  localStorage.setItem(MODE_KEY,pending);
  if(pending==='session')sessionStorage.setItem(ACTIVE_KEY,'1');
  else sessionStorage.removeItem(ACTIVE_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  return true;
}
async function expireSessionOnly(){
  if(redirecting)return;
  localStorage.setItem(LOGOUT_KEY,'1');
  localStorage.removeItem(MODE_KEY);
  clearLocalSessionState();
  try{await originalFetch(API+'/auth/logout',{method:'POST',credentials:'include',cache:'no-store',keepalive:true})}catch{}
  goLogin('SESSION_CLOSED');
}
function enforceRememberPolicy(){
  if(forceLogin())return;
  const pending=sessionStorage.getItem(PENDING_KEY);
  if(pending==='remember'||pending==='session')return;
  const mode=localStorage.getItem(MODE_KEY);
  if(mode==='session'&&sessionStorage.getItem(ACTIVE_KEY)!=='1')expireSessionOnly();
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
    finally{setTimeout(()=>{refreshPromise=null},0)}
  })();
  return refreshPromise;
}

window.fetch=async function(input,init={}){
  const url=requestUrl(input);
  const response=await originalFetch(input,init);
  if(response.status!==401||!isApi(url)||excluded(url)||forceLogin())return response;
  const refreshed=await refreshAccess();
  if(refreshed){
    try{return await originalFetch(input,init)}catch{return response}
  }
  goLogin('SESSION_EXPIRED');
  return response;
};

async function sessionCheck(){
  if(forceLogin()||document.body?.dataset?.auth==='required')return;
  try{
    const r=await window.fetch(API+'/me',{credentials:'include',cache:'no-store',headers:{'Cache-Control':'no-cache'}});
    if(r.status===401)goLogin('SESSION_EXPIRED');
  }catch{}
}

ensureForcedLogin();
enforceRememberPolicy();
document.addEventListener('submit',e=>{
  if(e.target?.id!=='loginForm')return;
  localStorage.removeItem(LOGOUT_KEY);
  const remember=!!e.target.querySelector?.('#rememberLogin')?.checked;
  try{sessionStorage.setItem(PENDING_KEY,remember?'remember':'session')}catch{}
},true);
document.addEventListener('click',e=>{
  const b=e.target.closest?.('#logoutNavBtn,[data-action="logout"]');
  if(!b)return;
  localStorage.setItem(LOGOUT_KEY,'1');
  localStorage.removeItem(MODE_KEY);
  clearLocalSessionState();
},true);
window.addEventListener('media:authenticated',()=>{
  if(!finalizePendingLogin()&&localStorage.getItem(MODE_KEY)==='session')sessionStorage.setItem(ACTIVE_KEY,'1');
});
window.addEventListener('focus',()=>setTimeout(sessionCheck,250));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(sessionCheck,250)});
setInterval(sessionCheck,60000);
})();

(()=>{
'use strict';
const LOGOUT_KEY='mi.loggedOut';
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
    finally{setTimeout(()=>{refreshPromise=null},250)}
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
  return response;
};

async function sessionCheck(){
  if(forceLogin()||document.body?.dataset?.auth==='required'||redirecting)return;
  try{
    const r=await window.fetch(API+'/me',{credentials:'include',cache:'no-store',headers:{'Cache-Control':'no-cache'}});
    if(r.ok){localStorage.removeItem(LOGOUT_KEY);return}
    if(r.status===401)goLogin('SESSION_EXPIRED');
  }catch{}
}

// IMPORTANT: a normal browser refresh must never be treated as a logout.
// Session validity is determined by the server-side refresh cookie, not sessionStorage.
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
setInterval(sessionCheck,60000);
})();
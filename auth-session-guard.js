(()=>{
'use strict';
const KEY='mi.loggedOut';
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
  if(localStorage.getItem(KEY)!=='1'||forceLogin())return;
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
document.addEventListener('click',e=>{
  const b=e.target.closest?.('#logoutNavBtn,[data-action="logout"]');
  if(!b)return;
  localStorage.setItem(KEY,'1');
},true);
document.addEventListener('submit',e=>{
  if(e.target?.id!=='loginForm')return;
  localStorage.removeItem(KEY);
},true);
window.addEventListener('focus',()=>setTimeout(sessionCheck,250));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(sessionCheck,250)});
setInterval(sessionCheck,60000);
})();

(()=>{
const KEY='mi.loggedOut';
const forceLogin=()=>new URLSearchParams(location.search).get('auth')==='login';
function ensureForcedLogin(){
  if(localStorage.getItem(KEY)!=='1')return;
  if(forceLogin())return;
  const url=new URL(location.href);
  url.searchParams.set('auth','login');
  location.replace(url.pathname+url.search+url.hash);
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
})();

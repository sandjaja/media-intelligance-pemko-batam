(()=>{'use strict';
const KEY='mi.colorTheme';
function readTheme(){try{return localStorage.getItem(KEY)==='dark'?'dark':'light'}catch{return'light'}}
function applyTheme(theme){const dark=theme==='dark';document.documentElement.classList.toggle('dark',dark);document.documentElement.dataset.theme=theme;document.body?.setAttribute('data-theme',theme);const b=document.getElementById('themeToggleBtn');if(b){b.innerHTML=dark?'<i class="fa-solid fa-sun"></i> <span>Light Mode</span>':'<i class="fa-solid fa-moon"></i> <span>Dark Mode</span>';b.setAttribute('aria-label',dark?'Aktifkan Light Mode':'Aktifkan Dark Mode');b.title=dark?'Beralih ke Light Mode':'Beralih ke Dark Mode'}try{localStorage.setItem(KEY,theme)}catch{}}
const css=document.createElement('style');css.id='miThemeStyles';css.textContent=`
html:not(.dark),html:not(.dark) body{background:#f3f6fb!important;color:#172033!important;color-scheme:light}
html:not(.dark) header.glass,html:not(.dark) .glass{background:rgba(255,255,255,.94)!important;border-color:#d9e1ec!important;color:#172033!important;box-shadow:0 4px 16px rgba(15,23,42,.045)}
html:not(.dark) nav{background:rgba(255,255,255,.97)!important;border-color:#d9e1ec!important}
html:not(.dark) main{color:#172033}
html:not(.dark) [class*="bg-slate-950"],html:not(.dark) [class*="bg-slate-900"],html:not(.dark) [class*="bg-slate-800"]{background-color:#fff!important}
html:not(.dark) [class*="bg-slate-700"]{background-color:#edf2f8!important}
html:not(.dark) [class*="border-slate-800"],html:not(.dark) [class*="border-slate-700"],html:not(.dark) [class*="border-slate-600"]{border-color:#d5deea!important}
html:not(.dark) [class*="text-slate-100"],html:not(.dark) [class*="text-slate-200"],html:not(.dark) [class*="text-slate-300"]{color:#253247!important}
html:not(.dark) [class*="text-slate-400"],html:not(.dark) [class*="text-slate-500"]{color:#59677b!important}
html:not(.dark) .text-white{color:#172033!important}
html:not(.dark) .tab{color:#526176!important}
html:not(.dark) .tab:hover{color:#0f172a!important;background:#e8eef6!important}
html:not(.dark) .tab.active,html:not(.dark) .active{background:#0891b2!important;color:#fff!important;border-color:#0891b2!important}
html:not(.dark) input:not([type="checkbox"]):not([type="radio"]),html:not(.dark) textarea,html:not(.dark) select{background:#fff!important;color:#172033!important;border-color:#cbd5e1!important;color-scheme:light}
html:not(.dark) select option{background:#fff!important;color:#172033!important}
html:not(.dark) input::placeholder,html:not(.dark) textarea::placeholder{color:#77849a!important}
html:not(.dark) table{color:#253247}
html:not(.dark) [class*="hover:bg-slate-"]:hover{background-color:#e8eef6!important}
html:not(.dark) .bg-cyan-950,html:not(.dark) [class*="bg-cyan-950"]{background-color:#ecfeff!important}
html:not(.dark) [style*="background:#020617"],html:not(.dark) [style*="background: #020617"],html:not(.dark) [style*="background:#0f172a"],html:not(.dark) [style*="background: #0f172a"]{background:#fff!important}
html:not(.dark) [style*="color:#f8fafc"],html:not(.dark) [style*="color: #f8fafc"],html:not(.dark) [style*="color:#e2e8f0"]{color:#172033!important}
html:not(.dark) #authSessionChecking{background:#f3f6fb!important;color:#253247!important}
@media print{html:not(.dark),html:not(.dark) body{background:#fff!important;color:#111827!important}}
`;document.head.appendChild(css);
function addButton(){if(document.getElementById('themeToggleBtn'))return;const host=document.getElementById('headerActions');if(!host)return;const b=document.createElement('button');b.id='themeToggleBtn';b.type='button';b.className='px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-xs font-black';b.style.cssText='display:inline-flex;align-items:center;gap:7px;white-space:nowrap';b.onclick=()=>applyTheme(readTheme()==='dark'?'light':'dark');host.prepend(b);applyTheme(readTheme())}
applyTheme(readTheme());window.addEventListener('media:authenticated',addButton);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addButton,{once:true});else addButton();
const observer=new MutationObserver(()=>{if(document.body?.dataset.auth==='ok')addButton()});observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-auth']});
})();
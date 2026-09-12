(()=>{
  const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>v?new Date(v).toLocaleString('id-ID'):'-';
  const statusLabel={NEW:'Baru',ASSIGNED:'Ditugaskan',IN_PROGRESS:'Dikerjakan',SUBMITTED:'Menunggu Review',REVISION_REQUIRED:'Perlu Revisi',APPROVED:'Disetujui',PUBLISHED:'Dipublikasikan',MONITORING:'Monitoring',CLOSED:'Selesai'};
  const statusClass={NEW:'bg-slate-700 text-slate-200',ASSIGNED:'bg-sky-500/15 text-sky-300',IN_PROGRESS:'bg-amber-500/15 text-amber-300',SUBMITTED:'bg-violet-500/15 text-violet-300',REVISION_REQUIRED:'bg-rose-500/15 text-rose-300',APPROVED:'bg-emerald-500/15 text-emerald-300',PUBLISHED:'bg-cyan-500/15 text-cyan-300',MONITORING:'bg-blue-500/15 text-blue-300',CLOSED:'bg-slate-700 text-slate-400'};
  let currentUser=null,issues=[],opds=[],selectedIssueId=null,detail=null,events=[];

  async function api(path,options={}){
    const hasBody=options.body!==undefined;
    const r=await fetch(API+path,{credentials:'include',cache:'no-store',headers:{...(hasBody?{'Content-Type':'application/json'}:{}),...(options.headers||{})},...options});
    const data=await r.json().catch(()=>({}));
    if(!r.ok){const e=new Error(data.message||data.error||`HTTP ${r.status}`);e.code=data.error;e.status=r.status;throw e}return data;
  }
  const toast=(m,ok=true)=>{if(window.toast)return window.toast(m);const t=document.getElementById('toast');if(!t)return;t.textContent=m;t.classList.remove('hidden');t.classList.toggle('text-rose-300',!ok);setTimeout(()=>t.classList.add('hidden'),3500)};
  const roles=()=>new Set(currentUser?.roles||[]);
  const isHumas=()=>roles().has('super_admin')||roles().has('humas');
  const isOpd=()=>roles().has('opd');

  function ensureSection(){
    if(document.getElementById('phase3'))return;
    const main=document.querySelector('main');if(!main)return;
    const s=document.createElement('section');s.id='phase3';s.className='hidden space-y-5';main.appendChild(s);
  }
  function ensureTab(){
    const tabs=document.getElementById('tabs');if(!tabs||tabs.querySelector('[data-tab="phase3"]'))return;
    const b=document.createElement('button');b.dataset.tab='phase3';b.className='tab px-3 py-2 rounded-lg border border-transparent text-xs text-slate-400 hover:text-white';b.innerHTML='<i class="fa-solid fa-list-check mr-2"></i>Penanganan Isu';b.onclick=()=>window.showTab?.('phase3');
    const before=tabs.querySelector('[data-tab="sources"]');before?tabs.insertBefore(b,before):tabs.appendChild(b);
  }
  function activateTab(){document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));document.querySelector('[data-tab="phase3"]')?.classList.add('active');}

  const badge=s=>`<span class="px-2 py-1 rounded-full text-[10px] font-black ${statusClass[s]||statusClass.NEW}">${esc(statusLabel[s]||s)}</span>`;
  function roleCaption(){if(isHumas())return 'Workspace Humas / Super Admin · assignment, review, approval';if(isOpd())return 'Workspace OPD · terima tugas, kerjakan, dan submit respons';return 'Mode baca · monitoring workflow penanganan isu';}

  function renderShell(){
    const root=document.getElementById('phase3');if(!root)return;
    const counts=Object.fromEntries(['NEW','ASSIGNED','IN_PROGRESS','SUBMITTED','REVISION_REQUIRED','APPROVED'].map(s=>[s,issues.filter(x=>x.workflow_status===s).length]));
    root.innerHTML=`
      <div class="glass rounded-2xl p-5">
        <div class="flex flex-wrap justify-between gap-3 items-start"><div><div class="text-[10px] font-black tracking-[.2em] text-cyan-400">PHASE 3 · ISSUE RESPONSE WORKFLOW</div><h2 class="text-xl font-black mt-1">Penanganan Isu & Respons OPD</h2><p class="text-xs text-slate-400 mt-1">${esc(roleCaption())}</p></div><button id="p3Refresh" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold"><i class="fa-solid fa-rotate mr-1"></i>Refresh</button></div>
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-5">
          ${[['NEW','Baru'],['ASSIGNED','Ditugaskan'],['IN_PROGRESS','Dikerjakan'],['SUBMITTED','Menunggu Review'],['REVISION_REQUIRED','Perlu Revisi'],['APPROVED','Disetujui']].map(([s,l])=>`<div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3"><div class="text-[10px] text-slate-500">${l}</div><div class="text-2xl font-black mt-1">${counts[s]||0}</div></div>`).join('')}
        </div>
      </div>
      <div class="grid xl:grid-cols-[420px_1fr] gap-5">
        <div class="glass rounded-2xl p-4"><div class="flex items-center justify-between mb-3"><h3 class="font-black">Daftar Isu</h3><span class="text-[10px] text-slate-500">${issues.length} isu</span></div><div id="p3IssueList" class="space-y-2 max-h-[70vh] overflow-y-auto pr-1"></div></div>
        <div id="p3Detail" class="glass rounded-2xl p-5 min-h-[420px]"><div class="h-full grid place-items-center text-sm text-slate-500">Pilih isu untuk melihat workflow.</div></div>
      </div>`;
    document.getElementById('p3Refresh').onclick=()=>load(true);
    renderList();
  }

  function renderList(){
    const box=document.getElementById('p3IssueList');if(!box)return;
    box.innerHTML=issues.map(x=>`<button data-p3-issue="${x.issue_id}" class="w-full text-left rounded-xl border ${String(selectedIssueId)===String(x.issue_id)?'border-cyan-500 bg-cyan-500/5':'border-slate-800 bg-slate-950/60'} p-3 hover:border-slate-600"><div class="flex justify-between gap-2 items-start">${badge(x.workflow_status)}<span class="text-[10px] text-slate-500">${esc(x.risk_level||x.momentum||'')}</span></div><div class="font-bold text-sm mt-2 leading-snug">${esc(x.title)}</div><div class="text-[11px] text-slate-500 mt-2"><i class="fa-solid fa-building mr-1"></i>${esc(x.lead_opd_name||'Belum ditugaskan')}</div>${x.due_at?`<div class="text-[10px] text-amber-300 mt-1">Deadline ${fmt(x.due_at)}</div>`:''}</button>`).join('')||'<div class="text-center text-sm text-slate-500 py-10">Belum ada workflow isu.</div>';
    box.querySelectorAll('[data-p3-issue]').forEach(b=>b.onclick=()=>selectIssue(b.dataset.p3Issue));
  }

  function opdOptions(selected){return opds.map(o=>`<option value="${o.id}" ${String(o.id)===String(selected)?'selected':''}>${esc(o.name)}</option>`).join('')}
  function assignmentPanel(d){if(!isHumas()||!['NEW','ASSIGNED'].includes(d.workflow_status))return'';const supportIds=new Set((d.supportingOpds||[]).map(x=>String(x.id)));return `<div class="border border-slate-800 rounded-xl p-4 mt-4"><h4 class="font-black text-sm">Penugasan OPD</h4><div class="grid md:grid-cols-2 gap-3 mt-3"><label class="text-xs text-slate-400">Lead OPD<select id="p3Lead" class="mt-1 w-full rounded-lg px-3 py-2 bg-slate-950 border border-slate-700"><option value="">Pilih Lead OPD</option>${opdOptions(d.lead_opd_id)}</select></label><label class="text-xs text-slate-400">Deadline<input id="p3Due" type="datetime-local" class="mt-1 w-full rounded-lg px-3 py-2 bg-slate-950 border border-slate-700" value="${d.due_at?new Date(new Date(d.due_at).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):''}"></label></div><label class="block text-xs text-slate-400 mt-3">Supporting OPD<select id="p3Support" multiple size="5" class="mt-1 w-full rounded-lg px-3 py-2 bg-slate-950 border border-slate-700">${opds.map(o=>`<option value="${o.id}" ${supportIds.has(String(o.id))?'selected':''}>${esc(o.name)}</option>`).join('')}</select><span class="text-[10px] text-slate-500">Ctrl/Cmd untuk memilih lebih dari satu OPD.</span></label><button id="p3Assign" class="mt-3 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-black text-xs">${d.workflow_status==='ASSIGNED'?'Perbarui Penugasan':'Tetapkan Penugasan'}</button></div>`}
  function submissionPanel(d){
    if(!isOpd()||String(currentUser.opdId)!==String(d.lead_opd_id))return'';
    if(d.workflow_status==='ASSIGNED'||d.workflow_status==='REVISION_REQUIRED')return `<div class="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4 mt-4"><h4 class="font-black text-sm">${d.workflow_status==='REVISION_REQUIRED'?'Revisi Diperlukan':'Tugas Siap Dikerjakan'}</h4>${d.workflow_status==='REVISION_REQUIRED'&&d.submissions?.[0]?.review_reason?`<p class="text-xs text-rose-300 mt-2">Catatan Humas: ${esc(d.submissions[0].review_reason)}</p>`:''}<button id="p3Start" class="mt-3 px-4 py-2 rounded-lg bg-amber-400 text-slate-950 font-black text-xs">${d.workflow_status==='REVISION_REQUIRED'?'Mulai Revisi':'Mulai Kerjakan'}</button></div>`;
    if(d.workflow_status!=='IN_PROGRESS')return'';
    return `<div class="border border-slate-800 rounded-xl p-4 mt-4"><h4 class="font-black text-sm">Susun Respons OPD</h4><label class="block text-xs text-slate-400 mt-3">Respons resmi<textarea id="p3Response" rows="5" class="mt-1 w-full rounded-lg p-3 bg-slate-950 border border-slate-700" placeholder="Jelaskan respons OPD terhadap isu...">${esc(d.submissions?.[0]?.status==='REVISION_REQUIRED'?d.submissions[0].response_text:'')}</textarea></label><label class="block text-xs text-slate-400 mt-3">Fakta / data pendukung<textarea id="p3Facts" rows="3" class="mt-1 w-full rounded-lg p-3 bg-slate-950 border border-slate-700">${esc(d.submissions?.[0]?.status==='REVISION_REQUIRED'?d.submissions[0].facts_data||'':'')}</textarea></label><label class="block text-xs text-slate-400 mt-3">Key message<textarea id="p3Key" rows="2" class="mt-1 w-full rounded-lg p-3 bg-slate-950 border border-slate-700">${esc(d.submissions?.[0]?.status==='REVISION_REQUIRED'?d.submissions[0].key_message||'':'')}</textarea></label><label class="block text-xs text-slate-400 mt-3">Supporting links <span class="text-slate-600">(satu URL per baris)</span><textarea id="p3Links" rows="2" class="mt-1 w-full rounded-lg p-3 bg-slate-950 border border-slate-700"></textarea></label><button id="p3Submit" class="mt-3 px-4 py-2 rounded-lg bg-emerald-400 text-slate-950 font-black text-xs">Kirim ke Humas</button></div>`;
  }
  function reviewPanel(d){if(!isHumas()||d.workflow_status!=='SUBMITTED')return'';const s=d.submissions?.find(x=>x.status==='SUBMITTED')||d.submissions?.[0];if(!s)return'';return `<div class="border border-violet-500/20 bg-violet-500/5 rounded-xl p-4 mt-4"><div class="flex justify-between gap-2"><h4 class="font-black text-sm">Review Respons OPD</h4><span class="text-[10px] text-violet-300">Versi ${esc(s.version)}</span></div><div class="mt-3 space-y-3 text-xs"><div><div class="text-slate-500">Respons</div><div class="mt-1 whitespace-pre-wrap">${esc(s.response_text)}</div></div>${s.facts_data?`<div><div class="text-slate-500">Fakta / Data</div><div class="mt-1 whitespace-pre-wrap">${esc(s.facts_data)}</div></div>`:''}${s.key_message?`<div><div class="text-slate-500">Key Message</div><div class="mt-1 whitespace-pre-wrap">${esc(s.key_message)}</div></div>`:''}</div><div class="flex flex-wrap gap-2 mt-4"><button id="p3Approve" class="px-4 py-2 rounded-lg bg-emerald-400 text-slate-950 font-black text-xs">Setujui Respons</button><button id="p3Revision" class="px-4 py-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 font-black text-xs">Minta Revisi</button></div></div>`}

  function renderDetail(){
    const box=document.getElementById('p3Detail');if(!box||!detail)return;
    const d=detail;
    box.innerHTML=`<div class="flex flex-wrap justify-between gap-3"><div class="min-w-0"><div class="flex items-center gap-2">${badge(d.workflow_status)}<span class="text-[10px] text-slate-500">Issue #${esc(d.issue_id)}</span></div><h3 class="text-xl font-black mt-2">${esc(d.title)}</h3><p class="text-xs text-slate-400 mt-2 whitespace-pre-wrap">${esc(d.description||'Belum ada deskripsi isu.')}</p></div></div><div class="grid md:grid-cols-3 gap-3 mt-4"><div class="bg-slate-950/70 rounded-xl p-3"><div class="text-[10px] text-slate-500">Lead OPD</div><div class="text-sm font-bold mt-1">${esc(d.lead_opd_name||'Belum ditetapkan')}</div></div><div class="bg-slate-950/70 rounded-xl p-3"><div class="text-[10px] text-slate-500">Deadline</div><div class="text-sm font-bold mt-1">${fmt(d.due_at)}</div></div><div class="bg-slate-950/70 rounded-xl p-3"><div class="text-[10px] text-slate-500">Supporting OPD</div><div class="text-sm font-bold mt-1">${(d.supportingOpds||[]).map(x=>esc(x.name)).join(', ')||'-'}</div></div></div>${assignmentPanel(d)}${submissionPanel(d)}${reviewPanel(d)}<div class="border-t border-slate-800 mt-5 pt-4"><h4 class="font-black text-sm">Riwayat Workflow</h4><div class="mt-3 space-y-2">${events.map(e=>`<div class="bg-slate-950/60 rounded-lg p-3 text-xs"><div class="flex justify-between gap-2"><b>${esc(e.event_type.replaceAll('_',' '))}</b><span class="text-slate-500">${fmt(e.created_at)}</span></div><div class="text-slate-500 mt-1">${esc(e.actor_email||e.actor_role||'Sistem')}${e.note?` · ${esc(e.note)}`:''}</div></div>`).join('')||'<div class="text-xs text-slate-500">Belum ada aktivitas.</div>'}</div></div>`;
    bindDetailActions();
  }

  function bindDetailActions(){
    const d=detail;if(!d)return;
    const assign=document.getElementById('p3Assign');if(assign)assign.onclick=async()=>{const lead=Number(document.getElementById('p3Lead').value);if(!lead)return toast('Pilih Lead OPD.',false);const supporting=[...document.getElementById('p3Support').selectedOptions].map(o=>Number(o.value)).filter(x=>x!==lead);const due=document.getElementById('p3Due').value;assign.disabled=true;try{await api(`/phase3/issues/${d.issue_id}/assign`,{method:'POST',body:JSON.stringify({leadOpdId:lead,supportingOpdIds:supporting,dueAt:due?new Date(due).toISOString():null})});toast('Penugasan OPD berhasil disimpan.');await load(true,d.issue_id)}catch(e){toast(e.message,false)}finally{assign.disabled=false}};
    const start=document.getElementById('p3Start');if(start)start.onclick=async()=>{start.disabled=true;try{await api(`/phase3/issues/${d.issue_id}/start`,{method:'POST'});toast('Pekerjaan dimulai.');await load(true,d.issue_id)}catch(e){toast(e.message,false)}finally{start.disabled=false}};
    const submit=document.getElementById('p3Submit');if(submit)submit.onclick=async()=>{const responseText=document.getElementById('p3Response').value.trim();if(responseText.length<10)return toast('Respons minimal 10 karakter.',false);const links=document.getElementById('p3Links').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);submit.disabled=true;try{await api(`/phase3/issues/${d.issue_id}/submit`,{method:'POST',body:JSON.stringify({responseText,factsData:document.getElementById('p3Facts').value.trim()||null,keyMessage:document.getElementById('p3Key').value.trim()||null,supportingLinks:links})});toast('Respons berhasil dikirim ke Humas.');await load(true,d.issue_id)}catch(e){toast(e.message,false)}finally{submit.disabled=false}};
    const approve=document.getElementById('p3Approve');if(approve)approve.onclick=async()=>{if(!confirm('Setujui respons OPD ini?'))return;approve.disabled=true;try{await api(`/phase3/issues/${d.issue_id}/review`,{method:'POST',body:JSON.stringify({decision:'APPROVED',reason:null})});toast('Respons disetujui.');await load(true,d.issue_id)}catch(e){toast(e.message,false)}finally{approve.disabled=false}};
    const revision=document.getElementById('p3Revision');if(revision)revision.onclick=async()=>{const reason=prompt('Tuliskan alasan revisi untuk OPD:','');if(reason===null)return;if(!reason.trim())return toast('Alasan revisi wajib diisi.',false);revision.disabled=true;try{await api(`/phase3/issues/${d.issue_id}/review`,{method:'POST',body:JSON.stringify({decision:'REVISION_REQUIRED',reason:reason.trim()})});toast('Respons dikembalikan untuk revisi.');await load(true,d.issue_id)}catch(e){toast(e.message,false)}finally{revision.disabled=false}};
  }

  async function selectIssue(id){selectedIssueId=id;renderList();try{const [d,e]=await Promise.all([api(`/phase3/issues/${id}`),api(`/phase3/issues/${id}/events`)]);detail=d.data;events=e.data||[];renderDetail()}catch(err){toast(err.message,false)}}
  async function load(force=false,keepId=null){
    const root=document.getElementById('phase3');if(!root)return;
    if(!force&&issues.length){renderShell();if(selectedIssueId)await selectIssue(selectedIssueId);return}
    root.innerHTML='<div class="glass rounded-2xl p-8 text-center text-sm text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat workflow Phase 3...</div>';
    try{const [me,list,opd]=await Promise.all([api('/rbac/me'),api('/phase3/issues'),api('/opd')]);currentUser=me.user||{};issues=list.data||[];opds=opd.data||[];selectedIssueId=keepId||selectedIssueId;renderShell();if(selectedIssueId&&issues.some(x=>String(x.issue_id)===String(selectedIssueId)))await selectIssue(selectedIssueId)}catch(e){root.innerHTML=`<div class="glass rounded-2xl p-6 text-rose-300 text-sm">Gagal memuat Phase 3: ${esc(e.message)}</div>`}
  }

  ensureSection();ensureTab();
  const previousShowTab=window.showTab;
  window.showTab=(id)=>{if(id==='phase3'){document.querySelectorAll('main section').forEach(s=>s.classList.add('hidden'));document.getElementById('phase3')?.classList.remove('hidden');ensureTab();activateTab();load();window.dispatchEvent(new CustomEvent('media-intelligence-tab',{detail:id}));return;}return previousShowTab?.(id)};
  const tabs=document.getElementById('tabs');if(tabs)new MutationObserver(()=>{ensureTab();if(!document.getElementById('phase3')?.classList.contains('hidden'))activateTab()}).observe(tabs,{childList:true,subtree:true});
  window.renderPhase3Workspace=()=>load(true,selectedIssueId);
})();
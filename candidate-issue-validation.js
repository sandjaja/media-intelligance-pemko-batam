(()=>{
  function removeLegacy(){document.getElementById('candidateIssueValidation')?.remove();}
  window.renderCandidateIssueValidation=removeLegacy;
  window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='printarchive')removeLegacy();});
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-tab="printarchive"]'))setTimeout(removeLegacy,50)});
  removeLegacy();
})();

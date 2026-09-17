(()=>{
/**
 * Legacy Phase 2E recovery frontend shim.
 *
 * The normal Media Cetak analysis flow is now handled by
 * print-review-workflow.js -> POST /api/print/articles/:id/mark-analyzed
 * using the shared V16.5 engine.
 *
 * Keep this file as a no-op for backward-compatible script references.
 * Do NOT attach a click handler to #paProcessAnalysis here because doing
 * so would intercept the V16.5 workflow and call the legacy
 * /mark-analyzed-v2 recovery endpoint.
 */
window.PRINT_ANALYSIS_RECOVERY_LEGACY_DISABLED = true;
})();

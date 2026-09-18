// Story clusters are rendered natively by online-media-ui.js.
// This compatibility shim intentionally performs no DOM decoration so the legacy
// post-render cluster enhancer cannot duplicate, move, or hide publication cards.
(()=>{ window.ONLINE_NATIVE_STORY_CLUSTERS=true; })();

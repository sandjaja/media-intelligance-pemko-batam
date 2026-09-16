// Compatibility shim. Runtime callers still importing analyzer-v14 are routed to the
// strict Master PRIMARY implementation so there is only one active analysis path.
export { analyzeArticle, CLASSIFICATION_VERSION } from './analyzer-v15.js';

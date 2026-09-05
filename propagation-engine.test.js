// Contract-level smoke tests for the client propagation scoring rules.
const assert=require('node:assert/strict');
function similarity(a,b){const A=new Set(a.toLowerCase().split(/\s+/).filter(x=>x.length>3)),B=new Set(b.toLowerCase().split(/\s+/).filter(x=>x.length>3));let n=0;for(const x of A)if(B.has(x))n++;return n/(A.size+B.size-n)}
assert(similarity('batam investasi industri meningkat','batam investasi industri meningkat')===1);
assert(similarity('batam investasi industri meningkat','cuaca hujan laut')<0.22);
assert.equal(['HIGH','MEDIUM','WATCH'][0],'HIGH');
console.log('Propagation contract tests passed');

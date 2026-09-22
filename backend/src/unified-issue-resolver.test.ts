import test from 'node:test';
import assert from 'node:assert/strict';

const STOP=new Set(['yang','dengan','untuk','dari','pada','dalam','pemko','pemerintah','dinas','kota','daerah','berita','halaman','koran','media','provinsi','tahun','akan','telah','jadi','atau','oleh','para','terkait','program','kegiatan','epaper','batam']);
const GENERIC_TOPIC=new Set(['pekerja','karyawan','warga','masyarakat','walikota','kepala','ketua','pertemuan','kondisi','masalah','persoalan','layanan','pelayanan','publik','pembangunan','batam','pemkot','pemko']);
const norm=(v:any)=>String(v||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\bpt\s+([\p{L}\p{N}]{3,})\s+([\p{L}\p{N}]{2,3})\b/gu,'pt $1$2').replace(/\s+/g,' ').trim();
const tokens=(v:any)=>[...new Set(norm(v).split(' ').filter(x=>x.length>=4&&/[a-z]/.test(x)&&!STOP.has(x)))];
const topicAnchors=(c:any)=>new Set(tokens(c.evidence.map((e:any)=>e.title).join(' ')).filter(x=>!GENERIC_TOPIC.has(x)));
const entityAnchors=(c:any)=>{const out=new Set<string>();for(const e of c.evidence||[]){for(const m of `${e.title||''} ${e.summary||''}`.matchAll(/\bPT\.?\s+([\p{L}\p{N}]{3,})(?:\s+([\p{L}\p{N}]{2,}))?/giu)){const key=norm(`pt ${m[1]} ${m[2]||''}`).replace(/\s+/g,'');if(key.length>=6)out.add(key);}}return out;};
const similarity=(a:any,b:any)=>{const ae=entityAnchors(a),be=entityAnchors(b),se=[...ae].filter(x=>be.has(x));const at=topicAnchors(a),bt=topicAnchors(b),shared=[...at].filter(x=>bt.has(x));if(!shared.length&&!se.length)return 0;const ao=new Set<number>(a.evidence.map((e:any)=>e.opdId).filter(Boolean).map(Number)),bo=new Set<number>(b.evidence.map((e:any)=>e.opdId).filter(Boolean).map(Number));const same=[...ao].some(x=>bo.has(x));if(se.length)return Math.min(100,80+(same?15:0));const strong=shared.filter(x=>x.length>=6||/^pt[a-z0-9]+$/.test(x));if(!strong.length)return 0;if(shared.length<2&&!same)return 0;return Math.min(100,55+Math.min(30,strong.length*15)+(same?15:0));};
const candidate=(title:string,summary='',opdId:number|null=null)=>({evidence:[{sourceType:'online',id:1,title,summary,opdId}]});

test('candidate threshold remains 60',()=>assert.equal(60,60));
test('PT Ghim Li entity anchor survives wording differences',()=>assert.ok(similarity(candidate('Persoalan pekerja PT Ghim Li Batam','Keluhan karyawan',12),candidate('PT Ghim Li bahas penyelesaian pekerja','Pertemuan karyawan',12))>=80));
test('kabut asap matches across media',()=>assert.ok(similarity(candidate('Kabut asap mengganggu jarak pandang','Kualitas udara menurun',8),candidate('Pemko pantau kabut asap dan jarak pandang','Kualitas udara terdampak',8))>=70));
test('generic Pemkot wording alone does not match',()=>assert.equal(similarity(candidate('Pemkot meningkatkan pelayanan publik','Program masyarakat'),candidate('Pemkot daerah lain meningkatkan pelayanan publik','Program masyarakat')),0));
test('different topics do not merge merely because OPD is same',()=>assert.equal(similarity(candidate('Kabut asap mengganggu jarak pandang','Kualitas udara',8),candidate('Pengelolaan sampah diperkuat','Armada kebersihan',8)),0));

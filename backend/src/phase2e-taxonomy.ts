type TaxonomyMapping = {
  keyword_id?: number | string;
  keyword?: string;
  priority?: number | string;
  taxonomy_code?: string;
  taxonomy_name?: string;
  weight?: number | string;
};

type OperatorMatch = { keyword?: string };

type CategoryRule={name:string;terms:string[];generic?:string[]};

const FALLBACK_RULES:CategoryRule[]=[
  {name:'Olahraga & Kepemudaan',terms:['olahraga','atlet','popda','porprov','pon','kejuaraan','pertandingan','medali','pelatih','kontingen','bonus atlet','kepemudaan','pemuda','sport','cabor','cabang olahraga','prestasi olahraga']},
  {name:'Infrastruktur & Transportasi',terms:['jalan','jembatan','pelabuhan','transportasi','kemacetan','macet','drainase','lampu jalan','infrastruktur']},
  {name:'Pelayanan Publik',terms:['pelayanan','layanan publik','administrasi','perizinan','pengaduan','masyarakat']},
  {name:'Ekonomi & Perdagangan',terms:['ekonomi','perdagangan','pasar murah','harga','inflasi','sembako','distribusi','pangan','daya beli','umkm']},
  {name:'Investasi & Pariwisata',terms:['investasi','usaha','industri','pariwisata','pertumbuhan','proyek investasi']},
  {name:'Sosial & Kesejahteraan',terms:['csr','bantuan sosial','bansos','sembako','penerima manfaat','kesejahteraan','kurang mampu','bantuan masyarakat']},
  {name:'Lingkungan',terms:['sampah','lingkungan','pencemaran','banjir','drainase','limbah','mangrove']},
  {name:'Keamanan & Ketertiban',terms:['keamanan','kriminal','pidana','polisi','kerusuhan','demonstrasi','unjuk rasa']},
  {name:'Kesehatan',terms:['kesehatan','rumah sakit','puskesmas','wabah','pasien','dokter']},
  {name:'Pendidikan',terms:['sekolah','pendidikan','siswa','guru','beasiswa']},
  {name:'Pemerintahan',terms:['kebijakan','anggaran','regulasi','peraturan','rapat koordinasi','musrenbang','administrasi pemerintahan','program pemerintah','tata kelola'],generic:['pemko','pemerintah','walikota','dinas','opd']}
];

const norm=(v:any)=>String(v||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();
const count=(text:string,term:string)=>{if(!term)return 0;let n=0,p=0;while((p=text.indexOf(term,p))!==-1){n++;p+=Math.max(1,term.length);}return n;};

function splitKeyword(raw:any){
  const original=String(raw||'');
  const parts=original.split(/[,;\n|]+/g).map(norm).filter(v=>v.length>=3);
  if(parts.length>1)return [...new Set(parts)];
  const one=norm(original);return one?[one]:[];
}

function fallback(title:string,summary:string,body:string,operatorMatches:OperatorMatch[]){
  const operatorTerms=new Set(operatorMatches.map(k=>norm(k.keyword)));
  const scored=FALLBACK_RULES.map(rule=>{
    let score=0;const evidence:string[]=[];
    for(const termRaw of rule.terms){const term=norm(termRaw),tc=count(title,term),sc=count(summary,term),bc=count(body,term);if(!(tc+sc+bc))continue;const contribution=Math.min(18,tc*6+sc*3+bc);score+=contribution;evidence.push(`${termRaw}: +${contribution}${tc?' judul':''}`);if(operatorTerms.has(term)){score+=2;evidence.push(`${termRaw}: +2 keyword operator`);}}
    if(rule.generic){let genericHits=0;for(const termRaw of rule.generic){const term=norm(termRaw);if(count(title,term)+count(summary,term)+count(body,term)){genericHits++;evidence.push(`${termRaw}: konteks generik`);}}if(score>0)score+=Math.min(4,genericHits);}
    return{name:rule.name,score,evidence,source:'fallback-rule'};
  }).sort((a,b)=>b.score-a.score);
  const winner=scored[0];
  return{issueCategory:winner&&winner.score>0?winner.name:'Umum / Lintas Isu',categoryEvidence:{engine:'phase2e-category-hybrid-v2.6',source:'fallback-rule',winnerScore:winner?.score||0,candidates:scored.filter(x=>x.score>0).slice(0,4)}};
}

export function classifyIssueWithTaxonomy(titleRaw:string,summaryRaw:string,bodyRaw:string,mappings:TaxonomyMapping[],operatorMatches:OperatorMatch[]){
  const title=norm(titleRaw),summary=norm(summaryRaw),body=norm(bodyRaw);
  const byCategory=new Map<string,{code:string;name:string;score:number;evidence:string[]}>();

  for(const row of mappings||[]){
    const name=String(row.taxonomy_name||'').trim();if(!name)continue;
    const code=String(row.taxonomy_code||'').trim();
    const weight=Math.max(.1,Math.min(10,Number(row.weight||1)));
    const priority=Math.max(1,Math.min(3,Number(row.priority||2)));
    for(const term of splitKeyword(row.keyword)){
      const tc=count(title,term),sc=count(summary,term),bc=count(body,term);if(!(tc+sc+bc))continue;
      const fieldScore=Math.min(12,tc*4+sc*2+bc);
      const contribution=Number((fieldScore*weight*(.75+priority*.25)).toFixed(2));
      const current=byCategory.get(name)||{code,name,score:0,evidence:[]};
      current.score+=contribution;
      current.evidence.push(`keyword resmi “${term}”: +${contribution}${tc?' judul':''}`);
      byCategory.set(name,current);
    }
  }

  const ranked=[...byCategory.values()].sort((a,b)=>b.score-a.score);
  if(!ranked.length)return fallback(title,summary,body,operatorMatches);
  const winner=ranked[0];
  return{issueCategory:winner.name,categoryEvidence:{engine:'phase2e-category-hybrid-v2.6',source:'keyword-taxonomy',winnerScore:Number(winner.score.toFixed(2)),winnerCode:winner.code,candidates:ranked.slice(0,4).map(x=>({...x,score:Number(x.score.toFixed(2))))}};
}

import type { Pool, PoolClient } from 'pg';
type Db=Pick<Pool,'query'>|Pick<PoolClient,'query'>;

export type UnifiedIssueEvidence = {
  title?: string|null;
  summary?: string|null;
  content?: string|null;
  opdId?: number|null;
  taxonomyName?: string|null;
  keywords?: string[];
};

export type UnifiedExistingIssueMatch = {
  issueId:number;
  title:string;
  status:string;
  score:number;
  confidence:'LOW'|'MEDIUM'|'HIGH';
  evidence:string[];
};

const ENGINE='unified-existing-issue-v1-print25';
const norm=(v:any)=>String(v||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const GENERIC=new Set(['yang','dengan','untuk','dari','pada','dalam','pemko','pemerintah','dinas','kota','daerah','olahraga','kepemudaan','pemuda','atlet','prestasi','program','kegiatan','provinsi']);
const specific=(v:string)=>{const n=norm(v);return n.length>=4&&/[a-z]/.test(n)&&!GENERIC.has(n)&&!['sport','tourism'].includes(n);};
const tokens=(v:any)=>new Set(norm(v).split(' ').filter(specific));
const overlap=(a:Set<string>,b:Set<string>)=>[...a].filter(x=>b.has(x));
const confidence=(s:number):'LOW'|'MEDIUM'|'HIGH'=>s>=70?'HIGH':s>=40?'MEDIUM':'LOW';

export async function matchExistingIssues(client:Db,organizationId:number,e:UnifiedIssueEvidence){
  const issues=await client.query(`SELECT i.id,i.title,i.description,i.status,COALESCE(array_agg(DISTINCT io.opd_id) FILTER (WHERE io.opd_id IS NOT NULL),'{}') AS opd_ids FROM issues i LEFT JOIN issue_opd io ON io.issue_id=i.id WHERE i.organization_id=$1 AND i.status IN ('active','watch') GROUP BY i.id ORDER BY i.updated_at DESC LIMIT 100`,[organizationId]);
  const articleWords=tokens(`${e.title||''} ${e.summary||''} ${e.content||''}`);
  const articleKeywords=new Set((e.keywords||[]).map(norm).filter(Boolean));
  const category=norm(e.taxonomyName);
  const out:UnifiedExistingIssueMatch[]=[];
  for(const issue of issues.rows){
    let score=0; const reasons:string[]=[];
    const issueText=norm(`${issue.title||''} ${issue.description||''}`);
    const issueTitleWords=tokens(issue.title||'');
    const sharedSpecific=overlap(articleWords,tokens(issueText));
    const titleAnchors=[...issueTitleWords].filter(w=>articleWords.has(w));
    const specificKw=[...articleKeywords].filter(k=>specific(k)&&issueText.includes(k));
    const anchors=[...new Set([...titleAnchors,...specificKw,...sharedSpecific])];
    if(category&&issueText.includes(category)){score+=20;reasons.push(`Taxonomy sama/tercantum: ${e.taxonomyName}`);}
    if(e.opdId&&(issue.opd_ids||[]).map(Number).includes(Number(e.opdId))){score+=15;reasons.push('OPD sama');}
    if(specificKw.length){score+=Math.min(30,specificKw.length*15);reasons.push(`Keyword spesifik sama: ${specificKw.slice(0,4).join(', ')}`);}
    if(titleAnchors.length){score+=Math.min(30,titleAnchors.length*15);reasons.push(`Anchor issue/judul sama: ${titleAnchors.slice(0,4).join(', ')}`);}
    else if(sharedSpecific.length){score+=Math.min(20,sharedSpecific.length*5);reasons.push(`Topik spesifik serupa: ${sharedSpecific.slice(0,4).join(', ')}`);}
    score=Math.min(100,score);
    if(anchors.length&&score>=40)out.push({issueId:Number(issue.id),title:String(issue.title),status:String(issue.status),score,confidence:confidence(score),evidence:[...reasons,`Anchor issue terkonfirmasi: ${anchors.slice(0,4).join(', ')}`]});
  }
  return {engine:ENGINE,matches:out.sort((a,b)=>b.score-a.score).slice(0,3)};
}

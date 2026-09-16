import type { Pool } from 'pg';
import { getV16PrimaryEvidence } from './context-dominance-v16.js';

function normalize(value:string){return String(value||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();}
function containsPhrase(text:string,phrase:string){const t=` ${normalize(text)} `,p=normalize(phrase);return p.length>=2&&t.includes(` ${p} `);}
function uptdTerms(row:{name?:string;code?:string;aliases?:unknown}){const out=new Set<string>();for(const raw of [row.name,row.code,...(Array.isArray(row.aliases)?row.aliases:[])]){const term=normalize(String(raw||''));if(term.length>=3)out.add(term);}return [...out];}

export async function routeArticleV16(pool:Pool,articleId:string){
 const article=(await pool.query(`SELECT id,title,summary,content FROM articles WHERE id=$1`,[articleId])).rows[0];if(!article)return null;
 const evidence=await getV16PrimaryEvidence(pool,articleId);
 // Replace AUTO routing as one deterministic projection of the selected Master keyword.
 await pool.query(`DELETE FROM article_opd WHERE article_id=$1 AND assignment_source='AUTO'`,[articleId]);
 await pool.query(`DELETE FROM article_uptd WHERE article_id=$1`,[articleId]);
 await pool.query(`DELETE FROM issue_articles WHERE article_id=$1 AND assignment_source='AUTO'`,[articleId]);
 await pool.query(`DELETE FROM article_entities WHERE article_id=$1 AND entity_type IN ('keyword','taxonomy','uptd')`,[articleId]);
 if(!evidence){await pool.query(`UPDATE articles SET opd_id=NULL WHERE id=$1`,[articleId]);return{articleId:String(articleId),classificationSource:'AUTO',opdId:null,supportingOpdIds:[],districtId:null,uptdId:null,uptdName:null,uptdMatches:0,taxonomyId:null,taxonomyName:null,taxonomyScore:0,issueId:null,issueMatchScore:0,issueAssignmentSource:null,keywordMatches:0,matchedKeywords:[]};}
 const routingEvidence=JSON.stringify({keywordId:evidence.keywordId,keyword:evidence.keyword,matchType:evidence.matchType,engine:'context-dominance-v16'});
 await pool.query(`UPDATE articles SET opd_id=$2 WHERE id=$1`,[articleId,evidence.opdId]);
 await pool.query(`INSERT INTO article_opd(article_id,opd_id,routing_role,relevance_score,evidence,assignment_source,updated_at) VALUES($1,$2,'PRIMARY',$3,$4,'AUTO',NOW()) ON CONFLICT(article_id,opd_id) DO UPDATE SET routing_role='PRIMARY',relevance_score=EXCLUDED.relevance_score,evidence=EXCLUDED.evidence,assignment_source=CASE WHEN article_opd.assignment_source='MANUAL' THEN 'MANUAL' ELSE 'AUTO' END,updated_at=NOW()`,[articleId,evidence.opdId,evidence.score,routingEvidence]);
 for(const opdId of evidence.supportingOpdIds)await pool.query(`INSERT INTO article_opd(article_id,opd_id,routing_role,relevance_score,evidence,assignment_source,updated_at) VALUES($1,$2,'SUPPORTING',$3,$4,'AUTO',NOW()) ON CONFLICT(article_id,opd_id) DO UPDATE SET routing_role=CASE WHEN article_opd.assignment_source='MANUAL' THEN article_opd.routing_role ELSE 'SUPPORTING' END,relevance_score=EXCLUDED.relevance_score,evidence=EXCLUDED.evidence,updated_at=NOW()`,[articleId,opdId,Math.max(1,evidence.score*.5),routingEvidence]);
 await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'keyword',$2) ON CONFLICT DO NOTHING`,[articleId,evidence.keyword]);
 await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'taxonomy',$2) ON CONFLICT DO NOTHING`,[articleId,evidence.taxonomyName]);
 const routed=new Set([evidence.opdId,...evidence.supportingOpdIds]);const title=String(article.title||''),lead=String(article.summary||article.content||'').slice(0,900);
 const units=(await pool.query(`SELECT id,opd_id,name,code,aliases FROM uptd WHERE active=true AND opd_id=ANY($1::bigint[]) ORDER BY id`,[[...routed]])).rows;const matches:any[]=[];
 for(const unit of units){let score=0;const terms:string[]=[];for(const term of uptdTerms(unit)){const points=containsPhrase(title,term)?24:containsPhrase(lead,term)?16:0;if(points){score+=points;terms.push(term);}}if(score>=16)matches.push({id:String(unit.id),opdId:String(unit.opd_id),name:String(unit.name||''),score,terms});}
 matches.sort((a,b)=>b.score-a.score||Number(a.id)-Number(b.id));const primaryUnit=matches.find(u=>u.opdId===evidence.opdId)??null;
 for(const unit of matches){await pool.query(`INSERT INTO article_uptd(article_id,uptd_id,relevance_score,evidence,is_primary,updated_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(article_id,uptd_id) DO UPDATE SET relevance_score=EXCLUDED.relevance_score,evidence=EXCLUDED.evidence,is_primary=EXCLUDED.is_primary,updated_at=NOW()`,[articleId,unit.id,unit.score,unit.terms,primaryUnit?.id===unit.id]);await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'uptd',$2) ON CONFLICT DO NOTHING`,[articleId,unit.name]);}
 // Existing MANUAL issue links are preserved. AUTO issue assignment is deliberately deferred to the issue engine after routing.
 return{articleId:String(articleId),classificationSource:evidence.matchType==='MANUAL'?'MANUAL_KEYWORD':'AUTO_V16',opdId:evidence.opdId,supportingOpdIds:evidence.supportingOpdIds,districtId:null,uptdId:primaryUnit?.id??null,uptdName:primaryUnit?.name??null,uptdMatches:matches.length,taxonomyId:evidence.taxonomyId,taxonomyName:evidence.taxonomyName,taxonomyScore:evidence.score,issueId:null,issueMatchScore:0,issueAssignmentSource:null,keywordMatches:1,matchedKeywords:[evidence.keyword]};
}

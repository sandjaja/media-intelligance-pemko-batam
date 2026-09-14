import { Pool } from 'pg';
import { analyzeArticle as analyzeCoreArticle, parseKeywordQuery } from './media-intelligence-core.js';
import { applyRisk } from './risk.js';

function normalize(value: string) { return value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim(); }
function containsPhrase(text:string,phrase:string){const t=` ${normalize(text)} `,p=normalize(phrase);return p.length>=2&&t.includes(` ${p} `);}
function meaningfulTokens(value:string){const stop=new Set(['dan','atau','yang','dengan','untuk','dalam','serta','pemerintah','daerah','masyarakat','kota','kabupaten']);return normalize(value).split(/\s+/).filter(v=>v.length>=4&&!stop.has(v));}
function dynamicOpdTerms(row:{name?:string;code?:string}){const terms=new Set<string>();const code=normalize(String(row.code||'')),name=normalize(String(row.name||''));if(code.length>=3)terms.add(code);if(name.length>=4)terms.add(name);for(const prefix of ['dinas ','badan ']){const v=name.replace(new RegExp(`^${prefix}`),'').trim();if(v.length>=5)terms.add(v);}return [...terms];}
function taxonomyTerms(row:{name?:string;description?:string}){const generic=new Set(['dan','atau','yang','dengan','untuk','dalam','serta','pemerintah','daerah','masyarakat']);const terms=new Set<string>();for(const raw of [row.name,row.description])for(const part of String(raw||'').split(/[,;&/]+/)){const term=normalize(part);if(term.length>=4&&!generic.has(term))terms.add(term);}return [...terms];}

async function mapHeadlineToExistingIssue(pool:Pool,articleId:string,title:string,taxonomyId:string|null){
  const headline=normalize(title);if(!headline)return null;
  const rows=(await pool.query(`SELECT i.id,i.title,i.taxonomy_category_id,t.name taxonomy_name,t.description taxonomy_description FROM issues i LEFT JOIN taxonomy_categories t ON t.id=i.taxonomy_category_id WHERE i.status IN ('active','watch') ORDER BY CASE WHEN i.status='active' THEN 0 ELSE 1 END,i.id`)).rows;
  let best:{id:string;score:number}|null=null;
  for(const row of rows){let score=0;if(taxonomyId&&String(row.taxonomy_category_id||'')===taxonomyId)score+=45;if(containsPhrase(headline,String(row.title||'')))score+=100;if(containsPhrase(headline,String(row.taxonomy_name||'')))score+=80;for(const token of meaningfulTokens(String(row.title||'')))if(containsPhrase(headline,token))score+=35;for(const term of taxonomyTerms({name:row.taxonomy_name,description:row.taxonomy_description})){if(containsPhrase(headline,term))score+=25;else for(const token of meaningfulTokens(term))if(containsPhrase(headline,token))score+=15;}if(score>(best?.score??0))best={id:String(row.id),score};}
  if(!best||best.score<35)return null;await pool.query(`INSERT INTO issue_articles(issue_id,article_id,relevance_score) VALUES($1,$2,$3) ON CONFLICT (issue_id,article_id) DO UPDATE SET relevance_score=EXCLUDED.relevance_score`,[best.id,articleId,Math.min(100,best.score)]);return best;
}

export async function routeArticleHeadline(pool:Pool,articleId:string){
  const article=(await pool.query(`SELECT id,title,summary,content FROM articles WHERE id=$1`,[articleId])).rows[0];if(!article)return null;
  const title=String(article.title||''),summary=String(article.summary||''),content=String(article.content||''),fullText=`${title} ${summary} ${content}`;
  const titleText=normalize(title),summaryText=normalize(summary),fullNormalized=normalize(fullText);
  const masterRows=(await pool.query(`SELECT k.id,k.keyword,kt.category_id,kt.weight,ko.opd_id,ko.weight opd_weight,kd.district_id,kd.weight district_weight FROM keywords k LEFT JOIN keyword_taxonomy kt ON kt.keyword_id=k.id AND kt.active=true LEFT JOIN keyword_opd ko ON ko.keyword_id=k.id AND ko.active=true LEFT JOIN keyword_district kd ON kd.keyword_id=k.id AND kd.active=true WHERE k.active=true AND k.organization_id IS NOT NULL AND k.opd_id IS NULL AND k.district_id IS NULL ORDER BY k.id`)).rows;
  const matches=masterRows.filter(k=>containsPhrase(fullNormalized,String(k.keyword||'')));
  const taxonomyScores=new Map<string,{score:number,strong:boolean;keywords:Set<string>}>(),opdScores=new Map<string,number>(),districtScores=new Map<string,number>();
  for(const m of matches){
    const keyword=String(m.keyword||''),base=Number(m.weight||0);let position=1;if(containsPhrase(titleText,keyword))position=1.5;else if(containsPhrase(summaryText,keyword))position=1.2;
    if(m.category_id!=null&&base>0){const id=String(m.category_id),cur=taxonomyScores.get(id)??{score:0,strong:false,keywords:new Set<string>()};cur.score+=base*position;cur.strong=cur.strong||base>=5;cur.keywords.add(keyword);taxonomyScores.set(id,cur);}
    if(m.opd_id!=null)opdScores.set(String(m.opd_id),(opdScores.get(String(m.opd_id))??0)+Number(m.opd_weight||2)*position);
    if(m.district_id!=null)districtScores.set(String(m.district_id),(districtScores.get(String(m.district_id))??0)+Number(m.district_weight||2)*position);
  }
  const eligible=[...taxonomyScores.entries()].filter(([,v])=>v.strong||v.keywords.size>=2).sort((a,b)=>b[1].score-a[1].score);
  const taxonomyId=eligible[0]?.[0]??null,taxonomyScore=eligible[0]?.[1].score??0;

  const opdRows=(await pool.query(`SELECT id,name,code FROM opd WHERE active=true ORDER BY id`)).rows;for(const opd of opdRows){const id=String(opd.id);let score=opdScores.get(id)??0;for(const term of dynamicOpdTerms(opd))if(containsPhrase(titleText,term))score+=12;if(score>0)opdScores.set(id,score);}
  const districtRows=(await pool.query(`SELECT id,name,code FROM districts WHERE active=true ORDER BY id`)).rows;for(const district of districtRows){const id=String(district.id);let score=districtScores.get(id)??0;for(const raw of [district.name,district.code]){const term=normalize(String(raw||''));if(term.length>=3&&containsPhrase(titleText,term))score+=12;}if(score>0)districtScores.set(id,score);}
  const opdId=[...opdScores.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]??null,districtId=[...districtScores.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]??null;
  await pool.query(`UPDATE articles SET opd_id=$2,district_id=$3 WHERE id=$1`,[articleId,opdId,districtId]);
  await pool.query(`DELETE FROM article_entities WHERE article_id=$1 AND entity_type IN ('keyword','taxonomy')`,[articleId]);
  const matchedNames=[...new Set(matches.map(k=>String(k.keyword)))].slice(0,40);for(const name of matchedNames)await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'keyword',$2) ON CONFLICT DO NOTHING`,[articleId,name]);
  let taxonomyName:string|null=null;if(taxonomyId){const t=(await pool.query(`SELECT name FROM taxonomy_categories WHERE id=$1`,[taxonomyId])).rows[0];taxonomyName=t?.name??null;if(taxonomyName)await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'taxonomy',$2) ON CONFLICT DO NOTHING`,[articleId,taxonomyName]);}
  const issueMatch=await mapHeadlineToExistingIssue(pool,String(articleId),title,taxonomyId);
  return{articleId:String(articleId),opdId,districtId,taxonomyId,taxonomyName,taxonomyScore:Number(taxonomyScore.toFixed(2)),issueId:issueMatch?.id??null,issueMatchScore:issueMatch?.score??0,keywordMatches:matchedNames.length,matchedKeywords:matchedNames};
}

export async function analyzeArticle(pool: Pool, articleId: string) {
  const article=(await pool.query(`SELECT a.id,a.title,a.content,a.summary,a.published_at,ms.name source_name,ms.tier,ms.category media_kind FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1`,[articleId])).rows[0];if(!article)return null;
  const routing=await routeArticleHeadline(pool,articleId),opdId=routing?.opdId??null,matchedNames=routing?.matchedKeywords??[],query=parseKeywordQuery(matchedNames.join(' | '));
  const peerResult=await pool.query(`SELECT COUNT(*)::int count FROM articles WHERE id<>$1 AND (title ILIKE $2 OR summary ILIKE $2)`,[articleId,`%${String(article.title).slice(0,80)}%`]);const peerCount=Number(peerResult.rows[0]?.count??1)+1;
  const analysis=analyzeCoreArticle({id:article.id,title:article.title,summary:article.summary,content:article.content,sourceName:article.source_name,sourceTier:Number(article.tier??2),mediaKind:article.media_kind==='print'?'print':article.media_kind==='social'?'social':'online',opdId,publishedAt:article.published_at},query,peerCount);
  await pool.query(`UPDATE articles SET opd_id=$2,sentiment=$3,importance_score=$4,impact_score=$5,velocity_score=$6,risk_score=$7,risk_level=$8,is_highlight=$9,summary=COALESCE(NULLIF(summary,''),$10) WHERE id=$1`,[articleId,opdId,analysis.sentiment,analysis.importanceScore,analysis.impactScore,analysis.velocityScore,analysis.riskScore,analysis.riskLevel,analysis.importanceScore>=65||analysis.riskLevel==='high'||analysis.riskLevel==='critical',String(article.content??article.title).slice(0,300)]);
  await pool.query(`DELETE FROM article_entities WHERE article_id=$1 AND entity_type='entity'`,[articleId]);for(const entity of analysis.entities.slice(0,20))await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'entity',$2) ON CONFLICT DO NOTHING`,[articleId,entity]);
  const risk=await applyRisk(pool,articleId);return{articleId,opdId,districtId:routing?.districtId??null,taxonomyId:routing?.taxonomyId??null,taxonomyName:routing?.taxonomyName??null,taxonomyScore:routing?.taxonomyScore??0,issueId:routing?.issueId??null,issueMatchScore:routing?.issueMatchScore??0,sentiment:analysis.sentiment,importance:analysis.importanceScore,impact:analysis.impactScore,velocity:analysis.velocityScore,highlight:analysis.importanceScore>=65||analysis.riskLevel==='high'||analysis.riskLevel==='critical',keywordMatches:matchedNames.length,matchedKeywords:matchedNames,entities:analysis.entities,duplicateFingerprint:analysis.duplicateFingerprint,risk};
}

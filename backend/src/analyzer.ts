import { Pool } from 'pg';
import { analyzeArticle as analyzeCoreArticle, parseKeywordQuery } from './media-intelligence-core.js';
import { applyRisk } from './risk.js';

function normalize(value: string) { return value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim(); }
function splitKeyword(value:string){return [...new Set(String(value||'').split(/[,;|\n]+/).map(v=>v.trim()).filter(v=>v.length>=2))];}
function containsPhrase(text:string,phrase:string){const t=` ${normalize(text)} `,p=normalize(phrase);return p.length>=2&&t.includes(` ${p} `);}
function meaningfulTokens(value:string){const stop=new Set(['dan','atau','yang','dengan','untuk','dalam','serta','pemerintah','daerah','masyarakat','kota','kabupaten']);return normalize(value).split(/\s+/).filter(v=>v.length>=4&&!stop.has(v));}
function dynamicOpdTerms(row:{name?:string;code?:string}){
  const terms=new Set<string>();
  const code=normalize(String(row.code||''));
  const name=normalize(String(row.name||''));
  if(code.length>=3)terms.add(code);
  if(name.length>=4)terms.add(name);
  const withoutDinas=name.replace(/^dinas\s+/,'').trim();
  if(withoutDinas.length>=5)terms.add(withoutDinas);
  const withoutBadan=name.replace(/^badan\s+/,'').trim();
  if(withoutBadan.length>=5)terms.add(withoutBadan);
  const withoutKecamatan=name.replace(/^kecamatan\s+/,'').trim();
  if(withoutKecamatan.length>=4)terms.add(withoutKecamatan);
  return [...terms];
}
function taxonomyTerms(row:{name?:string;description?:string}){
  const generic=new Set(['dan','atau','yang','dengan','untuk','dalam','serta','pemerintah','daerah','masyarakat']);
  const terms=new Set<string>();
  for(const raw of [row.name,row.description]){
    for(const part of String(raw||'').split(/[,;&/]+/)){
      const term=normalize(part);if(term.length>=4&&!generic.has(term))terms.add(term);
    }
  }
  return [...terms];
}
function expandKeywordRows(rows:any[]){
  return rows.flatMap(k=>splitKeyword(k.keyword).map(keyword=>({id:k.id,opd_id:k.opd_id,keyword})));
}
function matchKeywords(text:string,rows:any[]){
  const normalized=normalize(text);
  return expandKeywordRows(rows).filter(k=>{const term=normalize(k.keyword);return term.length>=2&&containsPhrase(normalized,term);});
}
async function mapHeadlineToExistingIssue(pool:Pool,articleId:string,title:string){
  const headline=normalize(title);if(!headline)return null;
  const rows=(await pool.query(`SELECT i.id,i.title,i.taxonomy_category_id,t.name taxonomy_name,t.description taxonomy_description FROM issues i LEFT JOIN taxonomy_categories t ON t.id=i.taxonomy_category_id WHERE i.status IN ('active','watch') ORDER BY CASE WHEN i.status='active' THEN 0 ELSE 1 END,i.id`)).rows;
  let best:{id:string;score:number}|null=null;
  for(const row of rows){
    let score=0;
    if(containsPhrase(headline,String(row.title||'')))score+=100;
    if(containsPhrase(headline,String(row.taxonomy_name||'')))score+=80;
    for(const token of meaningfulTokens(String(row.title||'')))if(containsPhrase(headline,token))score+=35;
    for(const term of taxonomyTerms({name:row.taxonomy_name,description:row.taxonomy_description})){
      if(containsPhrase(headline,term))score+=25;
      else for(const token of meaningfulTokens(term))if(containsPhrase(headline,token))score+=15;
    }
    if(score>(best?.score??0))best={id:String(row.id),score};
  }
  if(!best||best.score<35)return null;
  await pool.query(`INSERT INTO issue_articles(issue_id,article_id,relevance_score) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[best.id,articleId,Math.min(100,best.score)]);
  return best;
}

export async function routeArticleHeadline(pool:Pool,articleId:string){
  const article=(await pool.query(`SELECT id,title,summary,content FROM articles WHERE id=$1`,[articleId])).rows[0];
  if(!article)return null;

  const fullText=`${article.title||''} ${article.summary||''} ${article.content||''}`;
  const titleText=normalize(String(article.title||''));
  const keywordRows=(await pool.query(`SELECT id,opd_id,keyword FROM keywords WHERE active=true ORDER BY id`)).rows;
  const matches=matchKeywords(fullText,keywordRows);

  const opdScores=new Map<string,number>();
  for(const match of matches){
    if(match.opd_id!=null)opdScores.set(String(match.opd_id),(opdScores.get(String(match.opd_id))??0)+10);
  }

  // Explicit OPD mentions remain supported, but terms come only from OPD master data.
  const opdRows=(await pool.query(`SELECT id,name,code FROM opd WHERE active=true ORDER BY id`)).rows;
  for(const opd of opdRows){
    const id=String(opd.id);let score=opdScores.get(id)??0;
    for(const term of dynamicOpdTerms(opd))if(containsPhrase(titleText,term))score+=12;
    if(score>0)opdScores.set(id,score);
  }

  const opdId=[...opdScores.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]??null;
  await pool.query(`UPDATE articles SET opd_id=$2 WHERE id=$1`,[articleId,opdId]);

  // Refresh keyword labels from the active OPD keyword database for every routed article.
  await pool.query(`DELETE FROM article_entities WHERE article_id=$1 AND entity_type='keyword'`,[articleId]);
  const matchedNames=[...new Set(matches.map(k=>k.keyword))].slice(0,30);
  for(const match of matchedNames){
    await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'keyword',$2) ON CONFLICT DO NOTHING`,[articleId,match]);
  }

  const issueMatch=await mapHeadlineToExistingIssue(pool,String(articleId),String(article.title||''));
  return{articleId:String(articleId),opdId,issueId:issueMatch?.id??null,issueMatchScore:issueMatch?.score??0,keywordMatches:matchedNames.length,matchedKeywords:matchedNames};
}

export async function analyzeArticle(pool: Pool, articleId: string) {
  const article = (await pool.query(`SELECT a.id,a.title,a.content,a.summary,a.published_at,ms.name source_name,ms.tier,ms.category media_kind FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1`, [articleId])).rows[0];
  if (!article) return null;

  const routing=await routeArticleHeadline(pool,articleId);
  const opdId=routing?.opdId??null;
  const matchedNames=routing?.matchedKeywords??[];
  const query = parseKeywordQuery(matchedNames.join(' | '));
  const peerResult = await pool.query(`SELECT COUNT(*)::int count FROM articles WHERE id<>$1 AND (title ILIKE $2 OR summary ILIKE $2)`, [articleId, `%${String(article.title).slice(0, 80)}%`]);
  const peerCount = Number(peerResult.rows[0]?.count ?? 1) + 1;

  const analysis = analyzeCoreArticle({
    id: article.id,title: article.title,summary: article.summary,content: article.content,sourceName: article.source_name,sourceTier: Number(article.tier ?? 2),mediaKind: article.media_kind === 'print' ? 'print' : article.media_kind === 'social' ? 'social' : 'online',opdId,publishedAt: article.published_at
  }, query, peerCount);

  await pool.query(`UPDATE articles SET opd_id=$2,sentiment=$3,importance_score=$4,impact_score=$5,velocity_score=$6,risk_score=$7,risk_level=$8,is_highlight=$9,summary=COALESCE(NULLIF(summary,''),$10) WHERE id=$1`, [articleId, opdId, analysis.sentiment, analysis.importanceScore, analysis.impactScore, analysis.velocityScore, analysis.riskScore, analysis.riskLevel, analysis.importanceScore >= 65 || analysis.riskLevel === 'high' || analysis.riskLevel === 'critical', String(article.content ?? article.title).slice(0, 300)]);

  await pool.query(`DELETE FROM article_entities WHERE article_id=$1 AND entity_type='entity'`, [articleId]);
  for (const entity of analysis.entities.slice(0,20)) await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'entity',$2) ON CONFLICT DO NOTHING`, [articleId, entity]);

  const risk = await applyRisk(pool, articleId);
  return { articleId, opdId, issueId:routing?.issueId??null, issueMatchScore:routing?.issueMatchScore??0, sentiment: analysis.sentiment, importance: analysis.importanceScore, impact: analysis.impactScore, velocity: analysis.velocityScore, highlight: analysis.importanceScore >= 65 || analysis.riskLevel === 'high' || analysis.riskLevel === 'critical', keywordMatches: matchedNames.length, matchedKeywords:matchedNames, entities: analysis.entities, duplicateFingerprint: analysis.duplicateFingerprint, risk };
}

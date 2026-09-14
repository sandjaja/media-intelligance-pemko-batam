import { Pool } from 'pg';
import { analyzeArticle as analyzeCoreArticle, parseKeywordQuery } from './media-intelligence-core.js';
import { applyRisk } from './risk.js';

function normalize(value: string) { return value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim(); }
function splitKeyword(value:string){return [...new Set(String(value||'').split(/[,;|\n]+/).map(v=>v.trim()).filter(v=>v.length>=2))];}
function containsPhrase(text:string,phrase:string){const t=` ${normalize(text)} `,p=normalize(phrase);return p.length>=2&&t.includes(` ${p} `);}
function meaningfulTokens(value:string){const stop=new Set(['dan','atau','yang','dengan','untuk','dalam','serta','pemerintah','daerah','masyarakat','kota','kabupaten']);return normalize(value).split(/\s+/).filter(v=>v.length>=4&&!stop.has(v));}
function opdAliases(row:{name?:string;code?:string}){
  const aliases=new Set<string>();
  const code=normalize(String(row.code||''));
  const name=normalize(String(row.name||''));
  if(code.length>=3)aliases.add(code);
  if(name.length>=4)aliases.add(name);
  const withoutDinas=name.replace(/^dinas\s+/,'').trim();
  if(withoutDinas.length>=5)aliases.add(withoutDinas);
  if(code==='diskominfo')aliases.add('kominfo');
  if(code==='disdukcapil')aliases.add('dukcapil');
  if(code==='dinkes')aliases.add('kesehatan');
  if(code==='disdik')aliases.add('pendidikan');
  if(code==='dispora')aliases.add('pemuda dan olahraga');
  if(code==='dishub'){aliases.add('perhubungan');aliases.add('trans batam');aliases.add('brt');aliases.add('transportasi');}
  if(code==='dbmsda'){aliases.add('bina marga');aliases.add('sumber daya air');aliases.add('jalan');aliases.add('drainase');aliases.add('banjir');}
  if(code==='dpmptsp'){aliases.add('penanaman modal');aliases.add('pelayanan terpadu satu pintu');aliases.add('investasi');aliases.add('perizinan');}
  return [...aliases];
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
  const article=(await pool.query(`SELECT id,title FROM articles WHERE id=$1`,[articleId])).rows[0];
  if(!article)return null;
  const titleText=normalize(String(article.title||''));
  const keywordRows=(await pool.query(`SELECT id,opd_id,keyword FROM keywords WHERE active=true ORDER BY id`)).rows;
  const titleMatches=keywordRows.flatMap(k=>splitKeyword(k.keyword).map(keyword=>({opd_id:k.opd_id,keyword}))).filter(k=>{const term=normalize(k.keyword);return term.length>=2&&containsPhrase(titleText,term);});
  const opdScores=new Map<string,number>();
  for(const match of titleMatches)if(match.opd_id!=null)opdScores.set(String(match.opd_id),(opdScores.get(String(match.opd_id))??0)+8);
  const opdRows=(await pool.query(`SELECT id,name,code FROM opd WHERE active=true ORDER BY id`)).rows;
  for(const opd of opdRows){const id=String(opd.id);let score=opdScores.get(id)??0;for(const alias of opdAliases(opd))if(containsPhrase(titleText,alias))score+=12;if(score>0)opdScores.set(id,score);}
  const opdId=[...opdScores.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]??null;
  await pool.query(`UPDATE articles SET opd_id=$2 WHERE id=$1`,[articleId,opdId]);
  for(const match of [...new Set(titleMatches.map(k=>k.keyword))].slice(0,20)) await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'keyword',$2) ON CONFLICT DO NOTHING`,[articleId,match]);
  const issueMatch=await mapHeadlineToExistingIssue(pool,String(articleId),String(article.title||''));
  return{articleId:String(articleId),opdId,issueId:issueMatch?.id??null,issueMatchScore:issueMatch?.score??0};
}

export async function analyzeArticle(pool: Pool, articleId: string) {
  const article = (await pool.query(`SELECT a.id,a.title,a.content,a.summary,a.published_at,ms.name source_name,ms.tier,ms.category media_kind FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1`, [articleId])).rows[0];
  if (!article) return null;

  const routing=await routeArticleHeadline(pool,articleId);
  const opdId=routing?.opdId??null;
  const keywordRows = (await pool.query(`SELECT id,opd_id,keyword FROM keywords WHERE active=true ORDER BY id`)).rows;
  const keywords = keywordRows.flatMap(k=>splitKeyword(k.keyword).map(keyword=>({id:k.id,opd_id:k.opd_id,keyword})));
  const fullText=normalize(`${article.title} ${article.summary ?? ''} ${article.content ?? ''}`);
  const analysisMatches=keywords.filter(k=>{const term=normalize(k.keyword);return term.length>=2&&containsPhrase(fullText,term);});
  const queryTerms = analysisMatches.map(k => k.keyword).join(' | ');
  const query = parseKeywordQuery(queryTerms);
  const peerResult = await pool.query(`SELECT COUNT(*)::int count FROM articles WHERE id<>$1 AND (title ILIKE $2 OR summary ILIKE $2)`, [articleId, `%${String(article.title).slice(0, 80)}%`]);
  const peerCount = Number(peerResult.rows[0]?.count ?? 1) + 1;

  const analysis = analyzeCoreArticle({
    id: article.id,title: article.title,summary: article.summary,content: article.content,sourceName: article.source_name,sourceTier: Number(article.tier ?? 2),mediaKind: article.media_kind === 'print' ? 'print' : article.media_kind === 'social' ? 'social' : 'online',opdId,publishedAt: article.published_at
  }, query, peerCount);

  await pool.query(`UPDATE articles SET opd_id=$2,sentiment=$3,importance_score=$4,impact_score=$5,velocity_score=$6,risk_score=$7,risk_level=$8,is_highlight=$9,summary=COALESCE(NULLIF(summary,''),$10) WHERE id=$1`, [articleId, opdId, analysis.sentiment, analysis.importanceScore, analysis.impactScore, analysis.velocityScore, analysis.riskScore, analysis.riskLevel, analysis.importanceScore >= 65 || analysis.riskLevel === 'high' || analysis.riskLevel === 'critical', String(article.content ?? article.title).slice(0, 300)]);

  await pool.query(`DELETE FROM article_entities WHERE article_id=$1 AND entity_type='entity'`, [articleId]);
  for (const entity of analysis.entities.slice(0,20)) await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'entity',$2) ON CONFLICT DO NOTHING`, [articleId, entity]);
  const matchedNames=[...new Set(analysisMatches.map(k=>k.keyword))].slice(0,20);
  for (const match of matchedNames) await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'keyword',$2) ON CONFLICT DO NOTHING`, [articleId, match]);

  const risk = await applyRisk(pool, articleId);
  return { articleId, opdId, issueId:routing?.issueId??null, issueMatchScore:routing?.issueMatchScore??0, sentiment: analysis.sentiment, importance: analysis.importanceScore, impact: analysis.impactScore, velocity: analysis.velocityScore, highlight: analysis.importanceScore >= 65 || analysis.riskLevel === 'high' || analysis.riskLevel === 'critical', keywordMatches: matchedNames.length, matchedKeywords:matchedNames, entities: analysis.entities, duplicateFingerprint: analysis.duplicateFingerprint, risk };
}

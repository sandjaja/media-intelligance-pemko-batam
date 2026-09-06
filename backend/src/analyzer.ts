import { Pool } from 'pg';
import { analyzeArticle as analyzeCoreArticle, parseKeywordQuery } from './media-intelligence-core.js';
import { applyRisk } from './risk.js';

function normalize(value: string) { return value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim(); }

export async function analyzeArticle(pool: Pool, articleId: string) {
  const article = (await pool.query(`SELECT a.id,a.title,a.content,a.summary,a.published_at,ms.name source_name,ms.tier,ms.category media_kind FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1`, [articleId])).rows[0];
  if (!article) return null;

  const keywords = (await pool.query(`SELECT id,opd_id,keyword FROM keywords WHERE active=true ORDER BY id`)).rows;
  const text = normalize(`${article.title} ${article.summary ?? ''} ${article.content ?? ''}`);
  const matches = keywords.filter(k => text.includes(normalize(k.keyword)));
  const opdScores = new Map<string, number>();
  for (const match of matches) {
    if (match.opd_id != null) opdScores.set(String(match.opd_id), (opdScores.get(String(match.opd_id)) ?? 0) + 1);
  }
  const opdId = [...opdScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const queryTerms = matches.map(k => k.keyword).join(' | ');
  const query = parseKeywordQuery(queryTerms);
  const peerResult = await pool.query(`SELECT COUNT(*)::int count FROM articles WHERE id<>$1 AND (title ILIKE $2 OR summary ILIKE $2)`, [articleId, `%${String(article.title).slice(0, 80)}%`]);
  const peerCount = Number(peerResult.rows[0]?.count ?? 1) + 1;

  const analysis = analyzeCoreArticle({
    id: article.id,
    title: article.title,
    summary: article.summary,
    content: article.content,
    sourceName: article.source_name,
    sourceTier: Number(article.tier ?? 2),
    mediaKind: article.media_kind === 'print' ? 'print' : article.media_kind === 'social' ? 'social' : 'online',
    opdId,
    publishedAt: article.published_at
  }, query, peerCount);

  await pool.query(`UPDATE articles SET opd_id=$2,sentiment=$3,importance_score=$4,impact_score=$5,velocity_score=$6,risk_score=$7,risk_level=$8,is_highlight=$9,summary=COALESCE(NULLIF(summary,''),$10) WHERE id=$1`, [articleId, opdId, analysis.sentiment, analysis.importanceScore, analysis.impactScore, analysis.velocityScore, analysis.riskScore, analysis.riskLevel, analysis.importanceScore >= 65 || analysis.riskLevel === 'high' || analysis.riskLevel === 'critical', String(article.content ?? article.title).slice(0, 300)]);

  await pool.query(`DELETE FROM article_entities WHERE article_id=$1`, [articleId]);
  for (const entity of analysis.entities.slice(0, 20)) await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'entity',$2)`, [articleId, entity]);
  for (const match of analysis.matchedKeywords.slice(0, 20)) await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'keyword',$2) ON CONFLICT DO NOTHING`, [articleId, match]);

  const risk = await applyRisk(pool, articleId);
  return { articleId, opdId, sentiment: analysis.sentiment, importance: analysis.importanceScore, impact: analysis.impactScore, velocity: analysis.velocityScore, highlight: analysis.importanceScore >= 65 || analysis.riskLevel === 'high' || analysis.riskLevel === 'critical', keywordMatches: analysis.matchedKeywords.length, entities: analysis.entities, duplicateFingerprint: analysis.duplicateFingerprint, risk };
}

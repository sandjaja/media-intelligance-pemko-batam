import { Pool } from 'pg';
import { applyRisk } from './risk.js';

const POSITIVE = ['berhasil', 'sukses', 'prestasi', 'penghargaan', 'meningkat', 'investasi', 'terobosan', 'apresiasi', 'aman', 'lancar', 'kolaborasi', 'pertumbuhan', 'positif'];
const NEGATIVE = ['gagal', 'korupsi', 'suap', 'kriminal', 'kecelakaan', 'banjir', 'macet', 'protes', 'keluhan', 'kritik', 'masalah', 'terlambat', 'lambat', 'negatif', 'kebakaran', 'ancaman', 'sengketa'];

function normalize(text: string) { return text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim(); }
function countHits(text: string, words: string[]) { return words.reduce((n, word) => n + (text.includes(word) ? 1 : 0), 0); }

export async function analyzeArticle(pool: Pool, articleId: string) {
  const article = (await pool.query(`SELECT a.id,a.title,a.content,a.published_at,ms.tier FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1`, [articleId])).rows[0];
  if (!article) return null;

  const text = normalize(`${article.title} ${article.content ?? ''}`);
  const keywords = (await pool.query(`SELECT id,opd_id,keyword FROM keywords WHERE active=true`)).rows;
  const matches = keywords.filter(k => text.includes(normalize(k.keyword)));
  const opdScores = new Map<string, number>();
  for (const match of matches) opdScores.set(String(match.opd_id), (opdScores.get(String(match.opd_id)) ?? 0) + 1);
  const opdId = [...opdScores.entries()].sort((a,b) => b[1] - a[1])[0]?.[0] ?? null;

  const positive = countHits(text, POSITIVE);
  const negative = countHits(text, NEGATIVE);
  const sentiment = negative > positive ? 'negative' : positive > negative ? 'positive' : 'neutral';
  const tier = Math.min(3, Math.max(1, Number(article.tier ?? 2)));
  const tierScore = tier === 1 ? 35 : tier === 2 ? 22 : 12;
  const keywordScore = Math.min(30, matches.length * 8);
  const sentimentScore = sentiment === 'negative' ? 20 : sentiment === 'positive' ? 8 : 3;
  const recencyHours = Math.max(0, (Date.now() - new Date(article.published_at ?? Date.now()).getTime()) / 3600000);
  const recencyScore = Math.max(0, 15 - recencyHours * 0.5);
  const importance = Math.min(100, tierScore + keywordScore + sentimentScore + recencyScore);
  const impact = Math.min(100, tierScore * 1.5 + keywordScore + (sentiment === 'negative' ? 25 : 5));
  const velocity = Math.min(100, 100 / (1 + recencyHours / 6));
  const highlight = importance >= 65 || (sentiment === 'negative' && matches.length > 0 && importance >= 50);

  await pool.query(`UPDATE articles SET opd_id=$2,sentiment=$3,importance_score=$4,impact_score=$5,velocity_score=$6,is_highlight=$7,summary=COALESCE(NULLIF(summary,''),$8) WHERE id=$1`, [articleId, opdId, sentiment, importance.toFixed(2), impact.toFixed(2), velocity.toFixed(2), highlight, String(article.content ?? article.title).slice(0, 300)]);
  await pool.query(`DELETE FROM article_entities WHERE article_id=$1`, [articleId]);
  for (const match of matches.slice(0, 20)) await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'keyword',$2)`, [articleId, match.keyword]);
  const risk = await applyRisk(pool, articleId);
  return { articleId, opdId, sentiment, importance, impact, velocity, highlight, keywordMatches: matches.length, risk };
}

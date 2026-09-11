import type { Pool, PoolClient } from 'pg';

type Mention = {
  id: string;
  owned_account_id: string | null;
  title: string | null;
  content: string | null;
  published_at: string | null;
};

type WorkingCluster = {
  representative: Mention;
  members: Array<{ mention: Mention; score: number; type: 'identical' | 'adapted' | 'unique' }>;
};

const STOPWORDS = new Set(['dan','yang','di','ke','dari','untuk','pada','dengan','atau','ini','itu','dalam','atas','sebagai','oleh','kota','batam','pemko','pemerintah']);

function normalize(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string | null | undefined, max = 220) {
  return normalize(value)
    .split(' ')
    .filter(x => x.length > 2 && !STOPWORDS.has(x))
    .slice(0, max);
}

function jaccard(a: string[], b: string[]) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const x of A) if (B.has(x)) intersection += 1;
  return intersection / (A.size + B.size - intersection);
}

function similarity(a: Mention, b: Mention) {
  const title = jaccard(tokens(a.title, 40), tokens(b.title, 40));
  const body = jaccard(tokens(a.content, 220), tokens(b.content, 220));
  const score = Math.max(title, title * 0.65 + body * 0.35);
  return Math.max(0, Math.min(1, score));
}

function classify(score: number): 'identical' | 'adapted' | 'unique' {
  if (score >= 0.88) return 'identical';
  if (score >= 0.58) return 'adapted';
  return 'unique';
}

async function persist(client: PoolClient, clusters: WorkingCluster[]) {
  await client.query('DELETE FROM owned_content_cluster_members');
  await client.query('DELETE FROM owned_content_clusters');

  for (const cluster of clusters) {
    const dates = cluster.members.map(x => x.mention.published_at).filter(Boolean) as string[];
    const accountIds = new Set(cluster.members.map(x => x.mention.owned_account_id).filter(Boolean));
    const { rows } = await client.query(
      `INSERT INTO owned_content_clusters(canonical_title,representative_mention_id,member_count,channel_count,first_published_at,last_published_at)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [cluster.representative.title, cluster.representative.id, cluster.members.length, accountIds.size, dates.length ? dates.slice().sort()[0] : null, dates.length ? dates.slice().sort().at(-1) : null],
    );
    const clusterId = rows[0].id;
    for (const member of cluster.members) {
      await client.query(
        `INSERT INTO owned_content_cluster_members(cluster_id,mention_id,similarity_score,similarity_type,matched_by)
         VALUES($1,$2,$3,$4,'rule-v1')`,
        [clusterId, member.mention.id, member.score, member.type],
      );
    }
  }
}

export async function rebuildOwnedContentClusters(pool: Pool) {
  const { rows } = await pool.query<Mention>(
    `SELECT id,owned_account_id,title,content,published_at
       FROM social_mentions
      WHERE source_kind='owned'
      ORDER BY published_at DESC NULLS LAST,captured_at DESC,id DESC
      LIMIT 1000`,
  );

  const clusters: WorkingCluster[] = [];
  for (const mention of rows) {
    let best: WorkingCluster | null = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      const score = similarity(mention, cluster.representative);
      if (score > bestScore) { best = cluster; bestScore = score; }
    }
    const kind = classify(bestScore);
    if (best && kind !== 'unique') {
      best.members.push({ mention, score: bestScore, type: kind });
    } else {
      clusters.push({ representative: mention, members: [{ mention, score: 1, type: 'unique' }] });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await persist(client, clusters);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return {
    mentions: rows.length,
    clusters: clusters.length,
    republished: clusters.filter(c => c.members.length > 1).length,
    maxChannels: clusters.reduce((m, c) => Math.max(m, new Set(c.members.map(x => x.mention.owned_account_id).filter(Boolean)).size), 0),
    engine: 'owned-content-rule-v1',
  };
}

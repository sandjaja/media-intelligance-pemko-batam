-- Persistent human override for Owned Channel amplification relationships.
-- Kept outside generated cluster-member rows so refresh/reclustering cannot erase decisions.
CREATE TABLE IF NOT EXISTS owned_amplification_reviews (
  mention_id BIGINT PRIMARY KEY REFERENCES social_mentions(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('confirmed','rejected','moved')),
  target_mention_id BIGINT REFERENCES social_mentions(id) ON DELETE SET NULL,
  reason TEXT,
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_owned_amplification_reviews_decision ON owned_amplification_reviews(decision,reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_owned_amplification_reviews_target ON owned_amplification_reviews(target_mention_id) WHERE target_mention_id IS NOT NULL;

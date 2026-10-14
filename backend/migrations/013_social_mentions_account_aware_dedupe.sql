BEGIN;

DROP INDEX IF EXISTS uq_social_mentions_content_hash;

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_mentions_owned_content_hash
  ON social_mentions(platform, owned_account_id, content_hash)
  WHERE content_hash IS NOT NULL AND owned_account_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_mentions_unowned_content_hash
  ON social_mentions(platform, content_hash)
  WHERE content_hash IS NOT NULL AND owned_account_id IS NULL;

COMMIT;

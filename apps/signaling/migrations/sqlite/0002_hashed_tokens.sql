-- Swap to the hashed-token schema.
--
-- Migration intent: bearer tokens and recovery codes are stored as SHA-256
-- hex digests at rest, never plaintext. A DB exfiltration leaks no live
-- credential. The presented plaintext is hashed by the application and looked
-- up by hash (see ClaimStore.findByToken).
--
-- Trade-off: this DROPS every existing claim — SQLite can't hash the existing
-- plaintext tokens in pure SQL, and the coordinator has no live users yet
-- (see issue #41). Existing hubs must re-claim their name after this lands.

DROP INDEX IF EXISTS claims_token_idx;
DROP TABLE IF EXISTS claims;

CREATE TABLE claims (
  name           TEXT PRIMARY KEY,
  token_hash     TEXT NOT NULL,
  recovery_hash  TEXT,
  created_at     INTEGER NOT NULL
);

-- Reverse index so a hub WebSocket authenticates in O(1) by token hash.
CREATE UNIQUE INDEX claims_token_hash_idx ON claims (token_hash);

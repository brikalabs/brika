-- Persistent first-come-first-serve claims.
-- Token is the opaque bearer the hub uses on the signaling WebSocket.
CREATE TABLE IF NOT EXISTS claims (
  name        TEXT PRIMARY KEY,
  token       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- Reverse index so we can authenticate a hub WebSocket in O(1).
CREATE UNIQUE INDEX IF NOT EXISTS claims_token_idx ON claims (token);

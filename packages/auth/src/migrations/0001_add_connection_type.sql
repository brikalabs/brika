-- Track the transport a session was opened over: 'http' (direct LAN/loopback),
-- 'rtc' (WebRTC data channel via the signaling coordinator), or 'ws' (future
-- WebSocket transports). Persisted so the sessions UI can label each row and
-- the operator can see how a session was opened without heuristics on the IP.
ALTER TABLE `sessions` ADD COLUMN `connection_type` text NOT NULL DEFAULT 'http';

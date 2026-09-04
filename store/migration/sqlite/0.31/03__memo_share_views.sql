-- Access bookkeeping for memo shares.
-- A link that turns out to have leaked is worth nothing without an answer to
-- "was it ever opened, and when", so record both as the link is used.
ALTER TABLE memo_share ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memo_share ADD COLUMN last_accessed_ts BIGINT DEFAULT NULL;

-- Per-link export and comment options for memo shares.
-- Both default to enabled so existing links keep behaving like a full read-only
-- view of the memo: the holder can download the export bundle and see comments.
ALTER TABLE memo_share ADD COLUMN allow_download INTEGER NOT NULL CHECK (allow_download IN (0, 1)) DEFAULT 1;
ALTER TABLE memo_share ADD COLUMN include_comments INTEGER NOT NULL CHECK (include_comments IN (0, 1)) DEFAULT 1;

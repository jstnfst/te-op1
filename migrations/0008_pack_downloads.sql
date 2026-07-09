-- packs never got the download counter patches have had since 0001; add it
-- so pack zip downloads can be tracked and shown the same way.
ALTER TABLE packs ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0;

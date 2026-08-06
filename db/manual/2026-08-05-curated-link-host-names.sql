-- Adds curated_links.host_names.
--
-- Host identity is the first thing Serena's curation keys on, and it was the
-- one thing never recorded: the code inferred it by substring-scanning the
-- title and description against an allowlist, which misattributes badly (a
-- listing that merely mentions a well-known company scored as if that company
-- were hosting it).
--
-- Luma and Partiful publish it as schema.org JSON-LD. Measured: resolves on
-- 27 of the 40 live links.
--
-- MUST run before deploying this branch — Drizzle selects every column, so
-- until it exists every curated_links query fails.
--
-- Idempotent; safe to run more than once.
ALTER TABLE curated_links ADD COLUMN IF NOT EXISTS host_names text[];

-- Lets a stale link vector be detected. Widening the scraped descriptions
-- changed every link document while leaving every embedding NOT NULL, which a
-- `WHERE embedding IS NULL` backfill can never see.
ALTER TABLE curated_links ADD COLUMN IF NOT EXISTS embedding_document text;

-- Archive of links Serena removed.
--
-- removeCuratedLink was a hard DELETE, so every rejection was destroyed.
-- Curation is a discard machine — ~80% of what she sees is thrown away — and a
-- filter cannot be evaluated on a table containing only its keeps.
--
-- A separate table rather than a removed_at flag on curated_links: a flag is
-- fail-open (nine queries read curated_links; seven would silently include
-- removed rows if they forgot the filter — feed, digest, impression logging).
-- An archive table is fail-safe.
--
-- Idempotent; safe to run more than once.
CREATE TABLE IF NOT EXISTS removed_links (
  id            text PRIMARY KEY,
  source_url    text NOT NULL,
  title         text,
  description   text,
  category      text,
  host_names    text[],
  tags          text[],
  reason        text,
  image_url     text,
  event_date    timestamp,
  exclusivity   text,
  format        text,
  out_of_town   boolean,
  added_at      timestamp,
  removed_at    timestamp NOT NULL DEFAULT now()
);

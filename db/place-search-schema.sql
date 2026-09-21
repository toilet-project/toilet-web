PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS source_datasets (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  audited_at TEXT NOT NULL,
  as_of TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_count INTEGER NOT NULL,
  licenses_json TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  source_dataset TEXT NOT NULL REFERENCES source_datasets(id),
  name_ko TEXT NOT NULL,
  name_en TEXT NOT NULL,
  category TEXT NOT NULL,
  place_kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('usable_preview', 'pending_review', 'excluded')),
  search_scope TEXT NOT NULL CHECK (search_scope IN ('preview', 'production', 'disabled')),
  production_approved INTEGER NOT NULL DEFAULT 0 CHECK (production_approved IN (0, 1)),
  verification_level TEXT NOT NULL,
  region_en TEXT NOT NULL DEFAULT '',
  latitude REAL,
  longitude REAL,
  source_url TEXT NOT NULL,
  source_revision INTEGER,
  source_modified_at TEXT,
  audit_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_places_scope ON places(search_scope, status);
CREATE INDEX IF NOT EXISTS idx_places_source_dataset ON places(source_dataset);

CREATE TABLE IF NOT EXISTS place_aliases (
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('ko', 'en')),
  alias TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  PRIMARY KEY (place_id, locale, alias)
);

CREATE INDEX IF NOT EXISTS idx_place_aliases_normalized ON place_aliases(locale, alias_normalized);

CREATE TABLE IF NOT EXISTS place_localizations (
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('ja', 'zh-CN', 'zh-TW', 'zh-HK')),
  name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  source_language TEXT NOT NULL,
  source_revision INTEGER,
  PRIMARY KEY (place_id, locale)
);

CREATE TABLE IF NOT EXISTS place_coordinate_candidates (
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  candidate_index INTEGER NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  rank TEXT,
  eligible INTEGER NOT NULL DEFAULT 0 CHECK (eligible IN (0, 1)),
  precision_degrees REAL,
  evidence_json TEXT NOT NULL,
  PRIMARY KEY (place_id, candidate_index)
);

CREATE VIRTUAL TABLE IF NOT EXISTS place_search_fts USING fts5(
  place_id UNINDEXED,
  name_en,
  aliases_en,
  region_en,
  name_ko,
  aliases_ko,
  source_dataset UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE IF NOT EXISTS place_search_localized_fts USING fts5(
  place_id UNINDEXED,
  locale UNINDEXED,
  name,
  aliases,
  name_en,
  aliases_en,
  source_dataset UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

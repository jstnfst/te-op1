-- te-op1 community patch site — initial schema

CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  provider          TEXT NOT NULL,            -- 'google' | 'microsoft' | 'yahoo'
  provider_user_id  TEXT NOT NULL,            -- stable id from the provider
  email             TEXT,
  display_name      TEXT,
  avatar_url        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_login        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS patches (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,              -- synth engine, or 'dbox'
  engine_version  INTEGER,                    -- synth_version or drum_version
  fx_type         TEXT,
  lfo_type        TEXT,
  octave          INTEGER DEFAULT 0,
  json            TEXT NOT NULL,              -- the full preset JSON (minified)
  tags            TEXT DEFAULT '',           -- comma-separated, derived
  is_public       INTEGER NOT NULL DEFAULT 1,
  download_count  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patches_public_type ON patches (is_public, type);
CREATE INDEX IF NOT EXISTS idx_patches_user        ON patches (user_id);
CREATE INDEX IF NOT EXISTS idx_patches_created     ON patches (created_at);

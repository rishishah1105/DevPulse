CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  github_user_id BIGINT UNIQUE NOT NULL,
  login TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repositories (
  id SERIAL PRIMARY KEY,
  github_repo_id BIGINT UNIQUE NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  html_url TEXT NOT NULL,
  sync_status TEXT DEFAULT 'idle',
  sync_started_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  last_sync_cursor TIMESTAMPTZ,
  sync_items_done INTEGER DEFAULT 0,
  sync_pages_total INTEGER,
  sync_error TEXT,
  retry_after TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

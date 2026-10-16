CREATE TABLE IF NOT EXISTS user_repositories (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, repository_id)
);

CREATE TABLE IF NOT EXISTS github_items (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  github_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,
  author_login TEXT,
  assignee_login TEXT,
  labels TEXT[] DEFAULT '{}',
  html_url TEXT NOT NULL,
  created_at_gh TIMESTAMPTZ,
  updated_at_gh TIMESTAMPTZ,
  closed_at_gh TIMESTAMPTZ,
  UNIQUE (repository_id, number)
);

CREATE INDEX IF NOT EXISTS idx_items_repo_state_type ON github_items (repository_id, state, type);
CREATE INDEX IF NOT EXISTS idx_items_updated ON github_items (repository_id, updated_at_gh);

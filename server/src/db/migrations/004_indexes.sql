-- Covers almost every filter query: type, state, repository
CREATE INDEX IF NOT EXISTS idx_items_repo_state_type
  ON github_items (repository_id, state, type);

-- Covers stale queries and ordering by updated_at_gh
CREATE INDEX IF NOT EXISTS idx_items_repo_updated
  ON github_items (repository_id, updated_at_gh);

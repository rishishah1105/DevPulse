import pool from '../db/pool.js';

export async function userOwnsRepo(userId, repoId) {
  const result = await pool.query(
    'SELECT 1 FROM user_repositories WHERE user_id = $1 AND repository_id = $2',
    [userId, repoId]
  );
  return result.rows.length > 0;
}

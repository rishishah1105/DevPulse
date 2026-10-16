export async function fetchIssues(owner, repo, accessToken) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'devpulse',
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }

  return res.json();
}

import { useState, useEffect } from 'react';

function App() {
  const [user, setUser] = useState(null);
  const [repos, setRepos] = useState([]);
  const [url, setUrl] = useState('');

  useEffect(() => {
  fetch('/api/me')
    .then(r => r.ok ? r.json() : null)
    .then(data => setUser(data));
}, []);

useEffect(() => {
  if (!user) return;
  fetch('/api/repos')
    .then(r => r.json())
    .then(data => setRepos(data));
}, [user]);

async function handleAdd(e) {
  e.preventDefault();
  await fetch('/api/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  setUrl('');
  fetch('/api/repos').then(r => r.json()).then(setRepos);
}


if (!user) {
  return (
    <div>
      <h1>DevPulse</h1>
      <a href="/api/auth/github">Sign in with GitHub</a>
    </div>
  );
}

return (
  <div>
    <h1>DevPulse</h1>
    <p>Signed in as {user.login}</p>

    <h2>Add a repo</h2>
    <form onSubmit={handleAdd}>
      <input
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://github.com/owner/repo"
      />
      <button type="submit">Add</button>
    </form>

    <h2>My Repos</h2>
    {repos.length === 0 && <p>No repos yet.</p>}
    <ul>
      {repos.map(repo => (
        <li key={repo.id}>{repo.full_name}</li>
      ))}
    </ul>
  </div>
);
}

export default App;

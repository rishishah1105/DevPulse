// Parses GitHub's Link response header into an object keyed by rel name.
// e.g. '<https://api.github.com/...?page=2>; rel="next"' → { next: 'https://...?page=2' }
export function parseLinkHeader(header) {
  if (!header) return {};

  const links = {};
  const pattern = /<([^>]+)>;\s*rel="([^"]+)"/g;
  let match;

  while ((match = pattern.exec(header)) !== null) {
    const [, url, rel] = match;
    links[rel] = url;
  }

  return links;
}

// Extracts the page number from a URL's ?page= query param.
// Returns null if not found.
export function extractPageNumber(url) {
  if (!url) return null;
  const match = url.match(/[?&]page=(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

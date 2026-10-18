import { describe, it, expect } from 'vitest';
import { parseLinkHeader, extractPageNumber } from './linkHeader.js';

describe('parseLinkHeader', () => {
  it('returns empty object when header is null', () => {
    expect(parseLinkHeader(null)).toEqual({});
  });

  it('returns empty object when header is empty string', () => {
    expect(parseLinkHeader('')).toEqual({});
  });

  it('parses a next link', () => {
    const header = '<https://api.github.com/repos/owner/repo/issues?page=2>; rel="next"';
    expect(parseLinkHeader(header)).toEqual({
      next: 'https://api.github.com/repos/owner/repo/issues?page=2',
    });
  });

  it('parses both next and last links', () => {
    const header =
      '<https://api.github.com/repos/owner/repo/issues?page=2>; rel="next", ' +
      '<https://api.github.com/repos/owner/repo/issues?page=14>; rel="last"';
    expect(parseLinkHeader(header)).toEqual({
      next: 'https://api.github.com/repos/owner/repo/issues?page=2',
      last: 'https://api.github.com/repos/owner/repo/issues?page=14',
    });
  });

  it('returns no next on the last page (only last and first)', () => {
    const header =
      '<https://api.github.com/repos/owner/repo/issues?page=1>; rel="first", ' +
      '<https://api.github.com/repos/owner/repo/issues?page=14>; rel="last"';
    const result = parseLinkHeader(header);
    expect(result.next).toBeUndefined();
    expect(result.last).toBe('https://api.github.com/repos/owner/repo/issues?page=14');
  });
});

describe('extractPageNumber', () => {
  it('returns null for null input', () => {
    expect(extractPageNumber(null)).toBeNull();
  });

  it('extracts page number from URL', () => {
    expect(extractPageNumber('https://api.github.com/repos/owner/repo/issues?page=14')).toBe(14);
  });

  it('extracts page number when other params are present', () => {
    expect(extractPageNumber('https://api.github.com/repos/owner/repo/issues?state=all&page=7&per_page=100')).toBe(7);
  });
});

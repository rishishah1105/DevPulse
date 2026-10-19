const CAPACITY = 60;
const REFILL_RATE = 1;

const buckets = new Map();

export function rateLimiter(req, res, next) {
  const key = req.session?.userId ?? req.ip;
  const now = Date.now();

  if (!buckets.has(key)) {
    buckets.set(key, { tokens: CAPACITY, lastRefill: now });
  }
  const bucket = buckets.get(key);

  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsed * REFILL_RATE);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return next();
  }

  const retryAfter = (1 - bucket.tokens) / REFILL_RATE;
  res.set('Retry-After', String(Math.ceil(retryAfter)));
  return res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests' },
  });
}

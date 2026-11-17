// Fixed-window counter held in process memory. Each server instance counts
// separately, so this bounds bursts from one signed-in user against the quota
// of upstream market-data APIs; it is not a global limit.
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(
  key: string,
  limit: number,
  windowMs = 60_000,
  now = Date.now(),
) {
  if (windows.size > 5000)
    for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

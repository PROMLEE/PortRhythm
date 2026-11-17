// Server code throws user-facing errors in Korean. Driver, runtime and
// configuration failures are English and may describe internals, so only a
// Korean message without database error metadata is safe to return.
export function publicErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const database = typeof (error as { code?: unknown }).code === "string";
  return !database && /[가-힣]/.test(error.message) && error.message.length <= 200
    ? error.message
    : fallback;
}

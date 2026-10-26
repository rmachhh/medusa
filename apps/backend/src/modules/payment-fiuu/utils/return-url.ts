// Per-storefront return URLs for the Fiuu hosted page.
//
// One Medusa backend can serve several storefronts, so a single global
// FIUU_RETURN_URL cannot be correct for all of them. A payment session may ask
// for its own return/cancel URL; this resolves it against an explicit origin
// allowlist and falls back to the configured value on anything suspicious.

export type ReturnUrlInput = {
  fallback?: string
  requested?: unknown
  allowedOrigins?: string[]
}

export function resolveReturnUrl({
  fallback,
  requested,
  allowedOrigins = [],
}: ReturnUrlInput): string | undefined {
  if (typeof requested !== "string" || !requested.trim()) return fallback

  let url: URL
  try {
    url = new URL(requested.trim())
  } catch {
    return fallback
  }

  if (url.username || url.password || url.hash) return fallback

  const isLoopback =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  if (url.protocol !== "https:" && !isLoopback) return fallback

  if (!allowedOrigins.includes(url.origin)) return fallback

  return url.toString()
}

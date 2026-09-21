import { jsonResponse } from '../http'

export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds?: number
}
export interface RateLimitProvider {
  check(key: string): Promise<RateLimitDecision>
}

export async function requireRateLimit(
  provider: RateLimitProvider | undefined,
  key: string,
): Promise<Response | null> {
  if (!provider) {
    return jsonResponse({
      error: 'rate_limit_unavailable',
      message: 'Protected API requests remain disabled until rate limiting is configured.',
    }, 503)
  }

  const decision = await provider.check(key)

  if (decision.allowed) {
    return null
  }

  const headers = new Headers()

  if (decision.retryAfterSeconds) {
    headers.set('Retry-After', String(decision.retryAfterSeconds))
  }

  return jsonResponse({
    error: 'rate_limited',
    message: 'Too many requests.',
  }, 429, headers)
}
